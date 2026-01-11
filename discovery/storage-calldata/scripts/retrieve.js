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
  const CalldataStorage = await hre.ethers.getContractFactory("CalldataStorage");
  const contract = CalldataStorage.attach(contractAddress);

  console.log("🔍 Retrieving data from calldata (via event logs)...");
  console.log("   Contract:", contractAddress);
  console.log("");

  // Get the provider
  const provider = hre.ethers.provider;

  // Query all DataStored events
  const filter = contract.filters.DataStored();
  const events = await contract.queryFilter(filter);

  if (events.length === 0) {
    console.log("❌ No data found. Make sure you've stored data first (run store.js)");
    process.exit(1);
  }

  console.log(`✅ Found ${events.length} stored data entry/entries:\n`);

  // Display each event
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const block = await provider.getBlock(event.blockNumber);
    
    console.log(`--- Entry ${i + 1} ---`);
    console.log("   User:", event.args.user);
    console.log("   Data:", event.args.data);
    console.log("   Timestamp:", new Date(Number(event.args.timestamp) * 1000).toISOString());
    console.log("   Block number:", event.blockNumber);
    console.log("   Transaction hash:", event.transactionHash);
    console.log("");
  }

  console.log("💡 This data was stored in transaction calldata, not contract storage.");
  console.log("   It's permanently recorded in the blockchain transaction history.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
