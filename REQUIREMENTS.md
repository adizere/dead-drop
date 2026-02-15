# Encrypted On-Chain Storage - Requirements Document

## Project Overview

Build an MVP system for encrypting and storing data on the Ethereum blockchain using **post-quantum secure cryptography**. The system should protect data against both classical and quantum computing attacks.

## Key Technical Decisions (Summary)

| Decision | Choice | Rationale |
| ---------- | -------- | ----------- |
| **Cryptographic Algorithm** | ML-KEM-768 + AES-256-GCM (Hybrid) | Post-quantum key exchange + efficient symmetric encryption |
| **KEM Security Level** | ML-KEM-768 | 192 bits classical security, balanced payload size (~1088 bytes) |
| **JavaScript Library** | `pqclean` (Node), `mlkem` (browser/tests) | Mature Node addon + browser-compatible ML-KEM |
| **Key Storage Format** | Passphrase-derived per-secret keys | No server-side key storage; deterministic per-secret keys |
| **Development Network** | Arc Testnet | Matches primary usage |
| **Blockchain Framework** | Hardhat | Standard Ethereum development tooling |
| **Ethereum Client Library** | viem | TS ergonomics; contract calls for storage-based retrieval |
| **Data ID Generation** | Keyed HMAC of user identifier | Prevent identifier enumeration for low-entropy ids |
| **Storage Location** | Contract storage mapping | Direct `getEncrypted` view retrieval |

## Core Objectives

1. **Post-Quantum Security**: Use cryptographic algorithms resistant to quantum computing attacks
2. **On-Chain Storage**: Store encrypted data permanently on Ethereum blockchain
3. **Client-Side Encryption**: All encryption/decryption happens client-side; keys never touch the blockchain
4. **Usability**: Simple browser UI for encrypting, storing, and retrieving data (CLI kept for testing)

## Post-Quantum Cryptography Requirements

### Algorithm Selection

#### Option 1: ML-KEM (Recommended for MVP)

- **Type**: Key Encapsulation Mechanism (KEM)
- **Status**: NIST PQC Standard (selected 2022)
- **Security Level**: Multiple levels (Kyber-512, Kyber-768, Kyber-1024)
- **Key Sizes**:
  - Public key: ~800-1600 bytes
  - Secret key: ~1600-3200 bytes
  - Ciphertext: ~800-1600 bytes
- **Performance**: Fast key generation and encapsulation
- **Use Case**: Hybrid encryption (Kyber for key exchange + symmetric encryption for data)

#### Option 2: CRYSTALS-Kyber + AES-256 (Hybrid Approach)

- **Rationale**:
  - Kyber for key encapsulation (post-quantum secure)
  - AES-256-GCM for data encryption (fast, well-tested)
  - Provides defense-in-depth: quantum-resistant key exchange + classical symmetric encryption
- **Advantages**:
  - Best of both worlds: post-quantum security + performance
  - Smaller encrypted payloads (AES is more efficient for large data)
  - Industry-standard hybrid approach

#### Option 3: Pure Post-Quantum Symmetric

- **Algorithm**: AES-256 (already quantum-resistant for symmetric encryption)
- **Note**: Grover's algorithm only halves security, so AES-256 provides 128 bits of quantum security
- **Limitation**: Key exchange would still need post-quantum KEM

### DECIDED: Hybrid Approach (ML-KEM-768 + AES-256-GCM)

**Decision**: Use hybrid encryption with **Kyber-768** for key exchange and **AES-256-GCM** for data encryption.

**Rationale**:

1. **Kyber-768** handles key exchange (post-quantum secure, NIST standardized)
2. **AES-256-GCM** handles data encryption (quantum-resistant, efficient)
3. Standard industry practice for post-quantum migration
4. Balances security and performance
5. Kyber-768 provides 192 bits of classical security, suitable for MVP

**Flow**:

1. Derive ML-KEM-768 key pair (public/secret) per secret
2. Encapsulate shared secret using ML-KEM-768 public key → get ciphertext + shared secret
3. Use shared secret to derive AES-256 key (via HKDF or similar)
4. Encrypt data with AES-256-GCM
5. Store on-chain: Kyber ciphertext + AES-encrypted data

## Functional Requirements

### FR1: Key Management

- **FR1.1**: Derive per-secret post-quantum key pairs client-side from passphrase + identifier
- **FR1.2**: Keys are never stored on-chain or server-side
- **FR1.3**: Passphrase-based derivation is required for all operations

### FR2: Encryption

