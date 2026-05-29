import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

export enum ReputationLevel {
  Unverified = 0,
  Verified   = 1,
  Trusted    = 2,
  Elite      = 3,
}

export interface AgentProfile {
  did:                   string;
  stellarAddress:        string;
  vcHash:                string;
  vcUri:                 string;
  reputationScore:       number;
  level:                 ReputationLevel;
  totalExecutions:       string;
  successfulExecutions:  string;
  totalVolume:           string;
  winStreak:             number;
  banned:                boolean;
  registeredAt:          number;
  updatedAt:             number;
}

export interface Credential {
  id:       string;
  type:     string;
  label:    string;
  icon:     string;
  verified: boolean;
  issuedAt: number;
  expiresAt?: number;
}

// Derive credential list from the agent profile + local storage flags
function deriveCredentials(profile: AgentProfile): Credential[] {
  const base: Credential[] = [
    {
      id: "did",       type: "DID",        label: "Decentralised Identifier", icon: "fingerprint",
      verified: !!profile.did, issuedAt: profile.registeredAt,
    },
    {
      id: "kyc",       type: "KYC",        label: "Identity Verified",        icon: "verified_user",
      verified: profile.level >= ReputationLevel.Verified, issuedAt: profile.updatedAt,
    },
    {
      id: "age",       type: "Age",        label: "Age ≥ 18",                icon: "calendar_month",
      verified: false, issuedAt: 0,
    },
    {
      id: "sanctions", type: "Sanctions",  label: "Not Sanctioned",           icon: "gpp_good",
      verified: profile.level >= ReputationLevel.Trusted, issuedAt: profile.updatedAt,
    },
    {
      id: "accredited",type: "Investor",   label: "Accredited Investor",      icon: "workspace_premium",
      verified: profile.level >= ReputationLevel.Elite, issuedAt: profile.updatedAt,
    },
  ];
  return base;
}

const MOCK_PROFILE: AgentProfile = {
  did:                  "did:stellar:GCLFFNMPD6FXBHMBK2BONRIXBWALO3EOA6NYX3BJ42QBGH6FJPQUAWE4",
  stellarAddress:       "GCLFFNMPD6FXBHMBK2BONRIXBWALO3EOA6NYX3BJ42QBGH6FJPQUAWE4",
  vcHash:               "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9",
  vcUri:                "https://vc.veilVault1.app/cred/demo",
  reputationScore:      450,
  level:                ReputationLevel.Trusted,
  totalExecutions:      "28",
  successfulExecutions: "26",
  totalVolume:          "85000000",
  winStreak:            5,
  banned:               false,
  registeredAt:         Date.now() / 1000 - 60 * 86400,
  updatedAt:            Date.now() / 1000 - 3 * 86400,
};

export function useIdentity(address?: string) {
  const [profile,     setProfile]     = useState<AgentProfile | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [usingMock,   setUsingMock]   = useState(false);
  const [registered,  setRegistered]  = useState(false);

  const load = useCallback(async () => {
    if (!address) { setLoading(false); return; }
    setLoading(true);
    try {
      const p = await api.get<AgentProfile>(`/registry/${address}`);
      setProfile(p);
      setCredentials(deriveCredentials(p));
      setRegistered(true);
      setUsingMock(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("404") || msg.includes("not found")) {
        setRegistered(false);
        setProfile(null);
      } else {
        // Backend unavailable — show mock
        setProfile(MOCK_PROFILE);
        setCredentials(deriveCredentials(MOCK_PROFILE));
        setRegistered(true);
        setUsingMock(true);
      }
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  const register = useCallback(async (params: {
    agent: string; did: string; vcHash: string; vcUri: string; signerSecret: string;
  }) => {
    if (usingMock) { await new Promise(r => setTimeout(r, 1000)); setRegistered(true); return; }
    await api.post("/registry/register", params);
    setRegistered(true);
    await load();
  }, [usingMock, load]);

  return { profile, credentials, loading, error, usingMock, registered, register, refresh: load };
}
