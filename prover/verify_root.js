// Quick verification: does the new TypeScript hashPair logic match the on-chain root?
const { createHash } = require("crypto");

const FR_MOD = BigInt("0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001");
const ROUNDS = 110;
const DEPTH  = 20;

// Round constants — chain on ZEROED buf (matching new contract)
function computeRC() {
  let h = createHash("sha256").update("veilpool_mimc5_bls12381_rc_v1").digest();
  let arr = Buffer.from(h); arr[0] = 0;
  const out = [];
  for (let i = 0; i < ROUNDS; i++) {
    let v = 0n;
    for (let j = 0; j < 32; j++) v = (v << 8n) | BigInt(arr[j]);
    out.push(v % FR_MOD);
    const next = createHash("sha256").update(arr).digest();
    arr = Buffer.from(next); arr[0] = 0;
  }
  return out;
}
const RC = computeRC();

function frAdd(a, b) { return (a + b) % FR_MOD; }
function frMul(a, b) { return (a * b) % FR_MOD; }

// NO byte[0] zeroing — inputs are already valid Fr elements
function bufToFr(buf) {
  let v = 0n;
  for (let i = 0; i < 32; i++) v = (v << 8n) | BigInt(buf[i]);
  return v;
}

function frToBytes(fr) {
  const b = Buffer.alloc(32);
  let v = fr;
  for (let i = 31; i >= 0; i--) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}

function hashPair(left, right) {
  let a = bufToFr(left), b = bufToFr(right);
  for (const c of RC) {
    const t  = frAdd(b, c);
    const t2 = frMul(t, t);
    const t4 = frMul(t2, t2);
    const t5 = frMul(t4, t);
    const nb = frAdd(a, t5);
    a = b; b = nb;
  }
  return frToBytes(frAdd(a, b));
}

// Zero nodes
function computeZeroNodes() {
  const z = [Buffer.alloc(32)];
  for (let i = 0; i < DEPTH; i++) z.push(hashPair(z[i], z[i]));
  return z;
}
const ZERO_NODES = computeZeroNodes();

// The commitment with byte[0] zeroed (as stored by the new contract)
const RAW_COMMITMENT = Buffer.from(
  "83072f0ca822982bead6289e9bdb9850de9e1a17fcd613ad1262487cf2d7072b", "hex"
);
const LEAF = Buffer.from(RAW_COMMITMENT);
LEAF[0] = 0x00;  // byte[0] zeroed — this is what the contract stores via get_leaves

const allLeaves = [LEAF, LEAF];  // both deposits have the same commitment

const memo = new Map();
function subtree(index, level) {
  if (level === 0) return allLeaves[index] || ZERO_NODES[0];
  const key = `${level}:${index}`;
  if (memo.has(key)) return memo.get(key);
  const h = hashPair(subtree(index * 2, level - 1), subtree(index * 2 + 1, level - 1));
  memo.set(key, h);
  return h;
}

const root = subtree(0, DEPTH).toString("hex");
const ONCHAIN_ROOT = "12871d08259e5d13d07cd80b07edcb37b338165c2098879f06d836e314d2d016";
console.log("Computed root: ", root);
console.log("On-chain root: ", ONCHAIN_ROOT);
console.log("Match:         ", root === ONCHAIN_ROOT);

// Also compute the path for leaf 1
const pe = [], pi = [];
let node = 1;
for (let level = 0; level < DEPTH; level++) {
  const isRight = node % 2 === 1;
  const sibIdx  = isRight ? node - 1 : node + 1;
  pe.push(subtree(sibIdx, level).toString("hex"));
  pi.push(isRight);
  node = Math.floor(node / 2);
}

if (root === ONCHAIN_ROOT) {
  const fs = require("fs");
  fs.writeFileSync("pe.json", JSON.stringify(pe));
  fs.writeFileSync("pi.json", JSON.stringify(pi));
  console.log("\nWrote pe.json and pi.json");
  console.log("Leaf (stored by contract):", LEAF.toString("hex"));
} else {
  console.log("\nRoot mismatch — path files NOT written");
}