- **FR2.1**: Encrypt data using hybrid approach (Kyber + AES-256-GCM)
- **FR2.2**: Support data sizes up to ~10KB per entry (MVP limit)
- **FR2.3**: Include metadata: algorithm identifiers, version, nonce/IV
- **FR2.4**: Format: `[Kyber Ciphertext][AES IV][Encrypted Data][Auth Tag]`

### FR3: On-Chain Data Storage

- **FR3.1**: Store encrypted data in **contract storage** (mapping)
- **FR3.2**: Emit events containing encrypted data and metadata
  - Event structure: `DataStored(address indexed user, bytes32 indexed dataId, bytes encryptedData, uint256 timestamp)`
- **FR3.3**: Support multiple entries keyed by unique dataId
- **FR3.4**: Retrieve data via `getEncrypted(dataId)` view function
- **FR3.5**: Maximum data size: ~10KB per entry (gas and contract limit)
- **FR3.6**: Data is mutable: re-storing overwrites previous entry for the same dataId

### FR4: Decryption

- **FR4.1**: Retrieve encrypted data from contract storage (view call)
- **FR4.2**: Lookup uses dataId only
- **FR4.4**: Decapsulate shared secret using Kyber secret key
- **FR4.5**: Derive AES key from shared secret
- **FR4.6**: Decrypt data using AES-256-GCM
- **FR4.7**: Verify authentication tag

### FR5: Client Interface

- **FR5.1**: Browser UI for encrypt/store/retrieve/decrypt
- **FR5.2**: CLI scripts remain for testing (encrypt/store, retrieve/decrypt)
- **FR5.3**: Support for file input/output (CLI)

## Technical Requirements

### TR1: Cryptography Libraries

- **TR1.1**: Use NIST-standardized post-quantum algorithms
- **TR1.2**: **DECIDED**: `pqclean` (Node) and `mlkem` (browser/tests) for ML-KEM-768
- **TR1.3**: Support for AES-256-GCM (Node.js `crypto` module; Web Crypto in browser)

### TR2: Blockchain Integration

- **TR2.1**: Framework: **Hardhat** (DECIDED)
- **TR2.2**: Network: **Arc Testnet** for MVP
- **TR2.3**: **DECIDED**: Ethereum client library: **`viem`**
  - Rationale: strong TypeScript ergonomics and contract read/write support

### TR5: Data Storage Location

- **TR5.1**: **DECIDED**: Store encrypted data in **contract storage** (mapping)
- **TR5.2**: Rationale for storage:
  - **Retrieval**: single view call (no log scanning)
  - **Mutability**: re-store overwrites entry
- **TR5.3**: Implementation approach:
  - Smart contract writes encrypted data to mapping
  - Contract emits event for indexing/history
  - Retrieval via `getEncrypted(dataId)`

### TR3: Data Format

- **TR3.1**: Structured format for encrypted payload (stored in calldata):

  ```none
  [Version: 1 byte]
  [Algorithm ID: 1 byte] (0x01 = Kyber-768 + AES-256-GCM)
  [Kyber Ciphertext: variable, ~1088 bytes for Kyber-768]
  [AES IV: 12 bytes]
  [Encrypted Data: variable]
  [Auth Tag: 16 bytes]
  ```

- **TR3.2**: This format is sent as calldata to the smart contract function
- **TR3.3**: Contract emits event containing this encrypted payload
- **TR3.4**: Support versioning for future algorithm updates
- **TR3.5**: Include algorithm metadata for compatibility

### TR4: Key Storage

- **TR4.1**: Keys are derived in-browser from passphrase + identifier
- **TR4.2**: No key files required in the browser flow
- **TR4.3**: Optional debug export may use JSON (non-requirement)

## Security Requirements

### SR1: Post-Quantum Security

- **SR1.1**: Use NIST PQC Standard algorithms
- **SR1.2**: **DECIDED**: Security level: **Kyber-768** (equivalent to AES-192 security)
  - Provides 192 bits of classical security
  - ~1088 bytes ciphertext size
  - Good balance of security and payload size for MVP
- **SR1.3**: Future consideration: Kyber-1024 for higher security (larger keys, larger payload)

### SR2: Key Security

- **SR2.1**: Keys never transmitted to blockchain
- **SR2.2**: Keys are derived in-memory; not persisted by the web UI
- **SR2.3**: Passphrase strength is critical (PBKDF2-based derivation)
- **SR2.4**: Support key rotation (future enhancement)

### SR3: Data Integrity

- **SR3.1**: Use authenticated encryption (AES-GCM)
- **SR3.2**: Verify authentication tags on decryption
- **SR3.3**: Detect tampering attempts

### SR4: Privacy

- **SR4.1**: Only encrypted data on-chain (no plaintext metadata)
- **SR4.2**: Data IDs should not be enumerable (keyed HMAC of identifier)

