const hre = require("hardhat");

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  
  if (!contractAddress) {
    console.error("❌ Error: CONTRACT_ADDRESS environment variable not set");
    console.log("Please set it after deploying:");
    console.log("  export CONTRACT_ADDRESS=<deployed_address>");
    process.exit(1);
  }

  // Get the contract instance
  const ContractStorage = await hre.ethers.getContractFactory("ContractStorage");
  const contract = ContractStorage.attach(contractAddress);

  console.log("🔍 Retrieving data from contract storage...");
  console.log("   Contract:", contractAddress);
  console.log("");

  // Read data directly from contract storage using the view function
  // This is a read operation (SLOAD) and doesn't cost gas when called externally
  const [storedData, storer, timestamp] = await contract.getStoredData();

  if (storedData === "" || storedData.length === 0) {
    console.log("❌ No data found in contract storage.");
    console.log("   Make sure you've stored data first (run store.js)");
    process.exit(1);
  }

  console.log("✅ Data retrieved from contract storage:\n");
  console.log("   Data:", storedData);
  console.log("   Storer:", storer);
  console.log("   Timestamp:", new Date(Number(timestamp) * 1000).toISOString());
  console.log("");

  // Also show event history for reference
  console.log("📋 Event history (for reference):");
  const filter = contract.filters.DataStored();
  const events = await contract.queryFilter(filter);

  if (events.length === 0) {
    console.log("   No events found");
  } else {
    console.log(`   Found ${events.length} event(s):`);
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      console.log(`   - Event ${i + 1}: Block ${event.blockNumber}, TX ${event.transactionHash.substring(0, 10)}...`);
    }
  }

  console.log("");
  console.log("💡 This data was stored in contract storage (SSTORE), not in calldata.");
  console.log("   It persists in the contract's state and can be read at any time.");
  console.log("   The data can be modified by calling storeData() again.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
