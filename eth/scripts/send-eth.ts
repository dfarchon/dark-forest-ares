/**
 * Send native currency (ETH on most chains) from the admin wallet to a recipient.
 *
 * Setup (eth/.env) — use one of:
 *   ADMIN_PRIVATE_KEY=0x...
 *   ADMIN_MNEMONIC=word1 word2 ...          # optional dedicated admin mnemonic
 *   DEPLOYER_MNEMONIC=word1 word2 ...       # fallback if ADMIN_* not set
 *   ADMIN_PUBLIC_ADDRESS=0x...              # optional sanity check
 *
 * Optional CLI:
 *   --index 0                               # HD path account index (default 0)
 *
 * Examples:
 *   cd eth
 *   yarn send-eth --to 0xRecipient... --value 0.1 --network localhost
 *   yarn send-eth --to 0xRecipient... --value 0.1 --network redstoneTestnet --dry false
 *   yarn send-eth --to 0xRecipient... --value 0.05 --rpc https://rpc.example.com --dry false
 */

import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

function resolveRpcUrl(network?: string): string {
  if (network === 'localhost') return 'http://localhost:8545';
  if (network === 'xdai') return process.env.XDAI_RPC_URL ?? 'https://rpc-df.xdaichain.com/';
  if (network === 'mainnet') {
    return 'https://mainnet.infura.io/v3/5459b6d562eb47f689c809fe0b78408e';
  }
  if (network === 'altlayer') {
    if (!process.env.ALTLAYER_RPC_URL) throw new Error('ALTLAYER_RPC_URL not set in .env');
    return process.env.ALTLAYER_RPC_URL;
  }
  if (network === 'megaETH') {
    if (!process.env.MEGAETH_RPC_URL) throw new Error('MEGAETH_RPC_URL not set in .env');
    return process.env.MEGAETH_RPC_URL;
  }
  if (network === 'redstoneTestnet') {
    if (!process.env.REDSTONE_TESTNET_RPC_URL) {
      throw new Error('REDSTONE_TESTNET_RPC_URL not set in .env');
    }
    return process.env.REDSTONE_TESTNET_RPC_URL;
  }
  if (network === 'redstone') {
    if (!process.env.REDSTONE_RPC_URL) throw new Error('REDSTONE_RPC_URL not set in .env');
    return process.env.REDSTONE_RPC_URL;
  }
  if (network === 'opSepolia') {
    if (!process.env.OP_SEPOLIA_RPC_URL) throw new Error('OP_SEPOLIA_RPC_URL not set in .env');
    return process.env.OP_SEPOLIA_RPC_URL;
  }
  if (process.env.RPC_URL) return process.env.RPC_URL;
  throw new Error(
    'Provide --network (localhost | xdai | mainnet | altlayer | megaETH | redstoneTestnet | redstone | opSepolia), --rpc, or set RPC_URL in .env'
  );
}

function loadWallet(provider: ethers.providers.Provider, accountIndex: number): ethers.Wallet {
  const privateKey = process.env.ADMIN_PRIVATE_KEY;
  if (privateKey) {
    return new ethers.Wallet(privateKey, provider);
  }

  const mnemonic = process.env.ADMIN_MNEMONIC ?? process.env.DEPLOYER_MNEMONIC;
  if (!mnemonic) {
    throw new Error('Set ADMIN_PRIVATE_KEY, ADMIN_MNEMONIC, or DEPLOYER_MNEMONIC in eth/.env');
  }

  const hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic);
  const derived = hdNode.derivePath(`m/44'/60'/0'/0/${accountIndex}`);
  return new ethers.Wallet(derived.privateKey, provider);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const to = args.to;
  const valueStr = args.value;
  const dry = args.dry !== 'false';
  const gasPriceGwei = args.gaspricegwei ? parseFloat(args.gaspricegwei) : 1;
  const confirmations = args.confirmations ? parseInt(args.confirmations, 10) : 1;
  const accountIndex = args.index ? parseInt(args.index, 10) : 0;

  if (!to || !valueStr) {
    console.error(
      'Usage: yarn send-eth --to <address> --value <amount> [--network <name> | --rpc <url>] [--index 0] [--dry false] [--gaspricegwei 1] [--confirmations 1]'
    );
    process.exit(1);
  }

  if (Number.isNaN(accountIndex) || accountIndex < 0) {
    throw new Error(`Invalid --index: ${args.index}`);
  }

  if (!ethers.utils.isAddress(to)) {
    throw new Error(`Invalid recipient address: ${to}`);
  }

  const rpcUrl = args.rpc ?? resolveRpcUrl(args.network);
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = loadWallet(provider, accountIndex);

  if (process.env.ADMIN_PUBLIC_ADDRESS) {
    if (wallet.address.toLowerCase() !== process.env.ADMIN_PUBLIC_ADDRESS.toLowerCase()) {
      throw new Error(
        `Wallet address ${wallet.address} does not match ADMIN_PUBLIC_ADDRESS ${process.env.ADMIN_PUBLIC_ADDRESS}`
      );
    }
  }

  const value = parseFloat(valueStr);
  if (Number.isNaN(value) || value <= 0) {
    throw new Error(`Invalid value: ${valueStr}`);
  }

  const parsedValue = ethers.utils.parseEther(value.toString());
  const balance = await wallet.getBalance();

  if (balance.lt(parsedValue)) {
    throw new Error(
      `${wallet.address} trying to send ${ethers.utils.formatEther(
        parsedValue
      )} but has ${ethers.utils.formatEther(balance)}`
    );
  }

  const gasPrice = ethers.utils.parseUnits(gasPriceGwei.toString(), 'gwei');
  if (gasPrice.gt(ethers.utils.parseUnits('1', 'gwei').mul(1000))) {
    throw new Error(`GAS PRICE TOO HIGH: ${gasPriceGwei} gwei`);
  }

  const networkInfo = await provider.getNetwork();
  console.log(`[chainId=${networkInfo.chainId}] Sending ${value} from ${wallet.address} to ${to}`);
  if (!process.env.ADMIN_PRIVATE_KEY) {
    console.log(`Derived from mnemonic at m/44'/60'/0'/0/${accountIndex}`);
  }
  console.log(`Admin balance: ${ethers.utils.formatEther(balance)}`);
  console.log(`Gas price: ${gasPriceGwei} gwei`);
  console.log(`RPC: ${rpcUrl}`);

  if (dry) {
    console.log('Dry run successful. Run with "--dry false" to execute the transaction.');
    return;
  }

  const tx = await wallet.sendTransaction({
    to,
    value: parsedValue,
    gasPrice,
  });
  console.log(`Tx submitted: ${tx.hash}`);

  const receipt = await tx.wait(confirmations);
  console.log(`Tx confirmed at block ${receipt.blockNumber} (${confirmations} confirmation(s))`);

  const adminBalance = await wallet.getBalance();
  const recipientBalance = await provider.getBalance(to);
  console.log(`Admin balance: ${ethers.utils.formatEther(adminBalance)}`);
  console.log(`Recipient balance: ${ethers.utils.formatEther(recipientBalance)}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