## Non-Functional Requirements

### NFR1: Performance

- **NFR1.1**: Encryption should complete in < 1 second for ~10KB data
- **NFR1.2**: Decryption should complete in < 1 second for ~10KB data
- **NFR1.3**: Key generation should complete in < 100ms

### NFR2: Usability

- **NFR2.1**: Simple browser workflow (passphrase + identifier + wallet)
- **NFR2.2**: Clear error messages
- **NFR2.3**: Helpful documentation and examples

### NFR3: Compatibility

- **NFR3.1**: Support Node.js 18+ (ESM + mlkem)
- **NFR3.2**: Cross-platform (macOS, Linux, Windows)
- **NFR3.3**: Algorithm versioning for future updates

### NFR4: Maintainability

- **NFR4.1**: Modular code structure
- **NFR4.2**: Clear separation: crypto utils, contract interaction, CLI
- **NFR4.3**: Comprehensive comments and documentation

## MVP Scope

### Included in MVP

- Post-quantum key generation (Kyber-768)
- Hybrid encryption (Kyber-768 + AES-256-GCM)
- Smart contract with storage-based retrieval (`getEncrypted`)
- Browser UI for encrypt/store/retrieve/decrypt
- CLI for testing and debugging
- Single user per wallet
- Data size limit: ~10KB per entry
- Direct storage retrieval (view call)

### Excluded from MVP (Future)

- Forward secrecy
- Password-based key derivation beyond PBKDF2 (e.g., Argon2id)
- Multi-user sharing/access control
- Data compression
- Chunking for large files
- Web UI
- Key rotation
- Multiple algorithm support (only one hybrid scheme)
- Data deletion/updates

## Decisions Made

### Decision 1: Cryptographic Algorithm

- **Kyber-768** for key exchange (post-quantum KEM)
- **AES-256-GCM** for data encryption (symmetric authenticated encryption)
- **Hybrid approach** combining both

### Decision 2: JavaScript Library

- Use the **most popular and widely-used** JavaScript library for Kyber-768
- Selection will be based on npm download statistics, GitHub activity, and community support
- Final library choice will be determined before implementation phase
- Must support Kyber-768 specifically

### Decision 3: Key Storage Format

- **JSON format** with structured metadata
- Includes version, algorithm info, keys, and timestamp
- Stored in `keys/` directory with `.key.json` extension

### Decision 4: Development Network

- **Local Hardhat network** for MVP
- Fast iteration and testing without testnet ETH requirements
- Can extend to testnets later if needed

### Decision 5: Data ID Generation

- **Keyed HMAC of user-provided identifier** (DECIDED)
- Prevents enumeration of low-entropy identifiers
- Deterministic given passphrase + identifier

### Decision 6: Storage Location

- **Contract storage** (DECIDED)
- Store encrypted data in contract mapping; emit event for history

## Implementation Phases

### Phase 1: Research & Setup

1. Research and select Kyber JavaScript library (based on npm popularity)
2. Verify library supports Kyber-768
3. Set up project structure with Hardhat
4. Configure local Hardhat development environment

### Phase 2: Core Cryptography

1. Implement Kyber-768 key generation using selected library
2. Implement Kyber-768 encapsulation/decapsulation
3. Implement key derivation (shared secret → AES-256 key via HKDF)
4. Implement hybrid encryption (Kyber + AES-256-GCM)
5. Implement decryption flow
6. Unit tests for crypto functions

### Phase 3: Smart Contract

1. Design and implement contract with storage mapping
2. Emit event for indexing/history
3. Add `getEncrypted` view function
4. Deploy and test on local Hardhat network
5. Verify gas costs (should be lower than storage-based approach)

### Phase 4: Client Integration

1. Browser UI for encryption/storage/retrieval (Arc Testnet)
2. CLI scripts for testing and debugging
3. Key derivation via passphrase + identifier
5. Error handling and validation

### Phase 5: Documentation & Testing

1. Comprehensive README
2. Usage examples
3. Security considerations documentation
4. End-to-end testing

## Success Criteria

1. Can encrypt ~10KB of data using post-quantum cryptography
2. Can store encrypted data on Ethereum blockchain
3. Can retrieve and decrypt data successfully
4. Keys are never exposed on-chain
5. System uses NIST-standardized post-quantum algorithms
6. Documentation is clear and complete

## References

- NIST Post-Quantum Cryptography Standards: <https://csrc.nist.gov/projects/post-quantum-cryptography>
- CRYSTALS-Kyber Specification: <https://pq-crystals.org/kyber/>
- Open Quantum Safe: <https://openquantumsafe.org/>
- Ethereum Documentation: <https://ethereum.org/en/developers/>
