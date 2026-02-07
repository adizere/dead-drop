import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { network } from "hardhat";
import {
  hexToBytes,
  toBytes,
  toHex,
} from "viem";

import {
  aes256GcmDecrypt,
  aes256GcmEncrypt,
  deriveAes256KeyFromKemSecret,
} from "../../src/crypto.js";
import { getLatestDataStored } from "../../src/events.js";
import {
  HKDF_INFO,
  HKDF_SALT,
  buildAad,
  computeDataId,
  packEncryptedPayload,
  unpackEncryptedPayload,
} from "../../src/protocol.js";
import { PQClean, getKemCiphertextSize } from "../../src/pqclean.js";

async function encryptForDataId(plaintext, dataId) {
  const { publicKey, privateKey } = await PQClean.kem.generateKeyPair("ml-kem-768");
  const { key: kemSharedSecret, encryptedKey: kemCiphertext } =
    await publicKey.generateKey();

  const aesKey = deriveAes256KeyFromKemSecret(kemSharedSecret, { salt: HKDF_SALT, info: HKDF_INFO });
  const aad = buildAad(dataId);
  const { iv, ciphertext, tag } = aes256GcmEncrypt(aesKey, plaintext, { aad });

  return {
    privateKey,
    packed: packEncryptedPayload({ kemCiphertext, iv, ciphertext, tag }),
  };
}

async function storeAndFetchEncryptedData({ idString, packedPayload }) {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedCalldataStorage");
  const dataId = computeDataId(idString);

  const txHash = await contract.write.storeEncrypted([dataId, toHex(packedPayload)], {
    account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  void receipt;

  const { encryptedData } = await getLatestDataStored({
    publicClient,
    contractAddress: contract.address,
    dataId,
    user: account,
    fromBlock: 0n,
  });

  return { contractAddress: contract.address, dataId, encryptedDataHex: encryptedData };
}

test("E2E: encrypt -> storeEncrypted -> read log -> decrypt yields original plaintext", async () => {
  const idString = "e2e-happy";
  const dataId = computeDataId(idString);

  const plaintext = crypto.randomBytes(1024);
  const { privateKey, packed } = await encryptForDataId(plaintext, dataId);

  const { encryptedDataHex } = await storeAndFetchEncryptedData({
    idString,
    packedPayload: packed,
  });

  const kemCiphertextSize = getKemCiphertextSize("ml-kem-768");
  const parsed = unpackEncryptedPayload(Buffer.from(hexToBytes(encryptedDataHex)), { kemCiphertextSize });
  const recoveredSecret = await privateKey.decryptKey(parsed.kemCiphertext);
  const aesKey = deriveAes256KeyFromKemSecret(recoveredSecret, { salt: HKDF_SALT, info: HKDF_INFO });

  const aad = buildAad(dataId);
  const decrypted = aes256GcmDecrypt(aesKey, parsed.iv, parsed.ciphertext, parsed.tag, {
    aad,
  });

  assert.deepEqual(decrypted, plaintext);
});

test("E2E negative: tampering with stored ciphertext causes decrypt to fail", async () => {
  const idString = "e2e-negative";
  const dataId = computeDataId(idString);

  const plaintext = Buffer.from("hello world", "utf8");
  const { privateKey, packed } = await encryptForDataId(plaintext, dataId);

  const { encryptedDataHex } = await storeAndFetchEncryptedData({
    idString,
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

  const recoveredSecret = await privateKey.decryptKey(tamperedParsed.kemCiphertext);
  const aesKey = deriveAes256KeyFromKemSecret(recoveredSecret, { salt: HKDF_SALT, info: HKDF_INFO });
  const aad = buildAad(dataId);

  assert.throws(() => {
    aes256GcmDecrypt(aesKey, tamperedParsed.iv, tamperedParsed.ciphertext, tamperedParsed.tag, {
      aad,
    });
  });
});

