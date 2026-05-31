import * as fs from 'fs';
import type { Contract, ContractFactory, ContractReceipt } from 'ethers';
import { task, types } from 'hardhat/config';
import type { HardhatRuntimeEnvironment, Libraries } from 'hardhat/types';
import * as path from 'path';
import { dedent } from 'ts-dedent';
import * as settings from '../settings';
import { DiamondChanges } from '../utils/diamond';
import { tscompile } from '../utils/tscompile';

type DeployRecord = {
  address: string;
  txHash?: string;
  confirmed?: boolean;
};

type DeployState = {
  network: string;
  chainId?: number;
  contracts: Record<string, DeployRecord>;
  transactions?: Record<string, DeployRecord>;
};

type DeployStateContext = {
  hre: HardhatRuntimeEnvironment;
  filePath: string;
  state: DeployState;
};

let activeDeployState: DeployStateContext | undefined;

function getDeployStatePath(hre: HardhatRuntimeEnvironment) {
  const chainId = hre.network.config.chainId ?? 'unknown';
  return path.join(__dirname, '..', 'deployments', `${hre.network.name}-${chainId}.json`);
}

function loadDeployState(hre: HardhatRuntimeEnvironment): DeployStateContext {
  const filePath = getDeployStatePath(hre);
  let state: DeployState = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    contracts: {},
  };

  if (fs.existsSync(filePath)) {
    state = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DeployState;
  }

  return { hre, filePath, state };
}

function saveDeployState(context: DeployStateContext) {
  fs.mkdirSync(path.dirname(context.filePath), { recursive: true });
  fs.writeFileSync(context.filePath, `${JSON.stringify(context.state, null, 2)}\n`);
}

function rememberDeploy(contractName: string, record: DeployRecord) {
  if (!activeDeployState) {
    return;
  }

  activeDeployState.state.contracts[contractName] = record;
  saveDeployState(activeDeployState);
}

function rememberTransaction(transactionName: string, record: DeployRecord) {
  if (!activeDeployState) {
    return;
  }

  activeDeployState.state.transactions = activeDeployState.state.transactions ?? {};
  activeDeployState.state.transactions[transactionName] = record;
  saveDeployState(activeDeployState);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getErrorCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  return String((error as { code?: unknown }).code);
}

function isRetryableRpcError(error: unknown) {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();

  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    message.includes('socket hang up') ||
    message.includes('timeout') ||
    message.includes('network error')
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hasContractCode(hre: HardhatRuntimeEnvironment, address: string) {
  const code = await hre.ethers.provider.getCode(address);
  return code !== '0x';
}

async function waitForTransactionWithRetry(
  hre: HardhatRuntimeEnvironment,
  txHash: string,
  label: string
): Promise<ContractReceipt> {
  const attempts = 8;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const receipt = await hre.ethers.provider.waitForTransaction(txHash, 1, 120_000);
      if (receipt) {
        return receipt;
      }
    } catch (error) {
      if (!isRetryableRpcError(error) || attempt === attempts) {
        throw error;
      }

      console.warn(
        `${label}: RPC error while waiting for ${txHash}; retrying (${attempt}/${attempts})`
      );
      console.warn(getErrorMessage(error));
    }

    await delay(5_000 * attempt);
  }

  throw new Error(`${label}: timed out waiting for ${txHash}; rerun deploy to resume`);
}

async function confirmDeployment(contractName: string, address: string, txHash: string) {
  if (!activeDeployState) {
    return;
  }

  const receipt = await waitForTransactionWithRetry(activeDeployState.hre, txHash, contractName);
  if (!receipt.status) {
    throw new Error(`${contractName} deployment failed: ${txHash}`);
  }

  rememberDeploy(contractName, { address, txHash, confirmed: true });
}

