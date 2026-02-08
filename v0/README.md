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

### Contract tests added

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

## Phase 3 (Smart Contract): implemented

We implemented the MVP on-chain storage mechanism as **calldata + events** (no contract storage), matching `REQUIREMENTS.md`.

### Contract added/updated

- **Contract**: `contracts/ContractStorage.sol` (contains `EncryptedCalldataStorage`)
  - `storeEncrypted(bytes32 dataId, bytes calldata encryptedData)`
  - Emits:
    - `DataStored(address indexed user, bytes32 indexed dataId, bytes encryptedData, uint256 timestamp)`
  - Enforces a soft cap:
    - `MAX_ENCRYPTED_DATA_BYTES = 12288` (12 KiB)

### Tests added

- **Node.js contract tests**: `test/nodejs/calldata-storage.test.js`
  - Emits event and verifies log retrieval via `viem`
  - Stores a payload sized for **~10KB plaintext** (hybrid KEM + AES‑GCM budget) and verifies it succeeds
  - Verifies oversize payload is rejected (`encryptedData too large`)

### Run the contract tests

From `v0/`:

```shell
npm run test:node
```

## Phase 4 (Client Integration) – point 1: implemented (CLI encrypt + store)

We implemented the first Phase 4 item: a CLI that **encrypts a plaintext** and **stores it on-chain** via `EncryptedCalldataStorage.storeEncrypted(...)`.

### What it does (retrieve + decrypt)

- **Encryption**:
  - ML‑KEM‑768 via `pqclean` (KEM encapsulation)
  - HKDF‑SHA256 (derive 32-byte AES key)
  - AES‑256‑GCM (encrypt + authenticate)
- **Payload format** (stored as `bytes`):
  - `[version:1][algId:1][ml-kem ciphertext][iv:12][ciphertext][tag:16]`
- **Storage**:
  - Calls `EncryptedCalldataStorage.storeEncrypted(dataId, encryptedData)`
  - `dataId = keccak256(utf8(id))`
- **Key output**:
  - Writes a local file (gitignored) to `v0/keys/<id>.key.json`
  - This file contains the ML‑KEM private key required for decryption later (keep it secret)

### How to run (retrieve + decrypt)

From `v0/`:

```shell
# Encrypt and store a short message (deploys a new contract if --contract is omitted)
npm run store:encrypt -- --id demo --message "hello"

# Encrypt and store a file
npm run store:encrypt -- --id demo-file --file ./path/to/secret.bin

# Store into an already deployed contract
npm run store:encrypt -- --id demo --message "hello" --contract 0x...
```

### Implementation (retrieve + decrypt)

- **Hardhat task**: `encrypt-and-store`
  - Registered via `plugins/encrypt-and-store/index.js`
  - Implementation: `plugins/encrypt-and-store/task-action.js`
- **npm script**: `store:encrypt` (in `package.json`)

### Tests (retrieve + decrypt)

Accompanying tests exist in `v0/test/nodejs/e2e-encrypt-store-decrypt.test.js`.
They assert both the happy path as well as a negative flow. Run the tests using the standard:

```shell
npm run test
```

## Phase 4 (Client Integration) – point 2: implemented (CLI retrieve + decrypt)

We implemented the second Phase 4 item: a CLI that **retrieves the encrypted payload from `DataStored` logs** and **decrypts it locally** using the saved ML‑KEM private key.

### What it does

- **Retrieval**:
  - Queries `DataStored(address indexed user, bytes32 indexed dataId, bytes encryptedData, uint256 timestamp)`
  - Filters by `(contract, dataId, user)` and uses the **latest** match
- **Decryption**:
  - Loads the ML‑KEM private key from `keys/<id>.key.json` (or `--keys <path>`)
  - Unpacks payload: `[version][algId][ml-kem ciphertext][iv][ciphertext][tag]`
  - ML‑KEM‑768 decapsulation → HKDF‑SHA256 → AES‑256‑GCM decrypt

### How to run

From `v0/`:

```shell
# Print plaintext (utf8) to stdout
npm run retrieve:decrypt -- --contract 0x... --id demo

# Use a specific keys file
npm run retrieve:decrypt -- --contract 0x... --id demo --keys keys/demo.key.json

# Output as hex
npm run retrieve:decrypt -- --contract 0x... --id demo --format hex

# Write plaintext bytes to a file
npm run retrieve:decrypt -- --contract 0x... --id demo --out ./plaintext.bin
```

