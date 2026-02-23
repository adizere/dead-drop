# v0.1

See [REQUIREMENTS.md](../REQUIREMENTS.md) for the full project spec and [v0/README.md](../v0/README.md) for the implementation notes of the older, v0 prototype.

## Motivation (why v0.1?)

v0 stores encrypted payloads in transaction calldata and retrieves them by scanning `DataStored` event logs. This works but has serious UX problems on real networks:

- `getLogs` requires specifying block ranges; on some RPCs a wide range triggers **HTTP 413** ("response exceeds maximum length").
- v0 fell back to shelling out to `cast logs` with **hardcoded block numbers** (`CAST_FROM_BLOCK` / `CAST_TO_BLOCK` in `events.js`) -- fragile and manual.
- There is no simple way to ask "what is the current encrypted blob for `(user, dataId)`?"

v1 fixes all of this by storing data in **contract state** (a Solidity mapping). Retrieval is a single `view` function call -- no log scanning, no block ranges, no `cast`.

## Delta from v0

| Aspect | v0 | v1 |
| --- | --- | --- |
| **Contract** | `EncryptedCalldataStorage` -- emit-only, no storage | `EncryptedStorage` -- writes to `mapping(bytes32 => Entry)` |
| **Store** | `storeEncrypted(dataId, data)` emits event | Same signature, but also writes to storage |
| **Retrieve** | Scan `DataStored` event logs (`getLogs` / `cast`) | `getEncrypted(slot)` view function |
| **Mutability** | Immutable (each store is a new event) | Mutable (re-storing overwrites the entry) |
| **`src/events.js`** | 145 lines: `cast` subprocess, hardcoded block ranges, event decoding | **Deleted** -- replaced by `src/storage.js` (~25 lines) |
| **CLI options** | `--rpcUrl`, `--fromBlock` needed for retrieval | Removed (not needed) |
| **Crypto** | ML-KEM-768 + AES-256-GCM, HKDF-SHA256 | **Identical** (same protocol, same constants) |
| **Payload format** | `[version:1][algId:1][kemCt][iv:12][ct][tag:16]` | **Identical** |
| **Key files** | `keys/<id>.key.json` | Not used in browser flow; per-secret keys are derived from passphrase + identifier |
| **Frontend** | None | Single-file browser UI (`frontend/index.html`) -- encrypt/store and retrieve/decrypt from the browser |

### Changelog

See [CHANGELOG.md](./CHANGELOG.md) for history of change to this version.

### Files unchanged (copied from v0)

- `src/crypto.js` -- AES-256-GCM + HKDF
- `src/protocol.js` -- payload pack/unpack, AAD, `computeSlot()`
- `src/keyfile.js` -- key file I/O
- `src/pqclean.js` -- ML-KEM-768 wrapper

## Frontend

v1 ships a **zero-build-step browser UI** in `frontend/index.html` (~770 lines, single file). Serve it with any static HTTP server (e.g. `npx serve .`) and open in a browser with MetaMask.

### What it does

- **Encrypt & Store** -- type an identifier + plaintext message, sign a transaction, and store the encrypted blob on-chain.
- **Retrieve & Decrypt** -- enter an identifier, read the blob via a `view` call (no gas), and decrypt locally.

### Technical details

| | |
| --- | --- |
| **Dependencies** | No `node_modules` -- ESM imports from `esm.sh` at runtime: [`viem@2`](https://viem.sh) (Ethereum client) and [`mlkem@1`](https://github.com/nickovs/mlkem) (ML-KEM-768) |
| **Crypto** | ML-KEM-768 encap/decap via `mlkem`; AES-256-GCM + HKDF-SHA256 via the native Web Crypto API. Same protocol and payload format as the CLI |
| **Wallet** | MetaMask (EIP-1193 `window.ethereum`); auto-switches to Arc Testnet (chain 5042002) if needed |
| **Contract interaction** | `viem` `getContract` -- `storeEncrypted` write tx for store (wallet required), `getEncrypted(slot)` view call for retrieval (no wallet) |
| **Key management** | Per-secret ML-KEM keypair derived from passphrase + identifier in the browser (no keys stored on server or chain) |
| **UI** | Brutalist monospace theme; Access section (passphrase + identifier), Retrieve first, Store second |
| **Identifier normalization** | `idString.trim().normalize("NFC")` before keyed derivation; case-sensitive, empty identifiers rejected |

### Slot derivation (keyed, breaking change)

Identifiers are low-entropy, so the storage `slot` is derived using a keyed HMAC to prevent enumeration:

- `masterKey = PBKDF2(passphrase, "shared-secret:v1", 600k iterations, SHA-256)`
- `keyId = HKDF(masterKey, info="id-key", len=32)`
- `slot = HMAC-SHA256(keyId, normalizedId)` → 32 bytes

This is a **breaking change** from the previous `keccak256(id)` approach. Existing on-chain entries will not be discoverable with the new keyed `slot`. Deploy a new contract for this version.

### Per-secret keys

For each identifier, the ML-KEM-768 keypair is derived deterministically:

- `seed = HKDF(masterKey, info="kem:<normalizedId>", len=64)`
- `mlkem.deriveKeyPair(seed)` produces the per-secret keypair

### Gating rules

- **Store** requires passphrase + identifier + wallet (gas paid).
- **Retrieve** requires passphrase + identifier only (no wallet; no gas).

### Forward secrecy

Forward secrecy is **out of scope**. The priority is deterministic decryption given passphrase + identifier.

### Identifier requirements

Identifiers are normalized before hashing to avoid accidental mismatches:

- Leading/trailing whitespace is trimmed.
- Unicode is normalized to NFC (canonical form).
- Case-sensitive: `"MyNote"` ≠ `"mynote"`.

Note: This normalization changes the computed `slot`. If you stored data in earlier versions using non-normalized identifiers, you must use the same normalized form to retrieve it.

## Quick start

From `v1/`:

```shell
npm install
npm test              # run all tests
```

### Encrypt and store

When you omit `--network`, the task connects to **Arc Testnet** (you will be prompted for the keystore password):

```shell
# Deploys a new contract and stores the encrypted message (default: Arc Testnet)
npm run store:encrypt -- --id demo --passphrase "correct horse battery staple" --message "hello"

# Store into an existing contract
npm run store:encrypt -- --id demo --passphrase "correct horse battery staple" --message "hello" --contract 0x...

# Encrypt a file
npm run store:encrypt -- --id demo-file --passphrase "correct horse battery staple" --file ./path/to/secret.bin
```

Use `--network sepolia` (or another network from `hardhat.config.ts`) to target a different chain.

### Retrieve and decrypt

Retrieval needs no wallet or gas. The task uses `--rpc-url` (default: Arc Testnet) and does not use Hardhat’s network, so no keystore password is prompted:

```shell
# Print plaintext to stdout (no --network, no keystore password)
npm run retrieve:decrypt -- --contract 0x... --id demo --passphrase "correct horse battery staple"

# Custom RPC
npm run retrieve:decrypt -- --contract 0x... --id demo --passphrase "..." --rpc-url https://rpc.testnet.arc.network --chain-id 5042002

# Output as hex or write to file
npm run retrieve:decrypt -- --contract 0x... --id demo --passphrase "..." --format hex
npm run retrieve:decrypt -- --contract 0x... --id demo --passphrase "..." --out ./plaintext.bin
```

### Other networks

For store, the default network is Arc Testnet. To use another chain (e.g. Sepolia), pass `--network sepolia`. Set the private key via `npx hardhat keystore set <KEY_NAME>` (see `hardhat.config.ts` for network details).
