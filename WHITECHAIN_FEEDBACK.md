# Whitechain feedback

> Draft started while building the contracts. Team: edit and add your own notes before submitting.

## What worked

- The network reference page has everything in one place: chain ID 1874, HTTP and WS RPC, the Blockscout explorer, and the gas parameters. `eth_chainId` returned `0x752` on the first try.
- Prague support (stated plainly: "set `evmVersion` to `prague` or any earlier target") meant we could use the latest solc 0.8.30 and OpenZeppelin 5.x without guessing about opcodes.
- The Foundry page states the `/api/` trailing slash for `--verifier-url` explicitly, which saves a classic Blockscout verification failure.

## Where we got stuck

- **Which USDT?** The hackathon requires USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, but the docs token list
  (`build/block-explorer/token-list.md`) lists "USDT" as `0xaa7962d073935D387e8d442DA1D7149C81388f46`. That token reports
  itself as `USDT.e` / "Bridged USDT (Whitechain)". We only noticed by calling `symbol()` and `name()` on both. A
  team that copies the address from the docs would settle in the wrong token and fail qualification.
- **Getting test USDT:** _(team: add the WBT → USDT swap experience here: which URL, how long it took, any issues)_
- **Foundry on Windows:** the docs say Windows needs WSL. Foundry's own installer also works in Git Bash, which would help
  Windows developers who don't have a WSL distro set up.

## What the docs were missing

- A clear note on the token-list page that the hackathon / official test USDT is `0xcedf…55a7`, and that `USDT.e` is a different, bridged asset.
- A "how to get test USDT" page (swap URL, pool, typical amounts), similar to the WBT faucet page.
- The proxy-verification example reports compiler `0.8.28` / EVM `cancun` while the Foundry page recommends `0.8.30` / `prague`. One consistent example would avoid confusion.
- A short list of supported precompiles and opcodes per network (for example whether `PUSH0` / `MCOPY` / transient storage are available; they are via Prague, but it is only implied).
