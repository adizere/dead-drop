const hre = require("hardhat");

async function main() {
  console.log("Deploying CalldataStorage contract...");
  
  // Verify we're connected to a network
  const network = await hre.ethers.provider.getNetwork();
  console.log("Network:", network.name, "Chain ID:", network.chainId.toString());
  
  // Get signers
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying from account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");
  
  // Check current block number and nonce
  const currentBlock = await hre.ethers.provider.getBlockNumber();
  const nonce = await hre.ethers.provider.getTransactionCount(deployer.address);
  console.log("Current block number:", currentBlock);
  console.log("Deployer nonce:", nonce);

  // Get the contract factory
  console.log("\nGetting contract factory...");
  const CalldataStorage = await hre.ethers.getContractFactory("CalldataStorage");

  // Deploy the contract
  console.log("Deploying contract...");
  const calldataStorage = await CalldataStorage.deploy();
  console.log("Deployment transaction sent, waiting for confirmation...");

  // Wait for deployment to be mined
  await calldataStorage.waitForDeployment();

  const address = await calldataStorage.getAddress();
  console.log("\n✅ CalldataStorage deployed to:", address);
  
  // Verify deployment
  console.log("\nVerifying deployment...");
  const code = await hre.ethers.provider.getCode(address);
  if (code === "0x") {
    console.error("❌ ERROR: No code found at address", address);
    process.exit(1);
  }
  console.log("✓ Code exists at address (", code.length / 2 - 1, "bytes)");
  
  // Call view function to verify
  try {
    const contractAddress = await calldataStorage.getAddress();
    console.log("✓ Contract getAddress() returns indeed:", contractAddress);
  } catch (error) {
    console.log("⚠️  Could not call getAddress() - contract may still be valid");
  }
  
  // Get deployment transaction details
  const deploymentTx = calldataStorage.deploymentTransaction();
  if (deploymentTx) {
    console.log("\n📋 Deployment transaction:");
    console.log("   Transaction hash:", deploymentTx.hash);
    console.log("   From:", deploymentTx.from);
    console.log("   Nonce:", deploymentTx.nonce.toString());
    
    const receipt = await deploymentTx.wait();
    console.log("\n📋 Deployment receipt:");
    console.log("   Transaction hash:", receipt.hash);
    console.log("   Block number:", receipt.blockNumber);
    console.log("   Gas used:", receipt.gasUsed.toString());
    
    // Check current block number to verify we're on a persistent network
    const currentBlock = await hre.ethers.provider.getBlockNumber();
    console.log("   Current block number:", currentBlock);
  } else {
    console.log("⚠️  No deployment transaction found - contract may have been deployed in a previous run");
  }

  console.log("\nYou can now use this address in store.js and retrieve.js");
  console.log("Or set it as an environment variable: CONTRACT_ADDRESS=" + address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });