# Changelog

Version 1 started off with the design as outlined in the [Readme.md](./README.md) and then
accumulated a few revisions, as follows.

## Index by dataId only (no user/wallet for retrieval)

Entries are now indexed and retrieved solely by the keyed data identifier (`dataId`). The contract uses a single mapping `mapping(bytes32 => Entry)` and exposes `getEncrypted(dataId)` (no user address). Retrieval no longer requires a wallet or user address — passphrase + identifier is enough. **Breaking:** existing deployments used `(user, dataId)`; deploy a new contract and re-store for this version. Overwriting the same `dataId` is unlikely in practice because `dataId` is keyed by passphrase (same passphrase + identifier required to collide).

## Moved away from keys

Key handling and data IDs were reworked to match the last three revisions:

- **Passphrase-derived keys** — Keys are no longer loaded or stored on disk or in the browser. A master key is derived from a passphrase (PBKDF2, 600k iterations, SHA-256). Per-secret ML-KEM-768 keypairs are derived deterministically via HKDF from the master key and the normalized identifier (`seed = HKDF(masterKey, "kem:<id>", 64)` then `mlkem.deriveKeyPair(seed)`). The CLI requires `--passphrase`; `--keysOut` is optional and for debugging only.

- **Keyed data IDs** — The on-chain `dataId` is no longer `keccak256(id)`. It is now a keyed HMAC: `keyId = HKDF(masterKey, "id-key", 32)` and `dataId = HMAC-SHA256(keyId, normalizedId)`. This prevents enumeration of low-entropy identifiers. **Breaking:** existing entries stored under the old `keccak256(id)` scheme are not discoverable with the new derivation; use a new contract for this version.

- **Identifier normalization** — Identifiers are normalized (trim + NFC) before use in keyed derivation and in KEM seed derivation, so the same logical identifier yields the same `dataId` and keypair across sessions.

The frontend now has an Access section (passphrase + identifier) and an Unlock step; Retrieve appears before Store. CLI and tests were updated accordingly; REQUIREMENTS.md was updated to reflect passphrase-based key derivation, keyed dataId, and contract-storage retrieval.

## Decouple ids from key name

By default, the name of the key being used to encrypt and decrypt a secret
is inherited from the identifier of that secret: `keys/<id>.key.json`.

We've changed that to use a default key name and path, instead of relying
on the secret identifier.  The default key being used will be stored in the
same directory as before, and under the path: `keys/default.key.json`.

Rationale: We want to reuse the same key across many secrets.

## Added a frontend

In `frontend` there is now a full-fledged web-server able to serve a webpage for using the dead drop application from browser client.