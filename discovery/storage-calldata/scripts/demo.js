const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const userPayload = "design is gud";
  
  console.log("🚀 Calldata Storage Demo");
  console.log("=" .repeat(50));
  console.log("");

  // Step 1: Deploy contract
  console.log("Step 1: Deploying CalldataStorage contract...");
  const CalldataStorage = await hre.ethers.getContractFactory("CalldataStorage");
  const calldataStorage = await CalldataStorage.deploy();
  await calldataStorage.waitForDeployment();
  const contractAddress = await calldataStorage.getAddress();
  console.log("✅ Contract deployed to:", contractAddress);
  console.log("");

  // Save contract address for reference
  const addressFile = path.join(__dirname, "..", ".contract-address");
  fs.writeFileSync(addressFile, contractAddress);
  console.log("💾 Contract address saved to .contract-address");
  console.log("");

  // Step 2: Store data
  console.log("Step 2: Storing data in calldata...");
  console.log("   Payload:", userPayload);
  const [signer] = await hre.ethers.getSigners();
  console.log("   From account:", signer.address);
  
  const tx = await calldataStorage.storeData(userPayload);
  console.log("   Transaction hash:", tx.hash);
  console.log("   Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block", receipt.blockNumber);
  console.log("   Gas used:", receipt.gasUsed.toString());
  console.log("");

  // Step 3: Retrieve data
  console.log("Step 3: Retrieving data from event logs...");
  const filter = calldataStorage.filters.DataStored();
  const events = await calldataStorage.queryFilter(filter);
  
  if (events.length === 0) {
    console.log("❌ No events found");
    return;
  }

  console.log(`✅ Found ${events.length} stored entry/entries:\n`);
  
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const block = await hre.ethers.provider.getBlock(event.blockNumber);
    
    console.log(`--- Entry ${i + 1} ---`);
    console.log("   User:", event.args.user);
    console.log("   Data:", event.args.data);
    console.log("   Timestamp:", new Date(Number(event.args.timestamp) * 1000).toISOString());
    console.log("   Block:", event.blockNumber);
    console.log("   TX Hash:", event.transactionHash);
    console.log("");
  }

  console.log("=" .repeat(50));
  console.log("✨ Demo complete!");
  console.log("");
  console.log("💡 Key Points:");
  console.log("   • Data was stored in transaction calldata (not contract storage)");
  console.log("   • Data is permanently recorded in blockchain transaction history");
  console.log("   • Data can be retrieved by querying event logs");
  console.log("   • This approach is cheaper than using contract storage (SSTORE)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
