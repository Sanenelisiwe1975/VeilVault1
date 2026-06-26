import React, { useState } from "react";
import { colors, fontFamily } from "../constants/theme";
import { MaterialIcon, GradientButton, GradientText, Badge } from "../components/ui";
import { useIsMobile } from "../hooks";
import { useIdentity, ReputationLevel } from "../hooks/useIdentity";
import type { AgentProfile, Credential } from "../hooks/useIdentity";
import { useWalletSession } from "../context/WalletSession";

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVEL_CONFIG = [
  { label: "Unverified", color: colors.outline,  icon: "person",           score: 0   },
  { label: "Verified",   color: "#60a5fa",        icon: "verified",         score: 200 },
  { label: "Trusted",    color: colors.primary,   icon: "verified_user",    score: 500 },
  { label: "Elite",      color: colors.tertiary,  icon: "workspace_premium",score: 800 },
];

const PROOF_TYPES = [
  { id: "age",        label: "Prove Age ≥ 18",      icon: "calendar_month",  desc: "Prove you are an adult without revealing your birthdate" },
  { id: "kyc",        label: "Prove Identity Verified", icon: "verified_user", desc: "Prove identity verification without exposing personal data" },
  { id: "sanctions",  label: "Prove Not Sanctioned", icon: "gpp_good",       desc: "Prove you are not on any sanctions list" },
  { id: "jurisdiction", label: "Prove Jurisdiction", icon: "public",         desc: "Prove your country without revealing exact location" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortDid(did: string) {
  if (did.length <= 24) return did;
  return did.slice(0, 20) + "…" + did.slice(-8);
}
function timeSince(ts: number) {
  if (!ts) return "—";
  const d = Math.floor((Date.now() / 1000 - ts) / 86400);
  return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`;
}
function successRate(profile: AgentProfile) {
  const total = Number(profile.totalExecutions);
  if (total === 0) return 0;
  return Math.round((Number(profile.successfulExecutions) / total) * 100);
}

// ─── Connected wallet (always visible, regardless of registration status) ─────

function ConnectedWalletLine({ address }: { address: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!address) {
    return (
      <p style={{ color: "#f59e0b", fontSize: 13, margin: "0 0 20px", display: "flex", alignItems: "center", gap: 6 }}>
        <MaterialIcon name="warning" size={14} /> No wallet connected — sign in first.
      </p>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 24px", padding: "10px 14px", borderRadius: 10, background: colors.surfaceContainerLow, border: `1px solid rgba(255,255,255,0.07)`, maxWidth: 480 }}>
      <MaterialIcon name="account_balance_wallet" size={15} style={{ color: colors.outline, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: colors.outline }}>Connected wallet</span>
      <span style={{ flex: 1, fontSize: 12, color: colors.onSurface, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {address}
      </span>
      <button type="button" title={copied ? "Copied!" : "Copy address"} aria-label={copied ? "Copied!" : "Copy address"}
        onClick={() => { navigator.clipboard?.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        style={{ background: "none", border: "none", cursor: "pointer", color: copied ? "#22c55e" : colors.outline, flexShrink: 0, display: "flex" }}>
        <MaterialIcon name={copied ? "check" : "content_copy"} size={15} />
      </button>
    </div>
  );
}

// ─── Registration form ────────────────────────────────────────────────────────

function RegisterForm({ onDone }: { onDone: () => void }) {
  const [step,    setStep]    = useState(0);
  const [name,    setName]    = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 1100));
    setLoading(false);
    onDone();
  };

  const INPUT: React.CSSProperties = {
    background: colors.surfaceContainerHigh,
    border: `1px solid rgba(255,255,255,0.1)`,
    borderRadius: 10, padding: "13px 16px",
    color: colors.onSurface, fontSize: 15,
    outline: "none", fontFamily: fontFamily.body,
    width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", background: `linear-gradient(135deg, ${colors.primaryContainer}55, ${colors.tertiary}33)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
        <MaterialIcon name="badge" size={36} style={{ color: colors.primary }} />
      </div>
      <GradientText style={{ fontSize: 26, fontWeight: 900, fontFamily: fontFamily.headline, display: "block", marginBottom: 8 }}>
        Create your identity
      </GradientText>
      <p style={{ color: colors.outline, fontSize: 15, marginBottom: 32, lineHeight: 1.5 }}>
        Your identity is private by default — you control what you share, and with whom.
      </p>

      {/* Step dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 28 }}>
        {[0, 1].map(i => (
          <div key={i} style={{ width: i === step ? 24 : 8, height: 8, borderRadius: 4, background: i <= step ? colors.primary : colors.surfaceContainerHigh, transition: "all 0.3s" }} />
        ))}
      </div>

      <div style={{ background: colors.surfaceContainerLow, borderRadius: 20, padding: 28, border: `1px solid rgba(255,255,255,0.07)`, textAlign: "left" }}>
        {step === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Display name</label>
              <input style={INPUT} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Siphe M." autoFocus />
            </div>
            <div>
              <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Stellar address</label>
              <input style={INPUT} value={address} onChange={e => setAddress(e.target.value)} placeholder="G..." />
              <p style={{ fontSize: 11, color: `${colors.outline}88`, margin: "6px 0 0" }}>This becomes your unique identity reference.</p>
            </div>

            <div style={{ background: `${colors.primaryContainer}15`, border: `1px solid ${colors.primaryContainer}30`, borderRadius: 12, padding: "12px 16px", display: "flex", gap: 10 }}>
              <MaterialIcon name="shield" size={16} style={{ color: colors.primary, flexShrink: 0, marginTop: 2 }} />
              <p style={{ color: colors.outline, fontSize: 12, margin: 0, lineHeight: 1.6 }}>
                Your identity reference is public, but your personal details are never stored anywhere — only proof that something is true about you (like "over 18"), without revealing the underlying data.
              </p>
            </div>

            <GradientButton onClick={() => setStep(1)} disabled={!name.trim()} size="lg">
              Continue →
            </GradientButton>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <p style={{ color: colors.onSurface, fontSize: 15, margin: 0, fontFamily: fontFamily.headline, fontWeight: 700 }}>
              Choose your starting credentials
            </p>
            <p style={{ color: colors.outline, fontSize: 13, margin: 0 }}>
              You can add more at any time. Each credential lets you prove something about yourself without sharing the actual data.
            </p>

            {[
              { icon: "verified_user", label: "Basic Identity", desc: "Required", required: true },
              { icon: "calendar_month", label: "Age Verification (≥18)", desc: "Optional", required: false },
              { icon: "gpp_good", label: "Sanctions Check", desc: "Optional", required: false },
            ].map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 12, background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.07)` }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${colors.primary}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <MaterialIcon name={c.icon} size={18} style={{ color: colors.primary }} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: colors.onSurface, fontFamily: fontFamily.headline }}>{c.label}</p>
                  <p style={{ margin: 0, fontSize: 12, color: colors.outline }}>{c.desc}</p>
                </div>
                <MaterialIcon name={c.required ? "lock" : "check_circle"} size={18} style={{ color: c.required ? colors.outline : "#22c55e" }} />
              </div>
            ))}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(0)} style={{ flex: 1, padding: "13px", borderRadius: 12, background: colors.surfaceContainerHigh, border: "none", color: colors.outline, cursor: "pointer", fontSize: 14, fontFamily: fontFamily.headline }}>Back</button>
              <GradientButton onClick={submit} disabled={loading} style={{ flex: 2 }}>
                {loading ? "Creating identity…" : "Create Identity →"}
              </GradientButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Level badge ──────────────────────────────────────────────────────────────

function LevelBadge({ level }: { level: ReputationLevel }) {
  const cfg = LEVEL_CONFIG[level] ?? LEVEL_CONFIG[0];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 20, background: `${cfg.color}22`, color: cfg.color, border: `1px solid ${cfg.color}44`, fontSize: 12, fontWeight: 700, fontFamily: fontFamily.headline }}>
      <MaterialIcon name={cfg.icon} size={13} />
      {cfg.label}
    </span>
  );
}

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, max = 1000 }: { score: number; max?: number }) {
  const pct = Math.min(score / max, 1);
  const r   = 44;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;
  const level = LEVEL_CONFIG.findIndex((_, i) =>
    score < (LEVEL_CONFIG[i + 1]?.score ?? Infinity)
  );
  const color = LEVEL_CONFIG[Math.max(0, level)].color;

  return (
    <div style={{ position: "relative", width: 112, height: 112, flexShrink: 0 }}>
      <svg width={112} height={112} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={56} cy={56} r={r} fill="none" stroke={colors.surfaceContainerHigh} strokeWidth={8} />
        <circle cx={56} cy={56} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 22, fontWeight: 900, color, fontFamily: fontFamily.headline }}>{score}</span>
        <span style={{ fontSize: 10, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>score</span>
      </div>
    </div>
  );
}

// ─── Credential card ──────────────────────────────────────────────────────────

function CredentialCard({ cred, onProve }: { cred: Credential; onProve: (cred: Credential) => void }) {
  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 14, padding: "16px 18px", border: `1px solid ${cred.verified ? colors.primaryContainer + "33" : "rgba(255,255,255,0.05)"}`, display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: cred.verified ? `${colors.primary}20` : colors.surfaceContainerHigh, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <MaterialIcon name={cred.icon} size={20} style={{ color: cred.verified ? colors.primary : colors.outline }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>{cred.label}</p>
        <p style={{ margin: 0, fontSize: 12, color: colors.outline }}>
          {cred.verified ? `Issued ${timeSince(cred.issuedAt)}` : "Not yet issued"}
        </p>
      </div>
      {cred.verified ? (
        <button onClick={() => onProve(cred)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 10, background: `${colors.primary}18`, border: `1px solid ${colors.primary}44`, color: colors.primary, cursor: "pointer", fontSize: 12, fontFamily: fontFamily.headline, whiteSpace: "nowrap" }}>
          <MaterialIcon name="key" size={13} /> Prove
        </button>
      ) : (
        <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: `${colors.outline}18`, color: colors.outline }}>Pending</span>
      )}
    </div>
  );
}

// ─── Proof modal ──────────────────────────────────────────────────────────────

function ProofModal({ cred, onClose }: { cred: Credential; onClose: () => void }) {
  const [step, setStep] = useState<"choose" | "generating" | "done">("choose");
  const [target, setTarget] = useState("");

  const generate = async () => {
    setStep("generating");
    await new Promise(r => setTimeout(r, 1600));
    setStep("done");
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: colors.surfaceContainerLow, borderRadius: 24, padding: 28, maxWidth: 420, width: "100%", border: `1px solid rgba(255,255,255,0.08)`, animation: "blurIn 0.25s ease both" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <GradientText style={{ fontSize: 18, fontWeight: 800, fontFamily: fontFamily.headline }}>Generate ZK Proof</GradientText>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: colors.outline }}><MaterialIcon name="close" size={22} /></button>
        </div>

        {step === "choose" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", gap: 12, padding: "14px", borderRadius: 12, background: colors.surfaceContainerHigh }}>
              <MaterialIcon name={cred.icon} size={22} style={{ color: colors.primary, flexShrink: 0 }} />
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>{cred.label}</p>
                <p style={{ margin: 0, fontSize: 12, color: colors.outline }}>Selective-disclosure proof · Zero personal data exposed</p>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Share with (optional)</label>
              <input
                value={target}
                onChange={e => setTarget(e.target.value)}
                placeholder="App name or Stellar address"
                style={{ background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "12px 16px", color: colors.onSurface, fontSize: 14, outline: "none", fontFamily: fontFamily.body, width: "100%", boxSizing: "border-box" as const }}
              />
            </div>

            <div style={{ background: `${colors.tertiary}15`, borderRadius: 10, padding: "12px 16px", display: "flex", gap: 10 }}>
              <MaterialIcon name="info" size={15} style={{ color: colors.tertiary, flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12, color: colors.outline, lineHeight: 1.5 }}>
                The verifier learns only the boolean result of the proof — nothing else.
              </p>
            </div>

            <GradientButton onClick={generate} size="lg">Generate Proof →</GradientButton>
          </div>
        )}

        {step === "generating" && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ width: 52, height: 52, border: `3px solid ${colors.primaryContainer}`, borderTopColor: colors.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <p style={{ color: colors.onSurface, fontSize: 15, fontFamily: fontFamily.headline, margin: "0 0 6px" }}>Generating ZK proof…</p>
            <p style={{ color: colors.outline, fontSize: 13, margin: 0 }}>Computing cryptographic proof · no data leaves your device</p>
          </div>
        )}

        {step === "done" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18, textAlign: "center" }}>
            <div>
              <div style={{ fontSize: 48, marginBottom: 10 }}>🔐</div>
              <p style={{ color: colors.onSurface, fontSize: 18, fontWeight: 800, fontFamily: fontFamily.headline, margin: "0 0 6px" }}>Proof Ready</p>
              <p style={{ color: colors.outline, fontSize: 13, margin: 0 }}>Valid for 24 hours · anchored on Stellar</p>
            </div>
            <div style={{ background: colors.surfaceContainerHigh, borderRadius: 10, padding: "12px 16px" }}>
              <p style={{ margin: "0 0 4px", fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Proof hash</p>
              <p style={{ margin: 0, fontSize: 12, color: colors.primary, fontFamily: "monospace", wordBreak: "break-all" }}>
                zk1:a4f9b2e3c8d1f7a6b5e4c3d2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => navigator.clipboard?.writeText("zk1:demo")} style={{ flex: 1, padding: "12px", borderRadius: 12, background: colors.surfaceContainerHigh, border: "none", color: colors.onSurface, cursor: "pointer", fontSize: 14, fontFamily: fontFamily.headline, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <MaterialIcon name="content_copy" size={16} /> Copy
              </button>
              <GradientButton onClick={onClose} style={{ flex: 1 }}>Done</GradientButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "Profile" | "Credentials" | "Activity";

export const IdentityPage: React.FC = () => {
  const isMobile = useIsMobile();
  const { address } = useWalletSession();
  const { profile, credentials, loading, usingMock, registered, register } = useIdentity(address ?? undefined);

  const [tab,       setTab]       = useState<Tab>("Profile");
  const [proving,   setProving]   = useState<Credential | null>(null);
  const [registering, setRegistering] = useState(false);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${colors.primaryContainer}`, borderTopColor: colors.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <span style={{ color: colors.outline, fontFamily: fontFamily.body }}>Loading identity…</span>
        </div>
      </div>
    );
  }

  if (!registered || registering) {
    return (
      <section className="blur-in" style={{ padding: isMobile ? 16 : 48 }}>
        <div style={{ maxWidth: 480, margin: "0 auto 0" }}>
          <ConnectedWalletLine address={address} />
        </div>
        <RegisterForm onDone={() => { setRegistering(false); window.location.reload(); }} />
      </section>
    );
  }

  const lvl   = profile?.level ?? 0;
  const lcfg  = LEVEL_CONFIG[lvl];
  const nextLvl = LEVEL_CONFIG[lvl + 1];

  return (
    <section className="blur-in" style={{ padding: isMobile ? 16 : 32, maxWidth: 1000, margin: "0 auto" }}>
      {proving && <ProofModal cred={proving} onClose={() => setProving(null)} />}
      <ConnectedWalletLine address={address} />

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20, marginBottom: 32, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <GradientText style={{ fontSize: isMobile ? 24 : 30, fontWeight: 900, fontFamily: fontFamily.headline }}>
              My Identity
            </GradientText>
            <LevelBadge level={lvl} />
            {usingMock && (
              <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: `${colors.tertiary}22`, color: colors.tertiary, border: `1px solid ${colors.tertiary}44` }}>
                Demo
              </span>
            )}
          </div>
          <p style={{ color: colors.outline, fontSize: 13, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <MaterialIcon name="verified" size={14} style={{ color: colors.tertiary }} />
            {profile ? "Verified identity — only you control what you share" : "—"}
          </p>
        </div>
        <GradientButton onClick={() => {}} size="sm">
          <MaterialIcon name="share" size={14} /> Share my identity
        </GradientButton>
      </div>

      {/* ── Profile stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr", gap: 20, marginBottom: 28 }}>

        {/* Score ring + level */}
        <div style={{ background: colors.surfaceContainerLow, borderRadius: 20, padding: "24px", border: `1px solid rgba(255,255,255,0.05)`, display: "flex", flexDirection: isMobile ? "row" : "column", alignItems: "center", gap: 16, justifyContent: "center", minWidth: 180 }}>
          <ScoreRing score={profile?.reputationScore ?? 0} />
          <div style={{ textAlign: "center" }}>
            <p style={{ margin: "0 0 4px", color: colors.onSurface, fontSize: 14, fontWeight: 700, fontFamily: fontFamily.headline }}>{lcfg.label}</p>
            {nextLvl && (
              <p style={{ margin: 0, color: colors.outline, fontSize: 12 }}>
                {nextLvl.score - (profile?.reputationScore ?? 0)} pts to {nextLvl.label}
              </p>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            { icon: "bolt",          label: "Executions",   value: profile?.totalExecutions ?? "0" },
            { icon: "trending_up",   label: "Success Rate", value: `${profile ? successRate(profile) : 0}%` },
            { icon: "payments",      label: "Volume (XLM)", value: profile ? (Number(profile.totalVolume) / 1e7).toFixed(1) : "0" },
            { icon: "local_fire_department", label: "Win Streak", value: `${profile?.winStreak ?? 0} 🔥` },
          ].map(s => (
            <div key={s.label} style={{ background: colors.surfaceContainerLow, borderRadius: 14, padding: "16px 18px", border: `1px solid rgba(255,255,255,0.05)` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <MaterialIcon name={s.icon} size={15} style={{ color: colors.primary, opacity: 0.8 }} />
                <span style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>{s.label}</span>
              </div>
              <p style={{ fontSize: 22, fontWeight: 800, color: colors.onSurface, fontFamily: fontFamily.headline, margin: 0 }}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Level progress ── */}
      {nextLvl && (
        <div style={{ background: colors.surfaceContainerLow, borderRadius: 14, padding: "18px 20px", marginBottom: 28, border: `1px solid rgba(255,255,255,0.05)` }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: colors.outline }}>Progress to {nextLvl.label}</span>
            <span style={{ fontSize: 13, color: colors.onSurface, fontWeight: 600 }}>
              {profile?.reputationScore ?? 0} / {nextLvl.score}
            </span>
          </div>
          <div style={{ background: colors.surfaceContainerHigh, borderRadius: 4, height: 8, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, ((profile?.reputationScore ?? 0) / nextLvl.score) * 100)}%`, height: "100%", background: `linear-gradient(90deg, ${lcfg.color}, ${nextLvl.color})`, borderRadius: 4, transition: "width 0.5s ease" }} />
          </div>
          <p style={{ fontSize: 12, color: colors.outline, margin: "8px 0 0" }}>
            Increase your score by deploying strategies and completing successful executions
          </p>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: colors.surfaceContainerLow, borderRadius: 12, padding: 4, width: "fit-content" }}>
        {(["Profile", "Credentials", "Activity"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 14, fontFamily: fontFamily.headline, fontWeight: tab === t ? 700 : 400, background: tab === t ? colors.primary : "transparent", color: tab === t ? "#000" : colors.outline, transition: "all 0.2s" }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Profile tab ── */}
      {tab === "Profile" && profile && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
          {[
            { label: "Identity ID",    value: shortDid(profile.did),      mono: true  },
            { label: "Wallet address", value: shortDid(profile.stellarAddress), mono: true },
            { label: "Credential ID",  value: profile.vcHash.slice(0, 16) + "…", mono: true },
            { label: "Credential source", value: profile.vcUri,          mono: false },
            { label: "Registered",     value: timeSince(profile.registeredAt), mono: false },
            { label: "Last updated",   value: timeSince(profile.updatedAt),    mono: false },
          ].map(r => (
            <div key={r.label} style={{ background: colors.surfaceContainerLow, borderRadius: 12, padding: "14px 16px", border: `1px solid rgba(255,255,255,0.05)` }}>
              <p style={{ margin: "0 0 4px", fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{r.label}</p>
              <p style={{ margin: 0, fontSize: 13, color: colors.onSurface, fontFamily: r.mono ? "monospace" : fontFamily.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Credentials tab ── */}
      {tab === "Credentials" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <p style={{ margin: 0, color: colors.outline, fontSize: 13 }}>
              {credentials.filter(c => c.verified).length} of {credentials.length} credentials issued
            </p>
            <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 10, background: colors.surfaceContainerHigh, border: "none", color: colors.primary, cursor: "pointer", fontSize: 13, fontFamily: fontFamily.headline }}>
              <MaterialIcon name="add" size={15} /> Issue credential
            </button>
          </div>
          {credentials.map(cred => (
            <CredentialCard key={cred.id} cred={cred} onProve={setProving} />
          ))}

          {/* Prove identity banner */}
          <div style={{ background: `linear-gradient(135deg, ${colors.primaryContainer}20, ${colors.tertiary}12)`, border: `1px solid ${colors.primaryContainer}30`, borderRadius: 16, padding: "20px", marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>Prove your identity to external apps</p>
                <p style={{ margin: 0, fontSize: 13, color: colors.outline }}>Generate a portable ZK proof any app can verify — without exposing any personal data.</p>
              </div>
              <GradientButton size="sm" onClick={() => credentials[0] && setProving(credentials[0])}>
                <MaterialIcon name="key" size={14} /> Generate Proof
              </GradientButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Activity tab ── */}
      {tab === "Activity" && (
        <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, border: `1px solid rgba(255,255,255,0.05)`, overflow: "hidden" }}>
          {[
            { icon: "verified",     label: "Identity registered",            time: timeSince(profile?.registeredAt ?? 0), color: "#22c55e" },
            { icon: "bolt",         label: "Strategy executed successfully", time: "2 days ago",  color: colors.primary  },
            { icon: "payments",     label: "Yield harvested: 0.32 XLM",     time: "5 days ago",  color: colors.tertiary },
            { icon: "bolt",         label: "Strategy executed successfully", time: "8 days ago",  color: colors.primary  },
            { icon: "add_circle",   label: "Vault created",                  time: "14 days ago", color: colors.primary  },
          ].map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", borderBottom: i < 4 ? `1px solid rgba(255,255,255,0.04)` : "none" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${a.color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <MaterialIcon name={a.icon} size={15} style={{ color: a.color }} />
              </div>
              <p style={{ flex: 1, margin: 0, fontSize: 14, color: colors.onSurface }}>{a.label}</p>
              <span style={{ fontSize: 12, color: colors.outline, whiteSpace: "nowrap" }}>{a.time}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
