# Shared secret v0

See [Requirements.md](../REQUIREMENTS.md) for a comprehensive view
into this project.

## Phase 1 Checklist (Research & Setup)

- [ ] **Select Kyber JS library (most popular)**: choose a Kyber (ML-KEM) JavaScript library based on npm download stats + GitHub activity/maintenance; record the evidence and final choice.
- [ ] **Verify Kyber-768 support**: confirm the chosen library supports Kyber-768 KEM keygen/encap/decap; document the exact API surface we’ll use.
- [ ] **Confirm local Hardhat dev loop**: document the minimal local commands (install, compile, test). Example:
  - `npm install`
  - `npx hardhat compile` (or `./node_modules/.bin/hardhat compile`)
- [ ] **Align Ethereum client tooling**: requirements currently mention `ethers`, but this scaffold uses `viem`; decide which we’ll standardize on (and update docs accordingly).

## Strawman Project Overview

This example project includes:

- A simple Hardhat configuration file.
- Foundry-compatible Solidity unit tests.
- TypeScript integration tests using [`node:test`](nodejs.org/api/test.html), the new Node.js native test runner, and [`viem`](https://viem.sh/).
- Examples demonstrating how to connect to different types of networks, including locally simulating OP mainnet.

## Usage

### Running Tests

To run all the tests in the project, execute the following command:

```shell
npx hardhat test
```

You can also selectively run the Solidity or `node:test` tests:

```shell
npx hardhat test solidity
npx hardhat test nodejs
```

### Make a deployment to Sepolia

This project includes an example Ignition module to deploy the contract. You can deploy this module to a locally simulated chain or to Sepolia.

To run the deployment to a local chain:

```shell
npx hardhat ignition deploy ignition/modules/Counter.ts
```

To run the deployment to Sepolia, you need an account with funds to send the transaction. The provided Hardhat configuration includes a Configuration Variable called `SEPOLIA_PRIVATE_KEY`, which you can use to set the private key of the account you want to use.

You can set the `SEPOLIA_PRIVATE_KEY` variable using the `hardhat-keystore` plugin or by setting it as an environment variable.

To set the `SEPOLIA_PRIVATE_KEY` config variable using `hardhat-keystore`:

```shell
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

After setting the variable, you can run the deployment with the Sepolia network:

```shell
npx hardhat ignition deploy --network sepolia ignition/modules/Counter.ts
```
