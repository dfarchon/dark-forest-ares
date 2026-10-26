import { CONTRACT_ADDRESS } from '@dfares/contracts';
import diamondAbi from '@dfares/contracts/abis/DarkForest.json';
import { ethers } from 'ethers';
import * as fs from 'fs';
import { ACCOUNTS_PATH, writeAccountsFile } from './accountsFile';
import { parseArgs, resolveRpcUrl } from './cli';
import { chooseSpawnCluster, SpawnRules } from './spawn';

const MAX_SAFE_INTEGER = ethers.BigNumber.from('9007199254740991');

function asNumber(value: ethers.BigNumberish, label: string): number {
  const parsed = ethers.BigNumber.from(value);
  // Pass the limit as a decimal string. ethers v5 rejects BigNumber.from(Number.MAX_SAFE_INTEGER).
  if (parsed.isNegative() || parsed.gt(MAX_SAFE_INTEGER)) {
    throw new Error(`${label} does not fit in a safe integer`);
  }
  return parsed.toNumber();
}

function asNumberList(values: ethers.BigNumberish[], label: string): number[] {
  return values.map((value, index) => asNumber(value, `${label}[${index}]`));
}

async function loadRules(provider: ethers.providers.Provider, contractAddress: string): Promise<SpawnRules> {
  const contract = new ethers.Contract(contractAddress, diamondAbi, provider);
  const [worldRadius, innerRadius, gameResult, snarkResult] = await Promise.all([
    contract.worldRadius(),
    contract.innerRadius(),
    contract.getGameConstants(),
    contract.getSnarkConstants(),
  ]);
  const game = gameResult.MAX_LEVEL_DIST ? gameResult : gameResult[0];
  const snark = snarkResult.SPACETYPE_KEY ? snarkResult : snarkResult[0];

  return {
    worldRadius: asNumber(worldRadius, 'worldRadius'),
    innerRadius: asNumber(innerRadius, 'innerRadius'),
    maxLevelDist: asNumberList(game.MAX_LEVEL_DIST, 'MAX_LEVEL_DIST'),
    initPerlinMin: asNumber(game.INIT_PERLIN_MIN, 'INIT_PERLIN_MIN'),
    initPerlinMax: asNumber(game.INIT_PERLIN_MAX, 'INIT_PERLIN_MAX'),
    perlinThreshold1: asNumber(game.PERLIN_THRESHOLD_1, 'PERLIN_THRESHOLD_1'),
    perlinThreshold2: asNumber(game.PERLIN_THRESHOLD_2, 'PERLIN_THRESHOLD_2'),
    perlinThreshold3: asNumber(game.PERLIN_THRESHOLD_3, 'PERLIN_THRESHOLD_3'),
    spaceTypeKey: asNumber(snark.SPACETYPE_KEY, 'SPACETYPE_KEY'),
    perlinLengthScale: asNumber(snark.PERLIN_LENGTH_SCALE, 'PERLIN_LENGTH_SCALE'),
    mirrorX: Boolean(snark.PERLIN_MIRROR_X),
    mirrorY: Boolean(snark.PERLIN_MIRROR_Y),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const count = args.count ? parseInt(args.count, 10) : 4;
  const force = args.force === 'true';

  if (!Number.isInteger(count) || count < 1 || count > 64) {
    throw new Error('Invalid count. Use an integer from 1 to 64.');
  }
  if (fs.existsSync(ACCOUNTS_PATH) && !force) {
    throw new Error(
      `Refusing to overwrite ${ACCOUNTS_PATH}. Run again with force to replace it.`
    );
  }

  const rpcUrl = resolveRpcUrl(args.network, args.rpc);
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  const rules = await loadRules(provider, CONTRACT_ADDRESS);
  const spawns = chooseSpawnCluster(rules, count);

  const accounts = spawns.map((spawn, index) => {
    const wallet = ethers.Wallet.createRandom();
    const n = index + 1;
    return {
      id: `booth-${n}`,
      label: `Booth ${n}`,
      privateKey: wallet.privateKey,
      publicKey: wallet.address,
      spawn,
    };
  });

  writeAccountsFile({ accounts });

  console.log(`[chainId=${network.chainId}] Wrote ${accounts.length} accounts to ${ACCOUNTS_PATH}`);
  console.log(`RPC: ${rpcUrl}`);
  console.log(`Contract: ${CONTRACT_ADDRESS}`);
  console.log(
    `Birth ring uses world radius ${rules.worldRadius}, inner radius ${rules.innerRadius}, MAX_LEVEL_DIST [${rules.maxLevelDist.join(', ')}]`
  );
  for (const account of accounts) {
    const spawn = account.spawn;
    const radius = Math.round(Math.hypot(spawn.x, spawn.y));
    console.log(
      `${account.id} ${account.label} ${account.publicKey} spawn (${spawn.x}, ${spawn.y}) radius ${radius}`
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
