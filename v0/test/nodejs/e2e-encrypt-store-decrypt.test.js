import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { network } from "hardhat";
import PQCleanMod from "pqclean";
import {
  hexToBytes,
  keccak256,
  parseAbiItem,
  toBytes,
  toHex,
} from "viem";

import {
  aes256GcmDecrypt,
  aes256GcmEncrypt,
  deriveAes256KeyFromKemSecret,
} from "../../src/crypto.js";

const PQClean = PQCleanMod?.default ?? PQCleanMod;

const VERSION = 1;
const ALG_ID = 1; // 0x01 = ML-KEM-768 + AES-256-GCM
const SALT = Buffer.from("shared-secret:v0", "utf8");
const INFO = Buffer.from("ml-kem-768->aes-256-gcm", "utf8");

const dataStoredEvent = parseAbiItem(
  "event DataStored(address indexed user, bytes32 indexed dataId, bytes encryptedData, uint256 timestamp)",
);

function getMlKem768CiphertextSize() {
  const alg = PQClean.kem.supportedAlgorithms.find((a) => a.name === "ml-kem-768");
  assert.ok(alg, "pqclean must support ml-kem-768");
  // `encryptedKeySize` is the KEM ciphertext size (encapsulated key size).
  return alg.encryptedKeySize;
}

function buildAad(dataId) {
  // Bind version + alg + dataId to the AES-GCM tag.
  return Buffer.concat([Buffer.from([VERSION, ALG_ID]), Buffer.from(hexToBytes(dataId))]);
}

function packPayload({ kemCiphertext, iv, ciphertext, tag }) {
  // [version:1][algId:1][kemCiphertext][iv:12][ciphertext][tag:16]
  return Buffer.concat([
    Buffer.from([VERSION, ALG_ID]),
    Buffer.from(kemCiphertext),
    Buffer.from(iv),
    Buffer.from(ciphertext),
    Buffer.from(tag),
  ]);
}

function unpackPayload(packed) {
  const packedBuf = Buffer.from(packed);
  assert.ok(packedBuf.length >= 2 + 12 + 16, "payload too small");

  const version = packedBuf[0];
  const algId = packedBuf[1];
  assert.equal(version, VERSION);
  assert.equal(algId, ALG_ID);

  const kemCtSize = getMlKem768CiphertextSize();
  const kemStart = 2;
  const kemEnd = kemStart + kemCtSize;
  const ivStart = kemEnd;
  const ivEnd = ivStart + 12;
  const tagEnd = packedBuf.length;
  const tagStart = tagEnd - 16;
  const ctStart = ivEnd;
  const ctEnd = tagStart;

  assert.ok(tagStart >= ctStart, "payload missing ciphertext/tag");

  return {
    version,
    algId,
    kemCiphertext: packedBuf.subarray(kemStart, kemEnd),
    iv: packedBuf.subarray(ivStart, ivEnd),
    ciphertext: packedBuf.subarray(ctStart, ctEnd),
    tag: packedBuf.subarray(tagStart, tagEnd),
  };
}

async function encryptForDataId(plaintext, dataId) {
  const { publicKey, privateKey } = await PQClean.kem.generateKeyPair("ml-kem-768");
  const { key: kemSharedSecret, encryptedKey: kemCiphertext } =
    await publicKey.generateKey();

  const aesKey = deriveAes256KeyFromKemSecret(kemSharedSecret, { salt: SALT, info: INFO });
  const aad = buildAad(dataId);
  const { iv, ciphertext, tag } = aes256GcmEncrypt(aesKey, plaintext, { aad });

  return {
    privateKey,
    packed: packPayload({ kemCiphertext, iv, ciphertext, tag }),
  };
}

async function storeAndFetchEncryptedData({ idString, packedPayload }) {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedCalldataStorage");
  const dataId = keccak256(toBytes(idString));

  const txHash = await contract.write.storeEncrypted([dataId, toHex(packedPayload)], {
    account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  const logs = await publicClient.getLogs({
    address: contract.address,
    event: dataStoredEvent,
    args: { user: account, dataId },
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
  });

  assert.equal(logs.length, 1);
  return {
    contractAddress: contract.address,
    dataId,
    encryptedDataHex: logs[0].args.encryptedData,
  };
}

test("E2E: encrypt -> storeEncrypted -> read log -> decrypt yields original plaintext", async () => {
  const idString = "e2e-happy";
  const dataId = keccak256(toBytes(idString));

  const plaintext = crypto.randomBytes(1024);
  const { privateKey, packed } = await encryptForDataId(plaintext, dataId);

  const { encryptedDataHex } = await storeAndFetchEncryptedData({
    idString,
    packedPayload: packed,
  });

  const parsed = unpackPayload(Buffer.from(hexToBytes(encryptedDataHex)));
  const recoveredSecret = await privateKey.decryptKey(parsed.kemCiphertext);
  const aesKey = deriveAes256KeyFromKemSecret(recoveredSecret, { salt: SALT, info: INFO });

  const aad = buildAad(dataId);
  const decrypted = aes256GcmDecrypt(aesKey, parsed.iv, parsed.ciphertext, parsed.tag, {
    aad,
  });

  assert.deepEqual(decrypted, plaintext);
});

test("E2E negative: tampering with stored ciphertext causes decrypt to fail", async () => {
  const idString = "e2e-negative";
  const dataId = keccak256(toBytes(idString));

  const plaintext = Buffer.from("hello world", "utf8");
  const { privateKey, packed } = await encryptForDataId(plaintext, dataId);

  const { encryptedDataHex } = await storeAndFetchEncryptedData({
    idString,
    packedPayload: packed,
  });

  const storedPacked = Buffer.from(hexToBytes(encryptedDataHex));
  const parsed = unpackPayload(storedPacked);

  // Tamper a byte in the AES ciphertext portion.
  assert.ok(parsed.ciphertext.length > 0, "ciphertext should be non-empty");
  const tamperedPacked = Buffer.from(storedPacked);
  const kemCtSize = getMlKem768CiphertextSize();
  const ciphertextOffset = 2 + kemCtSize + 12; // header + kemCiphertext + iv
  tamperedPacked[ciphertextOffset] ^= 0xff;

  const tamperedParsed = unpackPayload(tamperedPacked);

  const recoveredSecret = await privateKey.decryptKey(tamperedParsed.kemCiphertext);
  const aesKey = deriveAes256KeyFromKemSecret(recoveredSecret, { salt: SALT, info: INFO });
  const aad = buildAad(dataId);

  assert.throws(() => {
    aes256GcmDecrypt(aesKey, tamperedParsed.iv, tamperedParsed.ciphertext, tamperedParsed.tag, {
      aad,
    });
  });
});

