import fs from "node:fs";

import { hexToBytes } from "viem";

import { aes256GcmDecrypt, deriveAes256KeyFromKemSecret } from "../../src/crypto.js";
import { readKeysFile } from "../../src/keyfile.js";
import { getEncryptedData } from "../../src/storage.js";
import {
  HKDF_INFO,
  HKDF_SALT,
  buildAad,
  computeDataId,
  unpackEncryptedPayload,
} from "../../src/protocol.js";
import { getKemCiphertextSize, importKemPrivateKey } from "../../src/pqclean.js";

/**
 * Hardhat task action: retrieve and decrypt.
 *
 * Returns decrypted bytes (Buffer) for programmatic usage.
 *
 * @param {{ id?: string, dataId?: string, contract: string, keys?: string, user?: string, out?: string, format?: string }} args
 * @param {import("hardhat/types").HardhatRuntimeEnvironment} hre
 */
export default async function retrieveAndDecryptAction(args, hre) {
  const { id, dataId: dataIdArg, contract, keys, user, out, format = "utf8" } = args;

  if (!contract) throw new Error("Missing required option: --contract");
  if (!id && !dataIdArg) throw new Error("Provide --id or --dataId");

  const dataId = dataIdArg ?? computeDataId(id);

  const keysPath = keys ?? (id ? `keys/${id}.key.json` : undefined);
  if (!keysPath) throw new Error("Missing keys: provide --keys (or use --id with default keys/<id>.key.json)");

  const keyJson = readKeysFile(keysPath);
  const privateKeyHex = keyJson.privateKey;

  // In Hardhat's in-process network (used by node:test), multiple calls to `network.connect()`
  // may yield isolated connections. Allow tests (and advanced callers) to inject a shared
  // connection to ensure we query the same chain state.
  const { viem } = hre.__sharedConnection ?? (await hre.network.connect());
  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();
  const filterUser = user ?? account;

  const storage = await viem.getContractAt("EncryptedStorage", contract);

  const { encryptedData } = await getEncryptedData({
    contract: storage,
    dataId,
    user: filterUser,
  });

  const packed = Buffer.from(hexToBytes(encryptedData));

  const kemCiphertextSize = getKemCiphertextSize("ml-kem-768");
  const parsed = unpackEncryptedPayload(packed, { kemCiphertextSize });
  const privateKey = importKemPrivateKey(privateKeyHex, "ml-kem-768");

  const recoveredSecret = await privateKey.decryptKey(parsed.kemCiphertext);
  const aesKey = deriveAes256KeyFromKemSecret(recoveredSecret, { salt: HKDF_SALT, info: HKDF_INFO });
  const aad = buildAad(dataId);

  const plaintext = aes256GcmDecrypt(aesKey, parsed.iv, parsed.ciphertext, parsed.tag, { aad });

  if (out) {
    fs.writeFileSync(out, plaintext);
    console.log(`Wrote plaintext to: ${out}`);
  } else if (format === "hex") {
    console.log(plaintext.toString("hex"));
  } else if (format === "utf8") {
    console.log(plaintext.toString("utf8"));
  } else {
    throw new Error(`Unsupported --format: ${format} (use utf8|hex or --out)`);
  }

  return plaintext;
}
