"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.INIT_ADDRESS = exports.CONTRACT_ADDRESS = exports.START_BLOCK = exports.NETWORK_ID = exports.NETWORK = void 0;
/**
 * The name of the network where these contracts are deployed.
 */
exports.NETWORK = 'opSepolia';
/**
 * The id of the network where these contracts are deployed.
 */
exports.NETWORK_ID = 11155420;
/**
 * The block in which the DarkForest contract was initialized.
 */
exports.START_BLOCK = 50556160;
/**
 * The address for the DarkForest contract.
 */
exports.CONTRACT_ADDRESS = '0x26c3eaFC559d6770d98C0972491cF91846E32024';
/**
 * The address for the initalizer contract. Useful for lobbies.
 */
exports.INIT_ADDRESS = '0xBAb78F7adD277303e303601E6e20597D6a303974';
//# sourceMappingURL=index.js.map