async function runOnceTransaction(
  transactionName: string,
  address: string,
  send: () => Promise<{ hash: string }>
): Promise<ContractReceipt> {
  const context = activeDeployState;
  if (!context) {
    throw new Error(`${transactionName}: deploy state unavailable`);
  }

  const previous = context?.state.transactions?.[transactionName];

  if (context && previous?.txHash) {
    console.log(`${transactionName} resuming tx: ${previous.txHash}`);
    const receipt = await waitForTransactionWithRetry(context.hre, previous.txHash, transactionName);
    if (!receipt.status) {
      throw new Error(`${transactionName} failed: ${previous.txHash}`);
    }

    rememberTransaction(transactionName, {
      address: previous.address,
      txHash: previous.txHash,
      confirmed: true,
    });
    return receipt;
  }

  const tx = await send();
  console.log('------ tx:', tx.hash, ' ------');
  rememberTransaction(transactionName, { address, txHash: tx.hash, confirmed: false });

  const receipt = await waitForTransactionWithRetry(context.hre, tx.hash, transactionName);
  if (!receipt.status) {
    throw new Error(`${transactionName} failed: ${tx.hash}`);
  }

  rememberTransaction(transactionName, { address, txHash: tx.hash, confirmed: true });
  return receipt;
}

async function deployOrResumeContract(
  contractName: string,
  factory: ContractFactory,
  constructorArgs: Array<unknown> = []
): Promise<Contract> {
  const context = activeDeployState;
  const previous = context?.state.contracts[contractName];

  if (context && previous) {
    if (await hasContractCode(context.hre, previous.address)) {
      console.log(`${contractName} resumed at: ${previous.address}`);
      return factory.attach(previous.address);
    }

    if (previous.txHash) {
      console.log(`${contractName} waiting for previous tx: ${previous.txHash}`);
      await confirmDeployment(contractName, previous.address, previous.txHash);
      if (await hasContractCode(context.hre, previous.address)) {
        console.log(`${contractName} resumed at: ${previous.address}`);
        return factory.attach(previous.address);
      }
    }

    console.warn(`${contractName} checkpoint had no on-chain code; redeploying`);
  }

  const contract = await factory.deploy(...constructorArgs);
  console.log('------ tx:', contract.address, ' ------');
  rememberDeploy(contractName, {
    address: contract.address,
    txHash: contract.deployTransaction.hash,
    confirmed: false,
  });

  if (context) {
    await confirmDeployment(contractName, contract.address, contract.deployTransaction.hash);
  } else {
    await contract.deployTransaction.wait();
  }

  console.log(`${contractName} deployed to: ${contract.address}`);
  return contract;
}

task('deploy', 'deploy all contracts')
  .addOptionalParam('whitelist', 'override the whitelist', undefined, types.boolean)
  .addOptionalParam('fund', 'amount of eth to fund whitelist contract for fund', 0, types.float)
  .addOptionalParam(
    'subgraph',
    'bring up subgraph with name (requires docker)',
    undefined,
    types.string
  )
  .setAction(deploy);

