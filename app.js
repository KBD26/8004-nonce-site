// 8004 NONCE - mint page logic. Same-origin, no inline (CSP-safe).
const CONTRACT="0x2f041d75f614f1d8e99a5267e7f08e9fa0c37fe3", CHAIN_ID=1;
const SEL={price:"0xa035b1fe",publicOpen:"0xba70c515",minted:"0x4f02c420",mint:"0xa0712d68"};
const RPCS=["https://ethereum-rpc.publicnode.com","https://gateway.tenderly.co/public/mainnet","https://eth-mainnet.public.blastapi.io","https://eth.drpc.org"];
// wallets flag hosts they do not recognise (MetaMask blocks every *.vercel.app and some Arweave gateways), so wallet
// connections happen only on the two official hosts; anywhere else "Connect wallet" opens the canonical page instead
const WALLET_HOSTS=["8004nonce.eth.limo","daemon-8004nonce.ar.io"];
const OFF_HOST=!WALLET_HOSTS.includes(location.hostname.toLowerCase());
// inside another site's frame the page never talks to the wallet (clickjacking); Connect opens the canonical page instead
const FRAMED=(()=>{try{return window.top!==window.self;}catch(e){return true;}})();
const $=id=>document.getElementById(id);
console.log("%cyou are not mining art. you are mining belief.","color:#5ec8d8;font-size:14px");
console.log("%c8004 NONCE — the label is a hypothesis. the supply is the truth.","color:#7f868c");

let account=null, minter=null, worker=null, best=null;
// minting: between a Mint click and its outcome. sentNonce: the nonce of the last submitted mint. otherAccount: the
// wallet moved to an account this nonce was not mined for. In each case Mint stays off and its status line stays put.
let minting=false, sentNonce=null, otherAccount=null;
const ca=$('ca'), btnMine=$('btnMine'), btnMint=$('btnMint'), mintHint=$('mintHint');
ca.textContent=CONTRACT.slice(0,10)+"…"+CONTRACT.slice(-6); ca.href="https://etherscan.io/address/"+CONTRACT;
$('lk-es').href="https://etherscan.io/address/"+CONTRACT+"#code";
$('lk-sc').href="https://repo.sourcify.dev/1/"+CONTRACT;
$('lk-bs').href="https://eth.blockscout.com/address/"+CONTRACT+"?tab=contract";

