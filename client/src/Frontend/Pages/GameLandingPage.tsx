import {
  BLOCKCHAIN_BRIDGE,
  BLOCKCHAIN_NAME,
  BLOCK_EXPLORER_URL,
  GAME_VERSION_INTRO,
  HOW_TO_ENABLE_POPUPS,
  HOW_TO_GET_ETH,
  TOKEN_NAME,
} from '@dfares/constants';
import { CONTRACT_ADDRESS } from '@dfares/contracts';
import { DarkForest } from '@dfares/contracts/typechain';
import { EthConnection, neverResolves, weiToEth } from '@dfares/network';
import { address } from '@dfares/serde';
import { UnconfirmedUseKey } from '@dfares/types';
import { bigIntFromKey } from '@dfares/whitelist';
import { utils, Wallet } from 'ethers';
import { reverse } from 'lodash';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RouteComponentProps, useHistory } from 'react-router-dom';
import { GameManagerEvent } from '../../Backend/GameLogic/BaseGameManager';
import { makeContractsAPI } from '../../Backend/GameLogic/ContractsAPI';
import GameManager from '../../Backend/GameLogic/GameManager';
import GameUIManager from '../../Backend/GameLogic/GameUIManager';
import TutorialManager, { TutorialState } from '../../Backend/GameLogic/TutorialManager';
import { addAccount, getAccounts } from '../../Backend/Network/AccountManager';
import { getEthConnection, loadDiamondContract } from '../../Backend/Network/Blockchain';
import {
  callRegisterAndWaitForConfirmation,
  EmailResponse,
  RegisterConfirmationResponse,
  requestDevFaucet,
  submitInterestedEmail,
  submitPlayerEmail,
} from '../../Backend/Network/UtilityServerAPI';
import { getWhitelistArgs } from '../../Backend/Utils/WhitelistSnarkArgsHelper';
import { resolveQuickJoinAccount } from '../../config/quickJoin';
import { ZKArgIdx } from '../../_types/darkforest/api/ContractsAPITypes';
import { CopyToClipboardButton } from '../Components/CopyToClipboardButton';
import {
  GameWindowWrapper,
  InitRenderState,
  TerminalToggler,
  TerminalWrapper,
  Wrapper,
} from '../Components/GameLandingPageComponents';
import { MythicLabelText } from '../Components/Labels/MythicLabel';
import { QuickJoinSettingsModal } from '../Components/QuickJoinSettingsModal';
import { TopLevelDivProvider, UIManagerProvider } from '../Utils/AppHooks';
import { Incompatibility, unsupportedFeatures } from '../Utils/BrowserChecks';
import { TerminalTextStyle } from '../Utils/TerminalTypes';
import UIEmitter, { UIEmitterEvent } from '../Utils/UIEmitter';
import { GameWindowLayout } from '../Views/GameWindowLayout';
import { Terminal, TerminalHandle, TerminalOptionMode } from '../Views/Terminal';
import {
  ENTER_TRANSITION_DURATION_MS,
  UniverseEnterTransition,
} from '../Views/UniverseEnterTransition';
import { BrowserCompatibleState, BrowserIssues } from './components/BrowserIssues';
import { MiniMap, MiniMapHandle } from './components/MiniMap';
import { EntryModeChoice, GameLandingEntryOverlay } from './GameLandingEntryOverlay';

type EntryMode = 'pending' | EntryModeChoice;

function printBurnerWalletWarnings(terminal: TerminalHandle, addr: string) {
  terminal.println(``);
  terminal.print(`Created new burner wallet account `);
  terminal.print(addr, TerminalTextStyle.Pink);
  terminal.println(``);
  terminal.println('');
  terminal.println('NOTE: Burner wallets are stored in local storage.', TerminalTextStyle.Pink);
  terminal.println('They are relatively insecure and you should avoid ');
  terminal.println('storing substantial funds in them.');
  terminal.println('');
  terminal.println('Also, clearing browser local storage/cache will render your');
  terminal.println('burner wallets inaccessible, unless you export your private keys.');
  terminal.println('');
}

function menuInputHint(entryMode: EntryMode): string {
  if (entryMode === 'terminal') {
    return 'Type a number and press ENTER to select:';
  }
  return 'Click an option or type a number and press ENTER:';
}

function printAckPrompt(
  terminal: TerminalHandle | undefined,
  entryMode: EntryMode,
  buttonLabel: string,
  terminalMessage: string
): void {
  if (entryMode !== 'terminal') {
    terminal?.printOption('1', buttonLabel, { hideKey: true });
    terminal?.println('');
    terminal?.println(menuInputHint(entryMode), TerminalTextStyle.Sub);
  } else {
    terminal?.println(terminalMessage);
  }
}

function formatEntryFeeEth(amountEth: number): string {
  if (amountEth === 0) {
    return `0 ${TOKEN_NAME} (no entry fee on this deployment)`;
  }
  if (amountEth >= 0.0001) {
    return `${amountEth.toFixed(6)} ${TOKEN_NAME}`;
  }
  return `${amountEth.toFixed(9)} ${TOKEN_NAME}`;
}

async function isPlayerInitializedOnChain(
  ethConnection: EthConnection,
  contractAddress: string,
  playerAddress: string
): Promise<boolean> {
  const contract = await ethConnection.loadContract<DarkForest>(
    contractAddress,
    loadDiamondContract
  );
  const rawPlayer = await contract.players(playerAddress);
  return rawPlayer.isInitialized;
}

async function awaitConfirmJoinEntryFee(
  terminal: TerminalHandle | undefined,
  ethConnection: EthConnection | undefined,
  contractAddress: string,
  entryMode: EntryMode
): Promise<void> {
  if (!terminal || !ethConnection) return;

  while (true) {
    try {
      const contract = await ethConnection.loadContract<DarkForest>(
        contractAddress,
        loadDiamondContract
      );
      const baseWei = await contract.getEntryFee();
      const halfPrice = await contract.halfPrice();
      const effectiveWei = halfPrice ? baseWei.div(2) : baseWei;
      const baseEth = weiToEth(baseWei);
      const effectiveEth = weiToEth(effectiveWei);

      terminal.println(
        'Joining this universe costs a one-time entry fee.',
        TerminalTextStyle.Green
      );
      if (halfPrice && effectiveEth > 0) {
        terminal.print('  Regular: ', TerminalTextStyle.Sub);
        terminal.println(formatEntryFeeEth(baseEth), TerminalTextStyle.Sub);
        terminal.print('  You pay (half-price): ', TerminalTextStyle.Sub);
        terminal.println(formatEntryFeeEth(effectiveEth), TerminalTextStyle.Green);
      } else {
        terminal.print('  Amount: ', TerminalTextStyle.Sub);
        terminal.println(formatEntryFeeEth(effectiveEth), TerminalTextStyle.Green);
      }
      terminal.newline();

      if (entryMode !== 'terminal') {
        terminal.printOption('1', 'I understand — continue', { hideKey: true });
        terminal.println('');
        terminal.println(menuInputHint(entryMode), TerminalTextStyle.Sub);
      } else {
        terminal.println('Press [enter] to acknowledge and continue.');
      }

      const input = ((await terminal.getInput()) ?? '').trim();
      if (input === '' || input === '1') {
        return;
      }
      terminal.println('Please acknowledge the entry fee to continue.', TerminalTextStyle.Pink);
      terminal.newline();
    } catch (e) {
      console.error('Failed to load entry fee', e);
      terminal.println('Entry fee: unable to load from contract.', TerminalTextStyle.Red);
      terminal.newline();
      return;
    }
  }
}
const enum TerminalPromptStep {
  NONE,
  COMPATIBILITY_CHECKS_PASSED,
  DISPLAY_ACCOUNTS,
  GENERATE_ACCOUNT,
  IMPORT_ACCOUNT,
  ACCOUNT_SET,
  ASKING_HAS_WHITELIST_KEY,
  ASKING_WAITLIST_EMAIL,
  ASKING_WHITELIST_KEY,
  ASKING_PLAYER_EMAIL,
  FETCHING_ETH_DATA,
  ASK_ADD_ACCOUNT,
  ADD_ACCOUNT,
  NO_HOME_PLANET,
  SEARCHING_FOR_HOME_PLANET,
  ALL_CHECKS_PASS,
  COMPLETE,
  TERMINATED,
  ERROR,
  SPECTATING,
}

