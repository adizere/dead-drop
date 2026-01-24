import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { network } from "hardhat";
import PQCleanMod from "pqclean";
import { keccak256, toBytes, toHex } from "viem";

import { aes256GcmEncrypt, deriveAes256KeyFromKemSecret } from "../../src/crypto.js";
import retrieveAndDecryptAction from "../../plugins/retrieve-and-decrypt/task-action.js";

const PQClean = PQCleanMod?.default ?? PQCleanMod;

const VERSION = 1;
const ALG_ID = 1;
const SALT = Buffer.from("shared-secret:v0", "utf8");
const INFO = Buffer.from("ml-kem-768->aes-256-gcm", "utf8");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildAad(dataIdHex) {
  // Bind version + alg + dataId to the AES-GCM tag.
  return Buffer.concat([Buffer.from([VERSION, ALG_ID]), Buffer.from(Buffer.from(dataIdHex.slice(2), "hex"))]);
}

test("retrieve-and-decrypt task returns the original plaintext (happy path)", async () => {
  const connection = await network.connect();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedCalldataStorage");

  const id = "retrieve-happy";
  const dataId = keccak256(toBytes(id));
  const plaintext = Buffer.from("hello from retrieve", "utf8");

  // Encrypt (same scheme as the encrypt task)
  const { publicKey, privateKey } = await PQClean.kem.generateKeyPair("ml-kem-768");
  const { key: kemSharedSecret, encryptedKey: kemCiphertext } = await publicKey.generateKey();
  const aesKey = deriveAes256KeyFromKemSecret(kemSharedSecret, { salt: SALT, info: INFO });
  const aad = buildAad(dataId);
  const { iv, ciphertext, tag } = aes256GcmEncrypt(aesKey, plaintext, { aad });

  const packed = Buffer.concat([
    Buffer.from([VERSION, ALG_ID]),
    Buffer.from(kemCiphertext),
    Buffer.from(iv),
    Buffer.from(ciphertext),
    Buffer.from(tag),
  ]);

  const txHash = await contract.write.storeEncrypted([dataId, toHex(packed)], { account });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  // Write keys file expected by retrieve task
  const keysDir = "keys-test";
  ensureDir(keysDir);
  const keysPath = `${keysDir}/${id}.key.json`;
  fs.writeFileSync(
    keysPath,
    JSON.stringify(
      {
        version: 1,
        algorithm: "ml-kem-768+aes-256-gcm",
        dataId,
        privateKey: toHex(Buffer.from(await privateKey.export())),
      },
      null,
      2,
    ),
  );

  const decrypted = await retrieveAndDecryptAction(
    {
      contract: contract.address,
      id,
      keys: keysPath,
      user: account,
      format: "utf8",
    },
    { network, __sharedSecretConnection: connection },
  );

  assert.deepEqual(decrypted, plaintext);
});

test("retrieve-and-decrypt fails with the wrong key (negative)", async () => {
  const connection = await network.connect();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedCalldataStorage");

  const id = "retrieve-negative";
  const dataId = keccak256(toBytes(id));
  const plaintext = Buffer.from("secret", "utf8");

  const { publicKey } = await PQClean.kem.generateKeyPair("ml-kem-768");
  const { key: kemSharedSecret, encryptedKey: kemCiphertext } = await publicKey.generateKey();
  const aesKey = deriveAes256KeyFromKemSecret(kemSharedSecret, { salt: SALT, info: INFO });
  const aad = buildAad(dataId);
  const { iv, ciphertext, tag } = aes256GcmEncrypt(aesKey, plaintext, { aad });

  const packed = Buffer.concat([
    Buffer.from([VERSION, ALG_ID]),
    Buffer.from(kemCiphertext),
    Buffer.from(iv),
    Buffer.from(ciphertext),
    Buffer.from(tag),
  ]);

  const txHash = await contract.write.storeEncrypted([dataId, toHex(packed)], { account });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  // Write a WRONG keys file (fresh unrelated private key)
  const { privateKey: wrongPrivateKey } = await PQClean.kem.generateKeyPair("ml-kem-768");
  const keysDir = "keys-test";
  ensureDir(keysDir);
  const keysPath = `${keysDir}/${id}.wrong.key.json`;
  fs.writeFileSync(
    keysPath,
    JSON.stringify(
      {
        version: 1,
        algorithm: "ml-kem-768+aes-256-gcm",
        dataId,
        privateKey: toHex(Buffer.from(await wrongPrivateKey.export())),
      },
      null,
      2,
    ),
  );

  await assert.rejects(async () => {
    await retrieveAndDecryptAction(
      {
        contract: contract.address,
        id,
        keys: keysPath,
        format: "utf8",
      },
      { network, __sharedSecretConnection: connection },
    );
  });
});

