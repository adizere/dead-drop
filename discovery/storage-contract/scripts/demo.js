const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const userPayload = "design is gud";
  
  console.log("🚀 Contract Storage Demo");
  console.log("=" .repeat(50));
  console.log("");

  // Step 1: Deploy contract
  console.log("Step 1: Deploying ContractStorage contract...");
  const ContractStorage = await hre.ethers.getContractFactory("ContractStorage");
  const contractStorage = await ContractStorage.deploy();
  await contractStorage.waitForDeployment();
  const contractAddress = await contractStorage.getAddress();
  console.log("✅ Contract deployed to:", contractAddress);
  console.log("");

  // Save contract address for reference
  const addressFile = path.join(__dirname, "..", ".contract-address");
  fs.writeFileSync(addressFile, contractAddress);
  console.log("💾 Contract address saved to .contract-address");
  console.log("");

  // Step 2: Store data
  console.log("Step 2: Storing data in contract storage...");
  console.log("   Payload:", userPayload);
  const [signer] = await hre.ethers.getSigners();
  console.log("   From account:", signer.address);
  
  const tx = await contractStorage.storeData(userPayload);
  console.log("   Transaction hash:", tx.hash);
  console.log("   Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block", receipt.blockNumber);
  console.log("   Gas used:", receipt.gasUsed.toString());
  console.log("");

  // Step 3: Retrieve data from contract storage
  console.log("Step 3: Retrieving data from contract storage...");
  const [storedData, storer, timestamp] = await contractStorage.getStoredData();
  
  console.log("✅ Data retrieved from contract storage:");
  console.log("   Data:", storedData);
  console.log("   Storer:", storer);
  console.log("   Timestamp:", new Date(Number(timestamp) * 1000).toISOString());
  console.log("");

  // Step 4: Show event history
  console.log("Step 4: Event history:");
  const filter = contractStorage.filters.DataStored();
  const events = await contractStorage.queryFilter(filter);
  
  if (events.length > 0) {
    console.log(`✅ Found ${events.length} event(s):\n`);
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const block = await hre.ethers.provider.getBlock(event.blockNumber);
      
      console.log(`--- Event ${i + 1} ---`);
      console.log("   User:", event.args.user);
      console.log("   Data:", event.args.data);
      console.log("   Timestamp:", new Date(Number(event.args.timestamp) * 1000).toISOString());
      console.log("   Block:", event.blockNumber);
      console.log("   TX Hash:", event.transactionHash);
      console.log("");
    }
  }

  console.log("=" .repeat(50));
  console.log("✨ Demo complete!");
  console.log("");
  console.log("💡 Key Points:");
  console.log("   • Data was stored in contract storage (SSTORE operation)");
  console.log("   • Data persists in the contract's state on the blockchain");
  console.log("   • Data can be read at any time using getStoredData()");
  console.log("   • Data can be modified by calling storeData() again");
  console.log("   • This approach is more expensive than calldata but provides mutable storage");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