type TerminalStateOptions = {
  showHelp: boolean;
};

export function GameLandingPage({ match, location }: RouteComponentProps<{ contract: string }>) {
  const history = useHistory();
  const terminalHandle = useRef<TerminalHandle>();
  const gameUIManagerRef = useRef<GameUIManager | undefined>();
  const topLevelContainer = useRef<HTMLDivElement | null>(null);
  const miniMapRef = useRef<MiniMapHandle>();

  const [gameManager, setGameManager] = useState<GameManager | undefined>();
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [initRenderState, setInitRenderState] = useState(InitRenderState.NONE);
  const [ethConnection, setEthConnection] = useState<EthConnection | undefined>();
  const [step, setStep] = useState(TerminalPromptStep.NONE);
  const [entryMode, setEntryMode] = useState<EntryMode>('pending');
  const [quickJoinSettingsOpen, setQuickJoinSettingsOpen] = useState(false);

  const entryModeRef = useRef<EntryMode>('pending');
  const entryFeeAcknowledgedRef = useRef(false);
  const skipTerminalPromptsRef = useRef(false);
  const quickBootstrapDoneRef = useRef(false);
  const quickBootstrapEffectGenRef = useRef(0);

  const [browserCompatibleState, setBrowserCompatibleState] =
    useState<BrowserCompatibleState>('unknown');
  const [browserIssues, setBrowserIssues] = useState<Incompatibility[]>([]);
  const [isMiniMapOn, setMiniMapOn] = useState(false);
  const [spectate, setSpectate] = useState(false);
  const [isEnteringUniverse, setIsEnteringUniverse] = useState(false);
  const isEnteringUniverseRef = useRef(false);
  const enterUniverseTimeoutRef = useRef<number | null>(null);

  const params = new URLSearchParams(location.search);
  // NOTE: round 2
  const useZkWhitelist = true;
  // const useZkWhitelist = params.has('zkWhitelist');
  const selectedAddress = params.get('account');
  const contractAddress = address(match.params.contract);
  const isLobby = contractAddress !== address(CONTRACT_ADDRESS);

  useEffect(() => {
    getEthConnection()
      .then((ethConnection) => setEthConnection(ethConnection))
      .catch((e) => {
        alert('error connecting to blockchain');
        console.log(e);
      });
  }, []);

  useEffect(() => {
    unsupportedFeatures().then((issues) => {
      const supported = issues.length === 0;
      setBrowserIssues(issues);
      if (supported) {
        setBrowserCompatibleState('supported');
      } else {
        setBrowserCompatibleState('unsupported');
        setTerminalVisible(true);
      }
    });
  }, []);

  useEffect(() => {
    entryModeRef.current = entryMode;
  }, [entryMode]);

  useEffect(() => {
    return () => {
      if (enterUniverseTimeoutRef.current !== null) {
        window.clearTimeout(enterUniverseTimeoutRef.current);
      }
    };
  }, []);

  const printPostUniverseWelcome = useCallback(
    (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      terminal.current?.clear();
      terminal.current?.println('Welcome to the Dark Forest Ares.', TerminalTextStyle.Green);
      terminal.current?.println('');
      terminal.current?.println(
        "This is the Dark Forest interactive JavaScript terminal. Only use this if you know exactly what you're doing."
      );
      terminal.current?.println('');
      terminal.current?.println('Try running: df.getAccount()');
      terminal.current?.println('');
    },
    []
  );

  const completeUniverseEntry = useCallback(
    (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      if (isEnteringUniverseRef.current) return;
      isEnteringUniverseRef.current = true;
      setIsEnteringUniverse(true);

      enterUniverseTimeoutRef.current = window.setTimeout(() => {
        setStep(TerminalPromptStep.COMPLETE);
        setInitRenderState(InitRenderState.COMPLETE);
        printPostUniverseWelcome(terminal);
        setIsEnteringUniverse(false);
        isEnteringUniverseRef.current = false;
        enterUniverseTimeoutRef.current = null;
      }, ENTER_TRANSITION_DURATION_MS);
    },
    [printPostUniverseWelcome]
  );

  const ensureJoinEntryFeeAcknowledged = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      if (entryFeeAcknowledgedRef.current || spectate || !ethConnection) return;

      const playerAddress = ethConnection.getAddress();
      if (!playerAddress) return;

      if (await isPlayerInitializedOnChain(ethConnection, contractAddress, playerAddress)) {
        entryFeeAcknowledgedRef.current = true;
        return;
      }

      await awaitConfirmJoinEntryFee(
        terminal.current,
        ethConnection,
        contractAddress,
        entryModeRef.current
      );
      entryFeeAcknowledgedRef.current = true;
    },
    [ethConnection, contractAddress, spectate]
  );

  const handleEntryModeSelected = useCallback(
    (choice: EntryModeChoice) => {
      setEntryMode(choice);
      if (choice === 'quick') {
        quickBootstrapDoneRef.current = false;
        setTerminalVisible(false);
      } else {
        setTerminalVisible(true);
        if (browserCompatibleState === 'supported') {
          setStep(TerminalPromptStep.COMPATIBILITY_CHECKS_PASSED);
        }
      }
    },
    [browserCompatibleState]
  );

  useEffect(() => {
    if (entryMode !== 'quick' || !ethConnection) return;

    quickBootstrapEffectGenRef.current += 1;
    const generation = quickBootstrapEffectGenRef.current;

    void (async () => {
      try {
        const issues = await unsupportedFeatures();
        if (generation !== quickBootstrapEffectGenRef.current) return;

        if (issues.length > 0) {
          setBrowserIssues(issues);
          setBrowserCompatibleState('unsupported');
          setTerminalVisible(true);
          quickBootstrapDoneRef.current = true;
          setStep(TerminalPromptStep.TERMINATED);
          return;
        }

        skipTerminalPromptsRef.current = true;

        if (selectedAddress !== null) {
          const account = reverse(getAccounts()).find((a) => a.address === selectedAddress);
          if (!account) {
            setTerminalVisible(true);
            terminalHandle.current?.println(
              'Unrecognized account found in url.',
              TerminalTextStyle.Red
            );
            quickBootstrapDoneRef.current = true;
            setStep(TerminalPromptStep.TERMINATED);
            return;
          }
          await ethConnection.setAccount(account.privateKey);
        } else {
          const accounts = getAccounts();
          if (accounts.length === 0) {
            const newWallet = Wallet.createRandom();
            const newSKey = newWallet.privateKey;
            const newAddr = address(newWallet.address);
            addAccount(newSKey);
            await ethConnection.setAccount(newSKey);
            setTerminalVisible(true);
            if (terminalHandle.current) {
              printBurnerWalletWarnings(terminalHandle.current, newAddr);
            }
          } else {
            const chosen = resolveQuickJoinAccount(accounts);
            if (!chosen) {
              throw new Error('Local accounts list was unexpectedly empty.');
            }
            await ethConnection.setAccount(chosen.privateKey);
          }
        }

        if (generation !== quickBootstrapEffectGenRef.current) return;
        quickBootstrapDoneRef.current = true;
        setStep(TerminalPromptStep.ACCOUNT_SET);
      } catch (err) {
        console.error(err);
        if (generation !== quickBootstrapEffectGenRef.current) return;
        quickBootstrapDoneRef.current = true;
        setTerminalVisible(true);
        terminalHandle.current?.println(
          err instanceof Error ? err.message : String(err),
          TerminalTextStyle.Red
        );
        terminalHandle.current?.println('Refresh the page to try again.', TerminalTextStyle.Red);
        setStep(TerminalPromptStep.TERMINATED);
      }
    })();
  }, [entryMode, ethConnection, selectedAddress]);

  const isProd = process.env.NODE_ENV === 'production';

  const advanceStateFromCompatibilityPassed = useCallback(
    async (
      terminal: React.MutableRefObject<TerminalHandle | undefined>,
      { showHelp }: TerminalStateOptions = {
        showHelp: true,
      }
    ) => {
      const accounts = getAccounts();
      const totalAccounts = accounts.length;

      if (showHelp) {
        terminal.current?.newline();

        if (isLobby) {
          terminal.current?.newline();
          terminal.current?.printElement(
            <MythicLabelText text={`You are joining a Dark Forest Ares lobby`} />
          );
          terminal.current?.newline();
          terminal.current?.newline();
        } else {
          terminal.current?.newline();
          terminal.current?.println('Login or create an account.', TerminalTextStyle.Green);
          terminal.current?.newline();
        }
        if (totalAccounts > 0) {
          terminal.current?.println(
            `Found ${totalAccounts} account${totalAccounts > 1 ? 's' : ''} on this device.`
          );
          terminal.current?.println(``);
          terminal.current?.printOption('1', 'Login with existing account.');
        }

        if (totalAccounts > 0) {
          terminal.current?.printOption('2', 'Generate new burner wallet account.');
          terminal.current?.printOption('3', 'Import private key.');
          terminal.current?.printOption('4', 'Spectate.');
        } else {
          terminal.current?.printOption('1', 'Generate new burner wallet account.');
          terminal.current?.printOption('2', 'Import private key.');
          terminal.current?.printOption('3', 'Spectate.');
        }
        terminal.current?.println(``);
        terminal.current?.println(menuInputHint(entryModeRef.current), TerminalTextStyle.Sub);
      }

      if (selectedAddress !== null) {
        terminal.current?.println(
          `Selecting account ${selectedAddress} from url...`,
          TerminalTextStyle.Green
        );

        // Search accounts backwards in case a player has used a private key more than once.
        // In that case, we want to take the most recently created account.
        const account = reverse(getAccounts()).find((a) => a.address === selectedAddress);
        if (!account) {
          terminal.current?.println('Unrecognized account found in url.', TerminalTextStyle.Red);
          return;
        }

        try {
          await ethConnection?.setAccount(account.privateKey);
          setStep(TerminalPromptStep.ACCOUNT_SET);
        } catch (e) {
          // unwanted state, client will need to reload browser here
          terminal.current?.println(
            'An unknown error occurred. please refresh the client',
            TerminalTextStyle.Red
          );
        }
        return;
      }

      const userInput = (await terminal.current?.getInput())?.trim() ?? '';

      const pickLogin = totalAccounts > 0 && userInput === '1';
      const pickNew = totalAccounts > 0 ? userInput === '2' : userInput === '1';
      const pickImport = totalAccounts > 0 ? userInput === '3' : userInput === '2';
      const pickSpectate = totalAccounts > 0 ? userInput === '4' : userInput === '3';

      if (pickLogin) {
        setStep(TerminalPromptStep.DISPLAY_ACCOUNTS);
        return;
      }
      if (pickNew) {
        setStep(TerminalPromptStep.GENERATE_ACCOUNT);
        return;
      }
      if (pickImport) {
        setStep(TerminalPromptStep.IMPORT_ACCOUNT);
        return;
      }
      if (pickSpectate) {
        setStep(TerminalPromptStep.SPECTATING);
        return;
      }

      // continue waiting for user input
      switch (true) {
        case userInput === 'clear': {
          terminal.current?.clear();
          showHelp = false;
          advanceStateFromCompatibilityPassed(terminal, {
            showHelp,
          });
          break;
        }
        case userInput === 'h' || userInput === 'help': {
          showHelp = true;
          advanceStateFromCompatibilityPassed(terminal, {
            showHelp,
          });
          break;
        }
        default: {
          terminal.current?.println(
            'Invalid option, please try press [help]',
            TerminalTextStyle.Pink
          );
          showHelp = false;
          advanceStateFromCompatibilityPassed(terminal, {
            showHelp,
          });
        }
      }
    },
    [isLobby, ethConnection, selectedAddress, entryModeRef]
  );

  const advanceStateFromDisplayAccounts = useCallback(
    async (
      terminal: React.MutableRefObject<TerminalHandle | undefined>,
      { showHelp }: TerminalStateOptions = {
        showHelp: true,
      }
    ) => {
      const accounts = getAccounts();
      const totalAccounts = accounts.length;
      if (showHelp) {
        terminal.current?.println('Login with existing account.', TerminalTextStyle.Green);
        terminal.current?.println('select account.', TerminalTextStyle.Sub);
        terminal.current?.println('');

        for (let i = 0; i < accounts.length; i += 1) {
          const rawResult = await ethConnection?.loadBalance(accounts[i].address);
          const balance = rawResult ? weiToEth(rawResult) : 0;
          const balanceLabel = balance.toFixed(9) + ' ' + TOKEN_NAME;
          const lowBalanceNote =
            balance < 0.0001 ? ' => low balance, funding steps follow next' : '';

          if (entryModeRef.current !== 'terminal') {
            terminal.current?.printOption(
              String(i + 1),
              `${accounts[i].address}  ${balanceLabel}${lowBalanceNote}`,
              { tailAfterKey: ': ' }
            );
          } else {
            terminal.current?.print(`(${i + 1}): ${accounts[i].address}  `, TerminalTextStyle.Sub);
            if (balance < 0.0001) {
              terminal.current?.print(balanceLabel, TerminalTextStyle.Red);
              terminal.current?.println(lowBalanceNote);
            } else {
              terminal.current?.println(balanceLabel, TerminalTextStyle.Green);
            }
          }
        }
        terminal.current?.println('');
        terminal.current?.println(menuInputHint(entryModeRef.current), TerminalTextStyle.Sub);
      }

      const userInput = (await terminal.current?.getInput())?.trim() ?? '';
      const selection = userInput !== '' ? Number(userInput) : NaN;

      // stop option, go to next step
      if (Number.isInteger(selection) && accounts[selection - 1] !== undefined) {
        const account = accounts[selection - 1];
        try {
          await ethConnection?.setAccount(account.privateKey);
          setStep(TerminalPromptStep.ACCOUNT_SET);
        } catch (e) {
          terminal.current?.println(
            'An unknown error occurred. please refresh the client.',
            TerminalTextStyle.Red
          );
          advanceStateFromDisplayAccounts(terminal, {
            showHelp: false,
          });
        }
        return;
      }

      // continue waiting for user input
      switch (true) {
        case userInput === 'clear': {
          terminal.current?.clear();
          showHelp = false;
          break;
        }
        case userInput === 'h' || userInput === 'help': {
          showHelp = true;
          break;
        }
        default: {
          terminal.current?.println(
            'Invalid option, please try press [help].',
            TerminalTextStyle.Pink
          );
          showHelp = false;
        }
      }

      advanceStateFromDisplayAccounts(terminal, { showHelp });
    },
    [ethConnection]
  );

  const advanceStateFromGenerateAccount = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      const newWallet = Wallet.createRandom();
      const newSKey = newWallet.privateKey;
      const newAddr = address(newWallet.address);

      try {
        addAccount(newSKey);
        await ethConnection?.setAccount(newSKey);
        if (terminal.current) {
          printBurnerWalletWarnings(terminal.current, newAddr);
        }
        printAckPrompt(
          terminal.current,
          entryModeRef.current,
          'Continue',
          'Press [enter] to continue.'
        );

        await terminal.current?.getInput();
        setStep(TerminalPromptStep.ACCOUNT_SET);
      } catch (e) {
        // unwanted state, user will need to reload browser here
        terminal.current?.println(
          'An unknown error occurred. please refresh the client.',
          TerminalTextStyle.Red
        );
      }
    },
    [ethConnection]
  );

  const advanceStateFromImportAccount = useCallback(
    async (
      terminal: React.MutableRefObject<TerminalHandle | undefined>,
      { showHelp }: TerminalStateOptions = {
        showHelp: true,
      }
    ) => {
      if (showHelp) {
        terminal.current?.println('Import private key.', TerminalTextStyle.Green);
        terminal.current?.println(
          'Enter the 0x-prefixed private key of the account you wish to import',
          TerminalTextStyle.Text
        );
        terminal.current?.println(
          "NOTE: THIS WILL STORE THE PRIVATE KEY IN YOUR BROWSER'S LOCAL STORAGE",
          TerminalTextStyle.Text
        );
        terminal.current?.println(
          'Local storage is relatively insecure. We recommend only importing accounts with zero-to-no funds.'
        );
      }

      const userInput = (await terminal.current?.getInput())?.trim() ?? '';
      const validSkeyPattern = /^0x[0-9a-fA-F]{64}$/;
      if (validSkeyPattern.test(userInput)) {
        try {
          const newSKey = userInput;
          const newAddr = address(utils.computeAddress(newSKey));

          addAccount(newSKey);

          await ethConnection?.setAccount(newSKey);
          terminal.current?.println(`Imported account with address ${newAddr}.`);
          setStep(TerminalPromptStep.ACCOUNT_SET);
          return;
        } catch (e) {
          terminal.current?.println(
            'An unknown error occurred. please refresh the page.',
            TerminalTextStyle.Red
          );
          advanceStateFromImportAccount(terminal, { showHelp: false });
          return;
        }
      }

      // continue waiting for user input
      switch (true) {
        case userInput === 'clear': {
          terminal.current?.clear();
          showHelp = false;
          break;
        }
        case userInput === 'h' || userInput === 'help': {
          showHelp = true;
          break;
        }
        default: {
          terminal.current?.println('Invalid option, please try again.', TerminalTextStyle.Red);
          showHelp = false;
        }
      }

      advanceStateFromImportAccount(terminal, { showHelp });
    },
    [ethConnection]
  );

  const advanceStateFromAccountSet = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      try {
        const playerAddress = ethConnection?.getAddress();
        if (!playerAddress || !ethConnection) throw new Error('not logged in');

        terminal.current?.println('Checking account balance... ');

        const balance = weiToEth(await ethConnection.loadBalance(playerAddress));

        if (balance < 0.0001) {
          terminal.current?.print(`   Your account: `);
          terminal.current?.println(`${playerAddress}`, TerminalTextStyle.Green);

          const privateKey = ethConnection.getPrivateKey();
          if (privateKey) {
            terminal.current?.print('    Private Key: ');
            terminal.current?.printElement(
              <CopyToClipboardButton text={privateKey} label='click to copy private key' />
            );
          }

          terminal.current?.println('');

          terminal.current?.print(`   Your balance: `);
          terminal.current?.print(`${balance.toFixed(9)} ${TOKEN_NAME}`, TerminalTextStyle.Red);

          terminal.current?.println(' <= recommend depositing enough for entry fee + gas');

          terminal.current?.print(`           NOTE: `, TerminalTextStyle.Pink);

          terminal.current?.println(
            `You can use bridge to transfer ${TOKEN_NAME} to ${BLOCKCHAIN_NAME}`,
            TerminalTextStyle.Pink
          );

          terminal.current?.print('         bridge: ');

          terminal.current?.printLink(
            BLOCKCHAIN_BRIDGE,
            () => {
              window.open(BLOCKCHAIN_BRIDGE);
            },
            TerminalTextStyle.Green
          );

          terminal.current?.println(` <= transfer ${TOKEN_NAME} to ${BLOCKCHAIN_NAME}`);

          terminal.current?.print('   Player guide: ');

          terminal.current?.printLink(
            `How to get ${TOKEN_NAME} on ${BLOCKCHAIN_NAME} for your account`,
            () => {
              window.open(HOW_TO_GET_ETH);
            },
            TerminalTextStyle.Green
          );
          terminal.current?.println(' <= please check this guide', TerminalTextStyle.Pink);

          terminal.current?.println('');

          if (entryModeRef.current !== 'terminal') {
            terminal.current?.println(
              `After your account has ${TOKEN_NAME} on ${BLOCKCHAIN_NAME}, continue when ready.`,
              TerminalTextStyle.Pink
            );
            terminal.current?.println('');
            terminal.current?.printOption('1', 'Continue', { hideKey: true });
            terminal.current?.println('');
            terminal.current?.println(menuInputHint(entryModeRef.current), TerminalTextStyle.Sub);
          } else {
            terminal.current?.println(
              `After your account has ${TOKEN_NAME} on ${BLOCKCHAIN_NAME}, press [enter] to continue.`,
              TerminalTextStyle.Pink
            );
          }

          const userInput = (await terminal.current?.getInput())?.trim() ?? '';
          let showHelp = true;

          // continue waiting for user input
          switch (true) {
            case userInput === '' || userInput === '1': {
              advanceStateFromAccountSet(terminal);
              return;
            }
            case userInput === 'clear': {
              terminal.current?.clear();
              showHelp = false;
              advanceStateFromCompatibilityPassed(terminal, {
                showHelp,
              });
              break;
            }
            case userInput === 'h' || userInput === 'help': {
              showHelp = true;
              advanceStateFromCompatibilityPassed(terminal, {
                showHelp,
              });
              break;
            }
            default: {
              terminal.current?.println(
                'Invalid option, please try press [help].',
                TerminalTextStyle.Pink
              );
              showHelp = false;
              advanceStateFromCompatibilityPassed(terminal, {
                showHelp,
              });
            }
          }
          return;
        }

        await ensureJoinEntryFeeAcknowledged(terminal);

        const whitelist = await ethConnection.loadContract<DarkForest>(
          contractAddress,
          loadDiamondContract
        );
        const isWhitelisted = await whitelist.isWhitelisted(playerAddress);
        // TODO(#2329): isWhitelisted should just check the contractOwner
        const adminAddress = address(await whitelist.adminAddress());

        if (isWhitelisted === false && playerAddress !== adminAddress) {
          terminal.current?.println('');
          terminal.current?.println(
            'Registered players can enter in advance. The Game will be open to everyone soon.',
            TerminalTextStyle.Pink
          );
        }
        terminal.current?.println('');

        terminal.current?.print('Checking if whitelisted... ');

        // TODO(#2329): isWhitelisted should just check the contractOwner
        if (isWhitelisted || playerAddress === adminAddress) {
          terminal.current?.println('Player whitelisted.');
          terminal.current?.println('');
          terminal.current?.println(`Welcome, player ${playerAddress}.`);
          // TODO: Provide own env variable for this feature
          if (!isProd) {
            // in development, automatically get some ether from faucet
            const balance = weiToEth(await ethConnection?.loadBalance(playerAddress));
            if (balance === 0) {
              await requestDevFaucet(playerAddress);
            }
          }
          setStep(TerminalPromptStep.FETCHING_ETH_DATA);
        } else {
          setStep(TerminalPromptStep.ASKING_HAS_WHITELIST_KEY);
        }
      } catch (e) {
        console.error(`error connecting to whitelist: ${e}`);
        terminal.current?.println(
          'ERROR: Could not connect to whitelist contract. Please refresh and try again in a few minutes.',
          TerminalTextStyle.Red
        );
        setStep(TerminalPromptStep.TERMINATED);
      }
    },
    [ethConnection, isProd, contractAddress, spectate, ensureJoinEntryFeeAcknowledged]
  );

  const advanceStateFromAskHasWhitelistKey = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      terminal.current?.println('Do you have a whitelist key?', TerminalTextStyle.Text);
      terminal.current?.println('');
      terminal.current?.printOption('1', 'Yes');
      terminal.current?.printOption('2', 'No');
      terminal.current?.println('');
      terminal.current?.println(menuInputHint(entryModeRef.current), TerminalTextStyle.Sub);
      const userInput = await terminal.current?.getInput();
      if (userInput === '1') {
        setStep(TerminalPromptStep.ASKING_WHITELIST_KEY);
      } else if (userInput === '2') {
        setStep(TerminalPromptStep.ASKING_WAITLIST_EMAIL);
      } else {
        terminal.current?.println('Unrecognized input. Please try again.');
        advanceStateFromAskHasWhitelistKey(terminal);
      }
    },
    []
  );

  const advanceStateFromAskWhitelistKey = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      const address = ethConnection?.getAddress();
      if (!address) throw new Error('not logged in');

      terminal.current?.println(
        'Please enter your invite key (XXXXXX-XXXXXX-XXXXXX-XXXXXX):',
        TerminalTextStyle.Sub
      );

      const key = (await terminal.current?.getInput()) || '';

      terminal.current?.print('Processing key... (this may take up to 30s)');
      terminal.current?.newline();

      if (!useZkWhitelist) {
        let registerConfirmationResponse = {} as RegisterConfirmationResponse;
        try {
          registerConfirmationResponse = await callRegisterAndWaitForConfirmation(
            key,
            address,
            terminal
          );
        } catch (e) {
          registerConfirmationResponse = {
            canRetry: true,
            errorMessage:
              'There was an error connecting to the whitelist server. Please try again later.',
          };
        }

        if (!registerConfirmationResponse.txHash) {
          terminal.current?.println(
            'ERROR: ' + registerConfirmationResponse.errorMessage,
            TerminalTextStyle.Red
          );
          if (registerConfirmationResponse.canRetry) {
            printAckPrompt(
              terminal.current,
              entryModeRef.current,
              'Try again',
              'Press any key to try again.'
            );
            await terminal.current?.getInput();
            advanceStateFromAskWhitelistKey(terminal);
          } else {
            setStep(TerminalPromptStep.ASKING_WAITLIST_EMAIL);
          }
        } else {
          terminal.current?.print('Successfully joined game. ', TerminalTextStyle.Green);
          terminal.current?.print(`Welcome, player `);
          terminal.current?.println(address, TerminalTextStyle.Text);
          terminal.current?.print('Sent player $0.15 :) ', TerminalTextStyle.Blue);
          terminal.current?.printLink(
            '(View Transaction)',
            () => {
              window.open(`${BLOCK_EXPLORER_URL}/tx/${registerConfirmationResponse.txHash}`);
            },
            TerminalTextStyle.Blue
          );
          terminal.current?.newline();
          setStep(TerminalPromptStep.ASKING_PLAYER_EMAIL);
        }
      } else {
        if (!ethConnection) throw new Error('no eth connection');
        const contractsAPI = await makeContractsAPI({ connection: ethConnection, contractAddress });

        const keyBigInt = bigIntFromKey(key);
        const snarkArgs = await getWhitelistArgs(keyBigInt, address, terminal);
        try {
          const getArgs = async () => {
            return [
              snarkArgs[ZKArgIdx.PROOF_A],
              snarkArgs[ZKArgIdx.PROOF_B],
              snarkArgs[ZKArgIdx.PROOF_C],
              [...snarkArgs[ZKArgIdx.DATA]],
            ];
          };

          const txIntent: UnconfirmedUseKey = {
            contract: contractsAPI.contract,
            methodName: 'useKey',
            args: getArgs(),
          };

          console.log(txIntent);
          const tx = await contractsAPI.submitTransaction(txIntent);
          console.log(tx);

          // const ukReceipt = await contractsAPI.contract.useKey(
          //   snarkArgs[ZKArgIdx.PROOF_A],
          //   snarkArgs[ZKArgIdx.PROOF_B],
          //   snarkArgs[ZKArgIdx.PROOF_C],
          //   [...snarkArgs[ZKArgIdx.DATA]]
          // );
          // await ukReceipt.wait();
          terminal.current?.print('Successfully joined game. ', TerminalTextStyle.Green);
          terminal.current?.print(`Welcome, player `);
          terminal.current?.println(address, TerminalTextStyle.Text);
          // terminal.current?.print('Sent player $0.15 :) ', TerminalTextStyle.Blue);
          // terminal.current?.printLink(
          //   '(View Transaction)',
          //   () => {
          //     window.open(`${BLOCK_EXPLORER_URL}/tx/${ukReceipt.hash}`);
          //   },
          //   TerminalTextStyle.Blue
          // );

          terminal.current?.printLink(
            '(View Transaction)',
            () => {
              window.open(`${BLOCK_EXPLORER_URL}/tx/${tx.hash}`);
            },
            TerminalTextStyle.Pink
          );
          terminal.current?.newline();
          // setStep(TerminalPromptStep.ASKING_PLAYER_EMAIL);
          setStep(TerminalPromptStep.FETCHING_ETH_DATA);
        } catch (e) {
          const error = e.error;
          if (error instanceof Error) {
            const invalidKey = error.message.includes('invalid key');
            if (invalidKey) {
              terminal.current?.println(`ERROR: Key ${key} is not valid.`, TerminalTextStyle.Red);
              setStep(TerminalPromptStep.ASKING_WAITLIST_EMAIL);
            } else {
              terminal.current?.println(`ERROR: Something went wrong.`, TerminalTextStyle.Red);
              printAckPrompt(
                terminal.current,
                entryModeRef.current,
                'Try again',
                'Press [Enter] to try again.'
              );
              await terminal.current?.getInput();
              advanceStateFromAskWhitelistKey(terminal);
            }
          }
          console.error('Error whitelisting.');
        }
      }
    },
    [ethConnection, contractAddress, useZkWhitelist]
  );

  const advanceStateFromAskWaitlistEmail = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      terminal.current?.println(
        'Enter your email address to sign up for the whitelist.',
        TerminalTextStyle.Text
      );
      const email = (await terminal.current?.getInput()) || '';
      terminal.current?.print('Response pending... ');
      const response = await submitInterestedEmail(email);
      if (response === EmailResponse.Success) {
        terminal.current?.println('Email successfully recorded. ', TerminalTextStyle.Green);
        terminal.current?.println(
          'Keep an eye out for updates and invite keys in the next few weeks.',
          TerminalTextStyle.Sub
        );
        printAckPrompt(
          terminal.current,
          entryModeRef.current,
          'Return to homepage',
          'Press ENTER to return to the homepage.'
        );
        setStep(TerminalPromptStep.TERMINATED);
        (await await terminal.current?.getInput()) || '';
        history.push('/');
      } else if (response === EmailResponse.Invalid) {
        terminal.current?.println('Email invalid. Please try again.', TerminalTextStyle.Red);
      } else {
        terminal.current?.print('ERROR: Server error. ', TerminalTextStyle.Red);
        printAckPrompt(
          terminal.current,
          entryModeRef.current,
          'Return to homepage',
          'Press ENTER to return to homepage.'
        );
        (await await terminal.current?.getInput()) || '';
        setStep(TerminalPromptStep.TERMINATED);
        history.push('/');
      }
    },
    [history]
  );

  const advanceStateFromAskPlayerEmail = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      const address = ethConnection?.getAddress();
      if (!address) throw new Error('not logged in');

      terminal.current?.print('Enter your email address. ', TerminalTextStyle.Text);
      terminal.current?.println("We'll use this email address to notify you if you win a prize.");

      const email = (await terminal.current?.getInput()) || '';
      const response = await submitPlayerEmail(await ethConnection?.signMessageObject({ email }));

      if (response === EmailResponse.Success) {
        terminal.current?.println('Email successfully recorded.');
        setStep(TerminalPromptStep.FETCHING_ETH_DATA);
      } else if (response === EmailResponse.Invalid) {
        terminal.current?.println('Email invalid.', TerminalTextStyle.Red);
        advanceStateFromAskPlayerEmail(terminal);
      } else {
        terminal.current?.println('Error recording email.', TerminalTextStyle.Red);
        setStep(TerminalPromptStep.FETCHING_ETH_DATA);
      }
    },
    [ethConnection]
  );

  const advanceStateFromFetchingEthData = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      let newGameManager: GameManager;

      try {
        if (!ethConnection) throw new Error('no eth connection');

        newGameManager = await GameManager.create({
          connection: ethConnection,
          terminal,
          contractAddress,
          spectate,
        });
      } catch (e) {
        console.error(e);

        setStep(TerminalPromptStep.ERROR);

        terminal.current?.print(
          'Network under heavy load. Please refresh the page, and check ',
          TerminalTextStyle.Red
        );

        terminal.current?.printLink(
          BLOCK_EXPLORER_URL,
          () => {
            window.open(BLOCK_EXPLORER_URL);
          },
          TerminalTextStyle.Red
        );

        terminal.current?.println('');

        return;
      }

      setGameManager(newGameManager);

      window.df = newGameManager;

      const newGameUIManager = await GameUIManager.create(newGameManager, terminal);

      window.ui = newGameUIManager;

      terminal.current?.newline();
      terminal.current?.println('Connected to Dark Forest Ares Contract');

      terminal.current?.newline();
      terminal.current?.println('Welcome to DARK FOREST ARES.');
      terminal.current?.newline();
      //NOTE: round 4 don't collect those information
      // terminal.current?.println('We collect a minimal set of statistics such as SNARK proving');
      // terminal.current?.println('times and average transaction times across browsers, to help ');
      // terminal.current?.println('us optimize performance and fix bugs. You can opt out of this');
      // terminal.current?.println('in the Settings pane.');
      // terminal.current?.newline();

      gameUIManagerRef.current = newGameUIManager;

      if (!newGameManager.hasJoinedGame() && spectate === false) {
        setStep(TerminalPromptStep.NO_HOME_PLANET);
      } else {
        const browserHasData = !!newGameManager.getHomeCoords();

        if (spectate) {
          terminal.current?.println(
            'Spectate mode need to input the center coords.',
            TerminalTextStyle.Text
          );
          setStep(TerminalPromptStep.ASK_ADD_ACCOUNT);
          return;
        }

        if (!browserHasData) {
          terminal.current?.println(
            'ERROR: Home coords not found on this browser.',
            TerminalTextStyle.Red
          );
          terminal.current?.println(
            'Home coordinates cannot be recovered from the blockchain. Please import your saved x, y coordinates.',
            TerminalTextStyle.Text
          );
          setStep(TerminalPromptStep.ASK_ADD_ACCOUNT);
          return;
        }

        terminal.current?.println('Validated Local Data...');
        setStep(TerminalPromptStep.ALL_CHECKS_PASS);
      }
    },
    [ethConnection, contractAddress, spectate]
  );

  const advanceStateFromAskAddAccount = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      if (spectate) {
        setStep(TerminalPromptStep.ADD_ACCOUNT);
        return;
      }

      terminal.current?.println('Import account home coordinates?', TerminalTextStyle.Text);
      terminal.current?.println(
        "If you're importing an account, make sure you know what you're doing."
      );
      terminal.current?.println('');
      terminal.current?.printOption('1', 'Yes');
      terminal.current?.printOption('2', 'No');
      terminal.current?.println('');
      terminal.current?.println(menuInputHint(entryModeRef.current), TerminalTextStyle.Sub);
      const userInput = await terminal.current?.getInput();
      if (userInput === '1') {
        setStep(TerminalPromptStep.ADD_ACCOUNT);
      } else if (userInput === '2') {
        terminal.current?.println('Try using a different account and reload.');
        setStep(TerminalPromptStep.TERMINATED);
      } else {
        terminal.current?.println('Unrecognized input. Please try again.');
        advanceStateFromAskAddAccount(terminal);
      }
    },
    [spectate]
  );

  const advanceStateFromAddAccount = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      const gameUIManager = gameUIManagerRef.current;

      if (gameUIManager) {
        try {
          if (spectate) {
            if (await gameUIManager.addAccount({ x: 0, y: 0 })) {
              terminal.current?.println('Successfully added account.');
              terminal.current?.println('Initializing game...');
              setStep(TerminalPromptStep.ALL_CHECKS_PASS);
            } else {
              throw 'Invalid home coordinates.';
            }
          } else {
            terminal.current?.println('x: ', TerminalTextStyle.Blue);
            const x = parseInt((await terminal.current?.getInput()) || '');
            terminal.current?.println('y: ', TerminalTextStyle.Blue);
            const y = parseInt((await terminal.current?.getInput()) || '');
            if (
              Number.isNaN(x) ||
              Number.isNaN(y) ||
              Math.abs(x) > 2 ** 32 ||
              Math.abs(y) > 2 ** 32
            ) {
              throw 'Invalid home coordinates.';
            }
            if (await gameUIManager.addAccount({ x, y })) {
              terminal.current?.println('Successfully added account.');
              terminal.current?.println('Initializing game...');
              setStep(TerminalPromptStep.ALL_CHECKS_PASS);
            } else {
              throw 'Invalid home coordinates.';
            }
          }
        } catch (e) {
          terminal.current?.println(`ERROR: ${e}`, TerminalTextStyle.Red);
          terminal.current?.println('Please try again.');
        }
      } else {
        terminal.current?.println('ERROR: Game UI Manager not found. Terminating session.');
        setStep(TerminalPromptStep.TERMINATED);
      }
    },
    [spectate]
  );

  const advanceStateFromNoHomePlanet = useCallback(
    async (
      terminal: React.MutableRefObject<TerminalHandle | undefined>,
      { showHelp }: TerminalStateOptions = {
        showHelp: true,
      }
    ) => {
      const gameUIManager = gameUIManagerRef.current;
      if (!gameUIManager) {
        terminal.current?.println(
          'ERROR: Game UI Manager not found. Terminating session.',
          TerminalTextStyle.Red
        );
        setStep(TerminalPromptStep.TERMINATED);
        return;
      }

      // if (Date.now() / 1000 > gameUIManager.getEndTimeSeconds()) {
      //   terminal.current?.println(
      //     'ERROR: This game has ended. Terminating session.',
      //     TerminalTextStyle.Red
      //   );
      //   setStep(TerminalPromptStep.TERMINATED);
      //   return;
      // }

      let setX = undefined;
      let setY = undefined;

      const params = new URLSearchParams(window.location.search);
      if (params.has('searchCenter')) {
        const parts = params.get('searchCenter')?.split(',');

        if (parts) {
          setX = parseInt(parts[0], 10);
          setY = parseInt(parts[1], 10);
        }
      }

      if (setX && setY) {
        const coords = { x: setX, y: setY };
        const distFromOrigin = Math.sqrt(coords.x ** 2 + coords.y ** 2);
        terminal.current?.println(
          `Spawn coordinates: (${coords.x.toFixed(0)}, ${coords.y.toFixed(
            0
          )}        ) were selected, distance from center: ${distFromOrigin.toFixed(0)}.`
        );

        gameUIManager.getGameManager().on(GameManagerEvent.InitializedPlayer, () => {
          setTimeout(() => {
            setMiniMapOn(false);

            terminal.current?.println('Initializing game...');
            setStep(TerminalPromptStep.ALL_CHECKS_PASS);
          });
        });

        gameUIManager
          .joinGame(
            async (e) => {
              // TODO: Handle 2min timeout error
              setMiniMapOn(false);

              console.error(e);

              terminal.current?.println('Error Joining Game:');
              terminal.current?.println(e.message, TerminalTextStyle.Red);
              terminal.current?.newline();

              console.log(e.message.slice(0, 20));

              if (e.message.slice(0, 20) === 'Please enable popups') {
                terminal.current?.print('Player guide: ', TerminalTextStyle.Pink);

                terminal.current?.printLink(
                  'How to enable popups',
                  () => {
                    window.open(HOW_TO_ENABLE_POPUPS);
                  },
                  TerminalTextStyle.Green
                );
                terminal.current?.println(
                  ' <= New player please check this guide!!!',
                  TerminalTextStyle.Pink
                );

                terminal.current?.println('');
              } else if (e.message === 'transaction reverted') {
                terminal.current?.println(
                  'Please refresh the client, choose another area and try again.',
                  TerminalTextStyle.Pink
                );

                terminal.current?.println('');
              }

              // terminal.current?.println(
              //   "Don't worry :-) you can get more ETH on Redstone this way 😘",
              //   TerminalTextStyle.Pink
              // );

              // terminal.current?.newline();
              // terminal.current?.printLink(
              //   'Deposit ETH to Redstone',
              //   () => {
              //     window.open(BLOCKCHAIN_BRIDGE);
              //   },
              //   TerminalTextStyle.Pink
              // );
              // terminal.current?.newline();
              // terminal.current?.newline();

              printAckPrompt(
                terminal.current,
                entryModeRef.current,
                'Try again',
                'Press [enter] to Try Again:'
              );

              await terminal.current?.getInput();
              return true;
            },
            coords,
            spectate
          )
          .catch((error: Error) => {
            terminal.current?.println(
              `[ERROR] An error occurred: ${error.toString().slice(0, 10000)}`,
              TerminalTextStyle.Red
            );
            terminal.current?.println(
              'please refresh client to try again.',
              TerminalTextStyle.Pink
            );
          });
      } else {
        if (!entryFeeAcknowledgedRef.current && !spectate) {
          await ensureJoinEntryFeeAcknowledged(terminal);
        }

        const printSpawnSelectionHelp = async (fullInstructions: boolean) => {
          if (fullInstructions) {
            terminal.current?.println('Select home planet.', TerminalTextStyle.Green);
            terminal.current?.newline();
            terminal.current?.print('Step 1: ', TerminalTextStyle.Sub);
            if (entryModeRef.current !== 'terminal') {
              terminal.current?.print('Click a ', TerminalTextStyle.Sub);
              terminal.current?.print('blue square', TerminalTextStyle.Blue);
              terminal.current?.println(' on the minimap to choose your spawn area.');
            } else {
              terminal.current?.print('Left-click a ', TerminalTextStyle.Sub);
              terminal.current?.print('blue square', TerminalTextStyle.Blue);
              terminal.current?.println(' on the minimap to choose your spawn area.');
            }
          }
          if (entryModeRef.current !== 'terminal') {
            if (fullInstructions) {
              terminal.current?.print('Step 2: ', TerminalTextStyle.Sub);
              terminal.current?.println('Confirm when you have picked a location.');
            }
            terminal.current?.newline();
            terminal.current?.printOption('1', 'Confirm spawn selection', { hideKey: true });
            terminal.current?.println('');
            terminal.current?.println(menuInputHint(entryModeRef.current), TerminalTextStyle.Sub);
          } else if (fullInstructions) {
            terminal.current?.print('Step 2: ', TerminalTextStyle.Sub);
            terminal.current?.print('Click the ', TerminalTextStyle.Sub);
            terminal.current?.print('prompt line below', TerminalTextStyle.Pink);
            terminal.current?.println(', then press [enter] to confirm.');
          }
        };

        if (showHelp) {
          await printSpawnSelectionHelp(true);
        }

        setMiniMapOn(true);
        // let the miniMap component mount
        await new Promise((resolve) => setTimeout(resolve, 100));

        let selectedSpawnArea: ReturnType<NonNullable<MiniMapHandle>['getSelectedSpawnArea']>;
        while (true) {
          const userInput = ((await terminal.current?.getInput()) ?? '').trim();
          selectedSpawnArea = miniMapRef.current?.getSelectedSpawnArea();

          if (userInput === 'clear') {
            terminal.current?.clear();
            await printSpawnSelectionHelp(true);
            continue;
          }
          if (userInput === 'h' || userInput === 'help') {
            await printSpawnSelectionHelp(true);
            continue;
          }
          if (userInput !== '' && userInput !== '1') {
            terminal.current?.println(
              'Invalid option, please try press [help]',
              TerminalTextStyle.Pink
            );
            await printSpawnSelectionHelp(entryModeRef.current === 'terminal');
            continue;
          }

          if (!selectedSpawnArea) {
            terminal.current?.println(
              entryModeRef.current !== 'terminal'
                ? 'Pick a blue square on the minimap, then click Confirm spawn selection.'
                : 'Pick a blue square on the minimap, then press [enter] to confirm.',
              TerminalTextStyle.Red
            );
            await printSpawnSelectionHelp(entryModeRef.current === 'terminal');
            continue;
          }

          break;
        }

        // disable reselect of spawn posistion when we start searching
        miniMapRef.current?.setSelectable(false);

        const coords = selectedSpawnArea.worldPoint;
        const distFromOrigin = Math.sqrt(coords.x ** 2 + coords.y ** 2);
        terminal.current?.println(
          `Spawn coordinates: (${coords.x.toFixed(0)}, ${coords.y.toFixed(
            0
          )}) were selected, distance from center: ${distFromOrigin.toFixed(0)}.`
        );

        gameUIManager.getGameManager().on(GameManagerEvent.InitializedPlayer, () => {
          setTimeout(() => {
            setMiniMapOn(false);

            terminal.current?.println('Initializing game...');
            setStep(TerminalPromptStep.ALL_CHECKS_PASS);
          });
        });

        gameUIManager
          .joinGame(
            async (e) => {
              // TODO: Handle 2min timeout error
              setMiniMapOn(false);

              console.error(e);

              terminal.current?.println('Error Joining Game:');
              terminal.current?.println(e.message, TerminalTextStyle.Red);
              terminal.current?.newline();

              console.log(e.message.slice(0, 20));

              if (e.message.slice(0, 20) === 'Please enable popups') {
                terminal.current?.print('Player guide: ', TerminalTextStyle.Pink);

                terminal.current?.printLink(
                  'How to enable popups',
                  () => {
                    window.open(HOW_TO_ENABLE_POPUPS);
                  },
                  TerminalTextStyle.Green
                );
                terminal.current?.println(
                  ' <= New player please check this guide!!!',
                  TerminalTextStyle.Pink
                );

                terminal.current?.println('');
              } else if (e.message === 'transaction reverted') {
                terminal.current?.println(
                  'Please refresh the client, choose another area and try again.',
                  TerminalTextStyle.Pink
                );

                terminal.current?.println('');
              }

              // terminal.current?.println(
              //   "Don't worry :-) you can get more ETH on Redstone this way 😘",
              //   TerminalTextStyle.Pink
              // );

              // terminal.current?.newline();
              // terminal.current?.printLink(
              //   'Deposit ETH to Redstone',
              //   () => {
              //     window.open(BLOCKCHAIN_BRIDGE);
              //   },
              //   TerminalTextStyle.Pink
              // );
              // terminal.current?.newline();
              // terminal.current?.newline();

              printAckPrompt(
                terminal.current,
                entryModeRef.current,
                'Try again',
                'Press [enter] to Try Again:'
              );

              await terminal.current?.getInput();
              return true;
            },
            coords,
            spectate
          )
          .catch((error: Error) => {
            terminal.current?.println(
              `[ERROR] An error occurred: ${error.toString().slice(0, 10000)}`,
              TerminalTextStyle.Red
            );
            terminal.current?.println(
              'please refresh client to try again.',
              TerminalTextStyle.Pink
            );
          });
      }
    },
    [ethConnection, spectate, contractAddress, ensureJoinEntryFeeAcknowledged]
  );

  const advanceStateFromAllChecksPass = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>, showHelp = true) => {
      if (skipTerminalPromptsRef.current) {
        completeUniverseEntry(terminal);
        return;
      }

      if (showHelp) {
        terminal.current?.println('Enter universe.', TerminalTextStyle.Green);
        terminal.current?.println('');
        if (entryModeRef.current !== 'terminal') {
          terminal.current?.printOption('1', 'Enter Universe', { hideKey: true });
          terminal.current?.printOption('2', 'Enter Universe in SAFE MODE - plugins disabled', {
            hideKey: true,
          });
        } else {
          terminal.current?.println('Press [enter] to enter universe');
          terminal.current?.println('Type [2] then [enter] for SAFE MODE - plugins disabled');
        }
        terminal.current?.println('');
        if (entryModeRef.current !== 'terminal') {
          terminal.current?.println(menuInputHint(entryModeRef.current), TerminalTextStyle.Sub);
        }
      }

      const input = (await terminal.current?.getInput())?.trim() ?? '';
      switch (true) {
        case input === '2': {
          const gameUIManager = gameUIManagerRef.current;
          gameUIManager?.getGameManager()?.setSafeMode(true);
          break;
        }
        case input === 'h' || input === 'help': {
          advanceStateFromAllChecksPass(terminal, true);
          return;
        }
        case input === 'clear': {
          terminal.current?.clear();
          advanceStateFromAllChecksPass(terminal, false);
          return;
        }
        case input !== '' && input !== '1': {
          terminal.current?.println('Invalid option, please try again...', TerminalTextStyle.Red);
          advanceStateFromAllChecksPass(terminal, false);
          return;
        }
      }

      completeUniverseEntry(terminal);
    },
    [completeUniverseEntry]
  );

  const advanceStateFromComplete = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      const input = (await terminal.current?.getInput()) || '';
      let res = '';
      try {
        // indrect eval call: http://perfectionkills.com/global-eval-what-are-the-options/
        const indirectEval = globalThis.eval;
        res = indirectEval(input) as string;
        if (res !== undefined) {
          terminal.current?.println(res.toString(), TerminalTextStyle.Text);
        }
      } catch (e) {
        res = e.message;
        terminal.current?.println(`ERROR: ${res}`, TerminalTextStyle.Red);
      }
      advanceStateFromComplete(terminal);
    },
    []
  );

  const advanceStateFromError = useCallback(async () => {
    await neverResolves();
  }, []);

  const advanceStateFromSpectating = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      try {
        if (!ethConnection) throw new Error('not logged in');

        setSpectate(true);
        setMiniMapOn(false);
        console.log('specatate:', spectate);
        console.log('isMiniMapOn:', isMiniMapOn);

        setStep(TerminalPromptStep.FETCHING_ETH_DATA);
      } catch (e) {
        console.error(e);
        setStep(TerminalPromptStep.ERROR);
        terminal.current?.print(
          'Network under heavy load. Please refresh the page, and check ',
          TerminalTextStyle.Red
        );
        terminal.current?.printLink(
          BLOCK_EXPLORER_URL,
          () => {
            window.open(BLOCK_EXPLORER_URL);
          },
          TerminalTextStyle.Red
        );
        terminal.current?.println('');
        return;
      }
    },
    [ethConnection, isProd, contractAddress, spectate]
  );

  const advanceState = useCallback(
    (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      if (browserCompatibleState !== 'supported') {
        return;
      }
      if (ethConnection === undefined) {
        return;
      }

      switch (true) {
        case step === TerminalPromptStep.COMPATIBILITY_CHECKS_PASSED:
          advanceStateFromCompatibilityPassed(terminal);
          return;
        case step === TerminalPromptStep.DISPLAY_ACCOUNTS:
          advanceStateFromDisplayAccounts(terminal);
          return;
        case step === TerminalPromptStep.GENERATE_ACCOUNT:
          advanceStateFromGenerateAccount(terminal);
          return;
        case step === TerminalPromptStep.IMPORT_ACCOUNT:
          advanceStateFromImportAccount(terminal);
          return;
        case step === TerminalPromptStep.ACCOUNT_SET:
          advanceStateFromAccountSet(terminal);
          return;
        case step === TerminalPromptStep.ASKING_HAS_WHITELIST_KEY:
          advanceStateFromAskHasWhitelistKey(terminal);
          return;
        case step === TerminalPromptStep.ASKING_WHITELIST_KEY:
          advanceStateFromAskWhitelistKey(terminal);
          return;
        case step === TerminalPromptStep.ASKING_WAITLIST_EMAIL:
          advanceStateFromAskWaitlistEmail(terminal);
          return;
        case step === TerminalPromptStep.ASKING_PLAYER_EMAIL:
          advanceStateFromAskPlayerEmail(terminal);
          return;
        case step === TerminalPromptStep.FETCHING_ETH_DATA:
          advanceStateFromFetchingEthData(terminal);
          return;
        case step === TerminalPromptStep.ASK_ADD_ACCOUNT:
          advanceStateFromAskAddAccount(terminal);
          return;
        case step === TerminalPromptStep.ADD_ACCOUNT:
          advanceStateFromAddAccount(terminal);
          return;
        case step === TerminalPromptStep.NO_HOME_PLANET:
          advanceStateFromNoHomePlanet(terminal);
          return;
        case step === TerminalPromptStep.ALL_CHECKS_PASS:
          advanceStateFromAllChecksPass(terminal);
          return;
        case step === TerminalPromptStep.COMPLETE:
          advanceStateFromComplete(terminal);
          return;
        case step === TerminalPromptStep.ERROR:
          advanceStateFromError();
          return;
        case step === TerminalPromptStep.SPECTATING:
          advanceStateFromSpectating(terminal);
          return;
      }
    },
    [
      step,
      advanceStateFromAccountSet,
      advanceStateFromAddAccount,
      advanceStateFromAllChecksPass,
      advanceStateFromAskAddAccount,
      advanceStateFromAskHasWhitelistKey,
      advanceStateFromAskPlayerEmail,
      advanceStateFromAskWaitlistEmail,
      advanceStateFromAskWhitelistKey,
      advanceStateFromCompatibilityPassed,
      advanceStateFromComplete,
      advanceStateFromDisplayAccounts,
      advanceStateFromError,
      advanceStateFromFetchingEthData,
      advanceStateFromGenerateAccount,
      advanceStateFromImportAccount,
      advanceStateFromNoHomePlanet,
      advanceStateFromSpectating,
      ethConnection,
      browserCompatibleState,
    ]
  );

  useEffect(() => {
    const uiEmitter = UIEmitter.getInstance();
    uiEmitter.emit(UIEmitterEvent.UIChange);
  }, [initRenderState]);

  useEffect(() => {
    const gameUiManager = gameUIManagerRef.current;
    if (!terminalVisible && gameUiManager) {
      const tutorialManager = TutorialManager.getInstance(gameUiManager);
      tutorialManager.acceptInput(TutorialState.Terminal);
    }
  }, [terminalVisible]);

  useEffect(() => {
    if (entryMode === 'pending') return;
    if (entryMode === 'quick' && !quickBootstrapDoneRef.current) return;
    if (terminalHandle.current && topLevelContainer.current) {
      advanceState(terminalHandle);
    }
  }, [terminalHandle, topLevelContainer, advanceState, entryMode, ethConnection]);

  const terminalOptionMode: TerminalOptionMode =
    entryMode === 'standard' || entryMode === 'quick' ? 'buttons' : 'classic';

  return (
    <>
      <UniverseEnterTransition active={isEnteringUniverse} />
      <QuickJoinSettingsModal
        open={quickJoinSettingsOpen}
        onClose={() => setQuickJoinSettingsOpen(false)}
      />
      {entryMode === 'pending' && browserCompatibleState === 'supported' && (
        <GameLandingEntryOverlay
          onSelect={handleEntryModeSelected}
          onConfigureQuickJoin={() => setQuickJoinSettingsOpen(true)}
        />
      )}
      <Wrapper initRender={initRenderState} terminalEnabled={terminalVisible}>
        <GameWindowWrapper initRender={initRenderState} terminalEnabled={terminalVisible}>
          {gameUIManagerRef.current && topLevelContainer.current && gameManager && (
            <TopLevelDivProvider value={topLevelContainer.current}>
              <UIManagerProvider value={gameUIManagerRef.current}>
                <GameWindowLayout
                  terminalVisible={terminalVisible}
                  setTerminalVisible={setTerminalVisible}
                />
              </UIManagerProvider>
            </TopLevelDivProvider>
          )}
          <TerminalToggler
            terminalEnabled={terminalVisible}
            setTerminalEnabled={setTerminalVisible}
          />
        </GameWindowWrapper>
        <TerminalWrapper initRender={initRenderState} terminalEnabled={terminalVisible}>
          <MythicLabelText
            text={`Welcome To Dark Forest Ares ${GAME_VERSION_INTRO}`}
            style={{
              fontFamily: "'Start Press 2P', sans-serif",
              display: initRenderState !== InitRenderState.COMPLETE ? 'block' : 'none',
            }}
          />
          <BrowserIssues issues={browserIssues} state={browserCompatibleState} />
          <Terminal
            ref={terminalHandle}
            promptCharacter={'>'}
            visible={browserCompatibleState === 'supported'}
            useCaretElement={initRenderState !== InitRenderState.COMPLETE}
            optionMode={terminalOptionMode}
          />
        </TerminalWrapper>
        <div ref={topLevelContainer}></div>
        <div>
          {isMiniMapOn && (
            <div style={{ position: 'absolute', right: '100px', top: '100px' }}>
              <MiniMap ref={miniMapRef} />
            </div>
          )}
        </div>
      </Wrapper>
    </>
  );
}
