import fs from "node:fs";
import path from "node:path";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Default keys file path.
 *
 * Uses a single shared key file (`keys/default.key.json`) rather than
 * per-identifier paths.  This allows the same keypair to be reused
 * across many secrets.
 *
 * @param {string} [cwd]
 */
export function defaultKeysPath(cwd = process.cwd()) {
  return path.join(cwd, "keys", "default.key.json");
}

/**
 * Read and validate a keys JSON file.
 * @param {string} keysPath
 * @returns {{ version?: number, algorithm?: string, dataId?: string, publicKey?: string, privateKey: string }}
 */
export function readKeysFile(keysPath) {
  const keyJson = JSON.parse(fs.readFileSync(keysPath, "utf8"));
  const privateKeyHex = keyJson.privateKey;
  if (typeof privateKeyHex !== "string" || !privateKeyHex.startsWith("0x")) {
    throw new Error(`Invalid keys file: missing "privateKey" hex in ${keysPath}`);
  }
  return keyJson;
}

/**
 * Write keys JSON file (contains private key; keep secret).
 *
 * The key file is decoupled from any specific secret identifier -- the same
 * keypair is reused across many secrets.
 *
 * @param {object} params
 * @param {string} params.keysPath
 * @param {string} params.publicKey
 * @param {string} params.privateKey
 * @param {string} [params.algorithm]
 */
export function writeKeysFile({
  keysPath,
  publicKey,
  privateKey,
  algorithm = "ml-kem-768+aes-256-gcm",
}) {
  ensureDir(path.dirname(keysPath));
  fs.writeFileSync(
    keysPath,
    JSON.stringify(
      {
        version: 1,
        algorithm,
        created: new Date().toISOString(),
        publicKey,
        privateKey,
        note: "KEEP THIS FILE SECRET. It contains the private key needed to decrypt.",
      },
      null,
      2,
    ),
    "utf8",
  );
  return keysPath;
}

