// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EncryptedCalldataStorage
 * @notice Stores encrypted payloads on-chain via transaction calldata + events (no contract storage)
 *
 * This matches the project's MVP storage model:
 * - encrypted payload is passed as calldata to a function
 * - contract emits an event containing the payload
 * - retrieval is done off-chain by querying event logs
 */
contract EncryptedCalldataStorage {
    /// @notice Soft cap for the encrypted payload size (bytes) to prevent accidental huge calldata.
    /// @dev Sized to comfortably fit ~10KB of plaintext when using a "KEM ciphertext + AES-256-GCM" payload.
    ///      Rough budget: ~1088 (ML-KEM-768 ciphertext) + 12 (IV) + 16 (tag) + ~10KB ciphertext ≈ ~11.1KB.
    uint256 public constant MAX_ENCRYPTED_DATA_BYTES = 12288; // 12 KiB

    /**
     * @notice Event emitted when encrypted data is stored
     * @param user The address that stored the encrypted payload
     * @param dataId Client-chosen identifier (hashed string per requirements)
     * @param encryptedData Opaque encrypted payload bytes (stored in calldata + event data)
     * @param timestamp Block timestamp when the data was stored
     */
    event DataStored(
        address indexed user,
        bytes32 indexed dataId,
        bytes encryptedData,
        uint256 timestamp
    );

    /**
     * @notice Store an encrypted payload by emitting an event
     * @param dataId Client-chosen identifier (recommended: keccak256 of user string)
     * @param encryptedData Opaque encrypted payload bytes (passed as calldata)
     */
    function storeEncrypted(bytes32 dataId, bytes calldata encryptedData) external {
        require(dataId != bytes32(0), "dataId cannot be zero");
        require(encryptedData.length != 0, "encryptedData cannot be empty");
        require(encryptedData.length <= MAX_ENCRYPTED_DATA_BYTES, "encryptedData too large");

        emit DataStored(msg.sender, dataId, encryptedData, block.timestamp);
    }

    /**
     * @notice Get the contract address (helper function)
     * @return The address of this contract
     */
    function getAddress() external view returns (address) {
        return address(this);
    }
}
