# Calldata Storage Demo

This demo demonstrates **Strategy 1: Calldata Storage** from the Ethereum storage strategies.

The other two options are:

- In a contract
- In persistent storage

## What is Calldata?

Calldata is the data sent with a transaction. When you call a smart contract function, the function parameters are stored in calldata. This data is:

- **Permanent**: Stored in the transaction history on the blockchain
- **Cheaper**: ~16 gas per byte vs 20,000 gas per 32-byte word for contract storage
- **Immutable**: Cannot be modified once the transaction is mined
- **Accessible**: Can be retrieved by querying event logs or transaction history

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
2. Store "design is gud" in calldata
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

#### Step 3: Store data in calldata

```bash
npm run store
```

This will store the string "design is gud" in calldata by calling the contract function with that parameter.

#### Step 4: Retrieve the data

```bash
npm run retrieve
```

This queries the event logs to retrieve and display the stored data.

## How It Works

1. **Storage**: The `storeData()` function accepts a string parameter. This string is passed as **calldata** (part of the transaction). The function emits an event containing this data.

2. **Retrieval**: The data can be retrieved by querying the `DataStored` events emitted by the contract. The event logs contain the calldata that was sent with the transaction.

3. **Key Point**: The data is **NOT** stored in contract storage (SSTORE), but it **IS** permanently recorded in the blockchain transaction history. This makes it cheaper while still being permanent and accessible.

## Gas Cost Comparison

- **Calldata**: ~16 gas per byte
- **Contract Storage (SSTORE)**: ~20,000 gas per 32-byte word (first write)
- **Event Logs**: ~375 gas per log + 8 gas per byte of data

For storing a string like "design is gud" (13 bytes):

- Calldata: ~208 gas (13 bytes × 16 gas/byte)
- Storage: ~20,000 gas (1 word)
- Event: ~479 gas (375 + 13 × 8)

Calldata + Events is significantly cheaper than contract storage!

## Files

- `contracts/CalldataStorage.sol` - Smart contract that stores data in calldata
- `scripts/deploy.js` - Deploys the contract
- `scripts/store.js` - Stores "design is gud" in calldata
- `scripts/retrieve.js` - Retrieves stored data from event logs
