const hre = require("hardhat");

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  console.log("Network:", network.name, "Chain ID:", network.chainId.toString());
  const blockNumber = await hre.ethers.provider.getBlockNumber();
  console.log("Block number:", blockNumber.toString());

  // The data to store in calldata
  const userPayload = "design is gud #" + blockNumber.toString();

  // Get signers (accounts)
  const [signer] = await hre.ethers.getSigners();
  console.log("Storing data from account:", signer.address);

  // Get the contract address (you can also set this as an environment variable)
  // For demo purposes, we'll try to get it from the deployment
  // In a real scenario, you'd save this after deployment
  const contractAddress = process.env.CONTRACT_ADDRESS;
  
  if (!contractAddress) {
    console.error("❌ Error: CONTRACT_ADDRESS environment variable not set");
    console.log("Please set it after deploying:");
    console.log("  export CONTRACT_ADDRESS=<deployed_address>");
    console.log("Or run: npm run deploy && npm run store");
    process.exit(1);
  }

  // Get the contract instance
  const CalldataStorage = await hre.ethers.getContractFactory("CalldataStorage");
  const contract = CalldataStorage.attach(contractAddress);

  console.log("\n📝 Storing data in calldata...");
  console.log("   Data:", userPayload);
  console.log("   Contract:", contractAddress);

  // Verify the address has contract code
  const code = await hre.ethers.provider.getCode(contractAddress);
  if (code === "0x" || code === "0x0") {
    console.error("❌ Error: No contract code found at address", contractAddress);
    console.error("   This address is an EOA (wallet), not a contract.");
    process.exit(1);
  }

  // Call the storeData function with the string parameter
  // The string will be passed as calldata
  const tx = await contract.storeData(userPayload);
  console.log("   Transaction hash:", tx.hash);

  // Wait for the transaction to be mined
  console.log("   Waiting for transaction to be mined...");
  const receipt = await tx.wait();

  console.log("\n✅ Transaction confirmed!");
  console.log("   Block number:", receipt.blockNumber);
  console.log("   Gas used:", receipt.gasUsed.toString());
  
  // Parse the event from the receipt
  const event = receipt.logs.find(log => {
    try {
      const parsed = contract.interface.parseLog(log);
      return parsed && parsed.name === "DataStored";
    } catch {
      return false;
    }
  });

  if (event) {
    const parsedEvent = contract.interface.parseLog(event);
    console.log("\n📋 Event emitted:");
    console.log("   User:", parsedEvent.args.user);
    console.log("   Data:", parsedEvent.args.data);
    console.log("   Timestamp:", new Date(Number(parsedEvent.args.timestamp) * 1000).toISOString());
  }

  console.log("\n💡 Note: The data is now permanently stored in the transaction calldata");
  console.log("   You can retrieve it by querying the event logs (see retrieve.js)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
