/**
 * Minimal TradeDeals ABI the agent and dashboard rely on.
 * PROPOSED by lane B for the G0 freeze. Lane C replaces this with the ABI exported
 * from contracts/ (same names and types), and nothing else needs to change.
 *
 * Solidity shape:
 *   struct Verification { bytes32 dealId; bool weight; bool statusCode; bool documents; uint256 nonce; uint256 expiry; }
 *   event ShipmentDeclared(bytes32 indexed dealId, address indexed exporter, bool weight, bool statusCode, bool documents, string containerNo, string blRef);
 *   event VerificationApplied(bytes32 indexed dealId, bool matched, uint8 newState, uint256 exporterScoreBps);
 *   function submitVerification(Verification calldata v, bytes calldata signature) external;
 *   function verifier() external view returns (address);
 *   function dealState(bytes32 dealId) external view returns (uint8);
 *   States: 0 None 1 Created 2 Approved 3 Funding 4 Funded 5 Shipped 6 Released 7 Settled 8 Cancelled 9 Disputed 10 Expired 11 Defaulted
 */
export const DEAL_STATE = {
  None: 0, Created: 1, Approved: 2, Funding: 3, Funded: 4, Shipped: 5, Released: 6,
  Settled: 7, Cancelled: 8, Disputed: 9, Expired: 10, Defaulted: 11,
} as const;

const VerificationTuple = {
  type: "tuple",
  name: "v",
  components: [
    { name: "dealId", type: "bytes32" },
    { name: "weight", type: "bool" },
    { name: "statusCode", type: "bool" },
    { name: "documents", type: "bool" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

export const tradeDealsAgentAbi = [
  {
    type: "event",
    name: "ShipmentDeclared",
    inputs: [
      { name: "dealId", type: "bytes32", indexed: true },
      { name: "exporter", type: "address", indexed: true },
      { name: "weight", type: "bool", indexed: false },
      { name: "statusCode", type: "bool", indexed: false },
      { name: "documents", type: "bool", indexed: false },
      { name: "containerNo", type: "string", indexed: false },
      { name: "blRef", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "VerificationApplied",
    inputs: [
      { name: "dealId", type: "bytes32", indexed: true },
      { name: "matched", type: "bool", indexed: false },
      { name: "newState", type: "uint8", indexed: false },
      { name: "exporterScoreBps", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "submitVerification",
    stateMutability: "nonpayable",
    inputs: [VerificationTuple, { name: "signature", type: "bytes" }],
    outputs: [],
  },
  { type: "function", name: "verifier", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "dealState", stateMutability: "view", inputs: [{ name: "dealId", type: "bytes32" }], outputs: [{ type: "uint8" }] },
] as const;