async function deploy(
  args: { whitelist?: boolean; fund: number; subgraph?: string },
  hre: HardhatRuntimeEnvironment
) {
  const isDev = hre.network.name === 'localhost' || hre.network.name === 'hardhat';

  let whitelistEnabled: boolean;
  if (typeof args.whitelist === 'undefined') {
    // `whitelistEnabled` defaults to `false` in dev but `true` in prod
    whitelistEnabled = isDev ? false : true;
  } else {
    whitelistEnabled = args.whitelist;
  }

  // Ensure we have required keys in our initializers
  settings.required(hre.initializers, [
    'PLANETHASH_KEY',
    'SPACETYPE_KEY',
    'BIOMEBASE_KEY',
    'BUY_ENERGY_COOLDOWN',
    'BUY_ENERGY_LEVEL_FEES',
  ]);

  // need to force a compile for tasks
  await hre.run('compile');

  // Were only using one account, getSigners()[0], the deployer.
  // Is deployer of all contracts, but ownership is transferred to ADMIN_PUBLIC_ADDRESS if set
  const [deployer] = await hre.ethers.getSigners();
  const beginBalance = await deployer.getBalance();
  console.log('begin balance:', beginBalance.toString());

  const requires = hre.ethers.utils.parseEther('0.01');
  const balance = await deployer.getBalance();

  // Only when deploying to production, give the deployer wallet money,
  // in order for it to be able to deploy the contracts
  if (!isDev && balance.lt(requires)) {
    throw new Error(
      `${deployer.address} requires ~$${hre.ethers.utils.formatEther(
        requires
      )} but has ${hre.ethers.utils.formatEther(balance)} top up and rerun`
    );
  }

  activeDeployState = loadDeployState(hre);
  console.log(`deployment checkpoint: ${activeDeployState.filePath}`);

  const [diamond, diamondInit, initReceipt] = await deployAndCut(
    { ownerAddress: deployer.address, whitelistEnabled, initializers: hre.initializers },
    hre
  );

  await saveDeploy(
    {
      coreBlockNumber: initReceipt.blockNumber,
      diamondAddress: diamond.address,
      initAddress: diamondInit.address,
    },
    hre
  );

  // Note Ive seen `ProviderError: Internal error` when not enough money...
  console.log(`funding whitelist with ${args.fund}`);

  if (args.fund > 0) {
    await runOnceTransaction(`fundDiamond:${args.fund}`, diamond.address, () =>
      deployer.sendTransaction({
        to: diamond.address,
        value: hre.ethers.utils.parseEther(args.fund.toString()),
      })
    );

    console.log(
      `Sent ${args.fund} to diamond contract (${diamond.address}) to fund drips in whitelist facet`
    );
  }

  // give all contract administration over to an admin adress if was provided
  const adminPublicAddress = hre.ADMIN_PUBLIC_ADDRESS;
  if (adminPublicAddress) {
    const ownership = await hre.ethers.getContractAt('DarkForest', diamond.address);
    await runOnceTransaction(`transferOwnership:${adminPublicAddress}`, diamond.address, () =>
      ownership.transferOwnership(adminPublicAddress)
    );
    console.log(`transfered diamond ownership to ${adminPublicAddress}`);
  }

  if (args.subgraph) {
    await hre.run('subgraph:deploy', { name: args.subgraph });
    console.log('deployed subgraph');
  }

  const whitelistBalance = await hre.ethers.provider.getBalance(diamond.address);
  console.log(`Whitelist balance ${whitelistBalance}`);

  const value = 0; // drip value in ether
  if (value) {
    const contract = await hre.ethers.getContractAt('DarkForest', hre.contracts.CONTRACT_ADDRESS);
    const txReceipt = await contract.changeDrip(
      hre.ethers.utils.parseEther(Number(value).toString())
    );
    console.log('------ tx:', txReceipt.hash, ' ------');
    await txReceipt.wait();
    console.log(`changed drip to ${value}`);
  }

  // TODO: Upstream change to update task name from `hardhat-4byte-uploader`
  if (!isDev) {
    try {
      await hre.run('upload-selectors', { noCompile: true });
    } catch {
      console.warn('WARNING: Unable to update 4byte database with our selectors');
      console.warn('Please run the `upload-selectors` task manually so selectors can be reversed');
    }
  }

  console.log('Deployed successfully. Godspeed cadet.');
  const endBalance = await deployer.getBalance();
  console.log('end balance:', endBalance.toString());
  const cost = beginBalance.sub(endBalance);
  console.log('cost:', cost.toString(), ' wei');
  const gweiAmount = hre.ethers.utils.formatUnits(cost, 'gwei');
  console.log(gweiAmount, 'gwei');
  const ethAmount = hre.ethers.utils.formatUnits(cost);
  console.log(ethAmount, 'eth');
}

