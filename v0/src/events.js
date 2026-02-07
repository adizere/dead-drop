import { parseAbiItem } from "viem";

export const DATA_STORED_EVENT = parseAbiItem(
  "event DataStored(address indexed user, bytes32 indexed dataId, bytes encryptedData, uint256 timestamp)",
);

/**
 * Fetch DataStored logs and return the latest match.
 *
 * @param {object} params
 * @param {any} params.publicClient
 * @param {`0x${string}`} params.contractAddress
 * @param {`0x${string}`} params.dataId
 * @param {`0x${string}` | undefined} [params.user]
 * @param {bigint} [params.fromBlock]
 * @returns {Promise<{ encryptedData: `0x${string}`, log: any }>}
 */
export async function getLatestDataStored({
  publicClient,
  contractAddress,
  dataId,
  user,
  fromBlock = 0n,
}) {
  const args = user ? { user, dataId } : { dataId };

  const logs = await publicClient.getLogs({
    address: contractAddress,
    event: DATA_STORED_EVENT,
    args,
    fromBlock,
    toBlock: "latest",
  });

  if (logs.length === 0) {
    throw new Error(
      `No DataStored events found for contract=${contractAddress} dataId=${dataId}${user ? ` user=${user}` : ""}`,
    );
  }

  const log = logs[logs.length - 1];
  return { encryptedData: log.args.encryptedData, log };
}

