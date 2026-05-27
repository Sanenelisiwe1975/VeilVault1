import axios, { AxiosInstance } from 'axios';

export enum ProposalType {
  Distribution = 0,
  Withdrawal = 1,
  AddMember = 2,
  RemoveMember = 3,
  EmergencyStop = 4,
}

export enum ProposalStatus {
  Active = 0,
  Approved = 1,
  Rejected = 2,
  Executed = 3,
  Expired = 4,
}

export interface StokvelConfig {
  admin: string;
  name: string;
  asset: string;
  threshold: number;
  maxMembers: number;
  contributionAmount: string;
  contributionIntervalSecs: string;
  yieldVault: string | null;
  totalContributed: string;
  totalDistributed: string;
  memberCount: number;
  proposalCount: string;
  paused: boolean;
}

export interface MemberInfo {
  address: string;
  shareBps: number;
  totalContributed: string;
  lastContribution: number;
  joinedAt: number;
}

export interface Proposal {
  id: string;
  proposer: string;
  proposalType: ProposalType;
  status: ProposalStatus;
  approvals: string[];
  rejections: string[];
  targetAddress: string | null;
  amount: string | null;
  expiresAt: number;
  createdAt: number;
  executedAt: number | null;
}

export interface StokvelClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export class StokvelClient {
  private http: AxiosInstance;

  constructor(cfg: StokvelClientConfig) {
    this.http = axios.create({
      baseURL: `${cfg.baseUrl}/api/stokvel`,
      timeout: cfg.timeout ?? 30_000,
      headers: { 'x-api-key': cfg.apiKey, 'content-type': 'application/json' },
    });
  }

  async getConfig(): Promise<StokvelConfig> {
    const { data } = await this.http.get<StokvelConfig>('/config');
    return data;
  }

  async getMember(address: string): Promise<MemberInfo> {
    const { data } = await this.http.get<MemberInfo>(`/member/${address}`);
    return data;
  }

  async getProposal(proposalId: string): Promise<Proposal> {
    const { data } = await this.http.get<Proposal>(`/proposal/${proposalId}`);
    return data;
  }

  async initialize(params: {
    admin: string;
    name: string;
    asset: string;
    threshold: number;
    maxMembers: number;
    contributionAmount: string;
    contributionIntervalSecs: string;
    adminSecret: string;
  }): Promise<void> {
    await this.http.post('/init', params);
  }

  async addMember(params: {
    admin: string;
    member: string;
    adminSecret: string;
  }): Promise<void> {
    await this.http.post('/add-member', params);
  }

  async contribute(params: { member: string; memberSecret: string }): Promise<void> {
    await this.http.post('/contribute', params);
  }

  async proposeDistribution(params: {
    proposer: string;
    recipient: string;
    amount: string;
    proposerSecret: string;
  }): Promise<string> {
    const { data } = await this.http.post<{ proposalId: string }>('/propose', params);
    return data.proposalId;
  }

  async vote(params: {
    voter: string;
    proposalId: string;
    approve: boolean;
    voterSecret: string;
  }): Promise<void> {
    await this.http.post('/vote', params);
  }

  async executeProposal(params: {
    executor: string;
    proposalId: string;
    executorSecret: string;
  }): Promise<void> {
    await this.http.post('/execute-proposal', params);
  }

  async setYieldVault(params: { vaultAddress: string; adminSecret: string }): Promise<void> {
    await this.http.post('/set-yield-vault', params);
  }
}
