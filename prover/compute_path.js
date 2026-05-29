const { createHash } = require("crypto");
const FR_MOD = BigInt("0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001");
const ROUNDS = 110; const DEPTH = 20;
function computeRC() {
  let h = createHash("sha256").update("veilpool_mimc5_bls12381_rc_v1").digest();
  const out = [];
  for(let i=0;i<ROUNDS;i++){
    const arr=Buffer.from(h);arr[0]=0;
    let v=0n;for(let j=0;j<32;j++) v=(v<<8n)|BigInt(arr[j]);
    out.push(v%FR_MOD);
    h=createHash("sha256").update(h).digest();
  }
  return out;
}
const RC=computeRC();
function toFr(b){const buf=Buffer.from(b);buf[0]=0;let v=0n;for(let i=0;i<32;i++) v=(v<<8n)|BigInt(buf[i]);return v%FR_MOD;}
function frToBytes(fr){const b=Buffer.alloc(32);let v=fr;for(let i=31;i>=0;i--){b[i]=Number(v&0xffn);v>>=8n;}return b;}
function fadd(a,b){return(a+b)%FR_MOD;}function fmul(a,b){return(a*b)%FR_MOD;}
function hp(l,r){let a=toFr(l),b=toFr(r);for(const c of RC){const t=fadd(b,c),t2=fmul(t,t),t4=fmul(t2,t2),t5=fmul(t4,t),nb=fadd(a,t5);a=b;b=nb;}return frToBytes(fadd(a,b));}
const commit=Buffer.from("83072f0ca822982bead6289e9bdb9850de9e1a17fcd613ad1262487cf2d7072b","hex");
const allLeaves=[commit,commit];
const memo=new Map();
function subtree(index,level){
  if(level===0) return allLeaves[index]||Buffer.alloc(32);
  const key=level+":"+index;
  if(memo.has(key)) return memo.get(key);
  const h=hp(subtree(index*2,level-1),subtree(index*2+1,level-1));
  memo.set(key,h);return h;
}
const pe=[],pi=[];
let node=1;
for(let level=0;level<DEPTH;level++){
  const isRight=node%2===1;
  pe.push(subtree(isRight?node-1:node+1,level).toString("hex"));
  pi.push(isRight);
  node=Math.floor(node/2);
}
const root=subtree(0,DEPTH).toString("hex");
console.log("root:"+root);
console.log("match:"+(root==="2ddf8439e7976bb20dcd9f2c96db591d6cccdf1a48101c01b9b6df618b212451"));
console.log("pe:"+JSON.stringify(pe));
console.log("pi:"+JSON.stringify(pi));
