import PQCleanMod from "pqclean";
import { hexToBytes } from "viem";

export const PQClean = PQCleanMod?.default ?? PQCleanMod;

export const ML_KEM_768 = "ml-kem-768";

/**
 * Return the KEM ciphertext size (encapsulated key size) for a given algorithm.
 * @param {string} [name]
 */
export function getKemCiphertextSize(name = ML_KEM_768) {
  const alg = PQClean.kem.supportedAlgorithms.find((a) => a.name === name);
  if (!alg) throw new Error(`pqclean must support ${name}`);
  return alg.encryptedKeySize;
}

/**
 * Import a pqclean ML-KEM private key from hex.
 * @param {string} privateKeyHex
 * @param {string} [name]
 */
export function importKemPrivateKey(privateKeyHex, name = ML_KEM_768) {
  return new PQClean.kem.PrivateKey(name, hexToBytes(privateKeyHex));
}

