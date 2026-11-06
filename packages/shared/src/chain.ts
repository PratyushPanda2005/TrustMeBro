// Whitechain Sepolia, shaped like a viem Chain (usable with defineChain / wagmi).

export const WHITECHAIN_TESTNET_ID = 1874

export const whitechainTestnet = {
  id: WHITECHAIN_TESTNET_ID,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WhiteBIT Coin", symbol: "WBT", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.whitechain.io"],
      webSocket: ["wss://rpc.testnet.whitechain.io/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Whitechain Explorer",
      url: "https://explorer.testnet.whitechain.io",
      apiUrl: "https://explorer.testnet.whitechain.io/api",
    },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: true,
} as const

const explorer = whitechainTestnet.blockExplorers.default.url

export const explorerTxUrl = (hash: string) => `${explorer}/tx/${hash}`
export const explorerAddressUrl = (address: string) => `${explorer}/address/${address}`
export const explorerTokenUrl = (token: string, tokenId?: bigint | number) =>
  tokenId === undefined ? `${explorer}/token/${token}` : `${explorer}/token/${token}/instance/${tokenId}`
