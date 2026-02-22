import { task } from "hardhat/config";
import { ArgumentType } from "hardhat/types/arguments";

export default {
  id: "dead-drop:retrieve-and-decrypt",
  tasks: [
    task("retrieve-and-decrypt", "Retrieve encrypted payload from contract storage and decrypt it")
      .addOption({
        name: "contract",
        description: "EncryptedStorage contract address",
        type: ArgumentType.STRING,
        defaultValue: "",
      })
      .addOption({
        name: "id",
        description: "Identifier string used with passphrase to derive dataId",
        type: ArgumentType.STRING_WITHOUT_DEFAULT,
        defaultValue: undefined,
      })
      .addOption({
        name: "passphrase",
        description: "Passphrase used to derive keyed dataId + per-secret keys",
        type: ArgumentType.STRING_WITHOUT_DEFAULT,
        defaultValue: undefined,
      })
      .addOption({
        name: "dataId",
        description: "Override derived bytes32 dataId (0x...)",
        type: ArgumentType.STRING_WITHOUT_DEFAULT,
        defaultValue: undefined,
      })
      .addOption({
        name: "rpcUrl",
        description: "RPC URL for the chain (no wallet/keystore). Default: Arc Testnet",
        type: ArgumentType.STRING,
        defaultValue: "https://rpc.testnet.arc.network",
      })
      .addOption({
        name: "chainId",
        description: "Chain ID when using --rpc-url (default 5042002 for Arc Testnet)",
        type: ArgumentType.STRING,
        defaultValue: "5042002",
      })
      .addOption({
        name: "out",
        description: "Write plaintext to file instead of stdout",
        type: ArgumentType.FILE_WITHOUT_DEFAULT,
        defaultValue: undefined,
      })
      .addOption({
        name: "format",
        description: "Stdout format when --out is not used (utf8|hex)",
        type: ArgumentType.STRING,
        defaultValue: "utf8",
      })
      .setAction(() => import("./task-action.js"))
      .build(),
  ],
};
