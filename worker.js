// 8004 NONCE - mining worker. Same-origin + bundled keccak (CSP-safe; runs under default-src 'self').
importScripts('sha3.js');
function hexToBytes(h){h=h.replace(/^0x/,'');const a=new Uint8Array(h.length/2);for(let i=0;i<a.length;i++)a[i]=parseInt(h.substr(i*2,2),16);return a;}
function toHex(a){let s='0x';for(let i=0;i<a.length;i++)s+=a[i].toString(16).padStart(2,'0');return s;}
self.onmessage=function(e){
  const {chainId,contract,minter,start}=e.data;
  const buf=new Uint8Array(104);
  let c=BigInt(chainId);for(let i=31;i>=0;i--){buf[i]=Number(c&0xffn);c>>=8n;}
  const cb=hexToBytes(contract);for(let i=0;i<20;i++)buf[32+i]=cb[i];
  const mb=hexToBytes(minter);for(let i=0;i<20;i++)buf[52+i]=mb[i];
  let nonce=BigInt(start);
  for(let i=0;i<5000000;i++){
    let x=nonce;for(let j=103;j>=72;j--){buf[j]=Number(x&0xffn);x>>=8n;}
    const h=keccak256.array(buf);let bits=0;
    for(let k=0;k<32;k++){if(h[k]===0){bits+=8;}else{let b=h[k];while((b&0x80)===0){bits++;b<<=1;}break;}}
    if(bits>=16){self.postMessage({nonce:nonce.toString(),hash:toHex(h),bits:bits});return;}
    nonce++;
  }
  self.postMessage({error:true});
};
