// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

import {ITradeDeals} from "./interfaces/ITradeDeals.sol";
import {TrustRegistry} from "./TrustRegistry.sol";
import {DealMath} from "./libraries/DealMath.sol";

/// @title TradeDeals
/// @notice Export-invoice financing settled in USDT: KYC → create → approve → claim → verify → fund → pay.
///         Each funded deal is an ERC-721 receivable that only KYC'd investors can hold.
contract TradeDeals is ITradeDeals, ERC721, AccessControl, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant KYC_ROLE = keccak256("KYC_ROLE");

    bytes32 public constant VERIFICATION_TYPEHASH = keccak256(
        "Verification(bytes32 dealId,uint32 observedKg,uint8 statusCode,bytes32 docHash,uint64 observedAt,uint256 nonce,uint256 expiry)"
    );

    uint256 public constant BPS = 10_000;

    uint256 public constant TOLERANCE_BPS = 300; // ±3% weight tolerance
    // A falsified check adds 2 x its weight on top of one deal of bad evidence.
    uint256 public constant W_WEIGHT = 4_000;
    uint256 public constant W_DOCS = 3_500;
    uint256 public constant W_STATUS = 2_500;

    uint256 public constant EVIDENCE_UNIT = 10_000; // one deal of evidence
    uint256 public constant LATE_GOOD = 5_000;
    uint256 public constant LATE_BAD_MAX = 5_000;
    uint256 public constant DEFAULT_BAD = 30_000;

    uint256 public constant EXPORTER_PRIOR = 10_000; // a = b → 50%
    uint256 public constant IMPORTER_PRIOR_STRENGTH = 20_000; // a + b
    uint256 public constant DEFAULT_IMPORTER_TRUST_BPS = 6_667; // → 4.00% risk

    uint8 public constant STATUS_LOADED = 3;
    uint8 public constant STATUS_ARRIVED = 5;

    uint8 public constant FALSIFIED_WEIGHT = 1;
    uint8 public constant FALSIFIED_DOCS = 2;
    uint8 public constant FALSIFIED_STATUS = 4;

    uint256 public constant MIN_WINDOW = 1 minutes;
    uint256 public constant MAX_WINDOW = 365 days;
    uint256 public constant MAX_TENOR = 730 days;
    uint256 public constant MAX_CLOCK_SKEW = 5 minutes; // verifier clock may run ahead of the chain
    uint256 public constant MAX_CONTAINER_REF = 32;
    uint256 public constant MAX_BL_REF = 64;

    bytes32 public constant TAG_FALSIFIED = "FALSIFIED";
    bytes32 public constant TAG_SETTLED = "SETTLED";
    bytes32 public constant TAG_PAID_ON_TIME = "PAID_ON_TIME";
    bytes32 public constant TAG_PAID_LATE = "PAID_LATE";
    bytes32 public constant TAG_PAID_AFTER_GRACE = "PAID_AFTER_GRACE";
    bytes32 public constant TAG_DEFAULTED = "DEFAULTED";

    IERC20 public immutable usdt;
    TrustRegistry public immutable registry;
    address public immutable verifier; // only signer whose observations are accepted

    // In token units, derived from the token's decimals.
    uint256 public immutable minInvoice; // 10 USDT
    uint256 public immutable minFee; // 2 USDT
    uint256 public immutable agentFee; // 1 USDT
    uint256 public immutable gasFee; // 0.50 USDT
    uint256 public immutable creditBase; // 200 USDT

    FeeRecipients private _recipients;

    uint256 public dealCount;
    mapping(uint256 dealId => Deal) private _deals;
    mapping(uint256 dealId => Shipment) private _shipments;

    mapping(bytes32 invoiceHash => uint256 dealId) public invoiceDeal; // 0 = free
    mapping(uint256 nonce => bool) public nonceUsed;

    mapping(address account => Role) public kycRole; // active role, None if revoked
    mapping(address account => Role) public boundRole; // first role ever given, never changes

    mapping(address exporter => uint256) public openExposure;
    mapping(address exporter => uint256) public settledVolume;

    /// @param registry_ TrustRegistry deployed with this contract's precomputed address
    /// @param verifier_ address of the verifier's EIP-712 signing key
    constructor(
        address admin,
        IERC20 usdt_,
        TrustRegistry registry_,
        address verifier_,
        FeeRecipients memory recipients_
    ) ERC721("TrustMeBro Receivable", "TMBR") EIP712("TrustMeBro", "1") {
        if (admin == address(0) || address(usdt_) == address(0) || verifier_ == address(0)) revert ZeroAddress();
        if (registry_.deals() != address(this)) revert RegistryNotBound();

        uint8 decimals = IERC20Metadata(address(usdt_)).decimals();
        if (decimals < 2 || decimals > 18) revert InvalidToken();
        uint256 unit = 10 ** decimals;

        usdt = usdt_;
        registry = registry_;
        verifier = verifier_;
        minInvoice = 10 * unit;
        minFee = 2 * unit;
        agentFee = unit;
        gasFee = unit / 2;
        creditBase = 200 * unit;

        _setRecipients(recipients_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KYC_ROLE, admin);
    }

    /// @notice Exporters start at 50%, importers at 66.67%.
    function setKyc(address account, Role role) external onlyRole(KYC_ROLE) {
        _setKyc(account, role, DEFAULT_IMPORTER_TRUST_BPS);
    }

    /// @notice Importer with a custom starting trust. Only applies on the first KYC.
    function setKycImporter(address account, uint256 startTrustBps) external onlyRole(KYC_ROLE) {
        if (startTrustBps == 0 || startTrustBps >= BPS) revert InvalidTrust(startTrustBps);
        _setKyc(account, Role.Importer, startTrustBps);
    }

    /// @notice Blocks new deals and receivable transfers. Score and role binding are kept.
    function revokeKyc(address account) external onlyRole(KYC_ROLE) {
        Role role = kycRole[account];
        if (role == Role.None) revert NoKyc(account);
        kycRole[account] = Role.None;
        emit KycRevoked(account, role);
    }

    function setFeeRecipients(FeeRecipients calldata recipients_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRecipients(recipients_);
    }

    /// @notice Exporter tokenizes an invoice. Amount is in USDT units; termsHash is the hash of the T&C PDF.
    function createDeal(
        uint256 amount,
        uint64 dueDate,
        address importer,
        bytes32 invoiceHash,
        bytes32 termsHash,
        Durations calldata durations
    ) external returns (uint256 dealId) {
        if (kycRole[msg.sender] != Role.Exporter) revert NotKyced(msg.sender, Role.Exporter);
        if (kycRole[importer] != Role.Importer) revert NotKyced(importer, Role.Importer);
        if (amount < minInvoice || amount > type(uint128).max) revert InvalidAmount();
        if (invoiceHash == bytes32(0) || termsHash == bytes32(0)) revert ZeroHash();
        uint256 existing = invoiceDeal[invoiceHash];
        if (existing != 0) revert InvoiceInUse(invoiceHash, existing);
        _checkWindow(durations.verifyWindow);
        _checkWindow(durations.listingWindow);
        _checkWindow(durations.graceWindow);
        if (dueDate <= block.timestamp + MIN_WINDOW || dueDate > block.timestamp + MAX_TENOR) revert InvalidDueDate();

        if (registry.advanceBps(msg.sender) == 0) revert ScoreTooLow(registry.trust(msg.sender));
        uint256 exposure = openExposure[msg.sender] + amount;
        uint256 limit = creditLimit(msg.sender);
        if (exposure > limit) revert CreditLimitExceeded(exposure, limit);

        dealId = ++dealCount;
        Deal storage d = _deals[dealId];
        d.exporter = msg.sender;
        d.importer = importer;
        d.createdAt = uint64(block.timestamp);
        d.state = State.Created;
        d.dueDate = dueDate;
        d.amount = uint128(amount);
        d.invoiceHash = invoiceHash;
        d.termsHash = termsHash;
        d.verifyWindow = durations.verifyWindow;
        d.listingWindow = durations.listingWindow;
        d.graceWindow = durations.graceWindow;

        invoiceDeal[invoiceHash] = dealId;
        openExposure[msg.sender] = exposure;

        emit DealCreated(dealId, msg.sender, importer, amount, dueDate, invoiceHash, termsHash);
    }

    /// @notice Importer accepts the debt. termsHash must match the deal's.
    function approveDeal(uint256 dealId, bytes32 termsHash) external {
        Deal storage d = _deal(dealId);
        _expect(d, dealId, State.Created);
        if (msg.sender != d.importer) revert NotParty(msg.sender);
        if (kycRole[msg.sender] != Role.Importer) revert NotKyced(msg.sender, Role.Importer);
        if (termsHash != d.termsHash) revert TermsMismatch();
        d.state = State.Approved;
        emit Approved(dealId, msg.sender, termsHash);
    }

    /// @notice Exporter declares the shipment after handing it to the carrier.
    /// @param claimedStatus LOADED (3) to ARRIVED (5)
    /// @param docHash keccak256 of invoice + packing list + bill of lading
    function declareClaims(
        uint256 dealId,
        uint32 declaredKg,
        uint8 claimedStatus,
        bytes32 docHash,
        string calldata containerNo,
        string calldata blRef
    ) external {
        Deal storage d = _deal(dealId);
        _expect(d, dealId, State.Approved);
        if (msg.sender != d.exporter) revert NotParty(msg.sender);
        if (declaredKg == 0 || claimedStatus < STATUS_LOADED || claimedStatus > STATUS_ARRIVED) revert InvalidClaim();
        if (docHash == bytes32(0)) revert ZeroHash();
        uint256 containerLen = bytes(containerNo).length;
        if (containerLen == 0 || containerLen > MAX_CONTAINER_REF || bytes(blRef).length > MAX_BL_REF) {
            revert InvalidShipmentRef();
        }
        if (block.timestamp >= d.dueDate) revert PastDueDate();

        uint64 claimTime = uint64(block.timestamp);
        uint64 verifyDeadline = claimTime + d.verifyWindow;
        d.declaredKg = declaredKg;
        d.claimedStatus = claimedStatus;
        d.docHash = docHash;
        d.claimTime = claimTime;
        d.verifyDeadline = verifyDeadline;
        d.state = State.Claimed;
        _shipments[dealId] = Shipment(containerNo, blRef);

        emit Claimed(dealId, msg.sender, declaredKg, claimedStatus, docHash, containerNo, blRef, verifyDeadline);
    }

    /// @notice Anyone may relay the verifier's signed observation; the contract judges it against the claim.
    function submitVerification(Verification calldata v, bytes calldata signature) external returns (Outcome outcome) {
        uint256 dealId = uint256(v.dealId);
        Deal storage d = _deal(dealId);
        if (d.state != State.Claimed && d.state != State.Pending) revert WrongState(dealId, d.state);
        if (block.timestamp > v.expiry) revert SignatureExpired();
        if (nonceUsed[v.nonce]) revert NonceAlreadyUsed(v.nonce);
        // Must be newer than the claim and the last observation, so old signatures can't be replayed.
        if (v.observedAt <= d.claimTime || v.observedAt <= d.observedAt) revert StaleObservation();
        if (v.observedAt > block.timestamp + MAX_CLOCK_SKEW) revert ObservationInFuture();
        if (v.statusCode > STATUS_ARRIVED) revert InvalidStatus(v.statusCode);

        address signer = ECDSA.recover(hashVerification(v), signature);
        if (signer != verifier) revert InvalidSigner(signer);

        nonceUsed[v.nonce] = true;
        d.observedKg = v.observedKg;
        d.observedStatus = v.statusCode;
        d.observedDocHash = v.docHash;
        d.observedAt = v.observedAt;
        d.checks += 1;

        outcome = _judge(d, dealId, v);
        emit VerificationSubmitted(dealId, msg.sender, v.nonce, keccak256(signature), outcome);
    }

    /// @notice Investor pays the advance; in the same tx the fee is split, the exporter is paid and the
    ///         receivable NFT is minted. Needs a USDT approval first. maxAdvance / minYieldBps guard
    ///         against the scores changing before the tx is mined.
    function fund(uint256 dealId, uint256 maxAdvance, uint256 minYieldBps)
        external
        nonReentrant
        returns (DealMath.Quote memory q)
    {
        Deal storage d = _deal(dealId);
        _expect(d, dealId, State.Verified);
        if (kycRole[msg.sender] != Role.Investor) revert NotKyced(msg.sender, Role.Investor);
        if (block.timestamp > _listingDeadline(d) || block.timestamp >= d.dueDate) revert ListingClosed(dealId);

        q = _quote(d);
        if (q.advanceBps == 0) revert ScoreTooLow(registry.trust(d.exporter));
        if (q.advance <= q.fee) revert AdvanceTooSmall(q.advance, q.fee);
        if (q.advance > maxAdvance || q.yieldBps < minYieldBps) revert SlippageExceeded();

        // Casts are safe: advance <= amount (uint128), advanceBps <= 9,000, yieldBps <= 800.
        d.state = State.Funded;
        d.investor = msg.sender;
        d.fundedAt = uint64(block.timestamp);
        d.advanceBps = uint16(q.advanceBps);
        d.yieldBps = uint16(q.yieldBps);
        d.advance = uint128(q.advance);
        d.fee = uint128(q.fee);
        d.investorDue = uint128(q.investorDue);
        _mint(msg.sender, dealId);

        _pull(msg.sender, q.advance);
        FeeRecipients memory r = _recipients;
        _send(r.agentWallet, q.agentFee);
        _send(r.gasRelayer, q.gasFee);
        _send(r.reserveFund, q.reserveFee);
        _send(r.platformTreasury, q.platformFee);
        _send(d.exporter, q.exporterNet);

        emit FeeSplit(dealId, q.agentFee, q.gasFee, q.reserveFee, q.platformFee);
        emit Funded(
            dealId,
            msg.sender,
            q.advance,
            q.fee,
            q.exporterNet,
            uint16(q.advanceBps),
            uint16(q.yieldBps),
            q.investorDue
        );
    }

    /// @notice Importer repays, fully or partly: NFT holder first, exporter the rest. Full payment settles
    ///         and updates scores. Also accepts recovery payments on Defaulted deals. Needs a USDT approval.
    function pay(uint256 dealId, uint256 amount) external nonReentrant returns (uint256 accepted) {
        Deal storage d = _deal(dealId);
        State state = d.state;
        if (state != State.Funded && state != State.Defaulted) revert WrongState(dealId, state);
        if (msg.sender != d.importer) revert NotParty(msg.sender);
        if (amount == 0) revert InvalidAmount();
        uint256 outstanding = uint256(d.amount) - d.paid;
        if (outstanding == 0) revert NothingOwed(dealId);
        accepted = amount < outstanding ? amount : outstanding;

        (uint256 toInvestor, uint256 toExporter) =
            DealMath.waterfall(accepted, uint256(d.investorDue) - d.paidToInvestor);
        d.paid += uint128(accepted);
        d.paidToInvestor += uint128(toInvestor);
        address holder = ownerOf(dealId);

        bool settles = state == State.Funded && d.paid == d.amount;
        bytes32 importerOutcome;
        uint256 exporterScore;
        uint256 importerScore;
        if (settles) {
            d.state = State.Settled;
            d.closedAt = uint64(block.timestamp);
            _release(d, dealId, false);
            (importerOutcome, exporterScore, importerScore) = _scoreSettlement(d, dealId);
        }

        _pull(msg.sender, accepted);
        _send(holder, toInvestor);
        _send(d.exporter, toExporter);

        emit Paid(dealId, msg.sender, accepted, toInvestor, toExporter, holder, d.paid);
        if (settles) emit Settled(dealId, importerOutcome, exporterScore, importerScore);
    }

    /// @notice Anyone, after due date + grace. Only the importer's score drops.
    function markDefault(uint256 dealId) external {
        Deal storage d = _deal(dealId);
        _expect(d, dealId, State.Funded);
        if (block.timestamp <= uint256(d.dueDate) + d.graceWindow) revert TooEarly(dealId);
        d.state = State.Defaulted;
        d.closedAt = uint64(block.timestamp);
        _release(d, dealId, false);
        uint256 score = registry.addEvidence(d.importer, dealId, 0, DEFAULT_BAD, TAG_DEFAULTED);
        emit Defaulted(dealId, uint256(d.amount) - d.paid, uint256(d.investorDue) - d.paidToInvestor, score);
    }

    /// @notice Anyone. Verified but unfunded after the listing window, or Claimed/Pending after
    ///         verifyDeadline + listingWindow. No score change.
    function expire(uint256 dealId) external {
        Deal storage d = _deal(dealId);
        State from = d.state;
        if (from == State.Verified) {
            if (block.timestamp <= _listingDeadline(d) && block.timestamp < d.dueDate) revert TooEarly(dealId);
        } else if (from == State.Claimed || from == State.Pending) {
            if (block.timestamp <= uint256(d.verifyDeadline) + d.listingWindow) revert TooEarly(dealId);
        } else {
            revert WrongState(dealId, from);
        }
        d.state = State.Expired;
        d.closedAt = uint64(block.timestamp);
        _release(d, dealId, true);
        emit Expired(dealId, from);
    }

    /// @notice Exporter while Created/Approved, importer while Created.
    function cancel(uint256 dealId) external {
        Deal storage d = _deal(dealId);
        State state = d.state;
        if (state == State.Created) {
            if (msg.sender != d.exporter && msg.sender != d.importer) revert NotParty(msg.sender);
        } else if (state == State.Approved) {
            if (msg.sender != d.exporter) revert NotParty(msg.sender);
        } else {
            revert WrongState(dealId, state);
        }
        d.state = State.Cancelled;
        d.closedAt = uint64(block.timestamp);
        _release(d, dealId, true);
        emit Cancelled(dealId, msg.sender);
    }

    function getDeal(uint256 dealId) external view returns (Deal memory) {
        return _deals[dealId];
    }

    function getShipment(uint256 dealId) external view returns (Shipment memory) {
        return _shipments[dealId];
    }

    function feeRecipients() external view returns (FeeRecipients memory) {
        return _recipients;
    }

    /// @notice Terms if funded now. advanceBps == 0 means the exporter is blocked (< 40%).
    function quote(uint256 dealId) external view returns (DealMath.Quote memory) {
        return _quote(_deal(dealId));
    }

    /// @notice 200 USDT + 2 x settled volume, applied to all open deals together.
    function creditLimit(address exporter) public view returns (uint256) {
        return creditBase + 2 * settledVolume[exporter];
    }

    function availableCredit(address exporter) external view returns (uint256) {
        uint256 limit = creditLimit(exporter);
        uint256 used = openExposure[exporter];
        return used >= limit ? 0 : limit - used;
    }

    /// @notice Key times of a deal (0 = not reached yet).
    function deadlines(uint256 dealId)
        external
        view
        returns (uint256 verifyDeadline, uint256 listingDeadline, uint256 dueDate, uint256 graceEnd)
    {
        Deal storage d = _deals[dealId];
        verifyDeadline = d.verifyDeadline;
        listingDeadline = d.verifiedAt == 0 ? 0 : _listingDeadline(d);
        dueDate = d.dueDate;
        graceEnd = d.dueDate == 0 ? 0 : uint256(d.dueDate) + d.graceWindow;
    }

    /// @notice EIP-712 digest the verifier signs. The agent can use it to pre-check a signature.
    function hashVerification(Verification calldata v) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    VERIFICATION_TYPEHASH,
                    v.dealId,
                    v.observedKg,
                    v.statusCode,
                    v.docHash,
                    v.observedAt,
                    v.nonce,
                    v.expiry
                )
            )
        );
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Onchain metadata for the receivable NFT.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Deal storage d = _deals[tokenId];
        string memory attributes = string.concat(
            '[{"trait_type":"State","value":"',
            _stateName(d.state),
            '"},{"trait_type":"Invoice (USDT units)","value":',
            Strings.toString(d.amount),
            '},{"trait_type":"Advance (USDT units)","value":',
            Strings.toString(d.advance),
            '},{"trait_type":"Investor due (USDT units)","value":',
            Strings.toString(d.investorDue),
            '},{"trait_type":"Paid to holder (USDT units)","value":',
            Strings.toString(d.paidToInvestor),
            '},{"trait_type":"Yield (bps)","value":',
            Strings.toString(d.yieldBps),
            '},{"display_type":"date","trait_type":"Due date","value":',
            Strings.toString(d.dueDate),
            "}]"
        );
        string memory json = string.concat(
            '{"name":"TrustMeBro Receivable #',
            Strings.toString(tokenId),
            '","description":"Export-invoice receivable on TrustMeBro. The importer repays this contract in USDT; the holder is paid first (principal + yield). Transferable only between KYC-approved investors.","attributes":',
            attributes,
            "}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Plan §4: weight ±3%, equal document hash, status reached by the deadline.
    function _judge(Deal storage d, uint256 dealId, Verification calldata v) internal returns (Outcome) {
        uint256 declared = d.declaredKg;
        uint256 lo = declared * (BPS - TOLERANCE_BPS) / BPS;
        uint256 hi = declared * (BPS + TOLERANCE_BPS) / BPS;

        uint8 mask;
        uint256 extra;
        if (v.observedKg < lo) {
            mask |= FALSIFIED_WEIGHT; // fewer goods than claimed
            extra += 2 * W_WEIGHT;
        }
        if (v.docHash != d.docHash) {
            mask |= FALSIFIED_DOCS;
            extra += 2 * W_DOCS;
        }
        bool statusBehind = v.statusCode < d.claimedStatus;
        if (statusBehind && v.observedAt > d.verifyDeadline) {
            mask |= FALSIFIED_STATUS; // still not reached after the deadline
            extra += 2 * W_STATUS;
        }

        if (mask != 0) {
            uint256 penalty = EVIDENCE_UNIT + extra;
            d.state = State.Rejected;
            d.falsifiedMask = mask;
            d.closedAt = uint64(block.timestamp);
            _release(d, dealId, false); // the invoice stays locked
            uint256 score = registry.addEvidence(d.exporter, dealId, 0, penalty, TAG_FALSIFIED);
            emit Rejected(dealId, d.exporter, mask, penalty, score);
            return Outcome.Falsified;
        }
        if (statusBehind) {
            d.state = State.Pending; // tracking lag: recheck later
            emit Pending(dealId, d.checks, v.statusCode, d.claimedStatus, d.verifyDeadline);
            return Outcome.Pending;
        }
        if (v.observedKg > hi) {
            d.state = State.Mismatch; // under-declared: no penalty
            d.closedAt = uint64(block.timestamp);
            _release(d, dealId, true); // invoice can be re-created with correct values
            emit Mismatch(dealId, d.declaredKg, v.observedKg);
            return Outcome.Mismatch;
        }
        d.state = State.Verified; // exporter credit is given at settlement, not here
        d.verifiedAt = uint64(block.timestamp);
        emit Verified(dealId, v.observedKg, v.statusCode, v.docHash, v.observedAt, uint64(_listingDeadline(d)));
        return Outcome.Verified;
    }

    function _scoreSettlement(Deal storage d, uint256 dealId)
        internal
        returns (bytes32 importerOutcome, uint256 exporterScore, uint256 importerScore)
    {
        uint256 due = d.dueDate;
        uint256 grace = d.graceWindow;
        uint256 good;
        uint256 bad;
        if (block.timestamp <= due) {
            good = EVIDENCE_UNIT;
            importerOutcome = TAG_PAID_ON_TIME;
        } else if (block.timestamp <= due + grace) {
            good = LATE_GOOD;
            bad = DealMath.latePenalty(block.timestamp - due, grace, LATE_BAD_MAX);
            importerOutcome = TAG_PAID_LATE;
        } else {
            bad = DEFAULT_BAD; // paid after grace: scored as a default
            importerOutcome = TAG_PAID_AFTER_GRACE;
        }
        importerScore = registry.addEvidence(d.importer, dealId, good, bad, importerOutcome);
        exporterScore = registry.addEvidence(d.exporter, dealId, EVIDENCE_UNIT, 0, TAG_SETTLED);
        settledVolume[d.exporter] += d.amount;
    }

    function _quote(Deal storage d) internal view returns (DealMath.Quote memory) {
        return DealMath.quote(
            d.amount,
            registry.advanceBps(d.exporter),
            registry.riskBps(d.importer),
            DealMath.FeeConfig({minFee: minFee, agentFee: agentFee, gasFee: gasFee})
        );
    }

    function _setKyc(address account, Role role, uint256 importerStartTrustBps) internal {
        if (account == address(0)) revert ZeroAddress();
        if (role == Role.None) revert InvalidRole();
        if (kycRole[account] != Role.None) revert AlreadyKyced(account);
        Role bound = boundRole[account];
        if (bound != Role.None && bound != role) revert RoleLocked(account, bound);

        kycRole[account] = role;
        if (bound == Role.None) {
            boundRole[account] = role;
            if (role == Role.Exporter) {
                registry.onboard(account, EXPORTER_PRIOR, EXPORTER_PRIOR);
            } else if (role == Role.Importer) {
                uint256 a = IMPORTER_PRIOR_STRENGTH * importerStartTrustBps / BPS;
                registry.onboard(account, a, IMPORTER_PRIOR_STRENGTH - a);
            }
        }
        emit KycSet(account, role);
    }

    function _setRecipients(FeeRecipients memory r) internal {
        if (
            r.agentWallet == address(0) || r.gasRelayer == address(0) || r.reserveFund == address(0)
                || r.platformTreasury == address(0)
        ) revert ZeroAddress();
        _recipients = r;
        emit FeeRecipientsUpdated(r.agentWallet, r.gasRelayer, r.reserveFund, r.platformTreasury);
    }

    function _release(Deal storage d, uint256 dealId, bool freeInvoice) internal {
        openExposure[d.exporter] -= d.amount;
        if (freeInvoice && invoiceDeal[d.invoiceHash] == dealId) delete invoiceDeal[d.invoiceHash];
    }

    /// @dev Reverts for fee-on-transfer tokens.
    function _pull(address from, uint256 amount) internal {
        uint256 before = usdt.balanceOf(address(this));
        usdt.safeTransferFrom(from, address(this), amount);
        if (usdt.balanceOf(address(this)) - before != amount) revert InvalidToken();
    }

    function _send(address to, uint256 amount) internal {
        if (amount != 0) usdt.safeTransfer(to, amount);
    }

    function _deal(uint256 dealId) internal view returns (Deal storage d) {
        d = _deals[dealId];
        if (d.state == State.None) revert UnknownDeal(dealId);
    }

    function _expect(Deal storage d, uint256 dealId, State expected) internal view {
        if (d.state != expected) revert WrongState(dealId, d.state);
    }

    function _listingDeadline(Deal storage d) internal view returns (uint256) {
        return uint256(d.verifiedAt) + d.listingWindow;
    }

    function _checkWindow(uint32 window) internal pure {
        if (window < MIN_WINDOW || window > MAX_WINDOW) revert InvalidDuration();
    }

    function _stateName(State s) internal pure returns (string memory) {
        if (s == State.Funded) return "Funded";
        if (s == State.Settled) return "Settled";
        if (s == State.Defaulted) return "Defaulted";
        return "Closed";
    }

    /// @dev Receivable NFTs go only to KYC'd investors, and only while Funded or Defaulted.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (kycRole[to] != Role.Investor) revert TransferRestricted(to);
        if (_ownerOf(tokenId) != address(0)) {
            State s = _deals[tokenId].state;
            if (s != State.Funded && s != State.Defaulted) revert ReceivableClosed(tokenId);
        }
        return super._update(to, tokenId, auth);
    }
}
