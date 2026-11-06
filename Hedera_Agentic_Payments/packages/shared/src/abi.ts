/**
 * TradeDeals ABI subset the agent and dashboard use, extracted from lane C's generated ABI
 * (branch asish @ 1d82271, packages/shared/src/abi/tradeDeals.ts, made by contracts/script/export.mjs).
 * Plan v5 §7. Do not edit by hand: re-extract when lane C changes the contract.
 */

/** ITradeDeals.State */
export const DEAL_STATE = {
  None: 0, Created: 1, Approved: 2, Claimed: 3, Pending: 4, Verified: 5, Funded: 6,
  Settled: 7, Rejected: 8, Mismatch: 9, Defaulted: 10, Expired: 11, Cancelled: 12,
} as const;

/** ITradeDeals.Outcome, returned by submitVerification */
export const OUTCOME = { Verified: 0, Pending: 1, Falsified: 2, Mismatch: 3 } as const;

export const tradeDealsAgentAbi = [
  {
    "type": "function",
    "name": "getDeal",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct ITradeDeals.Deal",
        "components": [
          {
            "name": "exporter",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "createdAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "state",
            "type": "uint8",
            "internalType": "enum ITradeDeals.State"
          },
          {
            "name": "claimedStatus",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "checks",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "falsifiedMask",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "importer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "dueDate",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "declaredKg",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "amount",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "paid",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "invoiceHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "termsHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "docHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "observedDocHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "claimTime",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "verifyDeadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "observedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "verifiedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "observedKg",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "observedStatus",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "verifyWindow",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "listingWindow",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "graceWindow",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "advanceBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "yieldBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "fundedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "investor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "closedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "advance",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "fee",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "investorDue",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "paidToInvestor",
            "type": "uint128",
            "internalType": "uint128"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getShipment",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct ITradeDeals.Shipment",
        "components": [
          {
            "name": "containerNo",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "blRef",
            "type": "string",
            "internalType": "string"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hashVerification",
    "inputs": [
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct ITradeDeals.Verification",
        "components": [
          {
            "name": "dealId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "observedKg",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "statusCode",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "docHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "observedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "expiry",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nonceUsed",
    "inputs": [
      {
        "name": "nonce",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "submitVerification",
    "inputs": [
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct ITradeDeals.Verification",
        "components": [
          {
            "name": "dealId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "observedKg",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "statusCode",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "docHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "observedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "expiry",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "signature",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "outcome",
        "type": "uint8",
        "internalType": "enum ITradeDeals.Outcome"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "verifier",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "Claimed",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "exporter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "declaredKg",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "claimedStatus",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "docHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "containerNo",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "blRef",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "verifyDeadline",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Mismatch",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "declaredKg",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "observedKg",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Pending",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "checks",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "observedStatus",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "claimedStatus",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "verifyDeadline",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Rejected",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "exporter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "falsifiedMask",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "penalty",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "exporterScoreBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VerificationSubmitted",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "submitter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "nonce",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "sigHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "outcome",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum ITradeDeals.Outcome"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Verified",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "observedKg",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "statusCode",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "docHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "observedAt",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "listingDeadline",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AccessControlBadConfirmation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AccessControlUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "neededRole",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "AdvanceTooSmall",
    "inputs": [
      {
        "name": "advance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "fee",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "AlreadyKyced",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "CreditLimitExceeded",
    "inputs": [
      {
        "name": "exposure",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "limit",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ECDSAInvalidSignature",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ECDSAInvalidSignatureLength",
    "inputs": [
      {
        "name": "length",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ECDSAInvalidSignatureS",
    "inputs": [
      {
        "name": "s",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721IncorrectOwner",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InsufficientApproval",
    "inputs": [
      {
        "name": "operator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InvalidApprover",
    "inputs": [
      {
        "name": "approver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InvalidOperator",
    "inputs": [
      {
        "name": "operator",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InvalidReceiver",
    "inputs": [
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InvalidSender",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721NonexistentToken",
    "inputs": [
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidAmount",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidClaim",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidDueDate",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidDuration",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidRole",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidShipmentRef",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidShortString",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidSigner",
    "inputs": [
      {
        "name": "recovered",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidStatus",
    "inputs": [
      {
        "name": "statusCode",
        "type": "uint8",
        "internalType": "uint8"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidToken",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidTrust",
    "inputs": [
      {
        "name": "trustBps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvoiceInUse",
    "inputs": [
      {
        "name": "invoiceHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ListingClosed",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NoKyc",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NonceAlreadyUsed",
    "inputs": [
      {
        "name": "nonce",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotKyced",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "required",
        "type": "uint8",
        "internalType": "enum ITradeDeals.Role"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotParty",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NothingOwed",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ObservationInFuture",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PastDueDate",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReceivableClosed",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RegistryNotBound",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RoleLocked",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "boundRole",
        "type": "uint8",
        "internalType": "enum ITradeDeals.Role"
      }
    ]
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ScoreTooLow",
    "inputs": [
      {
        "name": "scoreBps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SignatureExpired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SlippageExceeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "StaleObservation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "StringTooLong",
    "inputs": [
      {
        "name": "str",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "TermsMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TooEarly",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "TransferRestricted",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnknownDeal",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "WrongState",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "current",
        "type": "uint8",
        "internalType": "enum ITradeDeals.State"
      }
    ]
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroHash",
    "inputs": []
  }
] as const;
