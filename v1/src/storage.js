/**
 * Read encrypted data from the EncryptedStorage contract.
 *
 * Replaces v0's events.js which scanned event logs (getLogs / cast).
 * In v1, retrieval is a simple view-function call against contract storage.
 *
 * @param {object} params
 * @param {any} params.contract - viem contract instance for EncryptedStorage
 * @param {`0x${string}`} params.dataId - bytes32 data identifier
 * @param {`0x${string}`} params.user - address that stored the data
 * @returns {Promise<{ encryptedData: `0x${string}`, timestamp: bigint }>}
 */
export async function getEncryptedData({ contract, dataId, user }) {
  const [encryptedData, timestamp] = await contract.read.getEncrypted([
    dataId,
    user,
  ]);

  if (!encryptedData || encryptedData === "0x") {
    throw new Error(
      `No data found for dataId=${dataId} user=${user} on contract=${contract.address}`,
    );
  }

  return { encryptedData, timestamp };
}
