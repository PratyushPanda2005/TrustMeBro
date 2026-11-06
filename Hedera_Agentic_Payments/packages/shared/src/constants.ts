/** Network constants (sources: docs/plans/TMB-00-master-plan.md §8). */
export const WHITECHAIN_CHAIN_ID = 1874 as const; // Whitechain Sepolia (0x752)
/** Lane C's local stand-in: anvil (`npm run local` in services/verifier). Test keys only. */
export const LOCAL_ANVIL_CHAIN_ID = 31337 as const;
export const WHITECHAIN_RPC = "https://rpc.testnet.whitechain.io";
export const WHITECHAIN_WS = "wss://rpc.testnet.whitechain.io/ws";
export const WHITECHAIN_EXPLORER = "https://explorer.testnet.whitechain.io";
/** Sponsor test USDT required by the Whitechain track (constructor param in contracts). */
export const SPONSOR_USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7" as const;

export const HEDERA_NETWORK = "hedera:testnet" as const;
export const HEDERA_USDC_TESTNET = "0.0.429274" as const; // 6 decimals
export const HEDERA_USDC_DECIMALS = 6;
export const HEDERA_MIRROR = "https://testnet.mirrornode.hedera.com";
export const HASHSCAN = "https://hashscan.io/testnet";

export const VERIFY_PRICE = "$0.30" as const; // 300000 atomic USDC

export const hashscanTx = (txId: string) => `${HASHSCAN}/transaction/${txId}`;
export const hashscanTopic = (topicId: string) => `${HASHSCAN}/topic/${topicId}`;
export const whitechainTx = (hash: string) => `${WHITECHAIN_EXPLORER}/tx/${hash}`;
export const whitechainAddress = (addr: string) => `${WHITECHAIN_EXPLORER}/address/${addr}`;
