import fs from "node:fs";

import PQCleanMod from "pqclean";
import { hexToBytes, keccak256, parseAbiItem, toBytes } from "viem";

import { aes256GcmDecrypt, deriveAes256KeyFromKemSecret } from "../../src/crypto.js";

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
  if (!alg) throw new Error("pqclean must support ml-kem-768");
  return alg.encryptedKeySize;
}

function buildAad(dataIdHex) {
  return Buffer.concat([
    Buffer.from([VERSION, ALG_ID]),
    Buffer.from(hexToBytes(dataIdHex)),
  ]);
}

function unpackPayload(packedBytes) {
  const buf = Buffer.from(packedBytes);
  if (buf.length < 2 + 12 + 16) throw new Error("payload too small");

  const version = buf[0];
  const algId = buf[1];
  if (version !== VERSION) throw new Error(`unsupported payload version: ${version}`);
  if (algId !== ALG_ID) throw new Error(`unsupported algId: ${algId}`);

  const kemCtSize = getMlKem768CiphertextSize();
  const kemStart = 2;
  const kemEnd = kemStart + kemCtSize;
  const ivStart = kemEnd;
  const ivEnd = ivStart + 12;
  const tagEnd = buf.length;
  const tagStart = tagEnd - 16;
  const ctStart = ivEnd;
  const ctEnd = tagStart;

  if (tagStart < ctStart) throw new Error("payload missing ciphertext/tag");

  return {
    kemCiphertext: buf.subarray(kemStart, kemEnd),
    iv: buf.subarray(ivStart, ivEnd),
    ciphertext: buf.subarray(ctStart, ctEnd),
    tag: buf.subarray(tagStart, tagEnd),
  };
}

/**
 * Hardhat task action: retrieve and decrypt.
 *
 * Returns decrypted bytes (Buffer) for programmatic usage.
 *
 * @param {{ id?: string, dataId?: string, contract: string, keys?: string, user?: string, out?: string, format?: string, fromBlock?: string }} args
 * @param {import("hardhat/types").HardhatRuntimeEnvironment} hre
 */
export default async function retrieveAndDecryptAction(args, hre) {
  const { id, dataId: dataIdArg, contract, keys, user, out, format = "utf8", fromBlock } = args;

  if (!contract) throw new Error("Missing required option: --contract");
  if (!id && !dataIdArg) throw new Error("Provide --id or --dataId");

  const dataId = dataIdArg ?? keccak256(toBytes(id));

  const keysPath = keys ?? (id ? `keys/${id}.key.json` : undefined);
  if (!keysPath) throw new Error("Missing keys: provide --keys (or use --id with default keys/<id>.key.json)");

  const keyJson = JSON.parse(fs.readFileSync(keysPath, "utf8"));
  const privateKeyHex = keyJson.privateKey;
  if (typeof privateKeyHex !== "string" || !privateKeyHex.startsWith("0x")) {
    throw new Error(`Invalid keys file: missing "privateKey" hex in ${keysPath}`);
  }

  // In Hardhat's in-process network (used by node:test), multiple calls to `network.connect()`
  // may yield isolated connections. Allow tests (and advanced callers) to inject a shared
  // connection to ensure we query the same chain state.
  const connection = hre.__sharedSecretConnection ?? (await hre.network.connect());
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();
  const filterUser = user ?? account;

  const storage = await viem.getContractAt("EncryptedCalldataStorage", contract);

  const from = fromBlock ? BigInt(fromBlock) : 0n;

  let logs = await publicClient.getLogs({
    address: storage.address,
    event: dataStoredEvent,
    args: { user: filterUser, dataId },
    fromBlock: from,
    toBlock: "latest",
  });

  // If the default user filter doesn't match (e.g., different account contexts), retry by dataId only.
  if (logs.length === 0 && user === undefined) {
    logs = await publicClient.getLogs({
      address: storage.address,
      event: dataStoredEvent,
      args: { dataId },
      fromBlock: from,
      toBlock: "latest",
    });
  }

  if (logs.length === 0) {
    throw new Error(`No DataStored events found for user=${filterUser} dataId=${dataId}`);
  }

  // Take the latest matching event.
  const encryptedDataHex = logs[logs.length - 1].args.encryptedData;
  const packed = Buffer.from(hexToBytes(encryptedDataHex));

  const parsed = unpackPayload(packed);
  const privateKey = new PQClean.kem.PrivateKey("ml-kem-768", hexToBytes(privateKeyHex));

  const recoveredSecret = await privateKey.decryptKey(parsed.kemCiphertext);
  const aesKey = deriveAes256KeyFromKemSecret(recoveredSecret, { salt: SALT, info: INFO });
  const aad = buildAad(dataId);

  const plaintext = aes256GcmDecrypt(aesKey, parsed.iv, parsed.ciphertext, parsed.tag, { aad });

  if (out) {
    fs.writeFileSync(out, plaintext);
    console.log(`Wrote plaintext to: ${out}`);
  } else if (format === "hex") {
    console.log(plaintext.toString("hex"));
  } else if (format === "utf8") {
    console.log(plaintext.toString("utf8"));
  } else {
    throw new Error(`Unsupported --format: ${format} (use utf8|hex or --out)`);
  }

  return plaintext;
}

