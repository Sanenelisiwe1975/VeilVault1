import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { useWalletSession } from "../context/WalletSession";

export interface StokvelConfig {
  name:                     string;
  admin:                    string;
  asset:                    string;
  threshold:                number;
  maxMembers:               number;
  contributionAmount:       string;
  contributionIntervalSecs: string;
  totalContributed:         string;
  totalDistributed:         string;
  memberCount:              number;
  proposalCount:            string;
  paused:                   boolean;
}

export interface MemberInfo {
  address:         string;
  shareBps:        number;
  totalContributed:string;
  lastContribution:number;
  joinedAt:        number;
}

export interface Proposal {
  id:            string;
  proposer:      string;
  proposalType:  number;
  status:        number;
  approvals:     string[];
  rejections:    string[];
  targetAddress: string | null;
  amount:        string | null;
  expiresAt:     number;
  createdAt:     number;
}

// Mock data shown when backend is unavailable
const MOCK_CONFIG: StokvelConfig = {
  name:                     "Ubuntu Savings Circle",
  admin:                    "GCLFFNMPD6FXBHMBK2BONRIXBWALO3EOA6NYX3BJ42QBGH6FJPQUAWE4",
  asset:                    "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  threshold:                2,
  maxMembers:               6,
  contributionAmount:       "10000000",
  contributionIntervalSecs: "604800",
  totalContributed:         "60000000",
  totalDistributed:         "10000000",
  memberCount:              4,
  proposalCount:            "3",
  paused:                   false,
};

const MOCK_MEMBERS: MemberInfo[] = [
  { address: "GCLFF...AWE4", shareBps: 2500, totalContributed: "15000000", lastContribution: Date.now() / 1000 - 86400, joinedAt: Date.now() / 1000 - 2592000 },
  { address: "GBTCO...XK7P", shareBps: 2500, totalContributed: "15000000", lastContribution: Date.now() / 1000 - 172800, joinedAt: Date.now() / 1000 - 2592000 },
  { address: "GCEZI...R9MQ", shareBps: 2500, totalContributed: "15000000", lastContribution: Date.now() / 1000 - 259200, joinedAt: Date.now() / 1000 - 1296000 },
  { address: "GDKZZ...PL2N", shareBps: 2500, totalContributed: "15000000", lastContribution: Date.now() / 1000 - 345600, joinedAt: Date.now() / 1000 - 648000 },
];

const MOCK_PROPOSALS: Proposal[] = [
  {
    id: "1", proposer: "GCLFF...AWE4", proposalType: 0, status: 0,
    approvals: ["GCLFF...AWE4"], rejections: [],
    targetAddress: "GBTCO...XK7P", amount: "10000000",
    expiresAt: Date.now() / 1000 + 86400 * 3, createdAt: Date.now() / 1000 - 86400,
  },
];

export function useStokvel() {
  const { address, secretKey } = useWalletSession();
  const [config,    setConfig]    = useState<StokvelConfig | null>(null);
  const [members,   setMembers]   = useState<MemberInfo[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await api.get<StokvelConfig>("/stokvel/config");
      setConfig(cfg);
      setUsingMock(false);
    } catch {
      setConfig(MOCK_CONFIG);
      setMembers(MOCK_MEMBERS);
      setProposals(MOCK_PROPOSALS);
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Signed actions — use session key; fall back to simulation if not connected or mock
  const contribute = useCallback(async () => {
    if (usingMock || !address || !secretKey) {
      await new Promise(r => setTimeout(r, 800));
      return;
    }
    await api.post("/stokvel/contribute", { member: address, memberSecret: secretKey });
    await load();
  }, [usingMock, address, secretKey, load]);

  const propose = useCallback(async (params: {
    recipient: string; amount: string;
  }) => {
    if (usingMock || !address || !secretKey) {
      await new Promise(r => setTimeout(r, 800));
      return "mock-proposal-id";
    }
    const res = await api.post<{ proposalId: string }>("/stokvel/propose", {
      proposer:        address,
      recipient:       params.recipient,
      amount:          params.amount,
      proposerSecret:  secretKey,
    });
    await load();
    return res.proposalId;
  }, [usingMock, address, secretKey, load]);

  const vote = useCallback(async (proposalId: string, approve: boolean) => {
    if (usingMock || !address || !secretKey) {
      await new Promise(r => setTimeout(r, 500));
      return;
    }
    await api.post("/stokvel/vote", { voter: address, proposalId, approve, voterSecret: secretKey });
    await load();
  }, [usingMock, address, secretKey, load]);

  return { config, members, proposals, loading, error, usingMock, refresh: load, contribute, propose, vote };
}
