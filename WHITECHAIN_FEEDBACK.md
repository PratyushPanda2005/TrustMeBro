# Whitechain feedback

Our notes from building TrustMeBro on Whitechain Sepolia (chain 1874) at ETHGlobal Mumbai. The numbers come from our live trades and from checks we ran against the public RPC on 7 Nov 2026.

## What worked

- Whitechain's getting-started links had everything we needed: prizes, docs, the faucet, Get USDT (swap on YetiTrade) and the USDT token `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`. We followed them, swapped WBT for USDT on YetiTrade, and used the right USDT from our first transaction. Every trade, funding and repayment in our app uses that token.
- The whole flow runs on the live chain. Trades 1, 2 and 7 were created, confirmed, funded and repaid in USDT, and trade 7 was checked by our agent from start to finish with a paid x402 check on Hedera.
- The network reference page had what we needed in one place: chain ID, RPC, explorer, the 5 gwei minimum base fee and the 1 second block time. The block time is exact. From our deployment block, 12,365,020, the chain made 57,130 blocks in 57,130 seconds.
- "Set `evmVersion` to `prague`" is stated plainly, so we used solc 0.8.30 and OpenZeppelin 5 without guessing about opcodes.
- The Foundry page calls out the trailing `/api/` on `--verifier-url`. That's the usual way Blockscout verification fails, so it helps that it's written down.
- Gas is low enough for small invoices. Trade 7 (create, confirm, check, fund, repay) used 1,050,240 gas, about 0.0053 WBT, so 1 WBT covers the contract calls of about 190 deals like it.
- One second blocks made the agent flow feel instant. Trade 7 went from the importer's confirmation to a verified deal in 38 seconds, and that includes the Hedera payment.
- The public RPC worked well with `anvil --fork-url`. We ran our end-to-end tests on a fork of the live chain, with the real Finance V2 bytecode and real USDT balances, and never hit the 50 requests per second limit.
- The transaction finality page is clear about soft, safe and finalized. Our agent waits 2 blocks, which is a soft confirmation. That's fine on testnet, and the page made it clear we should wait longer once real money is involved.
- The Blockscout v2 API (`/api/v2/addresses/{address}/transactions` and `/token-transfers`) gave us gas, fees and token movements for each deal without running our own indexer.

## Where we got stuck

Nothing blocked us. Two small things took a little extra time:

- **`eth_getLogs` range.** A query over more than 10,000 blocks returns `query exceeds max block range 10000`, so our agent reads events in smaller windows. Easy once we knew.
- **Foundry on Windows.** The Foundry page suggests WSL. Foundry's installer also worked for us in Git Bash (forge 1.9.0).

## What the docs were missing

Two small additions that could help other teams:

- The `eth_getLogs` 10,000 block limit on the network reference page, next to the rate limits.
- An example of verifying a contract that another contract creates in its constructor, like our Reputation and ReceivableNote contracts.
