import { StellarClient } from '../integrations/stellar/client';
import { config } from '../config';
import { Address, nativeToScVal, scValToNative } from '@stellar/stellar-sdk';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

export interface AgentProfile {
  did: string;
  stellarAddress: string;
  vcHash: string;
  vcUri: string;
  reputationScore: number;
  level: ReputationLevel;
  totalExecutions: bigint;
  successfulExecutions: bigint;
  totalVolume: bigint;
  winStreak: number;
  banned: boolean;
  registeredAt: number;
  updatedAt: number;
}

export enum ReputationLevel {
  Unverified = 0,
  Verified = 1,
  Trusted = 2,
  Elite = 3,
}

/**
 * Punitive/identity actions against a specific agent. These cannot be
 * triggered by a single admin key — they go through propose/approve/execute
 * with the registry's M-of-N admin threshold (see contracts/agent-registry).
 */
export enum AdminAction {
  Ban = 0,
  Unban = 1,
  Slash = 2,
  AcceptVc = 3,
}

export enum AdminProposalStatus {
  Active = 0,
  Approved = 1,
  Executed = 2,
  Expired = 3,
}

export interface AdminProposal {
  id: bigint;
  action: AdminAction;
  target: string;
  amount: number;
  proposer: string;
  approvals: string[];
  status: AdminProposalStatus;
  createdAt: number;
  expiresAt: number;
}

export interface VcUpdateRequest {
  agentAddress: string;
  vcHash: string;
  vcUri: string;
}

export class AgentRegistryService {
  private contractId: string;
  private stellar: StellarClient;

  constructor(stellar: StellarClient) {
    this.stellar = stellar;
    if (!config.AGENT_REGISTRY_CONTRACT_ID) throw new Error('AGENT_REGISTRY_CONTRACT_ID not set');
    this.contractId = config.AGENT_REGISTRY_CONTRACT_ID;
  }

  async registerAgent(params: {
    agent: string;
    did: string;
    vcHash: string;
    vcUri: string;
    signerSecret: string;
  }): Promise<void> {
    logger.info('Registering agent', { agent: params.agent, did: params.did });

    const didVal = nativeToScVal(params.did, { type: 'string' });
    const vcHashBytes = Buffer.from(params.vcHash, 'hex');
    const vcHashVal = nativeToScVal(vcHashBytes, { type: 'bytes' });
    const vcUriVal = nativeToScVal(params.vcUri, { type: 'string' });

    await this.stellar.invokeContract(
      this.contractId,
      'register',
      [
        new Address(params.agent).toScVal(),
        didVal,
        vcHashVal,
        vcUriVal,
      ],
      params.signerSecret
    );
  }

  async submitVcUpdate(params: {
    agent: string;
    vcHash: string;
    vcUri: string;
    signerSecret: string;
  }): Promise<void> {
    logger.info('Submitting VC update', { agent: params.agent });

    const vcHashBytes = Buffer.from(params.vcHash, 'hex');
    await this.stellar.invokeContract(
      this.contractId,
      'submit_vc_update',
      [
        new Address(params.agent).toScVal(),
        nativeToScVal(vcHashBytes, { type: 'bytes' }),
        nativeToScVal(params.vcUri, { type: 'string' }),
      ],
      params.signerSecret
    );
  }

  async getProfile(agentAddress: string): Promise<AgentProfile | null> {
    try {
      const result = await this.stellar.callView(
        this.contractId,
        'get_agent',
        [new Address(agentAddress).toScVal()]
      );

      if (!result) return null;
      const raw = scValToNative(result) as Record<string, unknown>;
      return this.parseProfile(raw);
    } catch {
      return null;
    }
  }

  async meetsMinimumLevel(agentAddress: string, level: ReputationLevel): Promise<boolean> {
    try {
      const result = await this.stellar.callView(
        this.contractId,
        'meets_minimum_level',
        [
          new Address(agentAddress).toScVal(),
          nativeToScVal(level, { type: 'u32' }),
        ]
      );
      return scValToNative(result) as boolean;
    } catch {
      return false;
    }
  }

  //  Admin proposals (M-of-N multisig) — ban / unban / slash / accept_vc

