# Dead Drop (encrypted on-chain storage)

**Quick overview** for this repo:

- **`discovery/`** — Small demos used to choose the on-chain storage approach:
  - `storage-calldata/`: store data in tx calldata + events (cheap, immutable).
  - `storage-contract/`: store data in contract state (expensive, mutable).

- **`v0/`** — First prototype: **post-quantum encrypt → store on-chain → retrieve & decrypt**.
  - Crypto: ML-KEM-768 (key exchange) + AES-256-GCM (data), keys in `keys/<id>.key.json`.
  - Contract: `EncryptedCalldataStorage` emits `DataStored` with encrypted payload (no contract storage).
  - CLI: Hardhat tasks `store:encrypt` and `retrieve-and-decrypt`; optional `--rpcUrl` + cast for RPCs that 413 on large `eth_getLogs` (e.g. Arc testnet).
  - From `v0/`: `npm run store:encrypt`, `npm run retrieve:decrypt`, `npm run test`.
  - This MVP has some serious limitations, mainly due to the calldata-based approach of storing the encrypted data
    - See the main `v0/readme.md` and the last commits in this repo for context
  - Superseded by v0.1

- **`v0.1/`** — Current version. Same crypto as v0, but uses **contract storage** instead of calldata/events for retrieval.
  - Contract: `EncryptedStorage` — writes to a `mapping(address => mapping(bytes32 => Entry))`, retrieval is a `view` call.
  - No more `getLogs` scanning, `--rpcUrl`, `--fromBlock`, or `cast` workarounds.
  - Data is mutable (re-storing for the same `dataId` and passphrase will overwrites existing data).
  - From `v0.1/`: `npm run store:encrypt`, `npm run retrieve:decrypt`, `npm run test`.
  - See `v0.1/README.md` for the full motivation and delta from v0.

- **`REQUIREMENTS.md`** — Full project spec: algorithm choices (Kyber-768 + AES-GCM), storage model, phases, and acceptance criteria. Use it as the single source of truth for "what we decided and why."
