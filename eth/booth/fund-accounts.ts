import { CONTRACT_ADDRESS } from '@dfares/contracts';
import { ethers } from 'ethers';
import { keysMatch, readAccountsFile } from './accountsFile';
import { loadAdminWallet, parseArgs, resolveRpcUrl } from './cli';

type Command = 'check' | 'fund' | 'ensure' | 'whitelist';

const BOOTH_ADMIN_ABI = [
  'function isWhitelisted(address) view returns (bool)',
  'function batchAddToWhitelist(address[])',
];

function readCommand(argv: string[]): { command: Command; rest: string[] } {
  const rest: string[] = [];
  let command: string | undefined;
  for (const arg of argv) {
    if (!command && !arg.startsWith('--')) {
      command = arg;
      continue;
    }
    rest.push(arg);
  }
  if (command !== 'check' && command !== 'fund' && command !== 'ensure' && command !== 'whitelist') {
    throw new Error(
      'Usage: booth:fund -- <check|fund|ensure|whitelist> [--value <eth>] [--network <name> | --rpc <url>] [--dry false]'
    );
  }
  return { command, rest };
}

async function main() {
  const { command, rest } = readCommand(process.argv.slice(2));
  const args = parseArgs(rest);
  const dry = args.dry !== 'false';
  const gasPriceGwei = args.gaspricegwei ? parseFloat(args.gaspricegwei) : 1;
  const confirmations = args.confirmations ? parseInt(args.confirmations, 10) : 1;
  const accountIndex = args.index ? parseInt(args.index, 10) : 0;
  const valueStr = args.value;

  if (Number.isNaN(accountIndex) || accountIndex < 0) {
    throw new Error(`Invalid --index: ${args.index}`);
  }
  if (Number.isNaN(gasPriceGwei) || gasPriceGwei <= 0) {
    throw new Error(`Invalid --gaspricegwei: ${args.gaspricegwei}`);
  }
  if (!Number.isInteger(confirmations) || confirmations < 1) {
    throw new Error(`Invalid --confirmations: ${args.confirmations}`);
  }

  let target: ethers.BigNumber | undefined;
  if (command === 'fund' || command === 'ensure') {
    const value = valueStr ? parseFloat(valueStr) : NaN;
    if (!valueStr || Number.isNaN(value) || value <= 0) {
      throw new Error(`${command} requires --value <eth amount>`);
    }
    target = ethers.utils.parseEther(value.toString());
  }

  const file = readAccountsFile();
  if (file.accounts.length === 0) {
    throw new Error('accounts.json has no accounts');
  }
  for (const account of file.accounts) {
    if (!keysMatch(account)) {
      throw new Error(
        `${account.id} publicKey ${account.publicKey} does not match the address derived from privateKey`
      );
    }
  }

  const rpcUrl = resolveRpcUrl(args.network, args.rpc);
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  const admin = loadAdminWallet(provider, accountIndex);

  if (process.env.ADMIN_PUBLIC_ADDRESS) {
    if (admin.address.toLowerCase() !== process.env.ADMIN_PUBLIC_ADDRESS.toLowerCase()) {
      throw new Error(
        `Wallet address ${admin.address} does not match ADMIN_PUBLIC_ADDRESS ${process.env.ADMIN_PUBLIC_ADDRESS}`
      );
    }
  }

  const gasPrice = ethers.utils.parseUnits(gasPriceGwei.toString(), 'gwei');
  if (gasPrice.gt(ethers.utils.parseUnits('1000', 'gwei'))) {
    throw new Error(`GAS PRICE TOO HIGH: ${gasPriceGwei} gwei`);
  }

  console.log(`[chainId=${network.chainId}] ${command} for ${file.accounts.length} accounts`);
  console.log(`Admin: ${admin.address}`);
  console.log(`Admin balance: ${ethers.utils.formatEther(await admin.getBalance())}`);
  console.log(`RPC: ${rpcUrl}`);
  if (command !== 'check') {
    console.log(dry ? 'Dry run. Pass --dry false to send transactions.' : 'Sending transactions.');
  }

  const contract = new ethers.Contract(CONTRACT_ADDRESS, BOOTH_ADMIN_ABI, admin);
  const transfers: { to: string; value: ethers.BigNumber; label: string }[] = [];
  const toWhitelist: { id: string; publicKey: string }[] = [];

  for (const account of file.accounts) {
    const balance = await provider.getBalance(account.publicKey);
    const whitelisted = await contract.isWhitelisted(account.publicKey);
    console.log(
      `${account.id} ${account.label} ${account.publicKey} balance ${ethers.utils.formatEther(balance)} whitelisted ${whitelisted}`
    );
    if (!whitelisted) {
      toWhitelist.push({ id: account.id, publicKey: account.publicKey });
    }
    if (command !== 'fund' && command !== 'ensure') continue;
    if (!target) continue;
    if (command === 'fund') {
      transfers.push({ to: account.publicKey, value: target, label: account.id });
    } else if (balance.lt(target)) {
      transfers.push({ to: account.publicKey, value: target.sub(balance), label: account.id });
    } else {
      console.log(`${account.id} already at or above ${ethers.utils.formatEther(target)}; skipping`);
    }
  }

  if (command === 'whitelist') {
    if (toWhitelist.length === 0) {
      console.log('No whitelist updates needed.');
      return;
    }
    if (dry) {
      for (const account of toWhitelist) {
        console.log(`Would whitelist ${account.id} ${account.publicKey}`);
      }
      return;
    }
    const tx = await contract.batchAddToWhitelist(
      toWhitelist.map((account) => account.publicKey),
      { gasPrice }
    );
    console.log(`whitelist tx submitted: ${tx.hash}`);
    const receipt = await tx.wait(confirmations);
    console.log(`whitelist confirmed at block ${receipt.blockNumber}`);
    for (const account of toWhitelist) {
      const whitelisted = await contract.isWhitelisted(account.publicKey);
      console.log(`${account.id} whitelisted ${whitelisted}`);
    }
    return;
  }

  if (command === 'check' || transfers.length === 0) {
    if (command !== 'check' && transfers.length === 0) {
      console.log('No transfers needed.');
    }
    return;
  }

  const total = transfers.reduce((sum, transfer) => sum.add(transfer.value), ethers.BigNumber.from(0));
  const adminBalance = await admin.getBalance();
  console.log(`Total to send: ${ethers.utils.formatEther(total)}`);
  if (adminBalance.lt(total)) {
    throw new Error(
      `${admin.address} needs ${ethers.utils.formatEther(total)} but has ${ethers.utils.formatEther(adminBalance)}`
    );
  }

  if (dry) {
    for (const transfer of transfers) {
      console.log(`Would send ${ethers.utils.formatEther(transfer.value)} to ${transfer.label} ${transfer.to}`);
    }
    return;
  }

  for (const transfer of transfers) {
    const tx = await admin.sendTransaction({
      to: transfer.to,
      value: transfer.value,
      gasPrice,
    });
    console.log(`${transfer.label} tx submitted: ${tx.hash}`);
    const receipt = await tx.wait(confirmations);
    const updated = await provider.getBalance(transfer.to);
    console.log(
      `${transfer.label} confirmed at block ${receipt.blockNumber}; balance ${ethers.utils.formatEther(updated)}`
    );
  }

  console.log(`Admin balance: ${ethers.utils.formatEther(await admin.getBalance())}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
