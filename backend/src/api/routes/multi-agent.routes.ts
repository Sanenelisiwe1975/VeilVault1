import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getStellarClient } from '../../integrations/stellar/client';
import { getMultiAgentService, AgentRole } from '../../services/multi-agent.service';

const router = Router();

const CreateWorkflowSchema = z.object({
  vaultAddress: z.string().min(56).max(56),
  orchestratorAddress: z.string().min(56).max(56),
  agents: z.array(
    z.object({
      address: z.string().min(56).max(56),
      role: z.nativeEnum(AgentRole),
      weight: z.number().positive(),
    })
  ).min(1),
  consensusThreshold: z.number().min(0).max(100),
});

const DelegateSchema = z.object({
  orchestrator: z.string().min(56).max(56),
  delegate: z.string().min(56).max(56),
  payload: z.record(z.unknown()),
  orchestratorSecret: z.string().min(56),
});

const TaskUpdateSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(['running', 'completed', 'failed']),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

const ConsensusSchema = z.object({
  workflowId: z.string().min(1),
  proposedAction: z.record(z.unknown()),
  votes: z.record(z.boolean()),  // { [agentAddress]: true/false }
});

function getService() {
  return getMultiAgentService(getStellarClient());
}

// POST /api/multi-agent/workflow
router.post('/workflow', async (req: Request, res: Response) => {
  const parsed = CreateWorkflowSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const workflow = getService().createWorkflow(parsed.data);
    res.status(201).json(workflow);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/multi-agent/workflow/:id
router.get('/workflow/:id', async (req: Request, res: Response) => {
  try {
    const wf = getService().getWorkflow(req.params.id);
    if (!wf) return res.status(404).json({ error: 'Workflow not found' });
    res.json(wf);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/multi-agent/delegate
router.post('/delegate', async (req: Request, res: Response) => {
  const parsed = DelegateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const task = await getService().delegateOperation(parsed.data);
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/multi-agent/tasks/:taskId
router.get('/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const task = getService().getTask(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/multi-agent/tasks?orchestrator=...
router.get('/tasks', async (req: Request, res: Response) => {
  try {
    const orchestrator = req.query.orchestrator as string | undefined;
    const tasks = getService().listTasks(orchestrator);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/multi-agent/tasks/:taskId
router.patch('/tasks/:taskId', async (req: Request, res: Response) => {
  const parsed = TaskUpdateSchema.safeParse({ taskId: req.params.taskId, ...req.body });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const svc = getService();
    const { taskId, status, result, error } = parsed.data;
    if (status === 'running') svc.markTaskRunning(taskId);
    else if (status === 'completed') svc.completeTask(taskId, result);
    else if (status === 'failed') svc.failTask(taskId, error ?? 'unknown error');
    const task = svc.getTask(taskId);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/multi-agent/consensus
router.post('/consensus', async (req: Request, res: Response) => {
  const parsed = ConsensusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const { workflowId, proposedAction, votes } = parsed.data;
    const agentVotes = new Map<string, boolean>(Object.entries(votes));
    const result = await getService().runConsensus(workflowId, proposedAction, agentVotes);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
