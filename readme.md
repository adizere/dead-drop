# Shared secret (encrypted on-chain storage)

**Quick recap** for when you come back to this repo.

- **`discovery/`** — Small demos used to choose the on-chain storage approach:
  - `storage-calldata/`: store data in tx calldata + events (cheap, immutable).
  - `storage-contract/`: store data in contract state (expensive, mutable).
  The MVP follows the calldata strategy.

- **`v0/`** — The actual MVP: **post-quantum encrypt → store on-chain → retrieve & decrypt**.
  - Crypto: ML-KEM-768 (key exchange) + AES-256-GCM (data), keys in `keys/<id>.key.json`.
  - Contract: `EncryptedCalldataStorage` emits `DataStored` with encrypted payload (no contract storage).
  - CLI: Hardhat tasks `store:encrypt` and `retrieve-and-decrypt`; optional `--rpcUrl` + cast for RPCs that 413 on large `eth_getLogs` (e.g. Arc testnet).
  - From `v0/`: `npm run store:encrypt`, `npm run retrieve:decrypt`, `npm run test`.
  - This MVP has some serious limitations, mainly due to the calldata-based approach of storing the encrypted data
    - See the main `v0/readme.md` and the last commits in this repo for context

- **`REQUIREMENTS.md`** — Full project spec: algorithm choices (Kyber-768 + AES-GCM), storage model (calldata), phases, and acceptance criteria. Use it as the single source of truth for “what we decided and why.”
