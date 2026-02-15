import test from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { toHex } from "viem";

import { aes256GcmEncrypt, deriveAes256KeyFromKemSecret } from "../../src/crypto.js";
import {
  buildAad,
  computeDataIdKeyed,
  deriveKemSeedBytes,
  deriveKeyIdBytes,
  deriveMasterKeyBytes,
  HKDF_INFO,
  HKDF_SALT,
  normalizeIdentifier,
  packEncryptedPayload,
} from "../../src/protocol.js";
import { MlKem768 } from "mlkem";
import retrieveAndDecryptAction from "../../plugins/retrieve-and-decrypt/task-action.js";

test("retrieve-and-decrypt task returns the original plaintext (happy path)", async () => {
  const connection = await network.connect();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedStorage");

  const id = "retrieve-happy";
  const passphrase = "passphrase-1";
  const normalizedId = normalizeIdentifier(id);
  const masterKeyBytes = deriveMasterKeyBytes(passphrase);
  const keyIdBytes = deriveKeyIdBytes(masterKeyBytes);
  const dataId = computeDataIdKeyed(keyIdBytes, normalizedId);
  const plaintext = Buffer.from("hello from retrieve", "utf8");

  // Encrypt (same scheme as the encrypt task)
  const kem = new MlKem768();
  const seed = deriveKemSeedBytes(masterKeyBytes, normalizedId);
  const [publicKey, privateKey] = await kem.deriveKeyPair(seed);
  const [kemCiphertext, kemSharedSecret] = await kem.encap(publicKey);
  const aesKey = deriveAes256KeyFromKemSecret(kemSharedSecret, { salt: HKDF_SALT, info: HKDF_INFO });
  const aad = buildAad(dataId);
  const { iv, ciphertext, tag } = aes256GcmEncrypt(aesKey, plaintext, { aad });

  const packed = packEncryptedPayload({ kemCiphertext, iv, ciphertext, tag });

  const txHash = await contract.write.storeEncrypted([dataId, toHex(packed)], { account });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  const decrypted = await retrieveAndDecryptAction(
    {
      contract: contract.address,
      id,
      passphrase,
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
  const passphrase = "passphrase-2";
  const wrongPassphrase = "passphrase-2-wrong";
  const normalizedId = normalizeIdentifier(id);
  const masterKeyBytes = deriveMasterKeyBytes(passphrase);
  const keyIdBytes = deriveKeyIdBytes(masterKeyBytes);
  const dataId = computeDataIdKeyed(keyIdBytes, normalizedId);
  const plaintext = Buffer.from("secret", "utf8");

  const kem = new MlKem768();
  const seed = deriveKemSeedBytes(masterKeyBytes, normalizedId);
  const [publicKey] = await kem.deriveKeyPair(seed);
  const [kemCiphertext, kemSharedSecret] = await kem.encap(publicKey);
  const aesKey = deriveAes256KeyFromKemSecret(kemSharedSecret, { salt: HKDF_SALT, info: HKDF_INFO });
  const aad = buildAad(dataId);
  const { iv, ciphertext, tag } = aes256GcmEncrypt(aesKey, plaintext, { aad });

  const packed = packEncryptedPayload({ kemCiphertext, iv, ciphertext, tag });

  const txHash = await contract.write.storeEncrypted([dataId, toHex(packed)], { account });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  await assert.rejects(async () => {
    await retrieveAndDecryptAction(
      {
        contract: contract.address,
        id,
        passphrase: wrongPassphrase,
        format: "utf8",
      },
      { network, __sharedConnection: connection },
    );
  });
});
