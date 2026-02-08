import { execFileSync } from "node:child_process";

import { decodeAbiParameters, parseAbiItem } from "viem";

export const DATA_STORED_EVENT = parseAbiItem(
  "event DataStored(address indexed user, bytes32 indexed dataId, bytes encryptedData, uint256 timestamp)",
);

const DATA_STORED_SIG =
  "DataStored(address indexed user, bytes32 indexed dataId, bytes encryptedData, uint256 timestamp)";

/** When caller passes 0..latest, use this range for cast so RPC 10k limit is not hit. Override via --fromBlock/--toBlock for other stores. */
const CAST_FROM_BLOCK = 25831945n;
const CAST_TO_BLOCK = 25841099n;

/**
 * Fetch DataStored logs via cast and return the latest match.
 * Used when publicClient.getLogs hits RPC limits (e.g. HTTP 413).
 *
 * @param {object} params
 * @param {`0x${string}`} params.contractAddress
 * @param {`0x${string}`} params.dataId
 * @param {`0x${string}` | undefined} [params.user]
 * @param {bigint} [params.fromBlock]
 * @param {bigint | "latest"} [params.toBlock]
 * @param {string} params.rpcUrl
 * @returns {Promise<{ encryptedData: `0x${string}`, log: any }>}
 */
async function getLatestDataStoredViaCast({
  contractAddress,
  dataId,
  user,
  fromBlock = 0n,
  toBlock = "latest",
  rpcUrl,
}) {
  // Task passes 0 and "latest" by default; RPC limits eth_getLogs to 10k blocks. Use hardcoded range so cast gets a small request.
  const from = fromBlock === 0n && toBlock === "latest" ? CAST_FROM_BLOCK : fromBlock;
  const to = fromBlock === 0n && toBlock === "latest" ? CAST_TO_BLOCK : toBlock;
  const toArg = to === "latest" ? "latest" : String(to);

  // Use execFileSync with an array so the event signature is one argument; a shell would treat ( ) as syntax.
  const args = [
    "logs",
    DATA_STORED_SIG,
    "--address",
    contractAddress,
    "--from-block",
    String(from),
    "--to-block",
    toArg,
    "--rpc-url",
    rpcUrl,
    "--json",
  ];

  const raw = execFileSync("cast", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const parsed = JSON.parse(raw);
  /** @type {Array<{ address: string, topics: string[], data: string, blockNumber: string, transactionHash: string }>} */
  const logs = Array.isArray(parsed) ? parsed : [parsed];

  const dataIdNorm = dataId.toLowerCase();
  const matches = logs.filter((log) => {
    if (log.topics && log.topics[2]?.toLowerCase() !== dataIdNorm) return false;
    if (user && log.topics?.[1]) {
      const topic1 = log.topics[1].toLowerCase();
      const userPadded = user.toLowerCase().replace(/^0x/, "").padStart(64, "0");
      if (topic1 !== `0x${userPadded}`) return false;
    }
    return true;
  });

  if (matches.length === 0) {
    throw new Error(
      `No DataStored events found for contract=${contractAddress} dataId=${dataId}${user ? ` user=${user}` : ""}`,
    );
  }

  const sorted = matches.sort(
    (a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)),
  );
  const log = sorted[0];
  const [encryptedData] = decodeAbiParameters(
    [{ type: "bytes" }, { type: "uint256" }],
    log.data,
  );
  return { encryptedData: /** @type {`0x${string}`} */ (encryptedData), log };
}

/**
 * Fetch DataStored logs and return the latest match.
 * When rpcUrl is provided, uses cast instead of publicClient (avoids RPC 413 on some providers).
 *
 * @param {object} params
 * @param {any} [params.publicClient]
 * @param {`0x${string}`} params.contractAddress
 * @param {`0x${string}`} params.dataId
 * @param {`0x${string}` | undefined} [params.user]
 * @param {bigint} [params.fromBlock]
 * @param {bigint | "latest"} [params.toBlock]
 * @param {string} [params.rpcUrl] - When set, fetch via cast instead of publicClient (requires cast on PATH).
 * @returns {Promise<{ encryptedData: `0x${string}`, log: any }>}
 */
export async function getLatestDataStored({
  publicClient,
  contractAddress,
  dataId,
  user,
  fromBlock = 0n,
  toBlock = "latest",
  rpcUrl,
}) {
  if (rpcUrl) {
    return getLatestDataStoredViaCast({
      contractAddress,
      dataId,
      user,
      fromBlock,
      toBlock,
      rpcUrl,
    });
  }

  const args = user ? { user, dataId } : { dataId };

  const logs = await publicClient.getLogs({
    address: contractAddress,
    event: DATA_STORED_EVENT,
    args,
    fromBlock,
    toBlock,
  });

  if (logs.length === 0) {
    throw new Error(
      `No DataStored events found for contract=${contractAddress} dataId=${dataId}${user ? ` user=${user}` : ""}`,
    );
  }

  const log = logs[logs.length - 1];
  return { encryptedData: log.args.encryptedData, log };
}
