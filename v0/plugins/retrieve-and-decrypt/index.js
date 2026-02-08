import { task } from "hardhat/config";
import { ArgumentType } from "hardhat/types/arguments";

export default {
  id: "shared-secret:retrieve-and-decrypt",
  tasks: [
    task("retrieve-and-decrypt", "Retrieve encrypted payload from events and decrypt it")
      .addOption({
        name: "contract",
        description: "EncryptedCalldataStorage contract address",
        type: ArgumentType.STRING,
        defaultValue: "",
      })
      .addOption({
        name: "id",
        description: "Identifier string (hashed to bytes32 dataId). Optional if --dataId provided",
        type: ArgumentType.STRING_WITHOUT_DEFAULT,
        defaultValue: undefined,
      })
      .addOption({
        name: "dataId",
        description: "bytes32 hex dataId (0x...). Optional if --id provided",
        type: ArgumentType.STRING_WITHOUT_DEFAULT,
        defaultValue: undefined,
      })
      .addOption({
        name: "keys",
        description: "Path to key JSON file (default: keys/<id>.key.json)",
        type: ArgumentType.FILE_WITHOUT_DEFAULT,
        defaultValue: undefined,
      })
      .addOption({
        name: "user",
        description: "User address to filter logs by (defaults to the connected account)",
        type: ArgumentType.STRING_WITHOUT_DEFAULT,
        defaultValue: undefined,
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
      .addOption({
        name: "fromBlock",
        description: "From which block to start scanning logs (default: 0)",
        type: ArgumentType.STRING_WITHOUT_DEFAULT,
        defaultValue: undefined,
      })
      .addOption({
        name: "rpcUrl",
        description:
          "RPC URL for log fetch; when set, uses cast to fetch logs (avoids 413 on some RPCs). Requires cast on PATH.",
        type: ArgumentType.STRING_WITHOUT_DEFAULT,
        defaultValue: undefined,
      })
      .setAction(() => import("./task-action.js"))
      .build(),
  ],
};

