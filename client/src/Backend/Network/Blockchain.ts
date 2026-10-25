// These are loaded as URL paths by a webpack loader
import diamondContractAbiUrl from '@dfares/contracts/abis/DarkForest.json';
import { createContract, createEthConnection, EthConnection } from '@dfares/network';
import type { Contract, providers, Wallet } from 'ethers';

/**
 * Loads the game contract, which is responsible for updating the state of the game.
 */
export async function loadDiamondContract<T extends Contract>(
  address: string,
  provider: providers.JsonRpcProvider,
  signer?: Wallet
): Promise<T> {
  const abi = await fetch(diamondContractAbiUrl).then((r) => r.json());

  return createContract<T>(address, abi, provider, signer);
}

export function getEthConnection(): Promise<EthConnection> {
  const isProd = process.env.NODE_ENV === 'production';
  const defaultUrl = process.env.DEFAULT_RPC || 'http://localhost:8545';

  // Development uses DEFAULT_RPC directly. Production keeps a browser override
  // from the settings pane, then falls back to the same default.
  const url = isProd
    ? localStorage.getItem('XDAI_RPC_ENDPOINT_v5') || defaultUrl
    : defaultUrl;

  console.log(`GAME METADATA:`);
  console.log(`rpc url: ${url}`);
  console.log(`is production: ${isProd}`);
  console.log(`webserver url: ${process.env.DF_WEBSERVER_URL}`);
  console.log(`leaderboard url: ${process.env.LEADER_BOARD_URL}`);

  return createEthConnection(url);
}
