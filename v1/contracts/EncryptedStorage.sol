// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EncryptedStorage
 * @notice Stores encrypted payloads on-chain in contract storage (SSTORE).
 *
 * v1 improvement over v0's calldata-only design:
 * - encrypted payload is written to a mapping (contract storage)
 * - retrieval is a simple view function call (no event log scanning)
 * - events are still emitted for indexing / history
 * - data is mutable: storing again for the same dataId overwrites the previous entry
 */
contract EncryptedStorage {
    /// @notice Soft cap for the encrypted payload size (bytes) to prevent accidental huge writes.
    /// @dev Sized to comfortably fit ~10KB of plaintext when using a "KEM ciphertext + AES-256-GCM" payload.
    ///      Rough budget: ~1088 (ML-KEM-768 ciphertext) + 12 (IV) + 16 (tag) + ~10KB ciphertext ≈ ~11.1KB.
    uint256 public constant MAX_ENCRYPTED_DATA_BYTES = 12288; // 12 KiB

    /**
     * @notice A stored encrypted entry.
     * @param encryptedData Opaque encrypted payload bytes
     * @param timestamp Block timestamp when the data was stored
     */
    struct Entry {
        bytes encryptedData;
        uint256 timestamp;
    }

    /// @dev user => dataId => Entry
    mapping(address => mapping(bytes32 => Entry)) private entries;

    /**
     * @notice Event emitted when encrypted data is stored (for indexing / history).
     * @param user The address that stored the encrypted payload
     * @param dataId Client-chosen identifier (hashed string per requirements)
     * @param encryptedData Opaque encrypted payload bytes
     * @param timestamp Block timestamp when the data was stored
     */
    event DataStored(
        address indexed user,
        bytes32 indexed dataId,
        bytes encryptedData,
        uint256 timestamp
    );

    /**
     * @notice Store an encrypted payload in contract storage.
     * @param dataId Client-chosen identifier (recommended: keccak256 of user string)
     * @param encryptedData Opaque encrypted payload bytes
     *
     * Calling again with the same dataId overwrites the previous entry.
     */
    function storeEncrypted(bytes32 dataId, bytes calldata encryptedData) external {
        require(dataId != bytes32(0), "dataId cannot be zero");
        require(encryptedData.length != 0, "encryptedData cannot be empty");
        require(encryptedData.length <= MAX_ENCRYPTED_DATA_BYTES, "encryptedData too large");

        entries[msg.sender][dataId] = Entry({
            encryptedData: encryptedData,
            timestamp: block.timestamp
        });

        emit DataStored(msg.sender, dataId, encryptedData, block.timestamp);
    }

    /**
     * @notice Retrieve the encrypted payload for a given (user, dataId) pair.
     * @param dataId The identifier used when storing
     * @param user The address that stored the data
     * @return encryptedData The stored encrypted payload (empty bytes if nothing stored)
     * @return timestamp The block timestamp when it was stored (0 if nothing stored)
     */
    function getEncrypted(bytes32 dataId, address user) external view returns (
        bytes memory encryptedData,
        uint256 timestamp
    ) {
        Entry storage entry = entries[user][dataId];
        return (entry.encryptedData, entry.timestamp);
    }
}