  /** Propose a punitive/identity action against an agent. Auto-approved if the registry's threshold is 1. */
  async proposeAdminAction(params: {
    proposer: string;
    action: AdminAction;
    target: string;
    amount?: number; // required for Slash, ignored otherwise
    proposerSecret: string;
  }): Promise<bigint> {
    logger.info('Proposing admin action', { proposer: params.proposer, action: params.action, target: params.target });

    const { result } = await this.stellar.invokeContract(
      this.contractId,
      'propose_admin_action',
      [
        new Address(params.proposer).toScVal(),
        nativeToScVal(params.action, { type: 'u32' }),
        new Address(params.target).toScVal(),
        nativeToScVal(params.amount ?? 0, { type: 'u32' }),
      ],
      params.proposerSecret
    );
    if (!result) throw new Error('No return value from propose_admin_action call');
    return BigInt(scValToNative(result) as string);
  }

  /** Approve a pending admin proposal. */
  async approveAdminAction(params: {
    approver: string;
    proposalId: bigint;
    approverSecret: string;
  }): Promise<AdminProposalStatus> {
    const { result } = await this.stellar.invokeContract(
      this.contractId,
      'approve_admin_action',
      [
        new Address(params.approver).toScVal(),
        nativeToScVal(params.proposalId, { type: 'u64' }),
      ],
      params.approverSecret
    );
    if (result === null) throw new Error('No return value from approve_admin_action call');
    return scValToNative(result) as AdminProposalStatus;
  }

  /** Execute an approved admin proposal (threshold already met). */
  async executeAdminAction(params: {
    executor: string;
    proposalId: bigint;
    executorSecret: string;
  }): Promise<void> {
    await this.stellar.invokeContract(
      this.contractId,
      'execute_admin_action',
      [
        new Address(params.executor).toScVal(),
        nativeToScVal(params.proposalId, { type: 'u64' }),
      ],
      params.executorSecret
    );
  }

  async getAdminProposal(proposalId: bigint): Promise<AdminProposal | null> {
    try {
      const result = await this.stellar.callView(
        this.contractId,
        'get_admin_proposal_info',
        [nativeToScVal(proposalId, { type: 'u64' })]
      );
      if (!result) return null;
      return this.parseAdminProposal(scValToNative(result) as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  async getAdmins(): Promise<string[]> {
    const result = await this.stellar.callView(this.contractId, 'get_admins', []);
    return scValToNative(result) as string[];
  }

  async getAdminThreshold(): Promise<number> {
    const result = await this.stellar.callView(this.contractId, 'get_admin_threshold', []);
    return Number(scValToNative(result));
  }

  private parseProfile(raw: Record<string, unknown>): AgentProfile {
    return {
      did: raw.did as string,
      stellarAddress: raw.stellar_address as string,
      vcHash: Buffer.from(raw.vc_hash as Uint8Array).toString('hex'),
      vcUri: raw.vc_uri as string,
      reputationScore: Number(raw.reputation_score),
      level: Number(raw.level) as ReputationLevel,
      totalExecutions: BigInt(raw.total_executions as string),
      successfulExecutions: BigInt(raw.successful_executions as string),
      totalVolume: BigInt(raw.total_volume as string),
      winStreak: Number(raw.win_streak),
      banned: raw.banned as boolean,
      registeredAt: Number(raw.registered_at),
      updatedAt: Number(raw.last_updated),
    };
  }

  private parseAdminProposal(raw: Record<string, unknown>): AdminProposal {
    return {
      id: BigInt(raw.id as string),
      action: Number(raw.action) as AdminAction,
      target: raw.target as string,
      amount: Number(raw.amount),
      proposer: raw.proposer as string,
      approvals: raw.approvals as string[],
      status: Number(raw.status) as AdminProposalStatus,
      createdAt: Number(raw.created_at),
      expiresAt: Number(raw.expires_at),
    };
  }
}

let instance: AgentRegistryService | null = null;
export function getAgentRegistryService(stellar: StellarClient): AgentRegistryService {
  if (!instance) instance = new AgentRegistryService(stellar);
  return instance;
}
