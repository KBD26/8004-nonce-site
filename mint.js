#!/usr/bin/env node
/*
 * 8004 NONCE - open-source miner + mint-packet builder.
 * Mines a proof-of-work nonce for YOUR address and prints the exact transaction
 * to mint (to, value, data). It NEVER holds your keys - you broadcast the packet
 * from your own wallet/signer.
 *
 * VERIFY the contract address below against the canonical verified source before sending value:
 *   https://etherscan.io/address/0x2f041d75f614f1d8e99a5267e7f08e9fa0c37fe3#code  (Exact Match)
 * The only call is mint(nonce) payable. Minting needs NO approval. If anything asks you to
 * sign approve()/setApprovalForAll(), it is phishing.
 *
 * deps:  npm i js-sha3      (keccak-256 = Ethereum's hash; NOT Node's built-in 'sha3-256')
 * use :  node mint.js <yourWalletAddress> [minBits]
 */
const { keccak256 } = require("js-sha3");

const CONTRACT  = (process.env.NONCE_CONTRACT || "0x2f041d75f614f1d8e99a5267e7f08e9fa0c37fe3").toLowerCase();
const CHAIN_ID  = BigInt(process.env.NONCE_CHAIN || "1");
const MINT_SEL  = "0xa0712d68";  // mint(uint256)
const PRICE_SEL = "0xa035b1fe";  // price()
const RPCS = process.env.NONCE_RPC ? [process.env.NONCE_RPC]
          : ["https://ethereum-rpc.publicnode.com","https://gateway.tenderly.co/public/mainnet",
             "https://eth-mainnet.public.blastapi.io","https://eth.drpc.org"];

const hexToBytes = h => { h = h.replace(/^0x/, ""); const a = new Uint8Array(h.length/2); for (let i=0;i<a.length;i++) a[i]=parseInt(h.substr(i*2,2),16); return a; };
const u256 = n => { const a = new Uint8Array(32); let x = BigInt(n); for (let i=31;i>=0;i--){ a[i]=Number(x & 0xffn); x>>=8n; } return a; };

// keccak256(abi.encodePacked(uint256 chainId, address contract, address minter, uint256 nonce))
function workHash(chainId, contract, minter, nonce) {
  const buf = new Uint8Array(104);
  buf.set(u256(chainId), 0);
  buf.set(hexToBytes(contract), 32);
  buf.set(hexToBytes(minter), 52);
  buf.set(u256(nonce), 72);
  return "0x" + keccak256(buf);
}
function leadingZeroBits(hex) {
  const b = hexToBytes(hex); let bits = 0;
  for (let i=0;i<b.length;i++){ if (b[i]===0){ bits+=8; } else { let x=b[i]; while ((x & 0x80)===0){ bits++; x<<=1; } break; } }
  return bits;
}
// valid iff top 16 bits are zero  (uint256(hash) <= type(uint256).max >> 16)
const isValid = hex => leadingZeroBits(hex) >= 16;

function mine(chainId, contract, minter, opts = {}) {
  const minBits = opts.minBits || 16;
  let nonce = opts.start != null ? BigInt(opts.start) : (BigInt(Math.floor(Math.random()*1e9)) << 20n);
  let best = null, tries = 0, max = opts.maxTries || 5e8;
  for (;;) {
    const h = workHash(chainId, contract, minter, nonce);
    const bits = leadingZeroBits(h);
    if (bits >= 16 && (!best || bits > best.bits)) { best = { nonce: nonce.toString(), hash: h, bits }; if (bits >= minBits) return best; }
    if (++tries > max) return best;
    nonce++;
  }
}
const mintCalldata = nonce => MINT_SEL + BigInt(nonce).toString(16).padStart(64, "0");
function buildMintTx(nonce, priceWei, bufferBps = 100) {
  const value = BigInt(priceWei) + BigInt(priceWei) * BigInt(bufferBps) / 10000n; // overpay auto-refunded on-chain
  return { to: CONTRACT, value: "0x" + value.toString(16), data: mintCalldata(nonce) };
}
async function ethCall(data) {
  for (const u of RPCS) { try {
    const r = await fetch(u, { method:"POST", headers:{"content-type":"application/json"},
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ jsonrpc:"2.0", id:1, method:"eth_call", params:[{ to:CONTRACT, data }, "latest"] }) });
    const j = await r.json(); if (j.result) return j.result;
  } catch (e) {} }
  throw new Error("RPC read failed (set NONCE_RPC=<url>)");
}

module.exports = { CONTRACT, CHAIN_ID, workHash, leadingZeroBits, isValid, mine, mintCalldata, buildMintTx, ethCall };

if (require.main === module) (async () => {
  const minter = process.argv[2], minBits = parseInt(process.argv[3] || "16", 10);
  if (!/^0x[0-9a-fA-F]{40}$/.test(minter || "")) { console.log("usage: node mint.js <yourWalletAddress> [minBits]"); process.exit(1); }
  console.log("8004 NONCE - verify contract:", CONTRACT);
  console.log("mining for", minter, "(minBits " + minBits + ") ...");
  const t0 = Date.now();
  const r = mine(CHAIN_ID, CONTRACT, minter, { minBits });
  console.log("found " + r.bits + " bits in " + ((Date.now()-t0)/1000).toFixed(1) + "s  nonce=" + r.nonce);
  let price;
  try { price = BigInt(await ethCall(PRICE_SEL)); }
  catch (e) {
    console.log("\nCould not read the live price from any RPC, so no packet was built.");
    console.log("A packet priced from a stale constant would be REJECTED on-chain as underpaid");
    console.log("and you would lose the gas. Your nonce is valid and reusable:", r.nonce);
    console.log("Retry, or set NONCE_RPC=<url> to an endpoint you trust.");
    process.exit(1);
  }
  const tx = buildMintTx(r.nonce, price);
  console.log("\n=== MINT PACKET (send from YOUR wallet; this script never holds keys) ===");
  console.log("chain:", CHAIN_ID === 1n ? "Ethereum mainnet (chainId 1)" : "chainId " + CHAIN_ID);
  console.log("from :", minter, "(the nonce only works for this address)");
  console.log("to   :", tx.to);
  console.log("value:", tx.value, "(" + (Number(BigInt(tx.value))/1e18).toFixed(7) + " ETH; overpay auto-refunded)");
  console.log("data :", tx.data);
  console.log("\nSafety: the only call is mint(nonce) payable. Never sign an approval/setApprovalForAll.");
})();
