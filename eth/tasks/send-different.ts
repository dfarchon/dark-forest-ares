import * as fs from 'fs';
import { task, types } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

interface TransferItem {
  address: string;
  value: string;
}

task('batch:sendDifferent', 'send different native token amounts to different accounts')
  .addPositionalParam(
    'filePath',
    'file path with one transfer per line: "<address> <amount>" or "<address>,<amount>"',
    undefined,
    types.string
  )
  .addParam(
    'dry',
    "dry run only (doesn't carry out transactions). default: true",
    true,
    types.boolean
  )
  .addParam('confirmations', 'confirmations to wait for each transaction', 1, types.int)
  .setAction(sendDifferentValues);

function parseTransferLine(line: string, lineNumber: number): TransferItem | undefined {
  const trimmedLine = line.split('#')[0].trim();
  if (trimmedLine.length === 0) {
    return undefined;
  }

  const parts = trimmedLine.split(/[,\s]+/).filter((part) => part.length > 0);
  if (parts.length !== 2) {
    throw new Error(`Invalid transfer format on line ${lineNumber}: ${line}`);
  }

  return {
    address: parts[0],
    value: parts[1],
  };
}

async function sendDifferentValues(
  args: { filePath: string; dry: boolean; confirmations: number },
  hre: HardhatRuntimeEnvironment
) {
  await hre.run('utils:assertChainId');

  const fileContents = fs.readFileSync(args.filePath).toString();
  const transfers = fileContents
    .split('\n')
    .map((line, index) => parseTransferLine(line, index + 1))
    .filter((transfer): transfer is TransferItem => transfer !== undefined);

  if (transfers.length === 0) {
    throw new Error(`No transfers found in ${args.filePath}`);
  }

  const [admin] = await hre.ethers.getSigners();
  const beginBalance = await admin.getBalance();
  let totalValue = hre.ethers.constants.Zero;

  console.log('network:', hre.network.name);
  console.log('sender:', admin.address);
  console.log('sender balance:', hre.ethers.utils.formatEther(beginBalance));
  console.log('transfer count:', transfers.length);

  for (const transfer of transfers) {
    const isAddress = hre.ethers.utils.isAddress(transfer.address);
    if (!isAddress) {
      throw new Error(`Address ${transfer.address} is NOT a valid address.`);
    }

    const parsedValue = hre.ethers.utils.parseEther(transfer.value);
    if (parsedValue.lte(0)) {
      throw new Error(`Transfer value must be greater than 0 for ${transfer.address}`);
    }

    totalValue = totalValue.add(parsedValue);
  }

  console.log('total transfer value:', hre.ethers.utils.formatEther(totalValue));
  if (beginBalance.lt(totalValue)) {
    throw new Error(
      `${admin.address} trying to send ${hre.ethers.utils.formatEther(
        totalValue
      )} but only has ${hre.ethers.utils.formatEther(beginBalance)}`
    );
  }

  for (const transfer of transfers) {
    const value = hre.ethers.utils.parseEther(transfer.value);
    console.log(`send ${transfer.value} to ${transfer.address}`);

    if (args.dry) {
      continue;
    }

    const tx = await admin.sendTransaction({
      to: transfer.address,
      value,
    });

    console.log(`tx submitted: ${tx.hash}`);
    const receipt = await tx.wait(args.confirmations);
    console.log(
      `tx confirmed at block ${receipt?.blockNumber} (${args.confirmations} confirmations)`
    );

    const balance = await hre.ethers.provider.getBalance(admin.address);
    console.log('sender balance:', hre.ethers.utils.formatEther(balance));
    console.log('-------------------------------------------------');
  }

  if (args.dry) {
    console.log('Dry run successful; run with "--dry false" to execute transactions');
  }
}
