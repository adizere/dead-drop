# Shared secret v0

See [Requirements.md](../REQUIREMENTS.md) for a comprehensive view
into this project.

## Phase 1 Checklist (Research & Setup)

- [x] **Select Kyber JS library (most popular)**: choose a Kyber (ML-KEM) JavaScript library based on npm download stats + GitHub activity/maintenance; record the evidence and final choice.
- [x] **Verify Kyber-768 support**: confirm the chosen library supports Kyber-768 KEM keygen/encap/decap; document the exact API surface we’ll use.
- [x] **Confirm local Hardhat dev loop**: document the minimal local commands (install, compile, test). Example:
  - `npm install`
  - `./node_modules/.bin/hardhat compile`
  - `./node_modules/.bin/hardhat test`
- [x] **Align Ethereum client tooling**: **DECIDED**: use `viem` (matches this scaffold and is a good fit for event/log based retrieval).

### Phase 1 Notes: local Hardhat dev loop

From `v0/`:

```shell
npm install
./node_modules/.bin/hardhat compile
./node_modules/.bin/hardhat test
```

Notes:

- Prefer `./node_modules/.bin/hardhat ...` for reproducibility (uses the project’s pinned Hardhat version).
- Current state: `contracts/` and `test/` are effectively empty right now, so `compile` / `test` may report “No contracts/tests to compile”.

### Phase 1 Notes: Kyber (ML-KEM) JS library selection (preliminary)

We will **start with `pqclean`** (Node.js bindings to PQClean) for ML-KEM/Kyber usage, and revisit if we hit portability/build issues.

**Evidence (npm last-week downloads, collected 2026-01-24):**

| Package | Last-week downloads | Notes |
| --- | ---: | --- |
| [`pqclean`](https://www.npmjs.com/package/pqclean) | 1770 | Node.js bindings to PQClean (wide PQC surface) |
| [`mlkem`](https://www.npmjs.com/package/mlkem) | 2226 | TS ML‑KEM / CRYSTALS‑Kyber implementation |
| [`crystals-kyber-js`](https://www.npmjs.com/package/crystals-kyber-js) | 645 | TS ML‑KEM / CRYSTALS‑Kyber implementation |
| [`crystals-kyber`](https://www.npmjs.com/package/crystals-kyber) | 449 | JS CRYSTALS‑Kyber v3 implementation |

**Source:** npm downloads API (example endpoint): `https://api.npmjs.org/downloads/point/last-week/pqclean`

### Phase 1 Notes: confirm `pqclean` supports ML‑KEM‑768

We validated the chosen library’s **KEM support** via runtime inspection of `pqclean.kem.supportedAlgorithms`.

- **Result**: `pqclean` exposes **`ml-kem-768`** (alongside `ml-kem-512`, `ml-kem-1024`).
- **Command used** (run from `v0/`):
  - `node -e "import('pqclean').then(m => { const PQClean = m.default ?? m; console.log(PQClean.kem.supportedAlgorithms.map(a => a.name)); })"`
- **Observed output excerpt**:
  - `Kyber/ML-KEM matches: [ 'ml-kem-1024', 'ml-kem-512', 'ml-kem-768' ]`

**API surface we’ll use (key-centric KEM API):**

- `await PQClean.kem.generateKeyPair('ml-kem-768')`
- `await publicKey.generateKey()` → `{ key, encryptedKey }`
- `await privateKey.decryptKey(encryptedKey)` → `key`

## Phase 2 (Core Cryptography): implemented

We added a minimal crypto core + unit tests to validate the Kyber/ML‑KEM → HKDF → AES‑GCM flow end-to-end.

### Code added

- **Crypto helpers**: `src/crypto.js`
  - `deriveAes256KeyFromKemSecret(...)` (HKDF-SHA256 → 32-byte AES key)
  - `aes256GcmEncrypt(...)` / `aes256GcmDecrypt(...)` (AES-256-GCM with optional AAD)

### Tests added

- **Node.js unit tests**: `test/nodejs/crypto.test.js`
  - Confirms `pqclean` exposes `ml-kem-768`
  - KEM roundtrip: encapsulated key decapsulates to the same shared secret
  - HKDF determinism + domain separation (salt changes derived key)
  - AES-256-GCM roundtrip
  - AES-256-GCM tamper detection (ciphertext/tag)

### Run the tests

From `v0/`:

```shell
./node_modules/.bin/hardhat test nodejs
```

Or with the following script shortcut:

```shell
npm run test:node
```

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
