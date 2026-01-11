// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CalldataStorage
 * @notice Demonstrates storing data in transaction calldata
 * 
 * Calldata is the data sent with a transaction. When you call a function,
 * the function parameters are stored in calldata. This data is:
 * - Permanent: Stored in the transaction history on the blockchain
 * - Cheaper: ~16 gas per byte vs 20,000 gas per 32-byte word for storage
 * - Immutable: Cannot be modified once the transaction is mined
 * 
 * This contract accepts string data as a function parameter (calldata)
 * and emits an event containing that data. The data is NOT stored in
 * contract storage, but it IS permanently recorded in the transaction.
 */
contract CalldataStorage {
    /**
     * @notice Event emitted when data is stored
     * @param user The address that stored the data
     * @param data The data that was stored (in calldata)
     * @param timestamp Block timestamp when the data was stored
     */
    event DataStored(
        address indexed user,
        string data,
        uint256 timestamp
    );

    /**
     * @notice Store data in calldata by emitting an event
     * @param data The string data to store (passed as calldata)
     * 
     * The data parameter is part of the transaction calldata, which means:
     * 1. It's sent with the transaction
     * 2. It's permanently stored in the blockchain transaction history
     * 3. It can be retrieved by querying the event logs
     * 4. It's NOT stored in contract storage (SSTORE), making it cheaper
     */
    function storeData(string calldata data) external {
        emit DataStored(
            msg.sender,
            data,
            block.timestamp
        );
    }

    /**
     * @notice Get the contract address (helper function)
     * @return The address of this contract
     */
    function getAddress() external view returns (address) {
        return address(this);
    }
}
