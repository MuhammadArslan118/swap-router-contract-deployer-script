#!/usr/bin/env node
/**
 * CatenaSwap one-shot deploy
 *
 *   1. Compile CatenaFactory  -> work out POOL_INIT_CODE_HASH from CatenaswapPool bytecode
 *   2. Check / update POOL_INIT_CODE_HASH in PoolAddress.sol (Descriptor, NFPM, SwapRouter)
 *   3. Compile CatenaDescriptor, CatenaNFPM, SwapRouter
 *   4. Deploy CatenaswapFactory          -> confirm POOL_INIT_CODE_HASH() on-chain matches
 *   5. Deploy NFTDescriptor library + NonfungibleTokenPositionDescriptor(WCTA)
 *   6. Deploy NonfungiblePositionManager(factory, WCTA, descriptor)
 *   7. Deploy SwapRouter(factory, WCTA)
 *   8. Print all addresses and save them to deployments/<chainId>.json
 *
 * Usage:
 *   node deploy.js                 compile + deploy (reads .env)
 *   node deploy.js --compile-only  compile + hash check only, nothing sent to the chain
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const solc = require('solc');
const linker = require('solc/linker');
const { ethers } = require('ethers');

// ---------------------------------------------------------------- config
const CONTRACTS_DIR = path.join(__dirname, 'contracts');
const BUILD_DIR = path.join(__dirname, 'build');
const DEPLOY_DIR = path.join(__dirname, 'deployments');

// Same settings your Remix builds used (from the metadata.json files in the zip)
const COMPILER_SETTINGS = {
  optimizer: { enabled: true, runs: Number(process.env.OPTIMIZER_RUNS || 200) },
  evmVersion: process.env.EVM_VERSION || 'istanbul',
  outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.bytecode.linkReferences', 'evm.deployedBytecode.object'] } },
};

const COMPILE_ONLY = process.argv.includes('--compile-only');
const MAX_CODE_SIZE = 24576;

// ---------------------------------------------------------------- helpers
const log = (...a) => console.log(...a);
const step = (n, msg) => log(`\n[${n}] ${msg}`);

function compileFolder(folder) {
  const dir = path.join(CONTRACTS_DIR, folder);
  const sources = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sol'))) {
    sources[`${folder}/${f}`] = { content: fs.readFileSync(path.join(dir, f), 'utf8') };
  }
  const input = { language: 'Solidity', sources, settings: COMPILER_SETTINGS };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors || []).filter((e) => e.severity === 'error');
  if (errors.length) {
    errors.forEach((e) => console.error(e.formattedMessage));
    throw new Error(`Compilation failed for ${folder}`);
  }
  return out.contracts;
}

function getContract(compiled, folder, file, name) {
  const c = compiled[`${folder}/${file}`] && compiled[`${folder}/${file}`][name];
  if (!c) throw new Error(`Contract ${name} not found in ${folder}/${file}`);
  return c;
}

function saveArtifact(name, c, bytecode) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(BUILD_DIR, `${name}.json`),
    JSON.stringify({ contractName: name, abi: c.abi, bytecode: '0x' + (bytecode || c.evm.bytecode.object) }, null, 2)
  );
}

function checkSize(name, c) {
  const size = c.evm.deployedBytecode.object.length / 2;
  const flag = size > MAX_CODE_SIZE ? '  <-- OVER 24KB LIMIT (chain may reject it)' : '';
  log(`    ${name.padEnd(38)} ${String(size).padStart(6)} bytes${flag}`);
}

/** Replace POOL_INIT_CODE_HASH in a PoolAddress.sol. Returns the old value. */
function syncPoolAddressHash(folder, hash) {
  const file = path.join(CONTRACTS_DIR, folder, 'PoolAddress.sol');
  const src = fs.readFileSync(file, 'utf8');
  const re = /(bytes32\s+internal\s+constant\s+POOL_INIT_CODE_HASH\s*=\s*)(0x[0-9a-fA-F]{64})/;
  const m = src.match(re);
  if (!m) throw new Error(`POOL_INIT_CODE_HASH not found in ${folder}/PoolAddress.sol`);
  if (m[2].toLowerCase() !== hash.toLowerCase()) {
    fs.writeFileSync(file, src.replace(re, `$1${hash}`));
  }
  return m[2];
}

