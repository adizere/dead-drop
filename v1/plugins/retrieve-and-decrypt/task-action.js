import fs from "node:fs";

import { hexToBytes } from "viem";
import { MlKem768 } from "mlkem";

import { aes256GcmDecrypt, deriveAes256KeyFromKemSecret } from "../../src/crypto.js";
import { getEncryptedData } from "../../src/storage.js";
import {
  HKDF_INFO,
  HKDF_SALT,
  buildAad,
  computeDataIdKeyed,
  deriveKemSeedBytes,
  deriveKeyIdBytes,
  deriveMasterKeyBytes,
  normalizeIdentifier,
  unpackEncryptedPayload,
} from "../../src/protocol.js";
import { getKemCiphertextSize } from "../../src/pqclean.js";

/**
 * Hardhat task action: retrieve and decrypt.
 *
 * Returns decrypted bytes (Buffer) for programmatic usage.
 * Retrieval uses only dataId (no wallet or user address required).
 *
 * @param {{ id?: string, dataId?: string, contract: string, passphrase?: string, out?: string, format?: string }} args
 * @param {import("hardhat/types").HardhatRuntimeEnvironment} hre
 */
export default async function retrieveAndDecryptAction(args, hre) {
  const { id, dataId: dataIdArg, contract, passphrase, out, format = "utf8" } = args;

  if (!contract) throw new Error("Missing required option: --contract");
  if (!id) throw new Error("Missing required option: --id");
  if (!passphrase) throw new Error("Missing required option: --passphrase");

  const normalizedId = normalizeIdentifier(id);
  const masterKeyBytes = passphrase ? deriveMasterKeyBytes(passphrase) : null;
  const keyIdBytes = masterKeyBytes ? deriveKeyIdBytes(masterKeyBytes) : null;
  const dataId = dataIdArg ?? computeDataIdKeyed(keyIdBytes, normalizedId);

  // In Hardhat's in-process network (used by node:test), multiple calls to `network.connect()`
  // may yield isolated connections. Allow tests (and advanced callers) to inject a shared
  // connection to ensure we query the same chain state.
  const { viem } = hre.__sharedConnection ?? (await hre.network.connect());

  const storage = await viem.getContractAt("EncryptedStorage", contract);

  const { encryptedData } = await getEncryptedData({
    contract: storage,
    dataId,
  });

  const packed = Buffer.from(hexToBytes(encryptedData));

  const kemCiphertextSize = getKemCiphertextSize("ml-kem-768");
  const parsed = unpackEncryptedPayload(packed, { kemCiphertextSize });
  const kem = new MlKem768();
  const seed = deriveKemSeedBytes(masterKeyBytes, normalizedId);
  const [, privateKey] = await kem.deriveKeyPair(seed);
  const recoveredSecret = await kem.decap(parsed.kemCiphertext, privateKey);
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