### Implementation

- **Hardhat task**: `retrieve-and-decrypt`
  - Registered via `plugins/retrieve-and-decrypt/index.js`
  - Implementation: `plugins/retrieve-and-decrypt/task-action.js`
- **npm script**: `retrieve:decrypt` (in `package.json`)

### Tests

- `v0/test/nodejs/retrieve-and-decrypt.test.js`
  - Happy path: store → retrieve → decrypt equals original plaintext
  - Negative: wrong key file causes retrieval/decrypt to fail

## Strawman Project Overview -- Hardhat default docs

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

### Make a deployment to a testnet (Sepolia or Arc)

This project’s contract is **EncryptedCalldataStorage** (in `contracts/ContractStorage.sol`), used for storing encrypted payloads on-chain via calldata and events.

You can deploy it in two ways:

1. **Via the encrypt-and-store CLI** (no Ignition module needed): omit `--contract` when running so the task deploys a new instance. Use `--network <name>` to choose the chain.

   **Sepolia:**

   ```shell
   npx hardhat store:encrypt --network sepolia --id demo --message "hello"
   ```

   **Arc testnet** (chain ID 5042002; gas is paid in USDC):

   ```shell
   npx hardhat store:encrypt --network arcTestnet --id demo --message "hello"
   ```

   The task will deploy `EncryptedCalldataStorage` and then store the encrypted message; the deployed contract address is printed in the output.

2. **Via Hardhat Ignition** (if you add a module): create an Ignition module that deploys the `EncryptedCalldataStorage` contract (e.g. `ignition/modules/EncryptedCalldataStorage.ts`). This project does not include that file by default.

For either approach you need an account with funds.

- **Sepolia:** Set `SEPOLIA_PRIVATE_KEY` (and optionally `SEPOLIA_RPC_URL`). Using the keystore: `npx hardhat keystore set SEPOLIA_PRIVATE_KEY`
- **Arc testnet:** Set `ARC_TESTNET_PRIVATE_KEY`. RPC defaults to `https://rpc.testnet.arc.network`; override with `ARC_TESTNET_RPC_URL` if needed. Using the keystore: `npx hardhat keystore set ARC_TESTNET_PRIVATE_KEY`

### Retrieve and decrypt from a testnet (Sepolia or Arc)

After you’ve stored encrypted data (see above), you can fetch it from chain and decrypt it using the **retrieve-and-decrypt** task. You need:

- The **contract address** printed when you ran `store:encrypt` (e.g. `0x23f07ef458c1d8e185d565307accad8f15225439`).
- The **keys file** written by `store:encrypt` (default: `keys/<id>.key.json`, e.g. `keys/demo.key.json`). Keep this file secret; it contains the ML-KEM private key.

**Arc testnet** (same network you used to store):

```shell
npx hardhat retrieve-and-decrypt --network arcTestnet --contract <CONTRACT_ADDRESS> --id demo
```

The above does not work very well, because the `getLogs` method (needed for fetching the event data where the encrypted input is stored actually)
requires a `to` and `from` parameters, to configure which blocks exactly to query from. So encrypting and storing a secret at height H requires
changing the params "CAST_FROM_BLOCK" and "CAST_TO_BLOCK" in `events.js` with H. Without correct params, nothing may be found. Even with correct 
parameters, we need to also pass an RPC parameter, to use the CLI-based `cast` tool, because the basic viem library is unable to fetch the parameters
(it yields a HTTP 413 "response exceeds maximum lenght" error).

So the correct instantiation is:

```shell
npx hardhat retrieve-and-decrypt \             
  --network arcTestnet \
  --contract 0x23f07Ef458C1D8e185d565307AccAD8F15225439 \
  --id demo \
  --rpcUrl "https://rpc.testnet.arc.network"
```

Assuming, again, that "CAST_FROM_BLOCK" and "CAST_TO_BLOCK" are correctly hardcoded.

The task for storing works fine:

```shell
npx hardhat store:encrypt --network arcTestnet --id demo --message "hello25563" --contract 0x23f07Ef458C1D8e185d565307AccAD8F15225439
```