async function deploy(wallet, name, abi, bytecode, args = []) {
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(...args);
  const tx = contract.deploymentTransaction();
  log(`    tx ${tx.hash} ... waiting`);
  await tx.wait(Number(process.env.CONFIRMATIONS || 1));
  const address = await contract.getAddress();
  log(`    ${name} deployed at ${address}`);
  return { contract, address, txHash: tx.hash };
}

// ---------------------------------------------------------------- main
async function main() {
  // ---- 1. Factory compile + init code hash
  step(1, 'Compiling CatenaFactory');
  const factoryOut = compileFolder('CatenaFactory');
  const Factory = getContract(factoryOut, 'CatenaFactory', 'CatenaswapFactory.sol', 'CatenaswapFactory');
  const Pool = getContract(factoryOut, 'CatenaFactory', 'CatenaswapPool.sol', 'CatenaswapPool');
  const INIT_CODE_HASH = ethers.keccak256('0x' + Pool.evm.bytecode.object);
  log(`    POOL_INIT_CODE_HASH = ${INIT_CODE_HASH}`);

  // ---- 2. PoolAddress.sol hash check
  step(2, 'Checking POOL_INIT_CODE_HASH in PoolAddress.sol files');
  for (const folder of ['CatenaDescriptor', 'CatenaNFPM', 'SwapRouter']) {
    const old = syncPoolAddressHash(folder, INIT_CODE_HASH);
    if (old.toLowerCase() === INIT_CODE_HASH.toLowerCase()) log(`    ${folder}/PoolAddress.sol  OK (already correct)`);
    else log(`    ${folder}/PoolAddress.sol  UPDATED  ${old} -> ${INIT_CODE_HASH}`);
  }

  // ---- 3. Compile the rest
  step(3, 'Compiling CatenaDescriptor, CatenaNFPM, SwapRouter');
  const descOut = compileFolder('CatenaDescriptor');
  const NFTDescriptorLib = getContract(descOut, 'CatenaDescriptor', 'NFTDescriptor.sol', 'NFTDescriptor');
  const Descriptor = getContract(descOut, 'CatenaDescriptor', 'NonfungibleTokenPositionDescriptor.sol', 'NonfungibleTokenPositionDescriptor');
  const nfpmOut = compileFolder('CatenaNFPM');
  const NFPM = getContract(nfpmOut, 'CatenaNFPM', 'NonfungiblePositionManager.sol', 'NonfungiblePositionManager');
  const routerOut = compileFolder('SwapRouter');
  const Router = getContract(routerOut, 'SwapRouter', 'SwapRouter.sol', 'SwapRouter');

  log('    Deployed bytecode sizes:');
  [['CatenaswapFactory', Factory], ['NFTDescriptor (library)', NFTDescriptorLib], ['NonfungibleTokenPositionDescriptor', Descriptor],
   ['NonfungiblePositionManager', NFPM], ['SwapRouter', Router]].forEach(([n, c]) => checkSize(n, c));

  saveArtifact('CatenaswapFactory', Factory);
  saveArtifact('CatenaswapPool', Pool);
  saveArtifact('NFTDescriptor', NFTDescriptorLib);
  saveArtifact('NonfungiblePositionManager', NFPM);
  saveArtifact('SwapRouter', Router);
  log(`    ABIs + bytecode saved to ${path.relative(process.cwd(), BUILD_DIR) || '.'}/`);

  if (COMPILE_ONLY) {
    saveArtifact('NonfungibleTokenPositionDescriptor', Descriptor);
    log('\n--compile-only: stopping before deployment.');
    return;
  }

  // ---- chain setup
  const { RPC_URL, PRIVATE_KEY, WCTA_ADDRESS } = process.env;
  if (!RPC_URL || !PRIVATE_KEY || !WCTA_ADDRESS) {
    throw new Error('Set RPC_URL, PRIVATE_KEY and WCTA_ADDRESS in .env (see .env.example)');
  }
  if (!ethers.isAddress(WCTA_ADDRESS)) throw new Error(`WCTA_ADDRESS is not a valid address: ${WCTA_ADDRESS}`);
  const WCTA = ethers.getAddress(WCTA_ADDRESS);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const baseWallet = new ethers.Wallet(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : '0x' + PRIVATE_KEY, provider);
  const wallet = new ethers.NonceManager(baseWallet); // keeps nonces in order across back-to-back deploys
  const { chainId } = await provider.getNetwork();
  const balance = await provider.getBalance(baseWallet.address);
  log(`\nNetwork chainId ${chainId} | deployer ${baseWallet.address} | balance ${ethers.formatEther(balance)}`);
  log(`WCTA ${WCTA}`);

  // ---- 4. Factory
  step(4, 'Deploying CatenaswapFactory');
  const factory = await deploy(wallet, 'CatenaswapFactory', Factory.abi, '0x' + Factory.evm.bytecode.object);
  const onchainHash = await factory.contract.POOL_INIT_CODE_HASH();
  log(`    on-chain POOL_INIT_CODE_HASH() = ${onchainHash}`);
  if (onchainHash.toLowerCase() !== INIT_CODE_HASH.toLowerCase()) {
    throw new Error('On-chain init code hash does not match the hash written into PoolAddress.sol. Stopping.');
  }
  log('    matches PoolAddress.sol ✔');

  // ---- 5. Descriptor (NFTDescriptor is a library with a public function -> must be deployed and linked)
  step(5, 'Deploying NFTDescriptor library + NonfungibleTokenPositionDescriptor');
  const lib = await deploy(wallet, 'NFTDescriptor', NFTDescriptorLib.abi, '0x' + NFTDescriptorLib.evm.bytecode.object);
  const linkedDescriptor = linker.linkBytecode(Descriptor.evm.bytecode.object, {
    'CatenaDescriptor/NFTDescriptor.sol': { NFTDescriptor: lib.address },
  });
  if (linkedDescriptor.includes('__')) throw new Error('Descriptor bytecode still has unlinked libraries');
  saveArtifact('NonfungibleTokenPositionDescriptor', Descriptor, linkedDescriptor);
  const descriptor = await deploy(wallet, 'NonfungibleTokenPositionDescriptor', Descriptor.abi, '0x' + linkedDescriptor, [WCTA]);

  // ---- 6. NFPM
  step(6, 'Deploying NonfungiblePositionManager');
  const nfpm = await deploy(wallet, 'NonfungiblePositionManager', NFPM.abi, '0x' + NFPM.evm.bytecode.object, [
    factory.address, WCTA, descriptor.address,
  ]);

  // ---- 7. SwapRouter
  step(7, 'Deploying SwapRouter');
  const router = await deploy(wallet, 'SwapRouter', Router.abi, '0x' + Router.evm.bytecode.object, [factory.address, WCTA]);

  // ---- 8. Summary
  const result = {
    chainId: Number(chainId),
    deployer: baseWallet.address,
    timestamp: new Date().toISOString(),
    WCTA,
    POOL_INIT_CODE_HASH: INIT_CODE_HASH,
    CatenaswapFactory: factory.address,
    NFTDescriptorLibrary: lib.address,
    NonfungibleTokenPositionDescriptor: descriptor.address,
    NonfungiblePositionManager: nfpm.address,
    SwapRouter: router.address,
  };
  fs.mkdirSync(DEPLOY_DIR, { recursive: true });
  const outFile = path.join(DEPLOY_DIR, `${chainId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

  log('\n================ CatenaSwap deployed ================');
  log(`POOL_INIT_CODE_HASH                 ${INIT_CODE_HASH}`);
  log(`CatenaswapFactory                   ${factory.address}`);
  log(`NonfungibleTokenPositionDescriptor  ${descriptor.address}`);
  log(`NonfungiblePositionManager          ${nfpm.address}`);
  log(`SwapRouter                          ${router.address}`);
  log(`(NFTDescriptor library              ${lib.address})`);
  log('=====================================================');
  log(`Saved to ${path.relative(process.cwd(), outFile)}`);
}

main().catch((e) => {
  console.error('\nERROR:', e.shortMessage || e.message);
  process.exit(1);
});
