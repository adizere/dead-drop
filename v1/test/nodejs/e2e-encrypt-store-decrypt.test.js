import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { network } from "hardhat";
import {
  hexToBytes,
  toHex,
} from "viem";

import {
  aes256GcmDecrypt,
  aes256GcmEncrypt,
  deriveAes256KeyFromKemSecret,
} from "../../src/crypto.js";
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
  packEncryptedPayload,
  unpackEncryptedPayload,
} from "../../src/protocol.js";
import { getKemCiphertextSize } from "../../src/pqclean.js";
import { MlKem768 } from "mlkem";

async function encryptForDataId(plaintext, dataId, seed) {
  const kem = new MlKem768();
  const [publicKey, privateKey] = await kem.deriveKeyPair(seed);
  const [kemCiphertext, kemSharedSecret] = await kem.encap(publicKey);

  const aesKey = deriveAes256KeyFromKemSecret(kemSharedSecret, { salt: HKDF_SALT, info: HKDF_INFO });
  const aad = buildAad(dataId);
  const { iv, ciphertext, tag } = aes256GcmEncrypt(aesKey, plaintext, { aad });

  return {
    privateKey,
    packed: packEncryptedPayload({ kemCiphertext, iv, ciphertext, tag }),
  };
}

async function storeAndFetchEncryptedData({ dataId, packedPayload }) {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedStorage");

  const txHash = await contract.write.storeEncrypted([dataId, toHex(packedPayload)], {
    account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  void receipt;

  // v1: retrieve via view function instead of event logs
  const { encryptedData } = await getEncryptedData({
    contract,
    dataId,
    user: account,
  });

  return { contractAddress: contract.address, dataId, encryptedDataHex: encryptedData };
}

test("E2E: encrypt -> storeEncrypted -> getEncrypted -> decrypt yields original plaintext", async () => {
  const idString = "e2e-happy";
  const passphrase = "passphrase-e2e";
  const normalizedId = normalizeIdentifier(idString);
  const masterKeyBytes = deriveMasterKeyBytes(passphrase);
  const keyIdBytes = deriveKeyIdBytes(masterKeyBytes);
  const dataId = computeDataIdKeyed(keyIdBytes, normalizedId);
  const seed = deriveKemSeedBytes(masterKeyBytes, normalizedId);

  const plaintext = crypto.randomBytes(1024);
  const { privateKey, packed } = await encryptForDataId(plaintext, dataId, seed);

  const { encryptedDataHex } = await storeAndFetchEncryptedData({
    dataId,
    packedPayload: packed,
  });

  const kemCiphertextSize = getKemCiphertextSize("ml-kem-768");
  const parsed = unpackEncryptedPayload(Buffer.from(hexToBytes(encryptedDataHex)), { kemCiphertextSize });
  const kem = new MlKem768();
  const recoveredSecret = await kem.decap(parsed.kemCiphertext, privateKey);
  const aesKey = deriveAes256KeyFromKemSecret(recoveredSecret, { salt: HKDF_SALT, info: HKDF_INFO });

  const aad = buildAad(dataId);
  const decrypted = aes256GcmDecrypt(aesKey, parsed.iv, parsed.ciphertext, parsed.tag, {
    aad,
  });

  assert.deepEqual(decrypted, plaintext);
});

test("E2E negative: tampering with stored ciphertext causes decrypt to fail", async () => {
  const idString = "e2e-negative";
  const passphrase = "passphrase-e2e-neg";
  const normalizedId = normalizeIdentifier(idString);
  const masterKeyBytes = deriveMasterKeyBytes(passphrase);
  const keyIdBytes = deriveKeyIdBytes(masterKeyBytes);
  const dataId = computeDataIdKeyed(keyIdBytes, normalizedId);
  const seed = deriveKemSeedBytes(masterKeyBytes, normalizedId);

  const plaintext = Buffer.from("hello world", "utf8");
  const { privateKey, packed } = await encryptForDataId(plaintext, dataId, seed);

  const { encryptedDataHex } = await storeAndFetchEncryptedData({
    dataId,
    packedPayload: packed,
  });

  const storedPacked = Buffer.from(hexToBytes(encryptedDataHex));
  const kemCiphertextSize = getKemCiphertextSize("ml-kem-768");
  const parsed = unpackEncryptedPayload(storedPacked, { kemCiphertextSize });

  // Tamper a byte in the AES ciphertext portion.
  assert.ok(parsed.ciphertext.length > 0, "ciphertext should be non-empty");
  const tamperedPacked = Buffer.from(storedPacked);
  const ciphertextOffset = 2 + kemCiphertextSize + 12; // header + kemCiphertext + iv
  tamperedPacked[ciphertextOffset] ^= 0xff;

  const tamperedParsed = unpackEncryptedPayload(tamperedPacked, { kemCiphertextSize });

  const kem = new MlKem768();
  const recoveredSecret = await kem.decap(tamperedParsed.kemCiphertext, privateKey);
  const aesKey = deriveAes256KeyFromKemSecret(recoveredSecret, { salt: HKDF_SALT, info: HKDF_INFO });
  const aad = buildAad(dataId);

  assert.throws(() => {
    aes256GcmDecrypt(aesKey, tamperedParsed.iv, tamperedParsed.ciphertext, tamperedParsed.tag, {
      aad,
    });
  });
});