async function saveDeploy(
  args: {
    coreBlockNumber: number;
    diamondAddress: string;
    initAddress: string;
  },
  hre: HardhatRuntimeEnvironment
) {
  const isDev = hre.network.name === 'localhost' || hre.network.name === 'hardhat';

  // Save the addresses of the deployed contracts to the `@dfares/contracts` package
  const tsContents = dedent`
  /**
   * This package contains deployed contract addresses, ABIs, and Typechain types
   * for the Dark Forest game.
   *
   * ## Installation
   *
   * You can install this package using [\`npm\`](https://www.npmjs.com) or
   * [\`yarn\`](https://classic.yarnpkg.com/lang/en/) by running:
   *
   * \`\`\`bash
   * npm install --save @dfares/contracts
   * \`\`\`
   * \`\`\`bash
   * yarn add @dfares/contracts
   * \`\`\`
   *
   * When using this in a plugin, you might want to load it with [skypack](https://www.skypack.dev)
   *
   * \`\`\`js
   * import * as contracts from 'http://cdn.skypack.dev/@dfares/contracts'
   * \`\`\`
   *
   * ## Typechain
   *
   * The Typechain types can be found in the \`typechain\` directory.
   *
   * ## ABIs
   *
   * The contract ABIs can be found in the \`abis\` directory.
   *
   * @packageDocumentation
   */

  /**
   * The name of the network where these contracts are deployed.
   */
  export const NETWORK = '${hre.network.name}';
  /**
   * The id of the network where these contracts are deployed.
   */
  export const NETWORK_ID = ${hre.network.config.chainId};
  /**
   * The block in which the DarkForest contract was initialized.
   */
  export const START_BLOCK = ${isDev ? 0 : args.coreBlockNumber};
  /**
   * The address for the DarkForest contract.
   */
  export const CONTRACT_ADDRESS = '${args.diamondAddress}';
  /**
   * The address for the initalizer contract. Useful for lobbies.
   */
  export const INIT_ADDRESS = '${args.initAddress}';
  `;

  const { jsContents, jsmapContents, dtsContents, dtsmapContents } = tscompile(tsContents);

  const contractsFileTS = path.join(hre.packageDirs['@dfares/contracts'], 'index.ts');
  const contractsFileJS = path.join(hre.packageDirs['@dfares/contracts'], 'index.js');
  const contractsFileJSMap = path.join(hre.packageDirs['@dfares/contracts'], 'index.js.map');
  const contractsFileDTS = path.join(hre.packageDirs['@dfares/contracts'], 'index.d.ts');
  const contractsFileDTSMap = path.join(hre.packageDirs['@dfares/contracts'], 'index.d.ts.map');

  fs.writeFileSync(contractsFileTS, tsContents);
  fs.writeFileSync(contractsFileJS, jsContents);
  fs.writeFileSync(contractsFileJSMap, jsmapContents);
  fs.writeFileSync(contractsFileDTS, dtsContents);
  fs.writeFileSync(contractsFileDTSMap, dtsmapContents);
}

