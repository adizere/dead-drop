import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import PQCleanMod from "pqclean";
import {
  aes256GcmDecrypt,
  aes256GcmEncrypt,
  deriveAes256KeyFromKemSecret,
} from "../../src/crypto.js";

const PQClean = PQCleanMod?.default ?? PQCleanMod;

test("pqclean supports ML-KEM-768", () => {
  const names = PQClean.kem.supportedAlgorithms.map((a) => a.name);
  assert.ok(names.includes("ml-kem-768"));
});

test("ML-KEM-768 KEM roundtrip: encapsulated key == decapsulated key", async () => {
  const { publicKey, privateKey } = await PQClean.kem.generateKeyPair("ml-kem-768");
  const { key, encryptedKey } = await publicKey.generateKey();
  const recovered = await privateKey.decryptKey(encryptedKey);
  assert.deepEqual(Buffer.from(recovered), Buffer.from(key));
});

test("HKDF derives a stable 32-byte AES key from the KEM secret", async () => {
  const { publicKey, privateKey } = await PQClean.kem.generateKeyPair("ml-kem-768");
  const { key, encryptedKey } = await publicKey.generateKey();
  const recovered = await privateKey.decryptKey(encryptedKey);

  const salt = Buffer.from("shared-secret:v0", "utf8");
  const info = Buffer.from("ml-kem-768->aes-256-gcm", "utf8");

  const k1 = deriveAes256KeyFromKemSecret(key, { salt, info });
  const k2 = deriveAes256KeyFromKemSecret(recovered, { salt, info });

  assert.equal(k1.length, 32);
  assert.equal(k2.length, 32);
  assert.deepEqual(k1, k2);

  // Different salt should yield a different derived key
  const k3 = deriveAes256KeyFromKemSecret(recovered, {
    salt: Buffer.from("shared-secret:other", "utf8"),
    info,
  });
  assert.notDeepEqual(k2, k3);
});

test("AES-256-GCM encrypt/decrypt roundtrip works", async () => {
  const { publicKey, privateKey } = await PQClean.kem.generateKeyPair("ml-kem-768");
  const { key, encryptedKey } = await publicKey.generateKey();
  const recovered = await privateKey.decryptKey(encryptedKey);

  const aesKey = deriveAes256KeyFromKemSecret(recovered, {
    salt: Buffer.from("shared-secret:v0", "utf8"),
    info: Buffer.from("ml-kem-768->aes-256-gcm", "utf8"),
  });

  const plaintext = crypto.randomBytes(512); // within MVP-ish size constraints
  const aad = Buffer.from("aad:test", "utf8");

  const { iv, ciphertext, tag } = aes256GcmEncrypt(aesKey, plaintext, { aad });
  const decrypted = aes256GcmDecrypt(aesKey, iv, ciphertext, tag, { aad });

  assert.deepEqual(decrypted, plaintext);
});

test("AES-256-GCM authentication fails on tampered ciphertext/tag", async () => {
  const aesKey = crypto.randomBytes(32);
  const plaintext = Buffer.from("hello", "utf8");

  const { iv, ciphertext, tag } = aes256GcmEncrypt(aesKey, plaintext);

  const tamperedCiphertext = Buffer.from(ciphertext);
  tamperedCiphertext[0] ^= 0xff;

  assert.throws(() => {
    aes256GcmDecrypt(aesKey, iv, tamperedCiphertext, tag);
  });

  const tamperedTag = Buffer.from(tag);
  tamperedTag[0] ^= 0xff;

  assert.throws(() => {
    aes256GcmDecrypt(aesKey, iv, ciphertext, tamperedTag);
  });
});

