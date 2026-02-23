import crypto from "node:crypto";
import { hexToBytes } from "viem";

// Protocol constants (must stay consistent across encrypt/store/retrieve/decrypt)
export const PROTOCOL_VERSION = 1;
export const ALG_ID_MLKEM768_AES256GCM = 1; // 0x01

// HKDF domain separation constants
export const HKDF_SALT = Buffer.from("shared-secret:v0", "utf8");
export const HKDF_INFO = Buffer.from("ml-kem-768->aes-256-gcm", "utf8");
export const PBKDF2_SALT = Buffer.from("shared-secret:v1", "utf8");
export const PBKDF2_ITERS = 600_000;
export const HKDF_ID_SALT = Buffer.from("shared-secret:v1:hkdf", "utf8");

export function normalizeIdentifier(idString) {
  if (typeof idString !== "string") throw new Error("Identifier must be a string");
  const normalized = idString.trim().normalize("NFC");
  if (!normalized) throw new Error("Identifier cannot be empty");
  return normalized;
}

/**
 * Derive the bytes32 storage slot from a human-readable identifier using a keyed HMAC.
 * The slot is a unique, opaque location in the contract mapping derived from
 * passphrase (via keyId) + identifier — preventing enumeration and collisions.
 * @param {Uint8Array|string} keyId - 32-byte HMAC key derived from master key (hex string or bytes)
 * @param {string} idString
 * @returns {`0x${string}`}
 */
export function computeSlot(keyId, idString) {
  const normalized = normalizeIdentifier(idString);
  const keyBytes = typeof keyId === "string" ? hexToBytes(keyId) : keyId;
  const mac = crypto
    .createHmac("sha256", Buffer.from(keyBytes))
    .update(Buffer.from(normalized, "utf8"))
    .digest();
  return `0x${mac.subarray(0, 32).toString("hex")}`;
}

export function deriveMasterKeyBytes(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length === 0) {
    throw new Error("Passphrase is required");
  }
  const buf = crypto.pbkdf2Sync(passphrase, PBKDF2_SALT, PBKDF2_ITERS, 32, "sha256");
  return new Uint8Array(buf);
}

export function hkdfBytes(ikmBytes, infoBytes, length) {
  const buf = crypto.hkdfSync(
    "sha256",
    Buffer.from(ikmBytes),
    HKDF_ID_SALT,
    infoBytes,
    length,
  );
  return new Uint8Array(buf);
}

export function deriveKeyIdBytes(masterKeyBytes) {
  return hkdfBytes(masterKeyBytes, Buffer.from("id-key", "utf8"), 32);
}

export function deriveKemSeedBytes(masterKeyBytes, normalizedId) {
  return hkdfBytes(masterKeyBytes, Buffer.from(`kem:${normalizedId}`, "utf8"), 64);
}


/**
 * Build AES-GCM AAD that binds the payload to (version, algId, slot).
 * @param {`0x${string}`} slot
 * @param {{ version?: number, algId?: number }} [opts]
 * @returns {Buffer}
 */
export function buildAad(
  slot,
  { version = PROTOCOL_VERSION, algId = ALG_ID_MLKEM768_AES256GCM } = {},
) {
  return Buffer.concat([
    Buffer.from([version, algId]),
    Buffer.from(hexToBytes(slot)),
  ]);
}

/**
 * Pack the encrypted payload.
 * Format: [version:1][algId:1][kemCiphertext][iv:12][ciphertext][tag:16]
 *
 * @param {object} parts
 * @param {Uint8Array} parts.kemCiphertext
 * @param {Uint8Array} parts.iv
 * @param {Uint8Array} parts.ciphertext
 * @param {Uint8Array} parts.tag
 * @param {{ version?: number, algId?: number }} [opts]
 * @returns {Buffer}
 */
export function packEncryptedPayload(
  { kemCiphertext, iv, ciphertext, tag },
  { version = PROTOCOL_VERSION, algId = ALG_ID_MLKEM768_AES256GCM } = {},
) {
  return Buffer.concat([
    Buffer.from([version, algId]),
    Buffer.from(kemCiphertext),
    Buffer.from(iv),
    Buffer.from(ciphertext),
    Buffer.from(tag),
  ]);
}

/**
 * Unpack the encrypted payload.
 * @param {Uint8Array} packed
 * @param {object} params
 * @param {number} params.kemCiphertextSize
 * @param {number} [params.expectedVersion]
 * @param {number} [params.expectedAlgId]
 * @returns {{ version: number, algId: number, kemCiphertext: Buffer, iv: Buffer, ciphertext: Buffer, tag: Buffer }}
 */
export function unpackEncryptedPayload(
  payload,
  {
    kemCiphertextSize,
    expectedVersion = PROTOCOL_VERSION,
    expectedAlgId = ALG_ID_MLKEM768_AES256GCM,
  },
) {
  const buf = Buffer.from(payload);
  if (buf.length < 2 + 12 + 16) throw new Error("payload too small");

  const version = buf[0];
  const algId = buf[1];
  if (version !== expectedVersion) {
    throw new Error(`unsupported payload version: ${version}`);
  }
  if (algId !== expectedAlgId) {
    throw new Error(`unsupported algId: ${algId}`);
  }

  const kemStart = 2;
  const kemEnd = kemStart + kemCiphertextSize;
  const ivStart = kemEnd;
  const ivEnd = ivStart + 12;
  const tagEnd = buf.length;
  const tagStart = tagEnd - 16;
  const ctStart = ivEnd;
  const ctEnd = tagStart;

  if (tagStart < ctStart) throw new Error("payload missing ciphertext/tag");

  return {
    version,
    algId,
    kemCiphertext: buf.subarray(kemStart, kemEnd),
    iv: buf.subarray(ivStart, ivEnd),
    ciphertext: buf.subarray(ctStart, ctEnd),
    tag: buf.subarray(tagStart, tagEnd),
  };
}