export async function deployAndCut(
  {
    ownerAddress,
    whitelistEnabled,
    initializers,
  }: {
    ownerAddress: string;
    whitelistEnabled: boolean;
    initializers: HardhatRuntimeEnvironment['initializers'];
  },
  hre: HardhatRuntimeEnvironment
) {
  const isDev = hre.network.name === 'localhost' || hre.network.name === 'hardhat';

  const changes = new DiamondChanges();

  const libraries = await deployLibraries({}, hre);

  // Diamond Spec facets
  // Note: These won't be updated during an upgrade without manual intervention
  const diamondCutFacet = await deployDiamondCutFacet({}, libraries, hre);
  const diamondLoupeFacet = await deployDiamondLoupeFacet({}, libraries, hre);
  const ownershipFacet = await deployOwnershipFacet({}, libraries, hre);

  // The `cuts` to perform for Diamond Spec facets
  const diamondSpecFacetCuts = [
    // Note: The `diamondCut` is omitted because it is cut upon deployment
    ...changes.getFacetCuts('DiamondLoupeFacet', diamondLoupeFacet),
    ...changes.getFacetCuts('OwnershipFacet', ownershipFacet),
  ];

  const diamond = await deployDiamond(
    {
      ownerAddress,
      // The `diamondCutFacet` is cut upon deployment
      diamondCutAddress: diamondCutFacet.address,
    },
    libraries,
    hre
  );

  const diamondInit = await deployDiamondInit({}, libraries, hre);

  // Dark Forest facets
  const coreFacet = await deployCoreFacet({}, libraries, hre);
  const moveFacet = await deployMoveFacet({}, libraries, hre);
  const captureFacet = await deployCaptureFacet({}, libraries, hre);
  const pinkBombFacet = await deployPinkBombFacet({}, libraries, hre);
  const kardashevFacet = await deployKardashevFacet({}, libraries, hre);
  const tradeFacet = await deployTradeFacet({}, libraries, hre);
  const unionFacet = await deployUnionFacet({}, libraries, hre);

  const artifactFacet = await deployArtifactFacet(
    { diamondAddress: diamond.address },
    libraries,
    hre
  );

  const getterOneFacet = await deployGetterOneFacet({}, libraries, hre);
  const getterTwoFacet = await deployGetterTwoFacet({}, libraries, hre);

  const whitelistFacet = await deployWhitelistFacet({}, libraries, hre);
  const verifierFacet = await deployVerifierFacet({}, libraries, hre);
  const adminFacet = await deployAdminFacet({}, libraries, hre);
  const lobbyFacet = await deployLobbyFacet({}, {}, hre);

  //NOTE: rewardFacet don't fit v0.6.3
  // const rewardFacet = await deployRewardFacet({}, {}, hre);

  // The `cuts` to perform for Dark Forest facets
  const darkForestFacetCuts = [
    ...changes.getFacetCuts('DFCoreFacet', coreFacet),
    ...changes.getFacetCuts('DFMoveFacet', moveFacet),
    ...changes.getFacetCuts('DFCaptureFacet', captureFacet),
    ...changes.getFacetCuts('DFPinkBombFacet', pinkBombFacet),
    ...changes.getFacetCuts('DFKardashevFacet', kardashevFacet),
    ...changes.getFacetCuts('DFTradeFacet', tradeFacet),
    ...changes.getFacetCuts('DFUnionFacet', unionFacet),
    ...changes.getFacetCuts('DFArtifactFacet', artifactFacet),
    ...changes.getFacetCuts('DFGetterOneFacet', getterOneFacet),
    ...changes.getFacetCuts('DFGetterTwoFacet', getterTwoFacet),
    ...changes.getFacetCuts('DFWhitelistFacet', whitelistFacet),
    ...changes.getFacetCuts('DFVerifierFacet', verifierFacet),
    ...changes.getFacetCuts('DFAdminFacet', adminFacet),
    ...changes.getFacetCuts('DFLobbyFacet', lobbyFacet),

    //NOTE: rewardFacet don't fit v0.6.3
    // ...changes.getFacetCuts('DFRewardFacet', rewardFacet),
  ];

  if (isDev) {
    const debugFacet = await deployDebugFacet({}, libraries, hre);
    darkForestFacetCuts.push(...changes.getFacetCuts('DFDebugFacet', debugFacet));
  }

  const toCut = [...diamondSpecFacetCuts, ...darkForestFacetCuts];

  const diamondCut = await hre.ethers.getContractAt('DarkForest', diamond.address);

  // const tokenBaseUri = `${
  //   isDev
  //     ? 'https://nft-test.zkga.me/token-uri/artifact/'
  //     : 'https://nft.zkga.me/token-uri/artifact/'
  // }${hre.network.config?.chainId || 'unknown'}-${diamond.address}/`;

  const tokenBaseUri = `${isDev
    ? 'https://nft-test.dfpunk.xyz/token-uri/artifact/'
    : 'https://nft.dfpunk.xyz/token-uri/artifact/'
    }${hre.network.config?.chainId || 'unknown'}-${diamond.address}/`;

  console.log('tokenBaseUri:', tokenBaseUri);

  // EIP-2535 specifies that the `diamondCut` function takes two optional
  // arguments: address _init and bytes calldata _calldata
  // These arguments are used to execute an arbitrary function using delegatecall
  // in order to set state variables in the diamond during deployment or an upgrade
  // More info here: https://eips.ethereum.org/EIPS/eip-2535#diamond-interface
  const initAddress = diamondInit.address;
  const initFunctionCall = diamondInit.interface.encodeFunctionData('init', [
    whitelistEnabled,
    tokenBaseUri,
    initializers,
  ]);

  const initReceipt = await runOnceTransaction('diamondCut:init', diamond.address, () =>
    diamondCut.diamondCut(toCut, initAddress, initFunctionCall)
  );
  console.log('Completed diamond cut');

  return [diamond, diamondInit, initReceipt] as const;
}

