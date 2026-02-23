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
 * - data is mutable: storing again for the same slot overwrites the previous entry
 */
contract EncryptedStorage {
    /// @notice Soft cap for the encrypted payload size (bytes) to prevent accidental huge writes.
    /// @dev Sized to comfortably fit ~10KB of plaintext when using a "KEM ciphertext + AES-256-GCM" payload.
    ///      Rough budget: ~1088 (ML-KEM-768 ciphertext) + 12 (IV) + 16 (tag) + ~10KB ciphertext ≈ ~11.1KB.
    uint256 public constant MAX_ENCRYPTED_DATA_BYTES = 12288; // 12 KiB

    /**
     * @notice A stored encrypted entry.
     * @param payload Opaque encrypted payload bytes
     * @param timestamp Block timestamp when the data was stored
     */
    struct Entry {
        bytes payload;
        uint256 timestamp;
    }

    /// @dev slot => Entry (keyed solely by derived slot)
    mapping(bytes32 => Entry) private entries;

    /**
     * @notice Event emitted when encrypted data is stored (for indexing / history).
     * @param user The address that stored the encrypted payload
     * @param slot Derived storage slot (keyed HMAC of passphrase + identifier)
     * @param payload Opaque encrypted payload bytes
     * @param timestamp Block timestamp when the data was stored
     */
    event DataStored(
        address indexed user,
        bytes32 indexed slot,
        bytes payload,
        uint256 timestamp
    );

    /**
     * @notice Store an encrypted payload in contract storage.
     * @param slot Derived storage slot (bytes32 keyed HMAC of passphrase + identifier)
     * @param payload Opaque encrypted payload bytes
     *
     * Calling again with the same slot overwrites the previous entry.
     */
    function storeEncrypted(bytes32 slot, bytes calldata payload) external {
        require(slot != bytes32(0), "slot cannot be zero");
        require(payload.length != 0, "payload cannot be empty");
        require(payload.length <= MAX_ENCRYPTED_DATA_BYTES, "payload too large");

        entries[slot] = Entry({
            payload: payload,
            timestamp: block.timestamp
        });

        emit DataStored(msg.sender, slot, payload, block.timestamp);
    }

    /**
     * @notice Retrieve the encrypted payload for a given slot.
     * @param slot The derived storage slot used when storing
     * @return payload The stored encrypted payload (empty bytes if nothing stored)
     * @return timestamp The block timestamp when it was stored (0 if nothing stored)
     */
    function getEncrypted(bytes32 slot) external view returns (
        bytes memory payload,
        uint256 timestamp
    ) {
        Entry storage entry = entries[slot];
        return (entry.payload, entry.timestamp);
    }
}