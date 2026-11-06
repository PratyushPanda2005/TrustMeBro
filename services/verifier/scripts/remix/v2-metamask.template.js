(async function () {
  const OPERATION = __OPERATION__; // grant or relay; generated from the deployed ABI
  const ACTION = 'preflight'; // Change to 'send' only after reviewing preflight.
  const CONFIRM = ''; // Paste the exact confirmationRequired phrase from preflight.
  const PAYLOAD_FILE = 'v2-attestation.json'; // Relay only: upload the PUBLIC exported JSON into Remix.
  const ABI = __ABI__;
  const TYPES = __TYPES__;
  const ADMIN = '0xB758E119133050305520E2F47362cfDd9E55A325';
  const FINANCE = '0x71e3c6aE367A0D8517A0DA7cC480cBa9e954DfC7';
  const SERVICE_SIGNER = '0x76b4B8FFaa84901d5b2aDFB5c6a3592E4e63B1E8';
  const E = require('ethers').ethers, U = E.utils || E;
  const check = (ok, message) => { if (!ok) { console.error('STOP:', message); throw Error('Stopped safely'); } };
  const eq = (a,b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
  const bi = value => BigInt(value.toString());
  check(ACTION === 'preflight' || ACTION === 'send', 'ACTION must be preflight or send.');
  check(typeof web3Provider !== 'undefined', 'In Remix select Browser Extension / MetaMask, then connect your existing wallet.');
  const provider = E.BrowserProvider ? new E.BrowserProvider(web3Provider) : new E.providers.Web3Provider(web3Provider);
  const wallet = await provider.getSigner(), account = await wallet.getAddress();
  async function checkWallet() {
    check(bi(await provider.send('eth_chainId',[])) === 1874n,'Select Whitechain Sepolia, chain 1874.');
    const accounts = await provider.send('eth_accounts',[]);
    check(accounts.length > 0 && eq(accounts[0],ADMIN) && eq(await wallet.getAddress(),ADMIN),'Connect the specified Admin account; no private key is requested.');
  }
  await checkWallet();
  check(eq(account,ADMIN),'Wrong connected Admin account.');
  check(await provider.getCode(FINANCE) !== '0x','Finance contract is unavailable on this network.');
  const f = new E.Contract(FINANCE,ABI,provider), role = await f.VERIFIER_ROLE();
  check(eq(role,U.id('VERIFIER_ROLE')),'Unexpected verifier role constant.');
  let request, phrase, payload;
  if (OPERATION === 'grant') {
    check(await f.hasRole(await f.DEFAULT_ADMIN_ROLE(),ADMIN),'Connected wallet lacks DEFAULT_ADMIN_ROLE.');
    if (await f.hasRole(role,SERVICE_SIGNER)) { console.log('Verifier already authorized. No transaction requested.'); return; }
    request = {to:FINANCE,value:0,data:f.interface.encodeFunctionData('grantRole',[role,SERVICE_SIGNER])};
    phrase = 'GRANT VERIFIER '+SERVICE_SIGNER;
  } else {
    check(OPERATION === 'relay','Unknown operation.');
    check(typeof remix !== 'undefined','Relay requires Remix fileManager to read the public JSON file.');
    payload = JSON.parse(await remix.call('fileManager','readFile',PAYLOAD_FILE));
    check(payload.version === 1 && payload.relayMode === 'manual-metamask','Wrong public relay payload format.');
    check(['DEMO_SIMULATION','AUTHENTICATED_PROVIDER'].includes(payload.evidenceLabel),'Missing evidence label.');
    const a = payload.attestation;
    check(a && eq(payload.signer,SERVICE_SIGNER),'Payload must be signed by the configured service signer.');
    check(await f.hasRole(role,SERVICE_SIGNER),'Service signer lacks VERIFIER_ROLE.');
    check(!(await f.hasRole(await f.DEFAULT_ADMIN_ROLE(),SERVICE_SIGNER)),'Service signer must not be Admin.');
    const d = await f.getDeal(a.tradeId), now = bi((await provider.getBlock('latest')).timestamp);
    check(bi(d.state) === 1n && d.importerApproved && bi(d.verification) !== 3n,'Trade is not Created and importer-confirmed, or was rejected.');
    check(bi(d.terms.expiry) >= now,'Trade funding expiry has passed.');
    check(bi(a.tradeId) === bi(payload.tradeId) && eq(a.termsHash,d.termsHash) && eq(a.termsHash,payload.termsHash),'Trade/terms binding mismatch.');
    check(eq(a.reportHash,payload.reportHash) && eq(a.documentHash,d.terms.documentHash) && bi(a.quantity) === bi(d.terms.quantity) && bi(a.stage) >= bi(d.terms.minimumStage),'Report facts do not satisfy this agreement.');
    check(bi(a.timestamp) >= bi(d.createdAt) && bi(a.timestamp) <= now && bi(a.expiry) >= now && bi(a.expiry)-bi(a.timestamp) <= 300n,'Attestation is stale, expired or has invalid times. Do not repurchase automatically.');
    check(!(await f.attestationUsed(SERVICE_SIGNER,a.nonce)),'Attestation nonce is already used; reconcile the existing transaction.');
    const domain = {name:'TrustMeBro Trade Finance',version:'2',chainId:1874,verifyingContract:FINANCE};
    const encoder = E.TypedDataEncoder || U._TypedDataEncoder;
    check(eq(await f.attestationDigest(a),encoder.hash(domain,TYPES,a)),'Solidity/EIP-712 digest mismatch.');
    check(eq((E.verifyTypedData || U.verifyTypedData)(domain,TYPES,a,payload.signature),SERVICE_SIGNER),'Invalid service signature.');
    request = {to:FINANCE,value:0,data:f.interface.encodeFunctionData('verifyAttestation',[a,SERVICE_SIGNER,payload.signature])};
    const tx = payload.transaction;
    check(tx && tx.chainId === 1874 && eq(tx.from,ADMIN) && eq(tx.to,FINANCE) && bi(tx.value) === 0n && eq(tx.data,request.data),'Saved calldata/destination/account/value mismatch.');
    phrase = 'RELAY '+payload.evidenceLabel+' TRADE '+payload.tradeId+' '+payload.reportHash;
  }
  await provider.call({...request,from:ADMIN});
  const estimate = bi(await provider.estimateGas({...request,from:ADMIN})), gasLimit = (estimate*120n+99n)/100n;
  const fees = await provider.getFeeData(), maxFee = fees.maxFeePerGas || fees.gasPrice;
  check(maxFee !== null,'RPC did not return a fee estimate.');
  const balance = bi(await provider.getBalance(ADMIN));
  check(balance >= gasLimit*bi(maxFee),'Insufficient WBT for the execution fee cap. Review total L1/data fees in MetaMask too.');
  console.log(JSON.stringify({operation:OPERATION,chainId:1874,from:ADMIN,to:FINANCE,role,serviceSigner:SERVICE_SIGNER,value:'0',data:request.data,gasEstimate:estimate.toString(),gasLimit:gasLimit.toString(),adminWBT:U.formatEther(balance.toString()),maxExecutionWBT:U.formatEther((gasLimit*bi(maxFee)).toString()),tradeId:payload && payload.tradeId,evidenceLabel:payload && payload.evidenceLabel,hederaPayment:payload && payload.hederaPaymentTransactionId,reportHash:payload && payload.reportHash,confirmationRequired:phrase,submitted:false},null,2));
  if (ACTION === 'preflight') return;
  check(CONFIRM === phrase,'Set CONFIRM to the exact reviewed phrase. No transaction requested.');
  await checkWallet();
  await provider.call({...request,from:ADMIN});
  console.log('Requesting explicit MetaMask approval for the displayed transaction. Reject if any account/network/destination/data differs.');
  const sent = await wallet.sendTransaction({...request,chainId:1874,gasLimit:gasLimit.toString()});
  console.log('SUBMITTED hash (not yet success):',sent.hash);
  const receipt = await sent.wait(2);
  check(Number(receipt.status) === 1,'Transaction reverted. No automatic retry.');
  const mined = await provider.getTransaction(receipt.transactionHash || receipt.hash || sent.hash);
  check(eq(mined.from,ADMIN) && eq(mined.to,FINANCE) && eq(mined.data,request.data) && bi(mined.value) === 0n,'Mined replacement does not match the approved transaction.');
  if (OPERATION === 'grant') {
    check(await f.hasRole(role,SERVICE_SIGNER),'Receipt succeeded but verifier authorization is absent.');
    console.log('CONFIRMED VERIFIER_ROLE:',SERVICE_SIGNER,'transaction:',receipt.transactionHash || receipt.hash || sent.hash);
  } else {
    const event = receipt.logs.filter(log=>eq(log.address,FINANCE)).map(log=>{try{return f.interface.parseLog(log);}catch{return undefined;}}).find(log=>log && log.name === 'ShipmentChecked' && bi(log.args.id) === bi(payload.tradeId) && eq(log.args.reportHash,payload.reportHash) && eq(log.args.verifier,SERVICE_SIGNER) && log.args.mode === 'TRUSTED_SERVICE_ATTESTATION');
    check(event && bi(event.args.result) === 1n,'Receipt did not report ShipmentChecked Valid for this report.');
    const d = await f.getDeal(payload.tradeId);
    check(bi(d.state) === 1n && d.importerApproved && bi(d.verification) === 1n,'Current trade is not Created/approved/Valid.');
    check(bi(d.terms.expiry) >= bi((await provider.getBlock('latest')).timestamp),'Funding deadline has passed.');
    await f.quote(payload.tradeId);
    console.log(JSON.stringify({verified:true,financeable:true,tradeId:payload.tradeId,hederaPayment:payload.hederaPaymentTransactionId,whitechainTx:receipt.transactionHash || receipt.hash || sent.hash,reportHash:payload.reportHash,evidenceLabel:payload.evidenceLabel}));
  }
})().catch(()=>console.error('STOP. Inspect the public preflight, MetaMask and any submitted hash. No automatic retry, payment or key export.'))