export async function deployGetterOneFacet({ }, { }: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('DFGetterOneFacet');
  return deployOrResumeContract('DFGetterOneFacet', factory);
}

export async function deployGetterTwoFacet(
  { },
  { LibGameUtils }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFGetterTwoFacet', {
    libraries: {
      LibGameUtils,
    },
  });
  return deployOrResumeContract('DFGetterTwoFacet', factory);
}

export async function deployAdminFacet(
  { },
  { LibGameUtils, LibPlanet, LibArtifactUtils }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFAdminFacet', {
    libraries: {
      LibArtifactUtils,
      LibGameUtils,
      LibPlanet,
    },
  });
  return deployOrResumeContract('DFAdminFacet', factory);
}

export async function deployDebugFacet({ }, { }: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('DFDebugFacet');
  return deployOrResumeContract('DFDebugFacet', factory);
}

export async function deployWhitelistFacet({ }, { }: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('DFWhitelistFacet');
  return deployOrResumeContract('DFWhitelistFacet', factory);
}

export async function deployRewardFacet({ }, { }: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('DFRewardFacet');
  return deployOrResumeContract('DFRewardFacet', factory);
}

export async function deployVerifierFacet({ }, { }: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('DFVerifierFacet');
  return deployOrResumeContract('DFVerifierFacet', factory);
}

export async function deployArtifactFacet(
  { },
  { LibGameUtils, LibPlanet, LibArtifactUtils, LibArtifactExtendUtils }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFArtifactFacet', {
    libraries: {
      LibArtifactUtils,
      LibArtifactExtendUtils,
      LibGameUtils,
      LibPlanet,
    },
  });
  return deployOrResumeContract('DFArtifactFacet', factory);
}

export async function deployLibraries({ }, hre: HardhatRuntimeEnvironment) {
  const LibGameUtilsFactory = await hre.ethers.getContractFactory('LibGameUtils');
  const LibGameUtils = await deployOrResumeContract('LibGameUtils', LibGameUtilsFactory);

  const LibLazyUpdateFactory = await hre.ethers.getContractFactory('LibLazyUpdate', {
    libraries: {
      LibGameUtils: LibGameUtils.address,
    },
  });
  const LibLazyUpdate = await deployOrResumeContract('LibLazyUpdate', LibLazyUpdateFactory);

  const LibArtifactUtilsFactory = await hre.ethers.getContractFactory('LibArtifactUtils', {
    libraries: {
      LibGameUtils: LibGameUtils.address,
    },
  });

  const LibArtifactUtils = await deployOrResumeContract(
    'LibArtifactUtils',
    LibArtifactUtilsFactory
  );

  const LibArtifactExtendUtilsFactory = await hre.ethers.getContractFactory(
    'LibArtifactExtendUtils',
    {}
  );

  const LibArtifactExtendUtils = await deployOrResumeContract(
    'LibArtifactExtendUtils',
    LibArtifactExtendUtilsFactory
  );

  const LibPlanetFactory = await hre.ethers.getContractFactory('LibPlanet', {
    libraries: {
      LibGameUtils: LibGameUtils.address,
      LibLazyUpdate: LibLazyUpdate.address,
    },
  });
  const LibPlanet = await deployOrResumeContract('LibPlanet', LibPlanetFactory);

  return {
    LibGameUtils: LibGameUtils.address,
    LibLazyUpdate: LibLazyUpdate.address,
    LibPlanet: LibPlanet.address,
    LibArtifactUtils: LibArtifactUtils.address,
    LibArtifactExtendUtils: LibArtifactExtendUtils.address,
  };
}

export async function deployCoreFacet(
  { },
  { LibGameUtils, LibPlanet, LibArtifactUtils }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFCoreFacet', {
    libraries: {
      LibGameUtils,
      LibPlanet,
      LibArtifactUtils,
    },
  });
  return deployOrResumeContract('DFCoreFacet', factory);
}

export async function deployMoveFacet(
  { },
  { LibGameUtils, LibArtifactUtils, LibPlanet }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFMoveFacet', {
    libraries: {
      LibGameUtils,
      LibArtifactUtils,
      LibPlanet,
    },
  });
  return deployOrResumeContract('DFMoveFacet', factory);
}

