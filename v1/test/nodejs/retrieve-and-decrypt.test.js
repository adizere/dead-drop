import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { network } from "hardhat";
import { toHex } from "viem";

import { aes256GcmEncrypt, deriveAes256KeyFromKemSecret } from "../../src/crypto.js";
import { writeKeysFile } from "../../src/keyfile.js";
import { buildAad, computeDataId, HKDF_INFO, HKDF_SALT, packEncryptedPayload } from "../../src/protocol.js";
import { PQClean } from "../../src/pqclean.js";
import retrieveAndDecryptAction from "../../plugins/retrieve-and-decrypt/task-action.js";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

test("retrieve-and-decrypt task returns the original plaintext (happy path)", async () => {
  const connection = await network.connect();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedStorage");

  const id = "retrieve-happy";
  const dataId = computeDataId(id);
  const plaintext = Buffer.from("hello from retrieve", "utf8");

  // Encrypt (same scheme as the encrypt task)
  const { publicKey, privateKey } = await PQClean.kem.generateKeyPair("ml-kem-768");
  const { key: kemSharedSecret, encryptedKey: kemCiphertext } = await publicKey.generateKey();
  const aesKey = deriveAes256KeyFromKemSecret(kemSharedSecret, { salt: HKDF_SALT, info: HKDF_INFO });
  const aad = buildAad(dataId);
  const { iv, ciphertext, tag } = aes256GcmEncrypt(aesKey, plaintext, { aad });

  const packed = packEncryptedPayload({ kemCiphertext, iv, ciphertext, tag });

  const txHash = await contract.write.storeEncrypted([dataId, toHex(packed)], { account });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  // Write keys file expected by retrieve task
  const keysDir = "keys-test";
  ensureDir(keysDir);
  const keysPath = `${keysDir}/${id}.key.json`;
  writeKeysFile({
    keysPath,
    id,
    dataId,
    publicKey: toHex(Buffer.from(await publicKey.export())),
    privateKey: toHex(Buffer.from(await privateKey.export())),
  });

  const decrypted = await retrieveAndDecryptAction(
    {
      contract: contract.address,
      id,
      keys: keysPath,
      user: account,
      format: "utf8",
    },
    { network, __sharedConnection: connection },
  );

  assert.deepEqual(decrypted, plaintext);
});

test("retrieve-and-decrypt fails with the wrong key (negative)", async () => {
  const connection = await network.connect();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedStorage");

  const id = "retrieve-negative";
  const dataId = computeDataId(id);
  const plaintext = Buffer.from("secret", "utf8");

  const { publicKey } = await PQClean.kem.generateKeyPair("ml-kem-768");
  const { key: kemSharedSecret, encryptedKey: kemCiphertext } = await publicKey.generateKey();
  const aesKey = deriveAes256KeyFromKemSecret(kemSharedSecret, { salt: HKDF_SALT, info: HKDF_INFO });
  const aad = buildAad(dataId);
  const { iv, ciphertext, tag } = aes256GcmEncrypt(aesKey, plaintext, { aad });

  const packed = packEncryptedPayload({ kemCiphertext, iv, ciphertext, tag });

  const txHash = await contract.write.storeEncrypted([dataId, toHex(packed)], { account });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  // Write a WRONG keys file (fresh unrelated private key)
  const { privateKey: wrongPrivateKey } = await PQClean.kem.generateKeyPair("ml-kem-768");
  const keysDir = "keys-test";
  ensureDir(keysDir);
  const keysPath = `${keysDir}/${id}.wrong.key.json`;
  writeKeysFile({
    keysPath,
    id: `${id}.wrong`,
    dataId,
    publicKey: "0x",
    privateKey: toHex(Buffer.from(await wrongPrivateKey.export())),
  });

  await assert.rejects(async () => {
    await retrieveAndDecryptAction(
      {
        contract: contract.address,
        id,
        keys: keysPath,
        format: "utf8",
      },
      { network, __sharedConnection: connection },
    );
  });
});
