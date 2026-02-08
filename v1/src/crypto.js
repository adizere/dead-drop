import crypto from "node:crypto";

/**
 * Derive a 32-byte AES key from a KEM shared secret using HKDF-SHA256.
 *
 * @param {Uint8Array} sharedSecret - KEM shared secret bytes (IKM)
 * @param {object} [opts]
 * @param {Uint8Array} [opts.salt] - Optional salt (recommended for domain separation)
 * @param {Uint8Array} [opts.info] - Optional info (context string)
 * @returns {Buffer} 32-byte AES key
 */
export function deriveAes256KeyFromKemSecret(
  sharedSecret,
  { salt = new Uint8Array(), info = new Uint8Array() } = {},
) {
  const key = crypto.hkdfSync(
    "sha256",
    Buffer.from(sharedSecret),
    Buffer.from(salt),
    Buffer.from(info),
    32,
  );
  return Buffer.from(key);
}

/**
 * Encrypt using AES-256-GCM.
 *
 * @param {Uint8Array} key - 32 bytes
 * @param {Uint8Array} plaintext
 * @param {object} [opts]
 * @param {Uint8Array} [opts.iv] - 12 bytes; if omitted, generated randomly
 * @param {Uint8Array} [opts.aad] - additional authenticated data
 * @returns {{ iv: Buffer, ciphertext: Buffer, tag: Buffer }}
 */
export function aes256GcmEncrypt(
  key,
  plaintext,
  { iv = crypto.randomBytes(12), aad } = {},
) {
  const keyBuf = Buffer.from(key);
  if (keyBuf.length !== 32) throw new Error("AES-256-GCM key must be 32 bytes");

  const ivBuf = Buffer.from(iv);
  if (ivBuf.length !== 12) throw new Error("AES-256-GCM IV must be 12 bytes");

  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf, ivBuf);
  if (aad) cipher.setAAD(Buffer.from(aad));

  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return { iv: ivBuf, ciphertext, tag };
}

/**
 * Decrypt using AES-256-GCM.
 *
 * @param {Uint8Array} key - 32 bytes
 * @param {Uint8Array} iv - 12 bytes
 * @param {Uint8Array} ciphertext
 * @param {Uint8Array} tag - 16 bytes
 * @param {object} [opts]
 * @param {Uint8Array} [opts.aad] - additional authenticated data
 * @returns {Buffer} plaintext
 */
export function aes256GcmDecrypt(
  key,
  iv,
  ciphertext,
  tag,
  { aad } = {},
) {
  const keyBuf = Buffer.from(key);
  if (keyBuf.length !== 32) throw new Error("AES-256-GCM key must be 32 bytes");

  const ivBuf = Buffer.from(iv);
  if (ivBuf.length !== 12) throw new Error("AES-256-GCM IV must be 12 bytes");

  const tagBuf = Buffer.from(tag);
  if (tagBuf.length !== 16) throw new Error("AES-256-GCM tag must be 16 bytes");

  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf, ivBuf);
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tagBuf);

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext)),
    decipher.final(),
  ]);
}

