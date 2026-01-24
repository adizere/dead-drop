import fs from "node:fs";
import path from "node:path";

import PQCleanMod from "pqclean";
import { hexToBytes, keccak256, toBytes, toHex } from "viem";

import { aes256GcmEncrypt, deriveAes256KeyFromKemSecret } from "../../src/crypto.js";

const PQClean = PQCleanMod?.default ?? PQCleanMod;

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
 * @param {{ id: string, message?: string, file?: string, contract?: string, keysOut?: string }} args
 * @param {import("hardhat/types").HardhatRuntimeEnvironment} hre
 */
export default async function encryptAndStoreAction(args, hre) {
  const { id, message, file, contract, keysOut } = args;

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

  const dataId = keccak256(toBytes(id));

  // Generate a fresh ML-KEM-768 keypair for this dataId and store it locally so it can be decrypted later.
  // (We will refine key management in a later Phase 4 item.)
  const { publicKey, privateKey } = await PQClean.kem.generateKeyPair("ml-kem-768");

  // Encapsulate (public key): produces shared secret + KEM ciphertext.
  const { key: kemSharedSecret, encryptedKey: kemCiphertext } = await publicKey.generateKey();

  // Derive AES-256 key from KEM shared secret.
  const salt = Buffer.from("shared-secret:v0", "utf8");
  const info = Buffer.from("ml-kem-768->aes-256-gcm", "utf8");
  const aesKey = deriveAes256KeyFromKemSecret(kemSharedSecret, { salt, info });

  // Bind context to the AES-GCM tag.
  const VERSION = 1;
  const ALG_ID = 1; // 0x01 = ML-KEM-768 + AES-256-GCM
  const aad = Buffer.concat([Buffer.from([VERSION, ALG_ID]), Buffer.from(hexToBytes(dataId))]);

  const { iv, ciphertext, tag } = aes256GcmEncrypt(aesKey, plaintext, { aad });

  // Pack encrypted payload:
  // [version:1][algId:1][kemCiphertext][iv:12][ciphertext][tag:16]
  const packed = Buffer.concat([
    Buffer.from([VERSION, ALG_ID]),
    Buffer.from(kemCiphertext),
    Buffer.from(iv),
    Buffer.from(ciphertext),
    Buffer.from(tag),
  ]);

  // Connect and deploy/attach contract
  const { viem } = await hre.network.connect();
  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const storage = contract
    ? await viem.getContractAt("EncryptedCalldataStorage", contract)
    : await viem.deployContract("EncryptedCalldataStorage");

  const payloadHex = toHex(packed);
  const txHash = await storage.write.storeEncrypted([dataId, payloadHex], { account });

  // Save keys locally (private key is required for decryption).
  const exportedPublicKey = toHex(Buffer.from(await publicKey.export()));
  const exportedPrivateKey = toHex(Buffer.from(await privateKey.export()));

  const defaultKeysDir = path.join(process.cwd(), "keys");
  ensureDir(defaultKeysDir);
  const keysPath = keysOut
    ? path.resolve(keysOut)
    : path.join(defaultKeysDir, `${id}.key.json`);

  fs.writeFileSync(
    keysPath,
    JSON.stringify(
      {
        version: 1,
        algorithm: "ml-kem-768+aes-256-gcm",
        dataId,
        created: new Date().toISOString(),
        publicKey: exportedPublicKey,
        privateKey: exportedPrivateKey,
        note: "KEEP THIS FILE SECRET. It contains the private key needed to decrypt.",
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log("Stored encrypted payload:");
  console.log(`- contract: ${storage.address}`);
  console.log(`- dataId:   ${dataId}`);
  console.log(`- bytes:    ${packed.length}`);
  console.log(`- txHash:   ${txHash}`);
  console.log(`- keys:     ${keysPath}`);
}

