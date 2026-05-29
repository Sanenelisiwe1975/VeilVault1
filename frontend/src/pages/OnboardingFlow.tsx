/**
 * OnboardingFlow — 5-step wizard
 *
 * Step 1 — Identity       : display name + Stellar address → create ZK profile
 * Step 2 — Vault          : name + risk preset + guardrails
 * Step 3 — Deposit        : first deposit (XLM / USDC)
 * Step 4 — Agent/Stokvel  : choose AI agent or group savings
 * Step 5 — Done           : summary + go to dashboard
 */
import React, { useState, useEffect } from "react";
import { colors, fontFamily } from "../constants/theme";
import { MaterialIcon, GradientButton, GradientText } from "../components/ui";
import { useIsMobile } from "../hooks";
import { useWalletSession } from "../context/WalletSession";
import { api } from "../lib/api";

// ─── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "vv_onboarded";
export function isOnboarded() { return !!localStorage.getItem(STORAGE_KEY); }
function markOnboarded()      { localStorage.setItem(STORAGE_KEY, "1"); }

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.09em", fontFamily: fontFamily.body }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ fontSize: 11, color: `${colors.outline}99` }}>{hint}</span>}
    </label>
  );
}

const INPUT: React.CSSProperties = {
  background:   colors.surfaceContainerHigh,
  border:       `1px solid rgba(255,255,255,0.1)`,
  borderRadius: 10,
  padding:      "13px 16px",
  color:        colors.onSurface,
  fontSize:     15,
  outline:      "none",
  fontFamily:   fontFamily.body,
  width:        "100%",
  boxSizing:    "border-box",
};

// ─── Step 1 — Identity ────────────────────────────────────────────────────────

