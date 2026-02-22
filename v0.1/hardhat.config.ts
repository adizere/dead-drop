import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

import encryptAndStorePlugin from "./plugins/encrypt-and-store/index.js";
import retrieveAndDecryptPlugin from "./plugins/retrieve-and-decrypt/index.js";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin, encryptAndStorePlugin, retrieveAndDecryptPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    arcTestnet: {
      type: "http",
      chainType: "l1",
      url: process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network",
      chainId: 5042002,
      accounts: [configVariable("ARC_TESTNET_PRIVATE_KEY")],
    },
  },
});
