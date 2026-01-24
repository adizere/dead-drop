// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ContractStorage
 * @notice Demonstrates storing data in contract storage (SSTORE)
 * 
 * Contract storage is persistent storage on the Ethereum blockchain that:
 * - Permanent: Stored in the contract's state on the blockchain
 * - Expensive: ~20,000 gas per 32-byte word for first write (SSTORE)
 * - Mutable: Can be modified by contract functions
 * - Accessible: Can be read via view functions or directly from storage slots
 * 
 * This contract stores string data in contract storage using state variables.
 * The data persists across transactions and can be read at any time.
 */
contract ContractStorage {
    /**
     * @notice State variable storing the data
     * This is stored in contract storage slot 0
     */
    string private storedData;
    
    /**
     * @notice State variable storing the address that last stored data
     * This is stored in contract storage slot 1
     */
    address private lastStorer;
    
    /**
     * @notice State variable storing the timestamp of the last storage operation
     * This is stored in contract storage slot 2
     */
    uint256 private lastStoredTimestamp;
    
    /**
     * @notice Event emitted when data is stored
     * @param user The address that stored the data
     * @param data The data that was stored
     * @param timestamp Block timestamp when the data was stored
     */
    event DataStored(
        address indexed user,
        string data,
        uint256 timestamp
    );

    /**
     * @notice Store data in contract storage
     * @param data The string data to store in contract storage
     * 
     * This function:
     * 1. Stores the data in the `storedData` state variable (SSTORE operation)
     * 2. Updates `lastStorer` and `lastStoredTimestamp`
     * 3. Emits an event for indexing purposes
     * 
     * The data is permanently stored in contract storage and can be
     * retrieved later using the `getStoredData()` function.
     */
    function storeData(string memory data) external {
        storedData = data;
        lastStorer = msg.sender;
        lastStoredTimestamp = block.timestamp;
        
        emit DataStored(
            msg.sender,
            data,
            block.timestamp
        );
    }

    /**
     * @notice Retrieve the stored data from contract storage
     * @return The stored string data
     * @return The address that last stored the data
     * @return The timestamp when the data was last stored
     * 
     * This is a view function that reads from contract storage (SLOAD).
     * It does not cost gas when called externally (read-only).
     */
    function getStoredData() external view returns (
        string memory,
        address,
        uint256
    ) {
        return (storedData, lastStorer, lastStoredTimestamp);
    }

    /**
     * @notice Get the contract address (helper function)
     * @return The address of this contract
     */
    function getAddress() external view returns (address) {
        return address(this);
    }
}
