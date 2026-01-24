# Contract Storage Demo

This demo demonstrates **Strategy 2: Contract Storage** from the Ethereum storage strategies.

The other two options are:

- In calldata
- In persistent storage

## What is Contract Storage?

Contract storage is persistent storage on the Ethereum blockchain. When you store data in state variables, it is:

- **Permanent**: Stored in the contract's state on the blockchain
- **Expensive**: ~20,000 gas per 32-byte word for first write (SSTORE)
- **Mutable**: Can be modified by contract functions
- **Accessible**: Can be read via view functions or directly from storage slots

## Setup

1. Install dependencies:

```bash
npm install
```

1. Compile the contracts:

```bash
npm run compile
```

## Running the Demo

### Quick Demo (All-in-One)

The easiest way to run the demo is with the all-in-one script:

```bash
npm run demo
```

This will:

1. Deploy the contract
2. Store "design is gud" in contract storage
3. Retrieve and display the stored data

### Step-by-Step Demo

If you want to run each step separately:

#### Step 1: Start a local Hardhat node (in one terminal)

```bash
npm run node
```

This starts a local Ethereum node on `http://127.0.0.1:8545`

#### Step 2: Deploy the contract (in another terminal)

```bash
npm run deploy
```

This will output the contract address. Copy it and set it as an environment variable:

```bash
export CONTRACT_ADDRESS=<deployed_address>
```

#### Step 3: Store data in contract storage

```bash
npm run store
```

This will store the string "design is gud" in contract storage by calling the `storeData()` function. This performs SSTORE operations to write the data to the contract's state.

#### Step 4: Retrieve the data

```bash
npm run retrieve
```

This calls the `getStoredData()` view function to read the data directly from contract storage.

## How It Works

1. **Storage**: The `storeData()` function accepts a string parameter and stores it in the `storedData` state variable. This performs SSTORE operations, which write data to contract storage slots. The function also emits an event for indexing purposes.

2. **Retrieval**: The data can be retrieved by calling the `getStoredData()` view function, which reads from contract storage (SLOAD operations). This is a read-only operation that doesn't cost gas when called externally.

3. **Key Point**: The data **IS** stored in contract storage (SSTORE), making it part of the contract's persistent state. This data persists across transactions and can be modified by calling `storeData()` again.

## Gas Cost Comparison

- **Contract Storage (SSTORE)**: ~20,000 gas per 32-byte word (first write), ~5,000 gas for subsequent writes
- **Contract Storage (SLOAD)**: ~2,100 gas per 32-byte word (read)
- **Calldata**: ~16 gas per byte
- **Event Logs**: ~375 gas per log + 8 gas per byte of data

For storing a string like "design is gud" (13 bytes):

- Contract Storage (write): ~20,000 gas (1 word)
- Contract Storage (read): ~2,100 gas (1 word)
- Calldata: ~208 gas (13 bytes × 16 gas/byte)
- Event: ~479 gas (375 + 13 × 8)

Contract storage is significantly more expensive than calldata, but it provides:
- Mutable storage (can be updated)
- Direct access via view functions
- Persistence in contract state

## Storage Slots

In this contract:
- Slot 0: `storedData` (string)
- Slot 1: `lastStorer` (address)
- Slot 2: `lastStoredTimestamp` (uint256)

Note: String storage is more complex and may use multiple slots depending on length.

## Files

- `contracts/ContractStorage.sol` - Smart contract that stores data in contract storage
- `scripts/deploy.js` - Deploys the contract
- `scripts/store.js` - Stores "design is gud" in contract storage
- `scripts/retrieve.js` - Retrieves stored data from contract storage
