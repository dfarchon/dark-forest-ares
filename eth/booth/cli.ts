import { NETWORK } from '@dfares/contracts';
import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

export function parseArgs(argv: string[]): Record<string, string> {
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

export function resolveRpcUrl(network?: string, rpc?: string): string {
  const selected = network ?? (rpc ? undefined : NETWORK);
  if (rpc) return rpc;
  if (selected === 'localhost') return 'http://localhost:8545';
  if (selected === 'xdai') return process.env.XDAI_RPC_URL ?? 'https://rpc-df.xdaichain.com/';
  if (selected === 'mainnet') {
    return 'https://mainnet.infura.io/v3/5459b6d562eb47f689c809fe0b78408e';
  }
  if (selected === 'altlayer') {
    if (!process.env.ALTLAYER_RPC_URL) throw new Error('ALTLAYER_RPC_URL not set in .env');
    return process.env.ALTLAYER_RPC_URL;
  }
  if (selected === 'megaETH') {
    if (!process.env.MEGAETH_RPC_URL) throw new Error('MEGAETH_RPC_URL not set in .env');
    return process.env.MEGAETH_RPC_URL;
  }
  if (selected === 'redstoneTestnet') {
    if (!process.env.REDSTONE_TESTNET_RPC_URL) {
      throw new Error('REDSTONE_TESTNET_RPC_URL not set in .env');
    }
    return process.env.REDSTONE_TESTNET_RPC_URL;
  }
  if (selected === 'redstone') {
    if (!process.env.REDSTONE_RPC_URL) throw new Error('REDSTONE_RPC_URL not set in .env');
    return process.env.REDSTONE_RPC_URL;
  }
  if (selected === 'opSepolia') {
    if (!process.env.OP_SEPOLIA_RPC_URL) throw new Error('OP_SEPOLIA_RPC_URL not set in .env');
    return process.env.OP_SEPOLIA_RPC_URL;
  }
  if (process.env.RPC_URL) return process.env.RPC_URL;
  throw new Error(
    `No RPC for network ${selected ?? 'unset'}. Set the matching URL in eth/.env, or pass --network / --rpc.`
  );
}

export function loadAdminWallet(
  provider: ethers.providers.Provider,
  accountIndex: number
): ethers.Wallet {
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
