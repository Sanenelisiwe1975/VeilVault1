import { StellarClient } from '../integrations/stellar/client';
import { config } from '../config';
import { Address, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
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

  async acceptVc(params: {
    agent: string;
    adminSecret: string;
  }): Promise<void> {
    logger.info('Admin accepting VC for agent', { agent: params.agent });

    await this.stellar.invokeContract(
      this.contractId,
      'accept_vc',
      [new Address(params.agent).toScVal()],
      params.adminSecret
    );
  }

  async getProfile(agentAddress: string): Promise<AgentProfile | null> {
    try {
      const result = await this.stellar.callView(
        this.contractId,
        'get_profile',
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

  async banAgent(params: { agent: string; adminSecret: string }): Promise<void> {
    await this.stellar.invokeContract(
      this.contractId,
      'ban',
      [new Address(params.agent).toScVal()],
      params.adminSecret
    );
  }

  async unbanAgent(params: { agent: string; adminSecret: string }): Promise<void> {
    await this.stellar.invokeContract(
      this.contractId,
      'unban',
      [new Address(params.agent).toScVal()],
      params.adminSecret
    );
  }

  async slashAgent(params: {
    agent: string;
    amount: number;
    adminSecret: string;
  }): Promise<void> {
    await this.stellar.invokeContract(
      this.contractId,
      'slash',
      [
        new Address(params.agent).toScVal(),
        nativeToScVal(params.amount, { type: 'u32' }),
      ],
      params.adminSecret
    );
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
      updatedAt: Number(raw.updated_at),
    };
  }
}

let instance: AgentRegistryService | null = null;
export function getAgentRegistryService(stellar: StellarClient): AgentRegistryService {
  if (!instance) instance = new AgentRegistryService(stellar);
  return instance;
}
