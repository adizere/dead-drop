import fs from "node:fs";

import { createPublicClient, getContract, hexToBytes, http } from "viem";
import { MlKem768 } from "mlkem";

import { aes256GcmDecrypt, deriveAes256KeyFromKemSecret } from "../../src/crypto.js";
import { getEncryptedData } from "../../src/storage.js";
import {
  HKDF_INFO,
  HKDF_SALT,
  buildAad,
  computeSlot,
  deriveKemSeedBytes,
  deriveKeyIdBytes,
  deriveMasterKeyBytes,
  normalizeIdentifier,
  unpackEncryptedPayload,
} from "../../src/protocol.js";
import { getKemCiphertextSize } from "../../src/pqclean.js";

/**
 * Hardhat task action: retrieve and decrypt.
 *
 * Returns decrypted bytes (Buffer) for programmatic usage.
 * Retrieval uses only the slot (no wallet or user address required).
 * On HTTP networks we use a public client only, so no keystore/password is needed.
 *
 * @param {{ id?: string, slot?: string, contract: string, passphrase?: string, out?: string, format?: string }} args
 * @param {import("hardhat/types").HardhatRuntimeEnvironment} hre
 */
export default async function retrieveAndDecryptAction(args, hre) {
  const {
    id,
    slot: slotArg,
    contract,
    passphrase,
    out,
    format = "utf8",
    rpcUrl,
    chainId: chainIdArg,
  } = args;

  if (!contract) throw new Error("Missing required option: --contract");
  if (!id) throw new Error("Missing required option: --id");
  if (!passphrase) throw new Error("Missing required option: --passphrase");

  const normalizedId = normalizeIdentifier(id);
  const masterKeyBytes = passphrase ? deriveMasterKeyBytes(passphrase) : null;
  const keyIdBytes = masterKeyBytes ? deriveKeyIdBytes(masterKeyBytes) : null;
  const slot = slotArg ?? computeSlot(keyIdBytes, normalizedId);

  let storage;

  if (hre.__sharedConnection) {
    // Tests inject a shared connection to query the same chain state.
    const { viem } = hre.__sharedConnection;
    storage = await viem.getContractAt("EncryptedStorage", contract);
  } else if (rpcUrl) {
    // Standalone: public client from --rpc-url (and --chain-id). No Hardhat network, no wallet/keystore.
    const chainId = Number(chainIdArg) || 5042002;
    const chain = {
      id: chainId,
      name: "custom",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    };
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
    const artifact = await hre.artifacts.readArtifact("EncryptedStorage");
    storage = getContract({
      address: contract,
      abi: artifact.abi,
      client: publicClient,
    });
  } else {
    const netName = hre.network.name;
    const netConfig = hre.config.networks?.[netName];

    if (netConfig?.type === "http" && netConfig?.url) {
      const chain = {
        id: netConfig.chainId ?? 0,
        name: netName,
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [netConfig.url] } },
      };
      const publicClient = createPublicClient({
        chain,
        transport: http(netConfig.url),
      });
      const artifact = await hre.artifacts.readArtifact("EncryptedStorage");
      storage = getContract({
        address: contract,
        abi: artifact.abi,
        client: publicClient,
      });
    } else {
      const { viem } = await hre.network.connect();
      storage = await viem.getContractAt("EncryptedStorage", contract);
    }
  }

  const { payload } = await getEncryptedData({
    contract: storage,
    slot,
  });

  const payloadBytes = Buffer.from(hexToBytes(payload));

  const kemCiphertextSize = getKemCiphertextSize("ml-kem-768");
  const parsed = unpackEncryptedPayload(payloadBytes, { kemCiphertextSize });
  const kem = new MlKem768();
  const seed = deriveKemSeedBytes(masterKeyBytes, normalizedId);
  const [, privateKey] = await kem.deriveKeyPair(seed);
  const recoveredSecret = await kem.decap(parsed.kemCiphertext, privateKey);
  const aesKey = deriveAes256KeyFromKemSecret(recoveredSecret, { salt: HKDF_SALT, info: HKDF_INFO });
  const aad = buildAad(slot);

  const messageBytes = aes256GcmDecrypt(aesKey, parsed.iv, parsed.ciphertext, parsed.tag, { aad });

  if (out) {
    fs.writeFileSync(out, messageBytes);
    console.log(`Wrote plaintext to: ${out}`);
  } else if (format === "hex") {
    console.log(messageBytes.toString("hex"));
  } else if (format === "utf8") {
    console.log(messageBytes.toString("utf8"));
  } else {
    throw new Error(`Unsupported --format: ${format} (use utf8|hex or --out)`);
  }

  return messageBytes;
}
