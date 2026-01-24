import { task } from "hardhat/config";
import { ArgumentType } from "hardhat/types/arguments";

/**
 * Custom plugin that registers the `encrypt-and-store` task.
 *
 * Hardhat 3 tasks are registered via plugins (not by calling task() in a random imported file).
 */
export default {
  id: "shared-secret:encrypt-and-store",
  tasks: [
    task(
      "encrypt-and-store",
      "Encrypt a secret and store it via EncryptedCalldataStorage.storeEncrypted",
    )
      .addOption({
        name: "id",
        description: "Human-readable identifier (will be hashed to bytes32 dataId)",
        type: ArgumentType.STRING,
        defaultValue: "",
      })
      .addOption({
        name: "message",
        description: "Plaintext message to encrypt (utf8)",
        type: ArgumentType.STRING_WITHOUT_DEFAULT,
        defaultValue: undefined,
      })
      .addOption({
        name: "file",
        description: "Path to a file whose bytes will be encrypted",
        type: ArgumentType.FILE_WITHOUT_DEFAULT,
        defaultValue: undefined,
      })
      .addOption({
        name: "contract",
        description: "Existing EncryptedCalldataStorage address; if omitted, it will be deployed",
        type: ArgumentType.STRING_WITHOUT_DEFAULT,
        defaultValue: undefined,
      })
      .addOption({
        name: "keysOut",
        description: "Where to write the generated ML-KEM keypair JSON (default: keys/<id>.key.json)",
        type: ArgumentType.FILE_WITHOUT_DEFAULT,
        defaultValue: undefined,
      })
      .setAction(() => import("./task-action.js"))
      .build(),
  ],
};

