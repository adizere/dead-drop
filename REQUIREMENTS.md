# Encrypted On-Chain Storage - Requirements Document

## Project Overview

Build an MVP system for encrypting and storing data on the Ethereum blockchain using **post-quantum secure cryptography**. The system should protect data against both classical and quantum computing attacks.

## Key Technical Decisions (Summary)

| Decision | Choice | Rationale |
| ---------- | -------- | ----------- |
| **Cryptographic Algorithm** | Kyber-768 + AES-256-GCM (Hybrid) | Post-quantum key exchange + efficient symmetric encryption |
| **Kyber Security Level** | Kyber-768 | 192 bits classical security, balanced payload size (~1088 bytes) |
| **JavaScript Library** | Most popular npm package | Widest usage, community support, maintenance |
| **Key Storage Format** | JSON with metadata | Human-readable, easy debugging, structured |
| **Development Network** | Local Hardhat network | Fast iteration, no testnet ETH needed |
| **Blockchain Framework** | Hardhat | Standard Ethereum development tooling |
| **Ethereum Client Library** | viem | Type-forward TS ergonomics; great fit for event/log retrieval |
| **Data ID Generation** | Hash of user-provided string | User-friendly, deterministic, easy to remember |
| **Storage Location** | Transaction calldata | Cheaper than contract storage, permanent, accessible via events |

## Core Objectives

1. **Post-Quantum Security**: Use cryptographic algorithms resistant to quantum computing attacks
2. **On-Chain Storage**: Store encrypted data permanently on Ethereum blockchain
3. **Client-Side Encryption**: All encryption/decryption happens client-side; keys never touch the blockchain
4. **Usability**: Simple CLI interface for encrypting, storing, and retrieving data

## Post-Quantum Cryptography Requirements

### Algorithm Selection

#### Option 1: CRYSTALS-Kyber (Recommended for MVP)

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

### DECIDED: Hybrid Approach (Kyber-768 + AES-256-GCM)

**Decision**: Use hybrid encryption with **Kyber-768** for key exchange and **AES-256-GCM** for data encryption.

**Rationale**:

1. **Kyber-768** handles key exchange (post-quantum secure, NIST standardized)
2. **AES-256-GCM** handles data encryption (quantum-resistant, efficient)
3. Standard industry practice for post-quantum migration
4. Balances security and performance
5. Kyber-768 provides 192 bits of classical security, suitable for MVP

**Flow**:

1. Generate Kyber-768 key pair (public/secret)
2. Encapsulate shared secret using Kyber-768 public key → get ciphertext + shared secret
3. Use shared secret to derive AES-256 key (via HKDF or similar)
4. Encrypt data with AES-256-GCM
5. Store on-chain: Kyber ciphertext + AES-encrypted data

## Functional Requirements

### FR1: Key Management

- **FR1.1**: Generate post-quantum key pairs (Kyber) client-side
- **FR1.2**: Store secret keys securely (never on-chain)
- **FR1.3**: Support key derivation from password (optional for MVP)
- **FR1.4**: Key format: JSON or binary with metadata (algorithm, version, security level)

### FR2: Encryption

- **FR2.1**: Encrypt data using hybrid approach (Kyber + AES-256-GCM)
- **FR2.2**: Support data sizes up to ~10KB per entry (MVP limit)
- **FR2.3**: Include metadata: algorithm identifiers, version, nonce/IV
- **FR2.4**: Format: `[Kyber Ciphertext][AES IV][Encrypted Data][Auth Tag]`

### FR3: On-Chain Data Storage

- **FR3.1**: Store encrypted data in **transaction calldata** (not contract storage)
- **FR3.2**: Emit events containing encrypted data and metadata
  - Event structure: `DataStored(address indexed user, bytes32 indexed dataId, bytes encryptedData, uint256 timestamp)`
- **FR3.3**: Support multiple entries per user (identified by unique dataId)
- **FR3.4**: Retrieve data by querying events filtered by user address and dataId
- **FR3.5**: Maximum data size: ~10KB per entry (limited by calldata size and gas costs)
- **FR3.6**: Data is permanent and immutable once stored (calldata is part of transaction history)

### FR4: Decryption

- **FR4.1**: Retrieve encrypted data from blockchain events (calldata)
- **FR4.2**: Filter events by user address and dataId
- **FR4.3**: Extract encrypted data from event logs
- **FR4.4**: Decapsulate shared secret using Kyber secret key
- **FR4.5**: Derive AES key from shared secret
- **FR4.6**: Decrypt data using AES-256-GCM
- **FR4.7**: Verify authentication tag

### FR5: Client Interface

- **FR5.1**: CLI script to encrypt and store data
- **FR5.2**: CLI script to retrieve and decrypt data
- **FR5.3**: Support for file input/output
- **FR5.4**: Key management commands (generate, list, export)

## Technical Requirements

### TR1: Cryptography Libraries

- **TR1.1**: Use NIST-standardized post-quantum algorithms
- **TR1.2**: **DECIDED**: Use the most popular and widely-used JavaScript library for Kyber-768
  - Selection criteria: npm download statistics, GitHub stars, maintenance activity, community support
  - Will verify library supports Kyber-768 specifically
  - Common options to evaluate:
    - `crystals-kyber` (if available and popular)
    - `liboqs-js` (Open Quantum Safe bindings)
    - Other community implementations
  - Final selection will be made based on npm popularity metrics before implementation
