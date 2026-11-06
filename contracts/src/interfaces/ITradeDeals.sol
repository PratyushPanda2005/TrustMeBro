// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Types, events and errors of TradeDeals.
interface ITradeDeals {
    // One address = one role, for life.
    enum Role {
        None,
        Exporter,
        Importer,
        Investor
    }

    // Created → Approved → Claimed → (Pending) → Verified → Funded → Settled.
    // Side exits: Rejected, Mismatch, Defaulted, Expired, Cancelled.
    enum State {
        None,
        Created,
        Approved,
        Claimed,
        Pending,
        Verified,
        Funded,
        Settled,
        Rejected,
        Mismatch,
        Defaulted,
        Expired,
        Cancelled
    }

    enum Outcome {
        Verified,
        Pending,
        Falsified,
        Mismatch
    }

    // In seconds, so the demo can run in minutes.
    struct Durations {
        uint32 verifyWindow; // claim → verifyDeadline
        uint32 listingWindow; // verified → last moment to fund
        uint32 graceWindow; // dueDate → default
    }

    // Signed by the verifier. The type string must match packages/shared/src/eip712.ts exactly.
    // dealId is the uint256 id as bytes32.
    struct Verification {
        bytes32 dealId;
        uint32 observedKg;
        uint8 statusCode; // 0 NONE, 1 BOOKED, 2 GATED_IN, 3 LOADED, 4 DEPARTED, 5 ARRIVED
        bytes32 docHash;
        uint64 observedAt;
        uint256 nonce;
        uint256 expiry;
    }

    struct FeeRecipients {
        address agentWallet;
        address gasRelayer;
        address reserveFund;
        address platformTreasury;
    }

    struct Shipment {
        string containerNo;
        string blRef;
    }

    struct Deal {
        address exporter;
        uint64 createdAt;
        State state;
        uint8 claimedStatus;
        uint8 checks;
        uint8 falsifiedMask; // bit 0 weight, bit 1 documents, bit 2 status
        address importer;
        uint64 dueDate;
        uint32 declaredKg;
        uint128 amount; // invoice value in USDT units
        uint128 paid;
        bytes32 invoiceHash;
        bytes32 termsHash;
        bytes32 docHash;
        bytes32 observedDocHash;
        uint64 claimTime;
        uint64 verifyDeadline;
        uint64 observedAt;
        uint64 verifiedAt;
        uint32 observedKg;
        uint8 observedStatus;
        uint32 verifyWindow;
        uint32 listingWindow;
        uint32 graceWindow;
        // frozen at funding
        uint16 advanceBps;
        uint16 yieldBps;
        uint64 fundedAt;
        address investor; // original funder; current holder is ownerOf(dealId)
        uint64 closedAt;
        uint128 advance;
        uint128 fee;
        uint128 investorDue; // advance + yield
        uint128 paidToInvestor;
    }

    event KycSet(address indexed account, Role role);
    event KycRevoked(address indexed account, Role role);
    event FeeRecipientsUpdated(address agentWallet, address gasRelayer, address reserveFund, address platformTreasury);

    event DealCreated(
        uint256 indexed dealId,
        address indexed exporter,
        address indexed importer,
        uint256 amount,
        uint64 dueDate,
        bytes32 invoiceHash,
        bytes32 termsHash
    );
    event Approved(uint256 indexed dealId, address indexed importer, bytes32 termsHash);
    /// @notice The agent watches this to buy the x402 check.
    event Claimed(
        uint256 indexed dealId,
        address indexed exporter,
        uint32 declaredKg,
        uint8 claimedStatus,
        bytes32 docHash,
        string containerNo,
        string blRef,
        uint64 verifyDeadline
    );
    event VerificationSubmitted(
        uint256 indexed dealId, address indexed submitter, uint256 nonce, bytes32 sigHash, Outcome outcome
    );
    event Verified(
        uint256 indexed dealId,
        uint32 observedKg,
        uint8 statusCode,
        bytes32 docHash,
        uint64 observedAt,
        uint64 listingDeadline
    );
    event Pending(uint256 indexed dealId, uint8 checks, uint8 observedStatus, uint8 claimedStatus, uint64 verifyDeadline);
    event Rejected(
        uint256 indexed dealId, address indexed exporter, uint8 falsifiedMask, uint256 penalty, uint256 exporterScoreBps
    );
    event Mismatch(uint256 indexed dealId, uint32 declaredKg, uint32 observedKg);
    event Funded(
        uint256 indexed dealId,
        address indexed investor,
        uint256 advance,
        uint256 fee,
        uint256 exporterNet,
        uint16 advanceBps,
        uint16 yieldBps,
        uint256 investorDue
    );
    event FeeSplit(uint256 indexed dealId, uint256 agentFee, uint256 gasFee, uint256 reserveFee, uint256 platformFee);
    event Paid(
        uint256 indexed dealId,
        address indexed payer,
        uint256 amount,
        uint256 toInvestor,
        uint256 toExporter,
        address holder,
        uint256 totalPaid
    );
    event Settled(uint256 indexed dealId, bytes32 importerOutcome, uint256 exporterScoreBps, uint256 importerScoreBps);
    event Defaulted(uint256 indexed dealId, uint256 unpaid, uint256 investorShortfall, uint256 importerScoreBps);
    event Expired(uint256 indexed dealId, State fromState);
    event Cancelled(uint256 indexed dealId, address indexed by);

    error ZeroAddress();
    error InvalidToken();
    error RegistryNotBound();
    error InvalidRole();
    error AlreadyKyced(address account);
    error RoleLocked(address account, Role boundRole);
    error NotKyced(address account, Role required);
    error NoKyc(address account);
    error InvalidTrust(uint256 trustBps);

    error UnknownDeal(uint256 dealId);
    error WrongState(uint256 dealId, State current);
    error NotParty(address caller);
    error InvalidAmount();
    error ZeroHash();
    error InvoiceInUse(bytes32 invoiceHash, uint256 dealId);
    error InvalidDuration();
    error InvalidDueDate();
    error ScoreTooLow(uint256 scoreBps);
    error CreditLimitExceeded(uint256 exposure, uint256 limit);
    error TermsMismatch();
    error InvalidClaim();
    error InvalidShipmentRef();
    error PastDueDate();

    error SignatureExpired();
    error NonceAlreadyUsed(uint256 nonce);
    error StaleObservation();
    error ObservationInFuture();
    error InvalidStatus(uint8 statusCode);
    error InvalidSigner(address recovered);

    error ListingClosed(uint256 dealId);
    error AdvanceTooSmall(uint256 advance, uint256 fee);
    error SlippageExceeded();
    error NothingOwed(uint256 dealId);
    error TooEarly(uint256 dealId);
    error TransferRestricted(address to);
    error ReceivableClosed(uint256 dealId);
}
