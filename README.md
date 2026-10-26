# Dark Forest Punk

![node](https://img.shields.io/badge/node-24.22.1-43853d)
![yarn](https://img.shields.io/badge/yarn-4-2c8ebb)
![typescript](https://img.shields.io/badge/typescript-5.5-3178c6)
![hardhat](https://img.shields.io/badge/hardhat-2.29.1-f5c542)
![react](https://img.shields.io/badge/react-17.0.2-61dafb)
![stack](https://img.shields.io/badge/stack-Solidity%20%2F%20SNARKs%20%2F%20React-6f42c1)
![status](https://img.shields.io/badge/status-active%20development-2ea44f)
![license](https://img.shields.io/badge/license-GPL--3.0-555555)

An actively developed community branch of the first fully onchain ZK war game.

**Zero-knowledge exploration. Onchain strategy. Endless space.**

---

Dark Forest is a fully onchain ZK war game of exploration, strategy, and
conquest. The original project was developed by the Dark Forest official team
from 2019 to Q1 2022.

Dark Forest Punk is a community-maintained branch by the DFArchon team. The
original Ares line ran from Q1 2023 to Q2 2024, and the project is now active
again with a new 2026 test round.

Follow the latest updates at [x.com/darkforest_punk](https://x.com/darkforest_punk).

## Launch a Local Universe

Use Node.js 24.22.1.

```sh
yarn
yarn prepare
```

`yarn` installs dependencies. This repo is on Yarn 4, which leaves the root
`prepare` script for an explicit call, so install does not compile anything.
`yarn prepare` builds the `@dfares/*` packages into `dist/`, compiles the
contracts, and then typechecks `eth/`. Contract compilation writes the TypeChain
types and `abis/DarkForest.json`, which `eth/booth` imports, so that typecheck
has to run after the compile. Those directories are gitignored. The client build
and a Netlify deploy both resolve workspace packages through them, so run
`yarn prepare` after a fresh clone and again if those directories are removed.

Run the local universe with Ganache. It is faster for daily development and
keeps blocks on disk between restarts.

```sh
yarn workspace eth ganache
yarn workspace eth hardhat:dev deploy
yarn workspace client start:dev
```

Open `http://localhost:8081`.

## Stack

`Solidity` / `Hardhat` / `TypeScript` / `React` / `WebGL` / `SNARKs`

Dark Forest Punk is organized as a full onchain game stack:

- `circuits/` defines the zero-knowledge circuits for hidden movement and
  exploration. Players produce proofs from these circuits; the contracts verify
  those proofs before accepting state changes onchain.
- `eth/` contains the Solidity universe, Hardhat deployment flow, tests, and
  admin tasks. It is the settlement layer for every valid proof-backed action.
- `packages/` contains shared TypeScript modules for constants, types, game
  logic, rendering, settings, hashing, and SNARK interfaces.
- `client/` contains the browser game client, UI, plugins, storage, networking,
  and WebGL renderer.

The result is a self-contained Dark Forest universe: contracts define the world,
shared packages keep game rules consistent, and the client turns hidden onchain
state into playable strategy.

## Ares Versions

Dark Forest Punk evolved across four community rounds, then returned to active
development with a new 2026 test round.

- `2023 May` / `v0.1.1` - introduced Fire Link, Ice Link, Stellar Shield, and
  Avatar; added artifact purchasing; added cooldowns for artifact purchases and
  activations.
- `2023 Nov` / `v0.1.2` - introduced the Pink Bomb; upgraded the ZK circuit so
  central planets can reach higher levels while hiding exact coordinates; ranked
  players higher for claiming planets closer to the universe center.
- `2024 May` / `v0.1.3` - introduced the Kardashev artifact for blue-zone
  resource mobilization; added purchases for planets, artifacts, and skins;
  introduced sponsor-backed bounties.
- `2024 Aug` / `v0.1.4` - introduced the Union system for cooperative energy
  support; added a dynamically shrinking inner radius to slow early center
  capture and keep the round competitive.
- `2026 Jun` / `v0.1.5` - brings Ares back as a modern test round with
  configurable artifact rules, buy-energy flow, quick-join settings, and
  smoother transaction UX.

## License

GPL-3.0
