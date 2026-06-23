import { StellarClient } from '../integrations/stellar/client';
import { config } from '../config';
import { Address, nativeToScVal, scValToNative } from '@stellar/stellar-sdk';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

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
  contributionAmount: bigint;
  contributionIntervalSecs: bigint;
  yieldVault: string | null;
  totalContributed: bigint;
  totalDistributed: bigint;
  memberCount: number;
  proposalCount: bigint;
  paused: boolean;
}

export interface Proposal {
  id: bigint;
  proposer: string;
  proposalType: ProposalType;
  status: ProposalStatus;
  approvals: string[];
  rejections: string[];
  targetAddress: string | null;
  amount: bigint | null;
  expiresAt: number;
  createdAt: number;
  executedAt: number | null;
}

export interface MemberInfo {
  address: string;
  shareBps: number;
  totalContributed: bigint;
  lastContribution: number;
  joinedAt: number;
}

export class StokvelService {
  private contractId: string;
  private stellar: StellarClient;

  constructor(stellar: StellarClient) {
    this.stellar = stellar;
    if (!config.STOKVEL_REGISTRY_CONTRACT_ID) throw new Error('STOKVEL_REGISTRY_CONTRACT_ID not set');
    this.contractId = config.STOKVEL_REGISTRY_CONTRACT_ID;
  }

  async initialize(params: {
    admin: string;
    name: string;
    asset: string;
    threshold: number;
    maxMembers: number;
    contributionAmount: bigint;
    contributionIntervalSecs: bigint;
    adminSecret: string;
  }): Promise<void> {
    logger.info('Initializing stokvel', { name: params.name, threshold: params.threshold });

    await this.stellar.invokeContract(
      this.contractId,
      'initialize',
      [
        new Address(params.admin).toScVal(),
        nativeToScVal(params.name, { type: 'string' }),
        new Address(params.asset).toScVal(),
        nativeToScVal(params.threshold, { type: 'u32' }),
        nativeToScVal(params.maxMembers, { type: 'u32' }),
        nativeToScVal(params.contributionAmount, { type: 'i128' }),
        nativeToScVal(params.contributionIntervalSecs, { type: 'u64' }),
      ],
      params.adminSecret
    );
  }

  async addMember(params: {
    admin: string;
    member: string;
    adminSecret: string;
  }): Promise<void> {
    await this.stellar.invokeContract(
      this.contractId,
      'add_member',
      [
        new Address(params.admin).toScVal(),
        new Address(params.member).toScVal(),
      ],
      params.adminSecret
    );
  }

  async contribute(params: {
    member: string;
    memberSecret: string;
  }): Promise<void> {
    logger.info('Recording contribution', { member: params.member });
    await this.stellar.invokeContract(
      this.contractId,
      'contribute',
      [new Address(params.member).toScVal()],
      params.memberSecret
    );
  }

  async proposeDistribution(params: {
    proposer: string;
    recipient: string;
    amount: bigint;
    proposerSecret: string;
  }): Promise<bigint> {
    const { result } = await this.stellar.invokeContract(
      this.contractId,
      'propose',
      [
        new Address(params.proposer).toScVal(),
        nativeToScVal(ProposalType.Distribution, { type: 'u32' }),
        new Address(params.recipient).toScVal(),
        nativeToScVal(params.amount, { type: 'i128' }),
      ],
      params.proposerSecret
    );
    if (!result) throw new Error('No return value from propose call');
    return BigInt(scValToNative(result) as string);
  }

  async voteProposal(params: {
    voter: string;
    proposalId: bigint;
    approve: boolean;
    voterSecret: string;
  }): Promise<void> {
    await this.stellar.invokeContract(
      this.contractId,
      'vote',
      [
        new Address(params.voter).toScVal(),
        nativeToScVal(params.proposalId, { type: 'u64' }),
        nativeToScVal(params.approve),
      ],
      params.voterSecret
    );
  }

  async executeProposal(params: {
    executor: string;
    proposalId: bigint;
    executorSecret: string;
  }): Promise<void> {
    logger.info('Executing proposal', { proposalId: params.proposalId.toString() });
    await this.stellar.invokeContract(
      this.contractId,
      'execute_proposal',
      [
        new Address(params.executor).toScVal(),
        nativeToScVal(params.proposalId, { type: 'u64' }),
      ],
      params.executorSecret
    );
  }

  async setYieldVault(params: {
    vaultAddress: string;
    adminSecret: string;
  }): Promise<void> {
    await this.stellar.invokeContract(
      this.contractId,
      'set_yield_vault',
      [new Address(params.vaultAddress).toScVal()],
      params.adminSecret
    );
  }

  async getConfig(): Promise<StokvelConfig | null> {
    try {
      const result = await this.stellar.callView(this.contractId, 'get_config', []);
      if (!result) return null;
      return this.parseConfig(scValToNative(result) as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  async getMemberInfo(memberAddress: string): Promise<MemberInfo | null> {
    try {
      const result = await this.stellar.callView(
        this.contractId,
        'get_member',
        [new Address(memberAddress).toScVal()]
      );
      if (!result) return null;
      return this.parseMember(scValToNative(result) as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  async getProposal(proposalId: bigint): Promise<Proposal | null> {
    try {
      const result = await this.stellar.callView(
        this.contractId,
        'get_proposal',
        [nativeToScVal(proposalId, { type: 'u64' })]
      );
      if (!result) return null;
      return this.parseProposal(scValToNative(result) as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  private parseConfig(raw: Record<string, unknown>): StokvelConfig {
    return {
      admin: raw.admin as string,
      name: raw.name as string,
      asset: raw.asset as string,
      threshold: Number(raw.threshold),
      maxMembers: Number(raw.max_members),
      contributionAmount: BigInt(raw.contribution_amount as string),
      contributionIntervalSecs: BigInt(raw.contribution_interval_secs as string),
      yieldVault: (raw.yield_vault as string | null) ?? null,
      totalContributed: BigInt(raw.total_contributed as string),
      totalDistributed: BigInt(raw.total_distributed as string),
      memberCount: Number(raw.member_count),
      proposalCount: BigInt(raw.proposal_count as string),
      paused: raw.paused as boolean,
    };
  }

  private parseMember(raw: Record<string, unknown>): MemberInfo {
    return {
      address: raw.address as string,
      shareBps: Number(raw.share_bps),
      totalContributed: BigInt(raw.total_contributed as string),
      lastContribution: Number(raw.last_contribution),
      joinedAt: Number(raw.joined_at),
    };
  }

  private parseProposal(raw: Record<string, unknown>): Proposal {
    return {
      id: BigInt(raw.id as string),
      proposer: raw.proposer as string,
      proposalType: Number(raw.proposal_type) as ProposalType,
      status: Number(raw.status) as ProposalStatus,
      approvals: raw.approvals as string[],
      rejections: raw.rejections as string[],
      targetAddress: (raw.target_address as string | null) ?? null,
      amount: raw.amount ? BigInt(raw.amount as string) : null,
      expiresAt: Number(raw.expires_at),
      createdAt: Number(raw.created_at),
      executedAt: raw.executed_at ? Number(raw.executed_at) : null,
    };
  }
}

let instance: StokvelService | null = null;
export function getStokvelService(stellar: StellarClient): StokvelService {
  if (!instance) instance = new StokvelService(stellar);
  return instance;
}