export async function deployCaptureFacet(
  { },
  { LibPlanet }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFCaptureFacet', {
    libraries: {
      LibPlanet,
    },
  });
  return deployOrResumeContract('DFCaptureFacet', factory);
}

export async function deployPinkBombFacet(
  { },
  { LibPlanet, LibGameUtils, LibArtifactUtils }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFPinkBombFacet', {
    libraries: {
      LibPlanet,
      LibGameUtils,
      LibArtifactUtils,
    },
  });
  return deployOrResumeContract('DFPinkBombFacet', factory);
}

export async function deployKardashevFacet(
  { },
  { LibPlanet, LibGameUtils, LibArtifactUtils }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFKardashevFacet', {
    libraries: {
      LibPlanet,
      LibGameUtils,
      LibArtifactUtils,
    },
  });
  return deployOrResumeContract('DFKardashevFacet', factory);
}

export async function deployTradeFacet(
  { },
  { LibPlanet, LibGameUtils, LibArtifactUtils, LibLazyUpdate }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('DFTradeFacet', {
    libraries: {
      LibPlanet,
      LibGameUtils,
      LibArtifactUtils,
      LibLazyUpdate,
    },
  });
  return deployOrResumeContract('DFTradeFacet', factory);
}

export async function deployUnionFacet({ }, { }: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('DFUnionFacet', {
    libraries: {},
  });
  return deployOrResumeContract('DFUnionFacet', factory);
}

async function deployDiamondCutFacet({ }, libraries: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('DiamondCutFacet');
  return deployOrResumeContract('DiamondCutFacet', factory);
}

async function deployDiamond(
  {
    ownerAddress,
    diamondCutAddress,
  }: {
    ownerAddress: string;
    diamondCutAddress: string;
  },
  { }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  const factory = await hre.ethers.getContractFactory('Diamond');
  return deployOrResumeContract('Diamond', factory, [ownerAddress, diamondCutAddress]);
}

async function deployDiamondInit({ }, { LibGameUtils }: Libraries, hre: HardhatRuntimeEnvironment) {
  // DFInitialize provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const factory = await hre.ethers.getContractFactory('DFInitialize', {
    libraries: { LibGameUtils },
  });
  return deployOrResumeContract('DFInitialize', factory);
}

async function deployDiamondLoupeFacet({ }, { }: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('DiamondLoupeFacet');
  return deployOrResumeContract('DiamondLoupeFacet', factory);
}

async function deployOwnershipFacet({ }, { }: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('OwnershipFacet');
  return deployOrResumeContract('OwnershipFacet', factory);
}

export async function deployLobbyFacet({ }, { }: Libraries, hre: HardhatRuntimeEnvironment) {
  const factory = await hre.ethers.getContractFactory('DFLobbyFacet');
  return deployOrResumeContract('DFLobbyFacet', factory);
}

async function deployDiamondInitSec(
  { },
  { }: Libraries,
  hre: HardhatRuntimeEnvironment
) {
  // DFInitialize provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const factory = await hre.ethers.getContractFactory('DFInitializeSec', {
    libraries: {},
  });
  return deployOrResumeContract('DFInitializeSec', factory);
}

task('diamondCut', 'diamondCut').setAction(diamondCut);

async function diamondCut(_args: Record<string, never>, hre: HardhatRuntimeEnvironment) {
  const [deployer] = await hre.ethers.getSigners();
  const beginBalance = await deployer.getBalance();
  console.log('begin balance:', beginBalance.toString());

  const diamond = await hre.ethers.getContractAt('DarkForest', hre.contracts.CONTRACT_ADDRESS);

  const diamondInitSec = await deployDiamondInitSec({}, {}, hre);

  const initAddress = diamondInitSec.address;
  const initFunctionCall = diamondInitSec.interface.encodeFunctionData('init');

  const upgradeTx = await diamond.diamondCut([], initAddress, initFunctionCall);
  const upgradeReceipt = await upgradeTx.wait();
  if (!upgradeReceipt.status) {
    throw Error(`Diamond cut failed: ${upgradeTx.hash}`);
  }
  console.log('Completed diamond cut');
}
