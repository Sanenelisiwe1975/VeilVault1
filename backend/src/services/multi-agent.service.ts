import { StellarClient } from '../integrations/stellar/client';
import { config } from '../config';
import { Address, nativeToScVal, scValToNative } from '@stellar/stellar-sdk';
import { randomBytes } from 'crypto';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

export enum AgentRole {
  Orchestrator = 'orchestrator',
  Executor = 'executor',
  Analyst = 'analyst',
  RiskManager = 'risk_manager',
}

export interface AgentTask {
  taskId: string;
  orchestrator: string;
  delegate: string;
  operationId: string;
  role: AgentRole;
  payload: Record<string, unknown>;
  status: TaskStatus;
  createdAt: number;
  completedAt: number | null;
  result: unknown | null;
  error: string | null;
}

export enum TaskStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export interface WorkflowConfig {
  workflowId: string;
  vaultAddress: string;
  orchestratorAddress: string;
  agents: {
    address: string;
    role: AgentRole;
    weight: number;
  }[];
  consensusThreshold: number;  // 0–100, % of agents that must agree
}

export class MultiAgentService {
  private stellar: StellarClient;
  private vaultContractId: string;
  // In-memory task registry (production should use Redis or DB)
  private tasks = new Map<string, AgentTask>();
  private workflows = new Map<string, WorkflowConfig>();

  constructor(stellar: StellarClient) {
    this.stellar = stellar;
    this.vaultContractId = config.VAULT_CONTRACT_ID;
  }

  createWorkflow(params: Omit<WorkflowConfig, 'workflowId'>): WorkflowConfig {
    const workflowId = randomBytes(16).toString('hex');
    const workflow: WorkflowConfig = { workflowId, ...params };
    this.workflows.set(workflowId, workflow);
    logger.info('Created workflow', {
      workflowId,
      vault: params.vaultAddress,
      agents: params.agents.length,
    });
    return workflow;
  }

  async delegateOperation(params: {
    orchestrator: string;
    delegate: string;
    payload: Record<string, unknown>;
    orchestratorSecret: string;
  }): Promise<AgentTask> {
    const taskId = randomBytes(16).toString('hex');
    const operationId = randomBytes(32).toString('hex');

    logger.info('Delegating operation', {
      taskId,
      orchestrator: params.orchestrator,
      delegate: params.delegate,
    });

    // Emit on-chain delegation event via vault
    const operationIdBytes = Buffer.from(operationId, 'hex');
    const metadataBytes = Buffer.from(JSON.stringify(params.payload));

    await this.stellar.invokeContract(
      this.vaultContractId,
      'delegate_operation',
      [
        new Address(params.orchestrator).toScVal(),
        new Address(params.delegate).toScVal(),
        nativeToScVal(operationIdBytes, { type: 'bytes' }),
        nativeToScVal(metadataBytes, { type: 'bytes' }),
      ],
      params.orchestratorSecret
    );

    const task: AgentTask = {
      taskId,
      orchestrator: params.orchestrator,
      delegate: params.delegate,
      operationId,
      role: AgentRole.Executor,
      payload: params.payload,
      status: TaskStatus.Pending,
      createdAt: Math.floor(Date.now() / 1000),
      completedAt: null,
      result: null,
      error: null,
    };

    this.tasks.set(taskId, task);
    return task;
  }

  markTaskRunning(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = TaskStatus.Running;
      this.tasks.set(taskId, task);
    }
  }

  completeTask(taskId: string, result: unknown): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = TaskStatus.Completed;
      task.result = result;
      task.completedAt = Math.floor(Date.now() / 1000);
      this.tasks.set(taskId, task);
      logger.info('Task completed', { taskId });
    }
  }

  failTask(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = TaskStatus.Failed;
      task.error = error;
      task.completedAt = Math.floor(Date.now() / 1000);
      this.tasks.set(taskId, task);
      logger.warn('Task failed', { taskId, error });
    }
  }

  getTask(taskId: string): AgentTask | null {
    return this.tasks.get(taskId) ?? null;
  }

  getWorkflow(workflowId: string): WorkflowConfig | null {
    return this.workflows.get(workflowId) ?? null;
  }

  listTasks(orchestrator?: string): AgentTask[] {
    const all = Array.from(this.tasks.values());
    if (orchestrator) return all.filter(t => t.orchestrator === orchestrator);
    return all;
  }

  /**
   * Run a consensus check: given a workflow and a proposed action (as JSON),
   * collect signals from all agents and return true only when
   * consensusThreshold % of weighted agents approve.
   *
   * In production each agent would be called via its own API endpoint.
   * Here we model it as a synchronous weighted vote.
   */
  async runConsensus(
    workflowId: string,
    proposedAction: Record<string, unknown>,
    agentVotes: Map<string, boolean>
  ): Promise<{ approved: boolean; weightedApproval: number }> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    let totalWeight = 0;
    let approvedWeight = 0;

    for (const agent of workflow.agents) {
      const vote = agentVotes.get(agent.address);
      if (vote !== undefined) {
        totalWeight += agent.weight;
        if (vote) approvedWeight += agent.weight;
      }
    }

    const weightedApproval = totalWeight > 0 ? (approvedWeight / totalWeight) * 100 : 0;
    const approved = weightedApproval >= workflow.consensusThreshold;

    logger.info('Consensus result', {
      workflowId,
      weightedApproval: weightedApproval.toFixed(1),
      threshold: workflow.consensusThreshold,
      approved,
    });

    return { approved, weightedApproval };
  }
}

let instance: MultiAgentService | null = null;
export function getMultiAgentService(stellar: StellarClient): MultiAgentService {
  if (!instance) instance = new MultiAgentService(stellar);
  return instance;
}