// per-request deadline: a hung endpoint must not stall the page. AbortSignal.timeout where available.
const rpcSignal=ms=>{if(typeof AbortSignal!=="undefined"&&AbortSignal.timeout)return AbortSignal.timeout(ms);const c=new AbortController();setTimeout(()=>c.abort(),ms);return c.signal;};
// reads use the wallet only while it is on Ethereum mainnet; otherwise they go straight to public RPCs.
async function onMainnet(){try{return parseInt(await window.ethereum.request({method:"eth_chainId"}),16)===CHAIN_ID;}catch(e){return false;}}
// RPC answers are untrusted input: only a non-empty hex string counts as a result
const isHex=v=>typeof v==="string"&&/^0x[0-9a-fA-F]+$/.test(v);
async function ethCall(data){
  const params=[{to:CONTRACT,data:data},"latest"];
  if(window.ethereum&&await onMainnet()){try{const r=await window.ethereum.request({method:"eth_call",params});if(isHex(r))return r;}catch(e){}}
  for(const u of RPCS){
    try{const r=await fetch(u,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_call",params}),signal:rpcSignal(5000)});const j=await r.json();if(isHex(j.result))return j.result;}catch(e){}
  }
  throw new Error("read failed");
}
const big=h=>BigInt(h);
function fmtEth(wei){let w=BigInt(wei),n=w<0n;if(n)w=-w;const W=w/(10n**18n),f=(w%(10n**18n)).toString().padStart(18,"0").slice(0,8).replace(/0+$/,"");return (n?"-":"")+W+(f?("."+f):"")+" ETH";}

async function refresh(){
  try{
    const [m,o,p]=await Promise.all([ethCall(SEL.minted),ethCall(SEL.publicOpen),ethCall(SEL.price)]);
    $('st-minted').textContent=Number(big(m))+" / 8004";
    window.__open=big(o)===1n; window.__price=big(p);
    $('st-price').textContent=fmtEth(big(p));
    $('st-open').innerHTML=window.__open?'<span class="ok">public mint OPEN</span>':'<span class="warn">opens soon</span>';
    updateMintBtn();
  }catch(e){$('st-open').innerHTML='<span class="err">connect a wallet to load live data</span>';}
}
async function connect(){
  if(FRAMED){window.open("https://8004nonce.eth.limo/mint.html","_blank","noopener");return;}
  if(OFF_HOST){location.href="https://8004nonce.eth.limo/mint.html";return;}
  if(!window.ethereum){alert("No wallet found. Use 'mine without connecting' instead, or install MetaMask.");return;}
  try{
    const a=await window.ethereum.request({method:"eth_requestAccounts"});account=a[0];minter=account;
    let cid=await window.ethereum.request({method:"eth_chainId"});
    if(parseInt(cid,16)!==CHAIN_ID){try{await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x1"}]});}catch(e){alert("Switch to Ethereum Mainnet, then reconnect.");return;}}
    showMine();
  }catch(e){}
}
function useAddr(){
  const v=$('addrIn').value.trim();
  if(!/^0x[0-9a-fA-F]{40}$/.test(v)){alert("Enter a valid 0x… address.");return;}
  account=null; minter=v; showMine();
}
function showMine(){
  $('choosePanel').style.display="none";
  $('minePanel').style.display="block";
  $('mintPanel').style.display="block";
  $('me').textContent=minter;
  refresh();
}
function randStart(){ return (BigInt(Math.floor(Math.random()*1e12))<<16n).toString(); }
function doMine(){
  if(worker)worker.terminate();
  worker=new Worker('worker.js');
  worker.onmessage=onResult;
  best=null;
  $('packet').style.display="none";
  $('bestBits').innerHTML="&hellip;";
  $('theNonce').textContent="-";$('theHash').textContent="-";
  $('mineStat').textContent="mining…";
  btnMint.disabled=true; btnMine.disabled=true;
  worker.postMessage({chainId:CHAIN_ID,contract:CONTRACT,minter:minter,start:randStart()});
}
function onResult(e){
  btnMine.disabled=false; const d=e.data;
  if(d.error){$('bestBits').innerHTML="&mdash;";$('mineStat').textContent="no luck - tap Mine again";return;}
  best={bits:d.bits,nonce:d.nonce,hash:d.hash};
  $('bestBits').textContent=d.bits;
  $('theNonce').textContent=d.nonce;
  $('theHash').textContent=d.hash.slice(0,18)+"…";
  $('spinNote').textContent="(this one spins every "+(60+d.bits*4)+"s)";
  $('mineStat').textContent="got one ("+d.bits+" bits) - re-mine to roll a different one";
  btnMine.textContent="Re-mine";
  renderPacket(); updateMintBtn();
}
async function renderPacket(){
  if(!best)return;
  let price;
  try{price=big(await ethCall(SEL.price));}
  catch(e){
    if(window.__price){price=window.__price;}
    else{$('packet').style.display="none";mintHint.innerHTML='<span class="err">could not read the live price — reload before sending a packet.</span>';return;}
  }
  const value=price+price/100n;
  const data=SEL.mint+BigInt(best.nonce).toString(16).padStart(64,"0");
  $('pkTo').textContent=CONTRACT;
  $('pkVal').textContent="0x"+value.toString(16)+"  ("+fmtEth(value)+")";
  $('pkData').textContent=data;
  let nw=$('pkNet');if(!nw){nw=document.createElement('div');nw.id='pkNet';nw.className='hint';nw.style.margin='0 0 6px';$('packet').insertBefore(nw,$('packet').firstChild);}
  nw.textContent="network: Ethereum mainnet (chainId 1). send it from "+minter+" - the nonce only works for that address, and on any other network it will not mint.";
  $('packet').style.display=(sentNonce!==null&&sentNonce===best.nonce)?"none":"block";
}
function updateMintBtn(){
  if(minting)return;
  const ready=best&&best.bits>=16, open=window.__open, connected=!!account;
  btnMint.style.display=connected?"block":"none";
  if(sentNonce!==null&&best&&sentNonce===best.nonce){btnMint.disabled=true;return;}
  if(connected&&otherAccount){btnMint.disabled=true;mintHint.textContent="Your wallet switched to "+otherAccount.slice(0,10)+"… - this nonce only mints from "+account+". Switch back to it, or reload to mine for the new account.";return;}
  btnMint.disabled=!(ready&&open&&connected);
  if(!ready)mintHint.textContent="Mine a nonce first.";
  else if(!open)mintHint.innerHTML='<span class="warn">Public mint hasn\'t opened yet - your nonce + packet are saved for launch.</span>';
  else if(!connected)mintHint.innerHTML='Copy the packet below and send it from your wallet.';
  else mintHint.textContent="You pay the current price; any overpay is auto-refunded.";
}
async function mint(){
  if(!best||!account||minting||FRAMED)return;
  const nonce=best.nonce;
  minting=true;btnMine.disabled=true; // no re-mine until this mint has an outcome: its status line stays put
  try{
    btnMint.disabled=true;mintHint.textContent="confirm in your wallet…";
    // re-check the network at send time and pin chainId 1: a wallet moved to another chain after connecting must not send there
    if(!(await onMainnet())){try{await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x1"}]});}catch(e){}
      if(!(await onMainnet())){mintHint.textContent="Switch your wallet to Ethereum mainnet, then press Mint again.";btnMint.disabled=!!otherAccount;return;}}
    const price=big(await ethCall(SEL.price)),value=price+price/100n;
    const data=SEL.mint+BigInt(nonce).toString(16).padStart(64,"0");
    const tx=await window.ethereum.request({method:"eth_sendTransaction",params:[{from:account,to:CONTRACT,value:"0x"+value.toString(16),data:data,chainId:"0x1"}]});
    sentNonce=nonce;$('packet').style.display="none";
    if(!/^0x[0-9a-fA-F]{64}$/.test(String(tx))){mintHint.textContent="submitted: "+String(tx).slice(0,80);return;}
    mintHint.innerHTML='submitted: <a target="_blank" rel="noopener" href="https://etherscan.io/tx/'+tx+'">'+tx.slice(0,18)+'…</a>';await poll(tx);
  }catch(e){mintHint.textContent="";const sp=document.createElement('span');sp.className="err";sp.textContent=(e&&e.message)||"failed";mintHint.appendChild(sp);btnMint.disabled=!!otherAccount;}
  finally{minting=false;btnMine.disabled=false;}
}
async function poll(tx){for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,4000));try{const rc=await window.ethereum.request({method:"eth_getTransactionReceipt",params:[tx]});if(rc){mintHint.innerHTML=rc.status==="0x1"?'<span class="ok">minted.</span> <a target="_blank" rel="noopener" href="https://etherscan.io/tx/'+tx+'">view</a>':'<span class="err">reverted.</span>';if(rc.status==="0x1")refresh();else{sentNonce=null;btnMint.disabled=!!otherAccount;$('packet').style.display="block";}return;}}catch(e){}}}
function cp(id){const t=$(id).textContent.split("  (")[0];navigator.clipboard&&navigator.clipboard.writeText(t);}

let taps=0; $('title').addEventListener('click',()=>{if(++taps===4){console.log("%cwhat the crowd ignores, the crowd makes rare.","color:#bc78d6;font-size:13px");taps=0;}});
(function(){try{
  const buf=new Uint8Array(104);let c=1n;for(let i=31;i>=0;i--){buf[i]=Number(c&0xffn);c>>=8n;}
  const cb=CONTRACT.replace(/^0x/,'').match(/../g).map(h=>parseInt(h,16));for(let i=0;i<20;i++)buf[32+i]=cb[i];
  const mb="ECD5287F28b4d762d9DcDbc6E99470a5EC4DA600".match(/../g).map(h=>parseInt(h,16));for(let i=0;i<20;i++)buf[52+i]=mb[i];
  let n=283188n;for(let i=103;i>=72;i--){buf[i]=Number(n&0xffn);n>>=8n;}
  const got="0x"+keccak256.array(buf).map(b=>b.toString(16).padStart(2,"0")).join("");
  console.log("self-test miner:",got.startsWith("0x0000a7d027b9")?"PASS":"FAIL");
}catch(e){console.log("self-test error",e);}})();

$('btnConnect').onclick=connect;
$('noConnect').onclick=e=>{e.preventDefault();$('addrBox').style.display="block";};
$('btnUseAddr').onclick=useAddr;
btnMine.onclick=doMine;
btnMint.onclick=mint;
if(OFF_HOST||FRAMED)$('btnConnect').textContent="Connect wallet on 8004nonce.eth.limo ↗";
// a nonce is bound to the account it was mined for. a locked wallet (no accounts) changes nothing; another account
// turns Mint off until the wallet is back on the account the nonce was mined for. mined work is never thrown away.
if(window.ethereum&&window.ethereum.on){window.ethereum.on('accountsChanged',a=>{if(!account||!a||!a.length)return;otherAccount=String(a[0]).toLowerCase()===account.toLowerCase()?null:String(a[0]);updateMintBtn();});}
document.querySelectorAll('[data-cp]').forEach(b=>b.addEventListener('click',()=>cp(b.getAttribute('data-cp'))));
refresh();
