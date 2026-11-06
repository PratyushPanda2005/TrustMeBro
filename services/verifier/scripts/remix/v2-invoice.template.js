(async function () {
  const OPERATION = __OPERATION__;
  const ACTION = 'preflight'; // Change to send only after reviewing the printed transaction.
  const CONFIRM = ''; // Paste confirmationRequired from preflight.
  const CREATION_TX_HASH = ''; // Confirm: actual create receipt hash. Create: optional recovery check only.
  const INVOICE = __INVOICE__;
  const ABI = __ABI__;
  const FINANCE = '0x71e3c6aE367A0D8517A0DA7cC480cBa9e954DfC7';
  const E = require('ethers').ethers, U = E.utils || E;
  const check = (ok,message) => { if(!ok){ console.error('STOP:',message); throw Error('Stopped safely'); } };
  const eq = (a,b) => typeof a==='string' && typeof b==='string' && a.toLowerCase()===b.toLowerCase();
  const bi = x => BigInt(x.toString());
  check(['create','confirm'].includes(OPERATION) && ['preflight','send'].includes(ACTION),'Invalid operation/action.');
  check(typeof web3Provider!=='undefined','Select Browser Extension / MetaMask in Remix.');
  const p = E.BrowserProvider ? new E.BrowserProvider(web3Provider) : new E.providers.Web3Provider(web3Provider);
  const wallet = await p.getSigner(), expected = OPERATION==='create' ? INVOICE.exporter : INVOICE.importer;
  async function checkWallet(){
    check(bi(await p.send('eth_chainId',[]))===1874n,'Select Whitechain Sepolia chain 1874.');
    const accounts=await p.send('eth_accounts',[]);
    check(accounts.length && eq(accounts[0],expected) && eq(await wallet.getAddress(),expected),'Select the required existing '+OPERATION+' wallet: '+expected+'. Admin is not a substitute.');
  }
  await checkWallet();
  check(await p.getCode(FINANCE)!=='0x','Finance contract is unavailable.');
  const f = new E.Contract(FINANCE,ABI,p), t=INVOICE.terms;
  check(await f.hasRole(await f.EXPORTER_ROLE(),INVOICE.exporter),'Prepared exporter lacks EXPORTER_ROLE.');
  check(await f.hasRole(await f.IMPORTER_ROLE(),INVOICE.importer),'Prepared importer lacks IMPORTER_ROLE.');
  function matchingDeal(d){
    check(eq(d.exporter,INVOICE.exporter),'Creation belongs to another exporter.');
    for(const [name,value] of Object.entries(t)){
      check(typeof value==='string' && value.startsWith('0x') ? eq(d.terms[name],value) : bi(d.terms[name])===bi(value),'Onchain invoice terms differ: '+name);
    }
  }
  function creationEvent(receipt){
    check(Number(receipt.status)===1,'Creation reverted.');
    const events=receipt.logs.filter(l=>eq(l.address,FINANCE)).map(l=>{try{return f.interface.parseLog(l)}catch{return undefined}});
    const matches=events.filter(l=>l && l.name==='TradeCreated' && eq(l.args.exporter,INVOICE.exporter) && eq(l.args.importer,INVOICE.importer));
    check(matches.length===1,'Expected exactly one matching Finance TradeCreated event.');return matches[0];
  }
  async function recoverCreation(hash){
    check(/^0x[0-9a-f]{64}$/i.test(hash),'Set CREATION_TX_HASH to the actual successful creation transaction hash. Never use a predicted ID.');
    const receipt=await p.getTransactionReceipt(hash);
    check(receipt,'Creation is not mined yet.');
    check((await p.getBlockNumber())>=Number(receipt.blockNumber)+1,'Wait for two creation confirmations.');
    const tx=await p.getTransaction(hash),data=f.interface.encodeFunctionData('createTrade',[t]);
    check(tx && bi(tx.chainId)===1874n && eq(tx.from,INVOICE.exporter) && eq(tx.to,FINANCE) && bi(tx.value)===0n && eq(tx.data,data),'Creation transaction does not match the exact prepared invoice.');
    const event=creationEvent(receipt),deal=await f.getDeal(event.args.id);matchingDeal(deal);
    check(eq(deal.termsHash,event.args.termsHash),'Creation event/termsHash mismatch.');
    console.log(JSON.stringify({actualTradeId:event.args.id.toString(),creationTransaction:hash,termsHash:deal.termsHash,importerApproved:deal.importerApproved,evidenceLabel:'DEMO_SIMULATION'}));
    return {id:event.args.id,deal};
  }
  let request,phrase,id;
  if(OPERATION==='create'){
    if(CREATION_TX_HASH){await recoverCreation(CREATION_TX_HASH);return;}
    check(!(await f.invoiceUsed(t.invoiceHash)),'Invoice already exists. Recover its creation receipt; do not create a replacement or change hashes.');
    request={to:FINANCE,value:0,data:f.interface.encodeFunctionData('createTrade',[t])};
    phrase='CREATE DEMO INVOICE '+INVOICE.metadata.record.recordId;
  }else{
    const created=await recoverCreation(CREATION_TX_HASH);id=created.id;
    if(created.deal.importerApproved){console.log('Agreement already confirmed; no transaction requested. Actual trade ID:',id.toString());return;}
    check(bi(created.deal.state)===1n,'Trade must be Created.');
    request={to:FINANCE,value:0,data:f.interface.encodeFunctionData('confirmAgreement',[id])};
    phrase='CONFIRM DEMO TRADE '+id.toString();
  }
  check(bi(t.expiry)>=bi((await p.getBlock('latest')).timestamp),'Prepared invoice funding expiry passed.');
  await p.call({...request,from:expected});
  const estimate=bi(await p.estimateGas({...request,from:expected})),gasLimit=(estimate*120n+99n)/100n;
  const fees=await p.getFeeData(),fee=fees.maxFeePerGas || fees.gasPrice,balance=bi(await p.getBalance(expected));
  check(fee!==null && balance>=gasLimit*bi(fee),'Required party wallet needs WBT for gas; no transaction requested.');
  console.log(JSON.stringify({operation:OPERATION,chainId:1874,from:expected,to:FINANCE,value:'0',data:request.data,actualTradeId:id && id.toString(),invoiceUSDT:U.formatUnits(t.face,6),quantity:t.quantity,unit:INVOICE.metadata.unit,shipmentReference:INVOICE.metadata.shipmentReference,documentRecord:INVOICE.metadata.record.recordId,evidenceLabel:'DEMO_SIMULATION',fundingExpiry:t.expiry,gasEstimate:estimate.toString(),walletWBT:U.formatEther(balance.toString()),maxExecutionWBT:U.formatEther((gasLimit*bi(fee)).toString()),confirmationRequired:phrase,submitted:false},null,2));
  if(ACTION==='preflight')return;
  check(CONFIRM===phrase,'Set CONFIRM to the exact preflight phrase.');
  await checkWallet();await p.call({...request,from:expected});
  console.log('Requesting your explicit MetaMask approval. Review total fees including data fees.');
  const sent=await wallet.sendTransaction({...request,chainId:1874,gasLimit:gasLimit.toString()});
  console.log('SUBMITTED, not yet confirmed:',sent.hash);
  const receipt=await sent.wait(2),hash=receipt.transactionHash || receipt.hash || sent.hash;
  check(Number(receipt.status)===1,'Transaction reverted. No automatic retry.');
  const mined=await p.getTransaction(hash);
  check(eq(mined.from,expected) && eq(mined.to,FINANCE) && eq(mined.data,request.data) && bi(mined.value)===0n,'Mined replacement differs from the approved transaction.');
  if(OPERATION==='create'){await recoverCreation(hash);return;}
  const events=receipt.logs.filter(l=>eq(l.address,FINANCE)).map(l=>{try{return f.interface.parseLog(l)}catch{return undefined}});
  check(events.some(l=>l && l.name==='AgreementConfirmed' && bi(l.args.id)===bi(id) && eq(l.args.signer,INVOICE.importer)),'Missing matching importer AgreementConfirmed event.');
  const deal=await f.getDeal(id);matchingDeal(deal);
  check(deal.importerApproved && bi(deal.state)===1n,'Importer agreement is not confirmed in current Created state.');
  console.log(JSON.stringify({agreementConfirmed:true,actualTradeId:id.toString(),transaction:hash,evidenceLabel:'DEMO_SIMULATION',nextAction:'Bind this actual confirmed ID using setup:v2-demo -- --bind-trade=ID. No Hedera payment authorized.'}));
})().catch(()=>console.error('STOP. Review the public diagnostic and any submitted hash. Never retry blindly; no automatic payment or transaction.'))
