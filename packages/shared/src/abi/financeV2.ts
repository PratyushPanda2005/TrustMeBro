// Generated from deployed V2 package ABI; do not hand-edit.
export const financeV2Abi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "address",
        name: "admin",
        type: "address",
      },
      {
        internalType: "address",
        name: "company",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "AccessControlBadConfirmation",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "neededRole",
        type: "bytes32",
      },
    ],
    name: "AccessControlUnauthorizedAccount",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidShortString",
    type: "error",
  },
  {
    inputs: [],
    name: "ReentrancyGuardReentrantCall",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
    ],
    name: "SafeERC20FailedOperation",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "str",
        type: "string",
      },
    ],
    name: "StringTooLong",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "signer",
        type: "address",
      },
    ],
    name: "AgreementConfirmed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "DefaultRecorded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [],
    name: "EIP712DomainChanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "investor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "advance",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "profit",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "investorEntitlement",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "exporterRemainder",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "fee",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "dueAt",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "feeTreasury",
        type: "address",
      },
    ],
    name: "Funded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "previousAdminRole",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "newAdminRole",
        type: "bytes32",
      },
    ],
    name: "RoleAdminChanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
    ],
    name: "RoleGranted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
    ],
    name: "RoleRevoked",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "holder",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "investor",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "exporter",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "fee",
        type: "uint256",
      },
    ],
    name: "Settled",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "verifier",
        type: "address",
      },
      {
        indexed: false,
        internalType: "string",
        name: "mode",
        type: "string",
      },
      {
        indexed: false,
        internalType: "enum TradePilotFinance.Verification",
        name: "result",
        type: "uint8",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "reportHash",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "documentHash",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "quantity",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "enum TradePilotFinance.Stage",
        name: "stage",
        type: "uint8",
      },
    ],
    name: "ShipmentChecked",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "exporter",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "importer",
        type: "address",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "termsHash",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "face",
        type: "uint256",
      },
    ],
    name: "TradeCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previous",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "current",
        type: "address",
      },
    ],
    name: "TreasuryChanged",
    type: "event",
  },
  {
    inputs: [],
    name: "AGREEMENT_TYPEHASH",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "ATTESTATION_TYPEHASH",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "DEFAULT_ADMIN_ROLE",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "EXPORTER_ROLE",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "FINANCING_TERM",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "GRACE_PERIOD",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "IMPORTER_ROLE",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "INVESTOR_ROLE",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "VERIFIER_ROLE",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "adminCount",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "agreementDigest",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "tradeId",
            type: "uint256",
          },
          {
            internalType: "bytes32",
            name: "termsHash",
            type: "bytes32",
          },
          {
            internalType: "bytes32",
            name: "documentHash",
            type: "bytes32",
          },
          {
            internalType: "uint256",
            name: "quantity",
            type: "uint256",
          },
          {
            internalType: "enum TradePilotFinance.Stage",
            name: "stage",
            type: "uint8",
          },
          {
            internalType: "bytes32",
            name: "reportHash",
            type: "bytes32",
          },
          {
            internalType: "uint256",
            name: "nonce",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "timestamp",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "expiry",
            type: "uint256",
          },
        ],
        internalType: "struct TradePilotFinance.Attestation",
        name: "a",
        type: "tuple",
      },
    ],
    name: "attestationDigest",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "attestationUsed",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "confirmAgreement",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "bytes",
        name: "signature",
        type: "bytes",
      },
    ],
    name: "confirmAgreementBySignature",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "importer",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "face",
            type: "uint256",
          },
          {
            internalType: "bytes32",
            name: "invoiceHash",
            type: "bytes32",
          },
          {
            internalType: "bytes32",
            name: "documentHash",
            type: "bytes32",
          },
          {
            internalType: "bytes32",
            name: "commercialHash",
            type: "bytes32",
          },
          {
            internalType: "bytes32",
            name: "categoryHash",
            type: "bytes32",
          },
          {
            internalType: "bytes32",
            name: "shipmentReference",
            type: "bytes32",
          },
          {
            internalType: "uint256",
            name: "quantity",
            type: "uint256",
          },
          {
            internalType: "enum TradePilotFinance.Stage",
            name: "minimumStage",
            type: "uint8",
          },
          {
            internalType: "uint256",
            name: "expiry",
            type: "uint256",
          },
        ],
        internalType: "struct TradePilotFinance.Terms",
        name: "t",
        type: "tuple",
      },
    ],
    name: "createTrade",
    outputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "eip712Domain",
    outputs: [
      {
        internalType: "bytes1",
        name: "fields",
        type: "bytes1",
      },
      {
        internalType: "string",
        name: "name",
        type: "string",
      },
      {
        internalType: "string",
        name: "version",
        type: "string",
      },
      {
        internalType: "uint256",
        name: "chainId",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "verifyingContract",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "salt",
        type: "bytes32",
      },
      {
        internalType: "uint256[]",
        name: "extensions",
        type: "uint256[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "who",
        type: "address",
      },
    ],
    name: "eligibleHolder",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "bytes32",
        name: "expectedQuoteHash",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "expectedTreasury",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "fund",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "getDeal",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "exporter",
            type: "address",
          },
          {
            components: [
              {
                internalType: "address",
                name: "importer",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "face",
                type: "uint256",
              },
              {
                internalType: "bytes32",
                name: "invoiceHash",
                type: "bytes32",
              },
              {
                internalType: "bytes32",
                name: "documentHash",
                type: "bytes32",
              },
              {
                internalType: "bytes32",
                name: "commercialHash",
                type: "bytes32",
              },
              {
                internalType: "bytes32",
                name: "categoryHash",
                type: "bytes32",
              },
              {
                internalType: "bytes32",
                name: "shipmentReference",
                type: "bytes32",
              },
              {
                internalType: "uint256",
                name: "quantity",
                type: "uint256",
              },
              {
                internalType: "enum TradePilotFinance.Stage",
                name: "minimumStage",
                type: "uint8",
              },
              {
                internalType: "uint256",
                name: "expiry",
                type: "uint256",
              },
            ],
            internalType: "struct TradePilotFinance.Terms",
            name: "terms",
            type: "tuple",
          },
          {
            internalType: "bytes32",
            name: "termsHash",
            type: "bytes32",
          },
          {
            internalType: "uint256",
            name: "createdAt",
            type: "uint256",
          },
          {
            internalType: "bool",
            name: "importerApproved",
            type: "bool",
          },
          {
            internalType: "enum TradePilotFinance.State",
            name: "state",
            type: "uint8",
          },
          {
            internalType: "enum TradePilotFinance.Verification",
            name: "verification",
            type: "uint8",
          },
          {
            internalType: "uint256",
            name: "fundedAt",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "dueAt",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "feeTreasury",
            type: "address",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "score",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "advance",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "profit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "investor",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "fee",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "exporter",
                type: "uint256",
              },
            ],
            internalType: "struct TradeMath.Quote",
            name: "financial",
            type: "tuple",
          },
        ],
        internalType: "struct TradePilotFinance.Deal",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
    ],
    name: "getRoleAdmin",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "grantRole",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "hasRole",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    name: "invoiceUsed",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "markDefault",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "nextId",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "note",
    outputs: [
      {
        internalType: "contract ReceivableNote",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "paymentToken",
    outputs: [
      {
        internalType: "contract IERC20",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "quote",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "score",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "advance",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "profit",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "investor",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "fee",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "exporter",
            type: "uint256",
          },
        ],
        internalType: "struct TradeMath.Quote",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "rejectTrade",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "callerConfirmation",
        type: "address",
      },
    ],
    name: "renounceRole",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "repay",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "reputation",
    outputs: [
      {
        internalType: "contract ImporterReputation",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "revokeRole",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "who",
        type: "address",
      },
    ],
    name: "setTreasury",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes4",
        name: "interfaceId",
        type: "bytes4",
      },
    ],
    name: "supportsInterface",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "tokenDecimals",
    outputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "treasury",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "unit",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "tradeId",
            type: "uint256",
          },
          {
            internalType: "bytes32",
            name: "termsHash",
            type: "bytes32",
          },
          {
            internalType: "bytes32",
            name: "documentHash",
            type: "bytes32",
          },
          {
            internalType: "uint256",
            name: "quantity",
            type: "uint256",
          },
          {
            internalType: "enum TradePilotFinance.Stage",
            name: "stage",
            type: "uint8",
          },
          {
            internalType: "bytes32",
            name: "reportHash",
            type: "bytes32",
          },
          {
            internalType: "uint256",
            name: "nonce",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "timestamp",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "expiry",
            type: "uint256",
          },
        ],
        internalType: "struct TradePilotFinance.Attestation",
        name: "a",
        type: "tuple",
      },
      {
        internalType: "address",
        name: "signer",
        type: "address",
      },
      {
        internalType: "bytes",
        name: "signature",
        type: "bytes",
      },
    ],
    name: "verifyAttestation",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
      {
        internalType: "bytes32",
        name: "documentHash",
        type: "bytes32",
      },
      {
        internalType: "uint256",
        name: "quantity",
        type: "uint256",
      },
      {
        internalType: "enum TradePilotFinance.Stage",
        name: "stage",
        type: "uint8",
      },
      {
        internalType: "bytes32",
        name: "reportHash",
        type: "bytes32",
      },
    ],
    name: "verifyManual",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
