# Dead Drop v0.1

> [!IMPORTANT]
> ⚠ **Highly experimental** — for educational purposes only. Not security-audited. Do not use for sensitive data.

v0.1 of the post-quantum encrypted on-chain storage protocol. This is a prototype. Designed & tested using [Arc Testnet](https://www.arc.network/) as storage backend.

See [REQUIREMENTS.md](./REQUIREMENTS.md) for the full project spec. Read [v0.1/README](v0.1/README.md) for more implementation details of this prototype.

## What it does

> A dead drop, also known as a dead letter box, is a core technique in espionage tradecraft whereby agents exchange messages, documents, or small items at a covert, prearranged location without meeting face-to-face... -- Grokipedia, ["Dead drop"](https://grokipedia.com/page/Dead_drop).

This prototype allows users to write to a blockchain some _input_ data. The data is encrypted, so it cannot be simply recovered. The data is identified on the blockchain by two pieces of information: (1) an _identifier_, and (2) a _passphrase_. The unique combination of these two will allow anyone to retrieve the data from the blockchain and and decrypt it.

Analogous to a dead drop, the input data is "hiding in plain sight" on the blockchain. Only users who know the exact combination of identifier + passphrase can retrieve the data in plain.

Encryption is done via ML-KEM-768 + AES-256. The system handles encryption and decryption fully in the browser client, making the communication _end-to-end_ secure.

This prototype serves mainly for educational purpose!

## Overview

### Encryption

#### High-level flow

```typescript
USER ------------------------------
  |     |                          | 
  |     |                          |
  |     -> `identifier`            -> `passphrase`
  |         |                          |
  |         -> normalize(..)           -> deriveMasterKey(..)
  |             |                           |
  |             -> `normalized`             -> `masterKeyBytes`
  |                   |                                |
  |                   |                                |  
  |                   |--> deriveSeed(..) <------------|
  |                           |
  |                           |
  |                           ----> `seed`
  |                                 /
  |                                /
  |                               / 
  |            kem.deriveKeyPair(...) ---> `sharedSecret`
  |                                                 |
  |                            deriveAesKey(..)  <--|
  |                                  /
  |                                 /   
  |-----> `plaintext`--->  aesEncrypt(..)  
                                |---> `ciphertext` -> storage
```

#### Identifier normalizing

Identifiers are normalized to avoid accidental mismatches:

- Leading/trailing whitespace is trimmed.
- Unicode is normalized to NFC (canonical form).
- Case-sensitive: `"MyNote"` ≠ `"mynote"`.

#### Master key derivation

The system derives a master key based on the passphrase. The underlying method is as follows:

```js
masterKey = PBKDF2(passphrase, "shared-secret:v1", 600k iterations, SHA-256)
```

Where `"shared-secret:v1"` is the pre-defined salt.

PBKDF2 is intentionally slow and uses 600'000 iterations of SHA-256. It starts from a low-entropy secret -- the input that the user gave in the form of a passphrase -- and stretches that to obtain a master key.

This step is important because the master key, together with the normalized identifier, are the sources of
entropy that the system uses to obtain a seed. This is documented next.

#### ML-KEM keypair and shared secret

The ML-KEM-768 keypair is derived deterministically from a seed. At the base of that seed are the master key and the normalized identifier:

- `seed = HKDF(masterKey, info="kem:<normalizedId>", len=64)`
- `mlkem.deriveKeyPair(seed)` produces the keypair → `(publicKey, privateKey)`.

Once we have a key pair from ML-KEM, the encryption flow uses the public key to yield a shared secret. Obtaining the shared secret from the public key is called _encapsulation_. Then the system derives a AES key based on the shared secret, for perform symmetric key encryption of the plaintext.

#### Symmetric key encryption using AES-256

The last step of the encryption flow is encrypting the user's plaintext, via AES-256.

#### Storage of ciphertext on the blockchain

The system then indexes the ciphertext on the Arc Testnet blockchain. See [EncryptedStorage.sol](v0.1/contracts/EncryptedStorage.sol) for the contract structure.

### Decryption

Decryption is the mirror of the encryption flow. Because all keys are derived deterministically, nothing is persisted — everything is re-derived on the fly from the same passphrase + identifier pair:

1. Normalize the identifier, and derive `masterKey` (PBKDF2).
2. Derive the `seed` (HKDF) using the same parameters as during encryption.
3. Derive the ML-KEM-768 keypair: `mlkem.deriveKeyPair(seed)` → `(publicKey, privateKey)`.
4. Decapsulate: `mlkem.decap(.., privateKey)` → `sharedSecret`. This is analogous to the _encapsulation_ step from the encryption flow.
5. Derive the AES-256-GCM key from `sharedSecret` via HKDF (same salt and info as encryption).
6. Re-derive `slot` via keyed HMAC; fetch the payload from the contract (`getEncrypted(slot)`).
7. Decrypt the payload using the AES-256-GCM key, `iv`, `tag`, and AAD.

No private key material touches the network. Decryption is entirely local.

### Slot derivation

One step we didn't cover explicitly in the high-level flow above is: How does the system determine which index to use for storing the payload on-chain during the encryption flow? Each payload should be stored at a unique location, to prevent collision. Some identifiers are very common, for example, 'my note' or '2026-secret'. If two users want to store a message on-chain using the same identifier, as long as they use different passphrases, their secret messages should not collide (i.e., overwrite one another) and should therefore occupy different locations on-chain.

The decryption flow must use the same index to locate a specific payload and retrieve it.

An identifier on its own is low-entropy and should not be stored plainly. So this prototype derives a `slot` using a keyed HMAC to prevent enumeration or collisions:

- `masterKey = PBKDF2(passphrase, "shared-secret:v1", 600k iterations, SHA-256)`
- `keyId = HKDF(masterKey, info="id-key", len=32)`
- `slot = HMAC-SHA256(keyId, normalizedId)` → 32 bytes

The system stores the payload indexed at the location that `slot` provides. Since this index is a unique combination of the passphrase and identifier, the system will avoid collisions on the same index or enumerating indexes.

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
