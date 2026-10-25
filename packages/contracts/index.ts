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
export const NETWORK = 'opSepolia';
/**
 * The id of the network where these contracts are deployed.
 */
export const NETWORK_ID = 11155420;
/**
 * The block in which the DarkForest contract was initialized.
 */
export const START_BLOCK = 50556160;
/**
 * The address for the DarkForest contract.
 */
export const CONTRACT_ADDRESS = '0x26c3eaFC559d6770d98C0972491cF91846E32024';
/**
 * The address for the initalizer contract. Useful for lobbies.
 */
export const INIT_ADDRESS = '0xBAb78F7adD277303e303601E6e20597D6a303974';