import fs from "node:fs";
import path from "node:path";

import { toHex } from "viem";
import { MlKem768 } from "mlkem";

import { aes256GcmEncrypt, deriveAes256KeyFromKemSecret } from "../../src/crypto.js";
import {
  ALG_ID_MLKEM768_AES256GCM,
  HKDF_INFO,
  HKDF_SALT,
  PROTOCOL_VERSION,
  buildAad,
  computeDataIdKeyed,
  deriveKemSeedBytes,
  deriveKeyIdBytes,
  deriveMasterKeyBytes,
  normalizeIdentifier,
  packEncryptedPayload,
} from "../../src/protocol.js";
import { writeKeysFile } from "../../src/keyfile.js";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readPlaintext({ message, file }) {
  if (message !== undefined) return Buffer.from(String(message), "utf8");
  if (file !== undefined) return fs.readFileSync(String(file));
  throw new Error("Missing plaintext input: provide --message or --file");
}

/**
 * Hardhat task action: encrypt and store.
 *
 * @param {{ id: string, passphrase?: string, message?: string, file?: string, contract?: string, keysOut?: string }} args
 * @param {import("hardhat/types").HardhatRuntimeEnvironment} hre
 */
export default async function encryptAndStoreAction(args, hre) {
  const { id, passphrase, message, file, contract, keysOut } = args;

  if (!id) throw new Error("Missing required option: --id");
  if (message === undefined && file === undefined) {
    throw new Error("Provide exactly one plaintext input: --message or --file");
  }
  if (message !== undefined && file !== undefined) {
    throw new Error("Provide exactly one plaintext input: --message or --file (not both)");
  }

  const plaintext = readPlaintext({ message, file });

  // MVP limit in requirements: ~10KB plaintext.
  if (plaintext.length > 10_240) {
    throw new Error(`Plaintext too large: ${plaintext.length} bytes (max 10240 bytes)`);
  }

  if (!passphrase) throw new Error("Missing required option: --passphrase");

  const normalizedId = normalizeIdentifier(id);
  const masterKeyBytes = deriveMasterKeyBytes(passphrase);
  const keyIdBytes = deriveKeyIdBytes(masterKeyBytes);
  const dataId = computeDataIdKeyed(keyIdBytes, normalizedId);

  const kem = new MlKem768();
  const seed = deriveKemSeedBytes(masterKeyBytes, normalizedId);
  const [publicKey, privateKey] = await kem.deriveKeyPair(seed);

  // Encapsulate (public key): produces shared secret + KEM ciphertext.
  const [kemCiphertext, kemSharedSecret] = await kem.encap(publicKey);

  // Derive AES-256 key from KEM shared secret.
  const aesKey = deriveAes256KeyFromKemSecret(kemSharedSecret, {
    salt: HKDF_SALT,
    info: HKDF_INFO,
  });

  // Bind context to the AES-GCM tag.
  const aad = buildAad(dataId, {
    version: PROTOCOL_VERSION,
    algId: ALG_ID_MLKEM768_AES256GCM,
  });

  const { iv, ciphertext, tag } = aes256GcmEncrypt(aesKey, plaintext, { aad });

  const packed = packEncryptedPayload(
    { kemCiphertext, iv, ciphertext, tag },
    { version: PROTOCOL_VERSION, algId: ALG_ID_MLKEM768_AES256GCM },
  );

  // Connect and deploy/attach contract
  const { viem } = await hre.network.connect();
  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const storage = contract
    ? await viem.getContractAt("EncryptedStorage", contract)
    : await viem.deployContract("EncryptedStorage");

  const payloadHex = toHex(packed);
  const txHash = await storage.write.storeEncrypted([dataId, payloadHex], { account });

  let keysPath = null;
  if (keysOut) {
    keysPath = path.resolve(keysOut);
    ensureDir(path.dirname(keysPath));
    writeKeysFile({
      keysPath,
      publicKey: toHex(publicKey),
      privateKey: toHex(privateKey),
    });
  }

  console.log("Stored encrypted payload:");
  console.log(`- contract: ${storage.address}`);
  console.log(`- dataId:   ${dataId}`);
  console.log(`- bytes:    ${packed.length}`);
  console.log(`- txHash:   ${txHash}`);
  if (keysPath) console.log(`- keys:     ${keysPath}`);
}