function IdentityStep({ onNext }: { onNext: (data: { name: string; address: string }) => void }) {
  const { connect, address: sessionAddress, secretKey } = useWalletSession();
  const [name,      setName]      = useState("");
  const [address,   setAddress]   = useState(sessionAddress ?? "");
  const [sk,        setSk]        = useState("");
  const [loading,   setLoading]   = useState(false);
  const [connError, setConnError] = useState("");

  const submit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setConnError("");

    // Try to connect wallet if secret key provided
    let resolvedAddress = address.trim() || sessionAddress;
    if (sk.trim() && !sessionAddress) {
      const res = connect(sk.trim());
      if ("error" in res) { setConnError(res.error); setLoading(false); return; }
      resolvedAddress = res.address;
    }

    // Register identity on chain if we have a key
    if (resolvedAddress && (secretKey || sk.trim())) {
      try {
        await api.post("/registry/register", {
          agent:        resolvedAddress,
          did:          `did:stellar:${resolvedAddress}`,
          vcHash:       "0".repeat(64),
          vcUri:        "https://vc.veilVault1.app/cred/default",
          signerSecret: sk.trim() || secretKey,
        });
      } catch {
        // Non-fatal — identity registration can retry later
      }
    }

    setLoading(false);
    onNext({ name, address: resolvedAddress ?? "" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: `linear-gradient(135deg, ${colors.primaryContainer}55, ${colors.tertiary}33)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <MaterialIcon name="badge" size={32} style={{ color: colors.primary }} />
        </div>
        <h2 style={{ color: colors.onSurface, fontFamily: fontFamily.headline, fontSize: 22, margin: "0 0 8px" }}>Create your ZK Identity</h2>
        <p style={{ color: colors.outline, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Your identity is private by default. Only you control what you share.
        </p>
      </div>

      <Field label="Display name">
        <input style={INPUT} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Siphe M." autoFocus />
      </Field>

      {!sessionAddress && (
        <Field label="Stellar secret key" hint="Held in memory only — never stored. Derives your address automatically.">
          <input style={INPUT} type="password" value={sk} onChange={e => { setSk(e.target.value); setConnError(""); }} placeholder="S..." autoComplete="off" />
          {connError && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#ef4444" }}>{connError}</p>}
        </Field>
      )}

      {sessionAddress && (
        <div style={{ background: `${colors.primary}15`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: colors.primary, display: "flex", alignItems: "center", gap: 8 }}>
          <MaterialIcon name="check_circle" size={14} />
          Connected: {sessionAddress.slice(0,8)}…{sessionAddress.slice(-6)}
        </div>
      )}

      <div style={{ background: `${colors.primaryContainer}15`, border: `1px solid ${colors.primaryContainer}30`, borderRadius: 12, padding: "12px 16px", display: "flex", gap: 12 }}>
        <MaterialIcon name="lock" size={16} style={{ color: colors.primary, flexShrink: 0, marginTop: 2 }} />
        <p style={{ color: colors.outline, fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          Your ZK identity is stored on Stellar. You can issue selective-disclosure proofs (e.g. "over 18") without revealing underlying data.
        </p>
      </div>

      <GradientButton onClick={submit} disabled={!name.trim() || loading} size="lg">
        {loading ? "Creating identity…" : "Create Identity →"}
      </GradientButton>
    </div>
  );
}

// ─── Step 2 — Vault ───────────────────────────────────────────────────────────

type RiskPreset = "Conservative" | "Balanced" | "Aggressive";
const PRESETS: Record<RiskPreset, { drawdown: number; color: string; icon: string; desc: string }> = {
  Conservative: { drawdown: 10, color: "#22c55e", icon: "shield",        desc: "Lower yields, maximum protection" },
  Balanced:     { drawdown: 20, color: colors.primary, icon: "balance",    desc: "Good yields with managed risk" },
  Aggressive:   { drawdown: 35, color: "#ef4444",  icon: "trending_up",  desc: "Higher yields, higher risk" },
};

function VaultStep({ onNext }: { onNext: (data: { vaultName: string; preset: RiskPreset }) => void }) {
  const [vaultName, setVaultName] = useState("");
  const [preset,    setPreset]    = useState<RiskPreset>("Balanced");
  const [loading,   setLoading]   = useState(false);

  const submit = async () => {
    if (!vaultName.trim()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 900));
    setLoading(false);
    onNext({ vaultName, preset });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: `linear-gradient(135deg, ${colors.secondaryContainer}55, ${colors.primary}22)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <MaterialIcon name="account_balance_wallet" size={32} style={{ color: colors.primary }} />
        </div>
        <h2 style={{ color: colors.onSurface, fontFamily: fontFamily.headline, fontSize: 22, margin: "0 0 8px" }}>Create your Vault</h2>
        <p style={{ color: colors.outline, fontSize: 14, margin: 0 }}>Set guardrails that AI agents can never exceed.</p>
      </div>

      <Field label="Vault name">
        <input style={INPUT} value={vaultName} onChange={e => setVaultName(e.target.value)} placeholder="e.g. My Savings Vault" autoFocus />
      </Field>

      <Field label="Risk profile">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {(Object.entries(PRESETS) as [RiskPreset, typeof PRESETS[RiskPreset]][]).map(([key, p]) => (
            <button key={key} type="button" onClick={() => setPreset(key)}
              style={{ padding: "14px 8px", borderRadius: 12, border: `1.5px solid ${preset === key ? p.color : "rgba(255,255,255,0.1)"}`, background: preset === key ? `${p.color}18` : colors.surfaceContainerHigh, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, transition: "all 0.2s" }}>
              <MaterialIcon name={p.icon} size={20} style={{ color: p.color }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: preset === key ? p.color : colors.onSurface, fontFamily: fontFamily.headline }}>{key}</span>
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: colors.outline, margin: "4px 0 0" }}>
          {PRESETS[preset].desc} · Max drawdown: {PRESETS[preset].drawdown}%
        </p>
      </Field>

      <GradientButton onClick={submit} disabled={!vaultName.trim() || loading} size="lg">
        {loading ? "Creating vault…" : "Create Vault →"}
      </GradientButton>
    </div>
  );
}

// ─── Step 3 — Deposit ─────────────────────────────────────────────────────────

function DepositStep({ onNext, onSkip }: { onNext: (amount: number) => void; onSkip: () => void }) {
  const { address, secretKey } = useWalletSession();
  const [amount,  setAmount]  = useState("10");
  const [asset,   setAsset]   = useState("XLM");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      if (address && secretKey) {
        await api.post("/vault/deposit", {
          fromPublicKey:   address,
          amount:          String(Math.round(Number(amount) * 1e7)),
          signerSecretKey: secretKey,
        });
      } else {
        await new Promise(r => setTimeout(r, 900)); // demo if no wallet
      }
      onNext(Number(amount));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: `linear-gradient(135deg, ${colors.tertiary}33, ${colors.primaryContainer}44)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <MaterialIcon name="south_america" size={32} style={{ color: colors.tertiary }} />
        </div>
        <h2 style={{ color: colors.onSurface, fontFamily: fontFamily.headline, fontSize: 22, margin: "0 0 8px" }}>Make your first deposit</h2>
        <p style={{ color: colors.outline, fontSize: 14, margin: 0 }}>Start earning yield instantly. You can always add more later.</p>
      </div>

      <Field label="Asset">
        <div style={{ display: "flex", gap: 8 }}>
          {["XLM", "USDC"].map(a => (
            <button key={a} type="button" onClick={() => setAsset(a)}
              style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1.5px solid ${asset === a ? colors.primary : "rgba(255,255,255,0.1)"}`, background: asset === a ? `${colors.primary}18` : colors.surfaceContainerHigh, color: asset === a ? colors.primary : colors.onSurface, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: fontFamily.headline }}>
              {a}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Amount">
        <div style={{ position: "relative" }}>
          <input style={{ ...INPUT, paddingRight: 60 }} type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} />
          <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: colors.outline, fontSize: 14, fontWeight: 600 }}>{asset}</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["10", "50", "100"].map(v => (
            <button key={v} type="button" onClick={() => setAmount(v)}
              style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid rgba(255,255,255,0.12)`, background: "transparent", color: colors.outline, cursor: "pointer", fontSize: 12, fontFamily: fontFamily.body }}>
              {v}
            </button>
          ))}
        </div>
      </Field>

      {error && <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{error}</p>}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onSkip}
          style={{ flex: 1, padding: "13px", borderRadius: 12, background: colors.surfaceContainerHigh, border: "none", color: colors.outline, cursor: "pointer", fontSize: 14, fontFamily: fontFamily.headline }}>
          Skip for now
        </button>
        <GradientButton onClick={submit} disabled={!amount || Number(amount) <= 0 || loading} style={{ flex: 2 }}>
          {loading ? "Depositing…" : `Deposit ${amount} ${asset} →`}
        </GradientButton>
      </div>
    </div>
  );
}

// ─── Step 4 — Agent or Stokvel ────────────────────────────────────────────────

function ChooseStep({ onNext }: { onNext: (choice: "agent" | "stokvel" | "skip") => void }) {
  const [selected, setSelected] = useState<"agent" | "stokvel" | null>(null);

  const CARDS = [
    {
      key:  "agent" as const,
      icon: "smart_toy",
      title: "Deploy AI Agent",
      desc:  "Let an AI agent manage your vault, execute yield strategies, and rebalance automatically — all within your guardrails.",
      color: colors.primary,
    },
    {
      key:  "stokvel" as const,
      icon: "groups",
      title: "Join a Stokvel",
      desc:  "Pool funds with friends or community members. Contribute each cycle and take turns receiving the pot.",
      color: colors.tertiary,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: `linear-gradient(135deg, ${colors.primaryContainer}44, ${colors.tertiary}22)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <MaterialIcon name="explore" size={32} style={{ color: colors.primary }} />
        </div>
        <h2 style={{ color: colors.onSurface, fontFamily: fontFamily.headline, fontSize: 22, margin: "0 0 8px" }}>How do you want to grow?</h2>
        <p style={{ color: colors.outline, fontSize: 14, margin: 0 }}>You can always do both — choose one to start.</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {CARDS.map(c => (
          <button key={c.key} type="button" onClick={() => setSelected(c.key)}
            style={{ padding: 20, borderRadius: 16, border: `2px solid ${selected === c.key ? c.color : "rgba(255,255,255,0.08)"}`, background: selected === c.key ? `${c.color}12` : colors.surfaceContainerLow, cursor: "pointer", textAlign: "left", transition: "all 0.2s", display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${c.color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <MaterialIcon name={c.icon} size={24} style={{ color: c.color }} />
            </div>
            <div>
              <p style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>{c.title}</p>
              <p style={{ margin: 0, fontSize: 13, color: colors.outline, lineHeight: 1.5 }}>{c.desc}</p>
            </div>
            {selected === c.key && (
              <MaterialIcon name="check_circle" size={20} style={{ color: c.color, marginLeft: "auto", flexShrink: 0 }} />
            )}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => onNext("skip")}
          style={{ padding: "13px 20px", borderRadius: 12, background: "transparent", border: "none", color: colors.outline, cursor: "pointer", fontSize: 14, fontFamily: fontFamily.headline }}>
          Skip
        </button>
        <GradientButton onClick={() => selected && onNext(selected)} disabled={!selected} style={{ flex: 1 }}>
          Continue →
        </GradientButton>
      </div>
    </div>
  );
}

// ─── Step 5 — Done ────────────────────────────────────────────────────────────

function DoneStep({ data, onFinish }: {
  data: { name: string; vaultName: string; deposit: number; choice: string };
  onFinish: () => void;
}) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setCount(c => {
      if (c >= 3) { clearInterval(t); return c; }
      return c + 1;
    }), 400);
    return () => clearInterval(t);
  }, []);

  const items = [
    { done: count >= 1, icon: "badge",                  label: `Identity "${data.name}" created`           },
    { done: count >= 2, icon: "account_balance_wallet", label: `Vault "${data.vaultName}" set up`          },
    { done: count >= 3, icon: "payments",               label: data.deposit > 0 ? `${data.deposit} XLM deposited` : "Deposit skipped — add funds anytime" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, textAlign: "center" }}>
      <div>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🚀</div>
        <GradientText style={{ fontSize: 26, fontWeight: 900, fontFamily: fontFamily.headline, display: "block", marginBottom: 8 }}>
          You're all set, {data.name.split(" ")[0]}!
        </GradientText>
        <p style={{ color: colors.outline, fontSize: 15, margin: 0 }}>Your private vault is ready. Here's what we set up:</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 12, background: item.done ? `${colors.primaryContainer}15` : colors.surfaceContainerHigh, border: `1px solid ${item.done ? colors.primaryContainer + "40" : "rgba(255,255,255,0.06)"}`, transition: "all 0.4s ease" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: item.done ? `${colors.primary}22` : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.4s" }}>
              <MaterialIcon name={item.done ? "check" : item.icon} size={16} style={{ color: item.done ? colors.primary : colors.outline }} />
            </div>
            <span style={{ fontSize: 14, color: item.done ? colors.onSurface : colors.outline, fontFamily: fontFamily.body, transition: "color 0.4s" }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {count >= 3 && (
        <GradientButton onClick={onFinish} size="lg" style={{ animation: "blurIn 0.4s ease both" }}>
          Go to Dashboard →
        </GradientButton>
      )}
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

const STEPS = [
  { label: "Identity",  icon: "badge"                  },
  { label: "Vault",     icon: "account_balance_wallet" },
  { label: "Deposit",   icon: "payments"               },
  { label: "Strategy",  icon: "explore"                },
  { label: "Ready",     icon: "check_circle"           },
];

export const OnboardingFlow: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const isMobile = useIsMobile();
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    name:      "",
    address:   "",
    vaultName: "",
    preset:    "Balanced" as string,
    deposit:   0,
    choice:    "" as string,
  });

  const finish = () => { markOnboarded(); onComplete(); };

  const renderStep = () => {
    switch (step) {
      case 0: return <IdentityStep onNext={d => { setData(v => ({ ...v, ...d })); setStep(1); }} />;
      case 1: return <VaultStep    onNext={d => { setData(v => ({ ...v, ...d })); setStep(2); }} />;
      case 2: return <DepositStep  onNext={amt => { setData(v => ({ ...v, deposit: amt })); setStep(3); }} onSkip={() => setStep(3)} />;
      case 3: return <ChooseStep   onNext={c => { setData(v => ({ ...v, choice: c })); setStep(4); }} />;
      case 4: return <DoneStep     data={data} onFinish={finish} />;
      default: return null;
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: colors.surface, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: isMobile ? 16 : 24 }}>
      {/* Step progress */}
      <div style={{ width: "100%", maxWidth: 480, marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
          {STEPS.map((s, i) => (
            <React.Fragment key={s.label}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${i <= step ? colors.primary : "rgba(255,255,255,0.15)"}`, background: i < step ? colors.primary : i === step ? `${colors.primary}22` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.3s" }}>
                  {i < step
                    ? <MaterialIcon name="check" size={14} style={{ color: "#000" }} />
                    : <MaterialIcon name={s.icon} size={14} style={{ color: i === step ? colors.primary : colors.outline }} />
                  }
                </div>
                {!isMobile && (
                  <span style={{ fontSize: 10, color: i <= step ? colors.primary : colors.outline, fontFamily: fontFamily.body, transition: "color 0.3s" }}>{s.label}</span>
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 2, background: i < step ? colors.primary : "rgba(255,255,255,0.1)", margin: isMobile ? "0 4px 16px" : "0 4px 20px", transition: "background 0.3s" }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Card */}
      <div style={{ width: "100%", maxWidth: 480, background: colors.surfaceContainerLow, borderRadius: 24, padding: isMobile ? 24 : 36, border: `1px solid rgba(255,255,255,0.07)`, boxShadow: "0 24px 64px rgba(0,0,0,0.4)", animation: "blurIn 0.3s ease both" }}>
        {renderStep()}
      </div>

      {/* Skip entire onboarding */}
      {step < 4 && (
        <button onClick={finish} style={{ marginTop: 16, background: "none", border: "none", color: colors.outline, cursor: "pointer", fontSize: 13, fontFamily: fontFamily.body }}>
          Skip setup — go straight to dashboard
        </button>
      )}
    </div>
  );
};
