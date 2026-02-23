import test from "node:test";
import assert from "node:assert/strict";

import { network } from "hardhat";
import { keccak256, toBytes, toHex } from "viem";

test("EncryptedStorage stores and retrieves data via getEncrypted()", async () => {
  const { viem } = await network.connect();

  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedStorage");

  const slot = keccak256(toBytes("my-secret-id"));
  const payload = toHex(new Uint8Array([1, 2, 3, 4])); // opaque bytes payload

  const txHash = await contract.write.storeEncrypted([slot, payload], {
    account,
  });

  const publicClient = await viem.getPublicClient();
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  void receipt;

  // Retrieve via view function (the core v1 improvement)
  const [storedData, timestamp] = await contract.read.getEncrypted([slot]);

  assert.equal(storedData, payload);
  assert.ok(typeof timestamp === "bigint");
  assert.ok(timestamp > 0n);
});

test("EncryptedStorage emits DataStored event on store", async () => {
  const { viem } = await network.connect();

  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedStorage");

  const slot = keccak256(toBytes("event-test"));
  const payload = toHex(new Uint8Array([10, 20, 30]));

  const txHash = await contract.write.storeEncrypted([slot, payload], {
    account,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  const { parseAbiItem } = await import("viem");
  const event = parseAbiItem(
    "event DataStored(address indexed user, bytes32 indexed slot, bytes payload, uint256 timestamp)",
  );

  const logs = await publicClient.getLogs({
    address: contract.address,
    event,
    args: { user: account, slot },
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].args.user.toLowerCase(), account.toLowerCase());
  assert.equal(logs[0].args.slot, slot);
  assert.equal(logs[0].args.payload, payload);
});

test("EncryptedStorage accepts an encrypted payload sized for ~10KB plaintext secrets", async () => {
  const { viem } = await network.connect();

  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedStorage");

  const slot = keccak256(toBytes("payload-10kb-secret"));

  // Budget for a self-contained hybrid payload:
  // - ML-KEM-768 ciphertext: ~1088 bytes
  // - AES-256-GCM overhead: 12-byte IV + 16-byte tag = 28 bytes
  // - AES ciphertext ~= plaintext size
  //
  // Target: ~10KB (10240 bytes) plaintext => payload ~1088 + 28 + 10240 = 11356 bytes.
  const payloadBytes = 1088 + 28 + 10_240;
  const payload = toHex(new Uint8Array(payloadBytes));

  await contract.write.storeEncrypted([slot, payload], {
    account,
  });

  // Retrieve via view function
  const [storedData] = await contract.read.getEncrypted([slot]);

  // Hex string length = 2 ("0x") + payloadBytes*2
  assert.equal(storedData.length, 2 + payloadBytes * 2);
});

test("EncryptedStorage rejects payloads larger than MAX_ENCRYPTED_DATA_BYTES", async () => {
  const { viem } = await network.connect();

  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedStorage");

  const max = await contract.read.MAX_ENCRYPTED_DATA_BYTES();
  const oversizedBytes = Number(max) + 1;

  const slot = keccak256(toBytes("payload-too-large"));
  const oversizedPayload = toHex(new Uint8Array(oversizedBytes));

  await assert.rejects(
    async () => {
      await contract.write.storeEncrypted([slot, oversizedPayload], { account });
    },
    (err) => {
      assert.match(String(err), /payload too large/i);
      return true;
    },
  );
});

test("EncryptedStorage overwrites previous entry for the same slot", async () => {
  const { viem } = await network.connect();

  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedStorage");

  const slot = keccak256(toBytes("overwrite-test"));
  const data1 = toHex(new Uint8Array([1, 2, 3]));
  const data2 = toHex(new Uint8Array([4, 5, 6, 7]));

  await contract.write.storeEncrypted([slot, data1], { account });

  const [stored1] = await contract.read.getEncrypted([slot]);
  assert.equal(stored1, data1);

  await contract.write.storeEncrypted([slot, data2], { account });

  const [stored2] = await contract.read.getEncrypted([slot]);
  assert.equal(stored2, data2);
});

test("EncryptedStorage returns empty bytes for non-existent entries", async () => {
  const { viem } = await network.connect();

  const [walletClient] = await viem.getWalletClients();
  const [account] = await walletClient.getAddresses();

  const contract = await viem.deployContract("EncryptedStorage");

  const slot = keccak256(toBytes("does-not-exist"));

  const [storedData, timestamp] = await contract.read.getEncrypted([slot]);

  assert.equal(storedData, "0x");
  assert.equal(timestamp, 0n);
});

test("EncryptedStorage: same slot from different accounts yields single entry (second overwrites)", async () => {
  const { viem } = await network.connect();

  const [walletClient] = await viem.getWalletClients();
  const addresses = await walletClient.getAddresses();
  const [account0, account1] = addresses;
  assert.ok(account0 && account1, "need at least two accounts");

  const contract = await viem.deployContract("EncryptedStorage");

  const slot = keccak256(toBytes("shared-slot"));
  const data1 = toHex(new Uint8Array([1, 1, 1]));
  const data2 = toHex(new Uint8Array([2, 2, 2]));

  await contract.write.storeEncrypted([slot, data1], { account: account0 });
  const [afterFirst] = await contract.read.getEncrypted([slot]);
  assert.equal(afterFirst, data1);

  await contract.write.storeEncrypted([slot, data2], { account: account1 });
  const [afterSecond] = await contract.read.getEncrypted([slot]);
  assert.equal(afterSecond, data2);
});
