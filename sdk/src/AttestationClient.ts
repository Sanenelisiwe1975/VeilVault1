import axios, { AxiosInstance } from 'axios';

export interface Groth16Proof {
  a: string;  // hex, 96 bytes → 192 chars
  b: string;  // hex, 192 bytes → 384 chars
  c: string;  // hex, 96 bytes → 192 chars
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

export interface VerifyingKeyParams {
  circuitId: string;
  circuitName: string;
  alphaG1Neg: string;   // hex, 96 bytes → 192 chars (pre-negated)
  betaG2: string;       // hex, 192 bytes → 384 chars
  gammaG2: string;
  deltaG2: string;
  ic: string[];         // hex G1 points, 96 bytes each
  adminSecret: string;
}

export interface AttestationClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export class AttestationClient {
  private http: AxiosInstance;

  constructor(cfg: AttestationClientConfig) {
    this.http = axios.create({
      baseURL: `${cfg.baseUrl}/api/attestations`,
      timeout: cfg.timeout ?? 60_000,  // ZK ops can be slow
      headers: { 'x-api-key': cfg.apiKey, 'content-type': 'application/json' },
    });
  }

  async getAttestation(attestationId: string): Promise<PerformanceAttestation> {
    const { data } = await this.http.get<PerformanceAttestation>(`/${attestationId}`);
    return data;
  }

  async isValid(attestationId: string): Promise<boolean> {
    const { data } = await this.http.get<{ valid: boolean }>(`/${attestationId}/valid`);
    return data.valid;
  }

  async getCount(): Promise<string> {
    const { data } = await this.http.get<{ count: string }>('/count');
    return data.count;
  }

  async verifyProof(params: {
    circuitId: string;
    proof: Groth16Proof;
    publicInputs: string[];
  }): Promise<boolean> {
    const { data } = await this.http.post<{ valid: boolean }>('/verify', params);
    return data.valid;
  }

  async attestPerformance(params: {
    circuitId: string;
    vault: string;
    prover: string;
    strategyCommitment: string;
    periodStart: number;
    periodEnd: number;
    returnBps: number;
    proof: Groth16Proof;
    publicInputs: string[];
    proverSecret: string;
  }): Promise<string> {
    const { data } = await this.http.post<{ attestationId: string }>('/attest', params);
    return data.attestationId;
  }

  async registerCircuit(params: VerifyingKeyParams): Promise<void> {
    await this.http.post('/register-circuit', params);
  }
}
