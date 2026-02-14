# Shared secret v1

v1 of the post-quantum encrypted on-chain storage protocol. Same cryptography as v0, but with **contract-storage-based retrieval** instead of event-log scanning.

See [REQUIREMENTS.md](../REQUIREMENTS.md) for the full project spec and [v0/README.md](../v0/README.md) for the original implementation notes.

## Motivation (why v1?)

v0 stores encrypted payloads in transaction calldata and retrieves them by scanning `DataStored` event logs. This works but has serious UX problems on real networks:

- `getLogs` requires specifying block ranges; on some RPCs a wide range triggers **HTTP 413** ("response exceeds maximum length").
- v0 fell back to shelling out to `cast logs` with **hardcoded block numbers** (`CAST_FROM_BLOCK` / `CAST_TO_BLOCK` in `events.js`) -- fragile and manual.
- There is no simple way to ask "what is the current encrypted blob for `(user, dataId)`?"

v1 fixes all of this by storing data in **contract state** (a Solidity mapping). Retrieval is a single `view` function call -- no log scanning, no block ranges, no `cast`.

## Delta from v0

| Aspect | v0 | v1 |
| --- | --- | --- |
| **Contract** | `EncryptedCalldataStorage` -- emit-only, no storage | `EncryptedStorage` -- writes to `mapping(address => mapping(bytes32 => Entry))` |
| **Store** | `storeEncrypted(dataId, data)` emits event | Same signature, but also writes to storage |
| **Retrieve** | Scan `DataStored` event logs (`getLogs` / `cast`) | `getEncrypted(dataId, user)` view function |
| **Mutability** | Immutable (each store is a new event) | Mutable (re-storing overwrites the entry) |
| **`src/events.js`** | 145 lines: `cast` subprocess, hardcoded block ranges, event decoding | **Deleted** -- replaced by `src/storage.js` (~25 lines) |
| **CLI options** | `--rpcUrl`, `--fromBlock` needed for retrieval | Removed (not needed) |
| **Crypto** | ML-KEM-768 + AES-256-GCM, HKDF-SHA256 | **Identical** (same protocol, same constants) |
| **Payload format** | `[version:1][algId:1][kemCt][iv:12][ct][tag:16]` | **Identical** |
| **Key files** | `keys/<id>.key.json` | `keys/default.key.json` -- single shared keypair reused across secrets |
| **Frontend** | None | Single-file browser UI (`frontend/index.html`) -- encrypt/store and retrieve/decrypt from the browser |

### Changelog

See [CHANGELOG.md](./CHANGELOG.md) for history of change to this version.

### Files unchanged (copied from v0)

- `src/crypto.js` -- AES-256-GCM + HKDF
- `src/protocol.js` -- payload pack/unpack, AAD, `computeDataId()`
- `src/keyfile.js` -- key file I/O
- `src/pqclean.js` -- ML-KEM-768 wrapper

## Frontend

v1 ships a **zero-build-step browser UI** in `frontend/index.html` (~770 lines, single file). Serve it with any static HTTP server (e.g. `npx serve .`) and open in a browser with MetaMask.

### What it does

- **Encrypt & Store** -- type an identifier + plaintext message, sign a transaction, and store the encrypted blob on-chain.
- **Retrieve & Decrypt** -- enter an identifier (and optionally a user address), read the blob via a `view` call (no gas), and decrypt locally.

### Technical details

| | |
| --- | --- |
| **Dependencies** | No `node_modules` -- ESM imports from `esm.sh` at runtime: [`viem@2`](https://viem.sh) (Ethereum client) and [`mlkem@1`](https://github.com/nickovs/mlkem) (ML-KEM-768) |
| **Crypto** | ML-KEM-768 encap/decap via `mlkem`; AES-256-GCM + HKDF-SHA256 via the native Web Crypto API. Same protocol and payload format as the CLI |
| **Wallet** | MetaMask (EIP-1193 `window.ethereum`); auto-switches to Arc Testnet (chain 5042002) if needed |
| **Contract interaction** | `viem` `getContract` -- `storeEncrypted` write tx for store, `getEncrypted` view call for retrieval |
| **Key management** | Public/private key hex from `keys/default.key.json` hardcoded as constants at the top of the script |
| **UI** | Brutalist monospace theme; line-numbered editor for input/output; fully responsive |
| **Identifier normalization** | `idString.trim().normalize("NFC")` before `keccak256(toBytes(...))`; case-sensitive, empty identifiers rejected |

### Identifier requirements

Identifiers are normalized before hashing to avoid accidental mismatches:

- Leading/trailing whitespace is trimmed.
- Unicode is normalized to NFC (canonical form).
- Case-sensitive: `"MyNote"` ≠ `"mynote"`.

Note: This normalization changes the computed `dataId`. If you stored data in earlier versions using non-normalized identifiers, you must use the same normalized form to retrieve it.

## Quick start

From `v1/`:

```shell
npm install
npm test              # run all tests (15 passing)
```

### Encrypt and store, assuming Arc testnet

```shell
# Deploys a new contract and stores the encrypted message
npm run store:encrypt -- --id demo --message "hello" --network arcTestnet

# Store into an existing contract
npm run store:encrypt -- --id demo --message "hello" --contract 0x... --network arcTestnet

# Encrypt a file
npm run store:encrypt -- --id demo-file --file ./path/to/secret.bin --network arcTestnet
```

### Retrieve and decrypt

```shell
# Print plaintext to stdout
npm run retrieve:decrypt -- --contract 0x... --id demo --network arcTestnet

# Output as hex
npm run retrieve:decrypt -- --contract 0x... --id demo --format hex --network arcTestnet

# Write to file
npm run retrieve:decrypt -- --contract 0x... --id demo --out ./plaintext.bin --network arcTestnet
```

Note: Unlike v0, no `--rpcUrl` or `--fromBlock` needed -- retrieval is a direct contract read.

### Deploy to a testnet

```shell
# Sepolia
npx hardhat store:encrypt --network sepolia --id demo --message "hello"

# Arc testnet
npx hardhat store:encrypt --network arcTestnet --id demo --message "hello"
```

Set the appropriate private key via `npx hardhat keystore set <KEY_NAME>` (see `hardhat.config.ts` for network details).
