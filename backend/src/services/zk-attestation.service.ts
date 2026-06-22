import { StellarClient } from '../integrations/stellar/client';
import { config } from '../config';
import { Address, nativeToScVal, scValToNative } from '@stellar/stellar-sdk';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

export interface VerifyingKey {
  circuitId: string;
  circuitName: string;
  alphaG1Neg: Buffer;  // 96 bytes, pre-negated
  betaG2: Buffer;      // 192 bytes
  gammaG2: Buffer;     // 192 bytes
  deltaG2: Buffer;     // 192 bytes
  ic: Buffer[];        // 96 bytes each
}

export interface Groth16Proof {
  a: Buffer;   // G1, 96 bytes
  b: Buffer;   // G2, 192 bytes
  c: Buffer;   // G1, 96 bytes
}

export interface PerformanceAttestation {
  attestationId: string;
  circuitId: string;
  vault: string;
  prover: string;
  strategyCommitment: string;
  periodStart: number;
  periodEnd: number;
  returnBps: number;
  proof: Groth16Proof;
  publicInputsHash: string;
  verified: boolean;
  timestamp: number;
}

export interface AttestPerformanceParams {
  circuitId: string;
  vault: string;
  prover: string;
  strategyCommitment: Buffer;
  periodStart: number;
  periodEnd: number;
  returnBps: number;
  proof: Groth16Proof;
  publicInputs: Buffer[];  // 5 Fr scalars (32 bytes each)
  proverSecret: string;
}

export class ZkAttestationService {
  private contractId: string;
  private stellar: StellarClient;

  constructor(stellar: StellarClient) {
    this.stellar = stellar;
    if (!config.ZK_VERIFIER_CONTRACT_ID) throw new Error('ZK_VERIFIER_CONTRACT_ID not set');
    this.contractId = config.ZK_VERIFIER_CONTRACT_ID;
  }

  async registerCircuit(params: {
    circuitId: string;
    circuitName: string;
    vk: Omit<VerifyingKey, 'circuitId' | 'circuitName'>;
    adminSecret: string;
  }): Promise<void> {
    logger.info('Registering ZK circuit', { circuitId: params.circuitId, name: params.circuitName });

    const circuitIdBytes = Buffer.from(params.circuitId, 'hex');
    const icVals = params.vk.ic.map(ic => nativeToScVal(ic, { type: 'bytes' }));

    await this.stellar.invokeContract(
      this.contractId,
      'register_circuit',
      [
        nativeToScVal(circuitIdBytes, { type: 'bytes' }),
        nativeToScVal(params.circuitName, { type: 'string' }),
        nativeToScVal(params.vk.alphaG1Neg, { type: 'bytes' }),
        nativeToScVal(params.vk.betaG2, { type: 'bytes' }),
        nativeToScVal(params.vk.gammaG2, { type: 'bytes' }),
        nativeToScVal(params.vk.deltaG2, { type: 'bytes' }),
        nativeToScVal(icVals),
      ],
      params.adminSecret
    );
  }

  async verifyProof(params: {
    circuitId: string;
    proof: Groth16Proof;
    publicInputs: Buffer[];
  }): Promise<boolean> {
    try {
      const circuitIdBytes = Buffer.from(params.circuitId, 'hex');
      const piVals = params.publicInputs.map(pi => nativeToScVal(pi, { type: 'bytes' }));

      const proofVal = {
        a: params.proof.a,
        b: params.proof.b,
        c: params.proof.c,
      };

      const result = await this.stellar.callView(
        this.contractId,
        'verify_proof',
        [
          nativeToScVal(circuitIdBytes, { type: 'bytes' }),
          nativeToScVal(proofVal),
          nativeToScVal(piVals),
        ]
      );

      return scValToNative(result as Parameters<typeof scValToNative>[0]) as boolean;
    } catch (err) {
      logger.error('ZK proof verification failed', { error: err });
      return false;
    }
  }

  async attestPerformance(params: AttestPerformanceParams): Promise<string> {
    logger.info('Attesting vault performance', {
      vault: params.vault,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      returnBps: params.returnBps,
    });

    const circuitIdBytes = Buffer.from(params.circuitId, 'hex');
    const piVals = params.publicInputs.map(pi => nativeToScVal(pi, { type: 'bytes' }));

    const proofVal = {
      a: params.proof.a,
      b: params.proof.b,
      c: params.proof.c,
    };

    const { result } = await this.stellar.invokeContract(
      this.contractId,
      'attest_performance',
      [
        nativeToScVal(circuitIdBytes, { type: 'bytes' }),
        new Address(params.vault).toScVal(),
        new Address(params.prover).toScVal(),
        nativeToScVal(params.strategyCommitment, { type: 'bytes' }),
        nativeToScVal(params.periodStart, { type: 'u64' }),
        nativeToScVal(params.periodEnd, { type: 'u64' }),
        nativeToScVal(params.returnBps, { type: 'i64' }),
        nativeToScVal(proofVal),
        nativeToScVal(piVals),
      ],
      params.proverSecret
    );

    if (!result) throw new Error('No return value from attest_performance call');
    const attestId = scValToNative(result) as Uint8Array;
    return Buffer.from(attestId).toString('hex');
  }

  async getAttestation(attestationId: string): Promise<PerformanceAttestation | null> {
    try {
      const idBytes = Buffer.from(attestationId, 'hex');
      const result = await this.stellar.callView(
        this.contractId,
        'get_attestation',
        [nativeToScVal(idBytes, { type: 'bytes' })]
      );
      if (!result) return null;
      return this.parseAttestation(scValToNative(result) as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  async isValid(attestationId: string): Promise<boolean> {
    try {
      const idBytes = Buffer.from(attestationId, 'hex');
      const result = await this.stellar.callView(
        this.contractId,
        'is_valid',
        [nativeToScVal(idBytes, { type: 'bytes' })]
      );
      return scValToNative(result as Parameters<typeof scValToNative>[0]) as boolean;
    } catch {
      return false;
    }
  }

  async getAttestationCount(): Promise<bigint> {
    try {
      const result = await this.stellar.callView(this.contractId, 'get_attestation_count', []);
      return BigInt(scValToNative(result as Parameters<typeof scValToNative>[0]) as string);
    } catch {
      return 0n;
    }
  }

  private parseAttestation(raw: Record<string, unknown>): PerformanceAttestation {
    const proofRaw = raw.proof as Record<string, unknown>;
    return {
      attestationId: Buffer.from(raw.attestation_id as Uint8Array).toString('hex'),
      circuitId: Buffer.from(raw.circuit_id as Uint8Array).toString('hex'),
      vault: raw.vault as string,
      prover: raw.prover as string,
      strategyCommitment: Buffer.from(raw.strategy_commitment as Uint8Array).toString('hex'),
      periodStart: Number(raw.period_start),
      periodEnd: Number(raw.period_end),
      returnBps: Number(raw.return_bps),
      proof: {
        a: Buffer.from(proofRaw.a as Uint8Array),
        b: Buffer.from(proofRaw.b as Uint8Array),
        c: Buffer.from(proofRaw.c as Uint8Array),
      },
      publicInputsHash: Buffer.from(raw.public_inputs_hash as Uint8Array).toString('hex'),
      verified: raw.verified as boolean,
      timestamp: Number(raw.timestamp),
    };
  }
}

let instance: ZkAttestationService | null = null;
export function getZkAttestationService(stellar: StellarClient): ZkAttestationService {
  if (!instance) instance = new ZkAttestationService(stellar);
  return instance;
}
