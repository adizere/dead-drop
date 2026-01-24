import test from "node:test";
import assert from "node:assert/strict";

import { network } from "hardhat";
import { keccak256, parseAbiItem, toBytes, toHex } from "viem";

test("EncryptedCalldataStorage emits DataStored(user, dataId, encryptedData, timestamp)", async () => {
  const { viem } = await network.connect();

  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedCalldataStorage");

  const dataId = keccak256(toBytes("my-secret-id"));
  const encryptedData = toHex(new Uint8Array([1, 2, 3, 4])); // opaque bytes payload

  const txHash = await contract.write.storeEncrypted([dataId, encryptedData], {
    account,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  const event = parseAbiItem(
    "event DataStored(address indexed user, bytes32 indexed dataId, bytes encryptedData, uint256 timestamp)",
  );

  const logs = await publicClient.getLogs({
    address: contract.address,
    event,
    args: { user: account, dataId },
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].args.user.toLowerCase(), account.toLowerCase());
  assert.equal(logs[0].args.dataId, dataId);
  assert.equal(logs[0].args.encryptedData, encryptedData);
  assert.ok(typeof logs[0].args.timestamp === "bigint");
  assert.ok(logs[0].args.timestamp > 0n);
});

test("EncryptedCalldataStorage accepts an encrypted payload sized for ~10KB plaintext secrets", async () => {
  const { viem } = await network.connect();

  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedCalldataStorage");

  const dataId = keccak256(toBytes("payload-10kb-secret"));

  // Budget for a self-contained hybrid payload:
  // - ML-KEM-768 ciphertext: ~1088 bytes
  // - AES-256-GCM overhead: 12-byte IV + 16-byte tag = 28 bytes
  // - AES ciphertext ~= plaintext size
  //
  // Target: ~10KB (10240 bytes) plaintext ⇒ payload ~1088 + 28 + 10240 = 11356 bytes.
  const payloadBytes = 1088 + 28 + 10_240;
  const encryptedPayload = toHex(new Uint8Array(payloadBytes));

  const txHash = await contract.write.storeEncrypted([dataId, encryptedPayload], {
    account,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  const event = parseAbiItem(
    "event DataStored(address indexed user, bytes32 indexed dataId, bytes encryptedData, uint256 timestamp)",
  );

  const logs = await publicClient.getLogs({
    address: contract.address,
    event,
    args: { user: account, dataId },
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
  });

  assert.equal(logs.length, 1);

  // Hex string length = 2 ("0x") + payloadBytes*2
  assert.equal(logs[0].args.encryptedData.length, 2 + payloadBytes * 2);
});

test("EncryptedCalldataStorage rejects payloads larger than MAX_ENCRYPTED_DATA_BYTES", async () => {
  const { viem } = await network.connect();

  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedCalldataStorage");

  const max = await contract.read.MAX_ENCRYPTED_DATA_BYTES();
  const oversizedBytes = Number(max) + 1;

  const dataId = keccak256(toBytes("payload-too-large"));
  const oversizedPayload = toHex(new Uint8Array(oversizedBytes));

  await assert.rejects(
    async () => {
      await contract.write.storeEncrypted([dataId, oversizedPayload], { account });
    },
    (err) => {
      assert.match(String(err), /encryptedData too large/i);
      return true;
    },
  );
});
