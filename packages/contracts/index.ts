/**
 * This package contains deployed contract addresses, ABIs, and Typechain types
 * for the Dark Forest game.
 *
 * ## Installation
 *
 * You can install this package using [`npm`](https://www.npmjs.com) or
 * [`yarn`](https://classic.yarnpkg.com/lang/en/) by running:
 *
 * ```bash
 * npm install --save @dfares/contracts
 * ```
 * ```bash
 * yarn add @dfares/contracts
 * ```
 *
 * When using this in a plugin, you might want to load it with [skypack](https://www.skypack.dev)
 *
 * ```js
 * import * as contracts from 'http://cdn.skypack.dev/@dfares/contracts'
 * ```
 *
 * ## Typechain
 *
 * The Typechain types can be found in the `typechain` directory.
 *
 * ## ABIs
 *
 * The contract ABIs can be found in the `abis` directory.
 *
 * @packageDocumentation
 */

/**
 * The name of the network where these contracts are deployed.
 */
export const NETWORK = 'megaETH';
/**
 * The id of the network where these contracts are deployed.
 */
export const NETWORK_ID = 4326;
/**
 * The block in which the DarkForest contract was initialized.
 */
export const START_BLOCK = 17344608;
/**
 * The address for the DarkForest contract.
 */
export const CONTRACT_ADDRESS = '0x7d35623dE9aFa0f0A791345B6fa4f9c7AC5ad1a0';
/**
 * The address for the initalizer contract. Useful for lobbies.
 */
export const INIT_ADDRESS = '0x285C72eB59CBa433DA97d5E8bb1d351791E3714d';