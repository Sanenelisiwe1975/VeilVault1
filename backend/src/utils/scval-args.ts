/**
 * Typed argument specs for building Soroban contract-call ScVals from
 * plain JSON over HTTP — used by the generic passkey-transaction routes,
 * where the caller (frontend) names a contract method and its arguments
 * without the backend needing a bespoke typed wrapper per method.
 *
 * Deliberately scalar-only (no nested structs/maps): every user-facing
 * contract method in this codebase takes plain amounts/addresses/indices/
 * bytes, so this covers real call sites without the ambiguity of a fully
 * generic ScVal-from-JSON encoder.
 */
import { nativeToScVal, Address, xdr } from '@stellar/stellar-sdk';

export type ScValArgSpec =
  | { type: 'u32'; value: number }
  | { type: 'u64'; value: string } // decimal string — avoids JS number precision loss
  | { type: 'i128'; value: string }
  | { type: 'bytes'; value: string } // base64
  | { type: 'address'; value: string }
  | { type: 'string'; value: string }
  | { type: 'symbol'; value: string }
  | { type: 'bool'; value: boolean };

export function buildArgScVal(spec: ScValArgSpec): xdr.ScVal {
  switch (spec.type) {
    case 'u32':
      return nativeToScVal(spec.value, { type: 'u32' });
    case 'u64':
      return nativeToScVal(BigInt(spec.value), { type: 'u64' });
    case 'i128':
      return nativeToScVal(BigInt(spec.value), { type: 'i128' });
    case 'bytes':
      return nativeToScVal(Buffer.from(spec.value, 'base64'), { type: 'bytes' });
    case 'address':
      return new Address(spec.value).toScVal();
    case 'string':
      return nativeToScVal(spec.value, { type: 'string' });
    case 'symbol':
      return nativeToScVal(spec.value, { type: 'symbol' });
    case 'bool':
      return nativeToScVal(spec.value);
  }
}
