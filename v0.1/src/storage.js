/**
 * Read encrypted payload from the EncryptedStorage contract.
 *
 * Replaces v0's events.js which scanned event logs (getLogs / cast).
 * In v1, retrieval is a simple view-function call against contract storage.
 *
 * @param {object} params
 * @param {any} params.contract - viem contract instance for EncryptedStorage
 * @param {`0x${string}`} params.slot - bytes32 storage slot (derived from passphrase + identifier)
 * @returns {Promise<{ payload: `0x${string}`, timestamp: bigint }>}
 */
export async function getEncryptedData({ contract, slot }) {
  const [payload, timestamp] = await contract.read.getEncrypted([
    slot,
  ]);

  if (!payload || payload === "0x") {
    throw new Error(
      `No data found for slot=${slot} on contract=${contract.address}`,
    );
  }

  return { payload, timestamp };
}
