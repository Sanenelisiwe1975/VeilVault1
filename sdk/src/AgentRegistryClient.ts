import axios, { AxiosInstance } from 'axios';

export enum ReputationLevel {
  Unverified = 0,
  Verified = 1,
  Trusted = 2,
  Elite = 3,
}

export interface AgentProfile {
  did: string;
  stellarAddress: string;
  vcHash: string;
  vcUri: string;
  reputationScore: number;
  level: ReputationLevel;
  totalExecutions: string;
  successfulExecutions: string;
  totalVolume: string;
  winStreak: number;
  banned: boolean;
  registeredAt: number;
  updatedAt: number;
}

export interface AgentRegistryClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export class AgentRegistryClient {
  private http: AxiosInstance;

  constructor(cfg: AgentRegistryClientConfig) {
    this.http = axios.create({
      baseURL: `${cfg.baseUrl}/api/registry`,
      timeout: cfg.timeout ?? 30_000,
      headers: { 'x-api-key': cfg.apiKey, 'content-type': 'application/json' },
    });
  }

  async getProfile(agentAddress: string): Promise<AgentProfile> {
    const { data } = await this.http.get<AgentProfile>(`/${agentAddress}`);
    return data;
  }

  async meetsMinimumLevel(agentAddress: string, level: ReputationLevel): Promise<boolean> {
    const { data } = await this.http.get<{ meets: boolean }>(`/${agentAddress}/level`, {
      params: { min: level },
    });
    return data.meets;
  }

  async register(params: {
    agent: string;
    did: string;
    vcHash: string;
    vcUri: string;
    signerSecret: string;
  }): Promise<void> {
    await this.http.post('/register', params);
  }

  async submitVcUpdate(params: {
    agent: string;
    vcHash: string;
    vcUri: string;
    signerSecret: string;
  }): Promise<void> {
    await this.http.post('/vc-update', params);
  }

  async acceptVc(params: { agent: string; adminSecret: string }): Promise<void> {
    await this.http.post('/accept-vc', params);
  }

  async ban(params: { agent: string; adminSecret: string }): Promise<void> {
    await this.http.post('/ban', params);
  }

  async unban(params: { agent: string; adminSecret: string }): Promise<void> {
    await this.http.post('/unban', params);
  }

  async slash(params: { agent: string; amount: number; adminSecret: string }): Promise<void> {
    await this.http.post('/slash', params);
  }
}