- **TR1.3**: Fallback: Use WebAssembly bindings if pure JS implementation unavailable or insufficient
- **TR1.4**: Support for AES-256-GCM (Node.js `crypto` module - native implementation)

### TR2: Blockchain Integration

- **TR2.1**: Framework: **Hardhat** (DECIDED)
- **TR2.2**: Network: **Local Hardhat network** for MVP (DECIDED)
  - Start with local network for development and testing
  - Can extend to testnets (Sepolia/Goerli) later if needed
- **TR2.3**: **DECIDED**: Ethereum client library: **`viem`**
  - Rationale: strong TypeScript ergonomics and good primitives for querying/parsing event logs (matches the calldata-via-events storage model)
- **TR2.4**: Gas optimization: Use events for data storage (cheaper than contract storage)

### TR5: Data Storage Location

- **TR5.1**: **DECIDED**: Store encrypted data in **transaction calldata** via events
- **TR5.2**: Rationale for calldata storage:
  - **Cost**: Cheaper than contract storage (calldata is ~16 gas per byte vs 20,000 gas per 32-byte word for storage)
  - **Permanence**: Calldata is permanently stored in transaction history
  - **Accessibility**: Data accessible via event logs and transaction history
  - **Immutability**: Data cannot be modified once stored
- **TR5.3**: Implementation approach:
  - Smart contract function receives encrypted data as calldata parameter
  - Contract emits event containing the encrypted data
  - Data is stored in transaction calldata (part of transaction)
  - Retrieval via event filtering (no contract storage needed)
- **TR5.4**: Trade-offs considered:
  - **Calldata** (selected): Cheaper, permanent, accessible via events
  - **Contract Storage**: More expensive, mutable (can be updated), requires storage slots
  - **Events Only**: Similar to calldata, but events have size limits and are indexed differently
- **TR5.5**: Calldata size limits:
  - Maximum transaction size: ~128KB (block gas limit dependent)
  - For MVP: ~10KB per entry is well within limits
  - Multiple entries require multiple transactions

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

- **TR4.1**: Store keys in `keys/` directory (gitignored)
- **TR4.2**: **DECIDED**: Format: **JSON with metadata**
  - Human-readable for debugging
  - Easy to parse and validate
  - Includes structured metadata
- **TR4.3**: File naming: `<dataId>.key.json`
- **TR4.4**: JSON structure:

  ```json
  {
    "version": 1,
    "algorithm": "Kyber-768+AES-256-GCM",
    "publicKey": "hex-encoded-public-key",
    "secretKey": "hex-encoded-secret-key",
    "created": "ISO-8601-timestamp",
    "securityLevel": "Kyber-768"
  }
  ```

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
- **SR2.2**: Keys stored locally with appropriate file permissions
- **SR2.3**: Optional: Encrypt stored keys with password (future enhancement)
- **SR2.4**: Support key rotation (future enhancement)

### SR3: Data Integrity

- **SR3.1**: Use authenticated encryption (AES-GCM)
- **SR3.2**: Verify authentication tags on decryption
- **SR3.3**: Detect tampering attempts

### SR4: Privacy

- **SR4.1**: Only encrypted data on-chain (no plaintext metadata)
- **SR4.2**: Data IDs should not reveal content
- **SR4.3**: Consider using hash of data ID instead of plain identifier

## Non-Functional Requirements

### NFR1: Performance

- **NFR1.1**: Encryption should complete in < 1 second for ~10KB data
- **NFR1.2**: Decryption should complete in < 1 second for ~10KB data
- **NFR1.3**: Key generation should complete in < 100ms

### NFR2: Usability

- **NFR2.1**: Simple CLI commands (max 2-3 arguments)
- **NFR2.2**: Clear error messages
- **NFR2.3**: Helpful documentation and examples

### NFR3: Compatibility

- **NFR3.1**: Support Node.js 16+
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
- Smart contract with event-based storage (calldata)
- Basic CLI for encrypt/store/retrieve/decrypt
- Key management (local file storage in JSON format)
- Single user per wallet
- Data size limit: ~10KB per entry
- Event-based data retrieval

### Excluded from MVP (Future)

- Password-based key derivation
- Key encryption for stored keys
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

- **Hash of user-provided string** (DECIDED)
- User-friendly: users can use meaningful identifiers
- Deterministic: same string always produces same ID
- Example: `ethers.id("my-secret")` → bytes32
- Implementation: Use ethers.js `id()` function or keccak256 hash

### Decision 6: Storage Location

- **Transaction calldata** (DECIDED)
- Store encrypted data in transaction calldata via smart contract events
- Advantages:
  - Lower gas costs compared to contract storage
  - Permanent storage in transaction history
  - Accessible via event logs
  - Immutable once stored
- Implementation: Contract function emits event with encrypted data in calldata

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

1. Design and implement contract with event-based storage (calldata)
2. Implement function to emit events containing encrypted data
3. Add view functions for querying event data (if needed)
4. Deploy and test on local Hardhat network
5. Verify gas costs (should be lower than storage-based approach)

### Phase 4: Client Integration

1. CLI script for encryption and storage (via contract function call)
2. CLI script for retrieval (querying events from blockchain)
3. Event filtering and parsing utilities
4. Key management utilities
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
