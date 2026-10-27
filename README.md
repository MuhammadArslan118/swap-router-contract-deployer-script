# CatenaSwap one-shot deploy

Compiles and deploys all four CatenaSwap contracts in the right order with one command,
and prints the four addresses at the end.

## Setup
```bash
npm install
cp .env.example .env      # then fill in RPC_URL, PRIVATE_KEY, WCTA_ADDRESS
```

## Run
```bash
npm run compile   # optional: compile + init-hash check only, nothing sent on-chain
npm run deploy    # compile + deploy everything
```

## What it does
1. Compiles `contracts/CatenaFactory` and computes `POOL_INIT_CODE_HASH` from the `CatenaswapPool` bytecode.
2. Checks `PoolAddress.sol` in **CatenaDescriptor, CatenaNFPM and SwapRouter**, and writes the correct hash in if it differs.
3. Compiles CatenaDescriptor, CatenaNFPM and SwapRouter (solc 0.7.6, optimizer 200, istanbul; same as your Remix builds).
4. Deploys `CatenaswapFactory`, then reads `POOL_INIT_CODE_HASH()` from the chain and stops if it doesn't match.
5. Deploys the `NFTDescriptor` library, links it, then deploys `NonfungibleTokenPositionDescriptor(WCTA)`.
6. Deploys `NonfungiblePositionManager(factory, WCTA, descriptor)`.
7. Deploys `SwapRouter(factory, WCTA)`.
8. Prints all addresses and saves them to `deployments/<chainId>.json`. ABIs and bytecode go in `build/`.
