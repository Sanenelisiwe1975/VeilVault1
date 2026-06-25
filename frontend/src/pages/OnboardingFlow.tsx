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

//Persistence 

const STORAGE_KEY = "vv_onboarded";
export function isOnboarded() { return !!localStorage.getItem(STORAGE_KEY); }
function markOnboarded()      { localStorage.setItem(STORAGE_KEY, "1"); }

//Shared helpers 

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


function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {([true, false] as const).map(opt => (
        <button
          key={String(opt)}
          type="button"
          onClick={() => onChange(opt)}
          style={{
            flex: 1,
            padding: "11px",
            borderRadius: 10,
            border: `1.5px solid ${value === opt ? colors.primary : "rgba(255,255,255,0.1)"}`,
            background: value === opt ? `${colors.primary}18` : colors.surfaceContainerHigh,
            color: value === opt ? colors.primary : colors.onSurface,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 700,
            fontFamily: fontFamily.headline,
            transition: "all 0.18s",
          }}
        >
          {opt ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
}

//Step 0a — Individual profile 

interface IndividualProfile {
  ownsCrypto:     boolean | null;
  hasBeneficiaries: boolean | null;
  wantsLegacy:    boolean | null;
}

function IndividualProfileStep({ onNext }: { onNext: (data: IndividualProfile) => void }) {
  const [profile, setProfile] = useState<IndividualProfile>({
    ownsCrypto:       null,
    hasBeneficiaries: null,
    wantsLegacy:      null,
  });

  const complete =
    profile.ownsCrypto !== null &&
    profile.hasBeneficiaries !== null &&
    profile.wantsLegacy !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <StepHeader
        icon="person"
        iconBg={`linear-gradient(135deg, ${colors.primaryContainer}55, ${colors.primary}22)`}
        iconColor={colors.primary}
        title="Tell us about yourself"
        subtitle="Three quick questions to personalise your vault."
      />

      <Field label="1. Do you own cryptocurrency?">
        <YesNo value={profile.ownsCrypto} onChange={v => setProfile(p => ({ ...p, ownsCrypto: v }))} />
      </Field>

      <Field label="2. Do you have beneficiaries?">
        <YesNo value={profile.hasBeneficiaries} onChange={v => setProfile(p => ({ ...p, hasBeneficiaries: v }))} />
      </Field>

      <Field label="3. Would you like to create a digital legacy plan?">
        <YesNo value={profile.wantsLegacy} onChange={v => setProfile(p => ({ ...p, wantsLegacy: v }))} />
      </Field>

      <GradientButton onClick={() => onNext(profile)} disabled={!complete} size="lg">
        Continue →
      </GradientButton>
    </div>
  );
}

//Step 0b — Stokvel profile 

interface StokvelProfile {
  memberCount:    string;
  monthlyAmount:  string;
  admins:         string;
  managesCrypto:  boolean | null;
}

function StokvelProfileStep({ onNext }: { onNext: (data: StokvelProfile) => void }) {
  const [profile, setProfile] = useState<StokvelProfile>({
    memberCount:   "",
    monthlyAmount: "",
    admins:        "",
    managesCrypto: null,
  });

  const complete =
    profile.memberCount.trim() !== "" &&
    profile.monthlyAmount.trim() !== "" &&
    profile.admins.trim() !== "" &&
    profile.managesCrypto !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <StepHeader
        icon="groups"
        iconBg={`linear-gradient(135deg, ${colors.tertiary}33, ${colors.primaryContainer}44)`}
        iconColor={colors.tertiary}
        title="Set up your Stokvel"
        subtitle="Tell us about your group so we configure the right controls."
      />

      <Field label="1. Number of members">
        <input
          style={INPUT}
          type="number"
          min={2}
          placeholder="e.g. 12"
          value={profile.memberCount}
          onChange={e => setProfile(p => ({ ...p, memberCount: e.target.value }))}
        />
      </Field>

      <Field label="2. Monthly contribution amount (ZAR or XLM)">
        <input
          style={INPUT}
          type="number"
          min={1}
          placeholder="e.g. 500"
          value={profile.monthlyAmount}
          onChange={e => setProfile(p => ({ ...p, monthlyAmount: e.target.value }))}
        />
      </Field>

      <Field label="3. Who are the administrators?" hint="Names or wallet addresses, comma-separated">
        <input
          style={INPUT}
          placeholder="e.g. Thandi M., Sipho K."
          value={profile.admins}
          onChange={e => setProfile(p => ({ ...p, admins: e.target.value }))}
        />
      </Field>

      <Field label="4. Do you manage crypto investments?">
        <YesNo value={profile.managesCrypto} onChange={v => setProfile(p => ({ ...p, managesCrypto: v }))} />
      </Field>

      <GradientButton onClick={() => onNext(profile)} disabled={!complete} size="lg">
        Continue →
      </GradientButton>
    </div>
  );
}

// ─── Step 0c — Business profile ───────────────────────────────────────────────

type CompanySize = "1–10" | "11–50" | "51–200" | "200+";
const COMPANY_SIZES: CompanySize[] = ["1–10", "11–50", "51–200", "200+"];

interface BusinessProfile {
  companySize:       CompanySize | null;
  employeeCount:     string;
  manageTreasury:    boolean | null;
  needsSuccession:   boolean | null;
}

function BusinessProfileStep({ onNext }: { onNext: (data: BusinessProfile) => void }) {
  const [profile, setProfile] = useState<BusinessProfile>({
    companySize:     null,
    employeeCount:   "",
    manageTreasury:  null,
    needsSuccession: null,
  });

  const complete =
    profile.companySize !== null &&
    profile.employeeCount.trim() !== "" &&
    profile.manageTreasury !== null &&
    profile.needsSuccession !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <StepHeader
        icon="business"
        iconBg={`linear-gradient(135deg, #10B98133, ${colors.primaryContainer}44)`}
        iconColor="#10B981"
        title="Configure your business vault"
        subtitle="A few details help us set the right governance controls."
      />

      <Field label="1. Company size">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          {COMPANY_SIZES.map(size => (
            <button
              key={size}
              type="button"
              onClick={() => setProfile(p => ({ ...p, companySize: size }))}
              style={{
                padding: "11px 6px",
                borderRadius: 10,
                border: `1.5px solid ${profile.companySize === size ? "#10B981" : "rgba(255,255,255,0.1)"}`,
                background: profile.companySize === size ? "#10B98118" : colors.surfaceContainerHigh,
                color: profile.companySize === size ? "#10B981" : colors.onSurface,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: fontFamily.headline,
                transition: "all 0.18s",
              }}
            >
              {size}
            </button>
          ))}
        </div>
      </Field>

      <Field label="2. Number of employees">
        <input
          style={INPUT}
          type="number"
          min={1}
          placeholder="e.g. 25"
          value={profile.employeeCount}
          onChange={e => setProfile(p => ({ ...p, employeeCount: e.target.value }))}
        />
      </Field>

      <Field label="3. Do you manage treasury wallets?">
        <YesNo value={profile.manageTreasury} onChange={v => setProfile(p => ({ ...p, manageTreasury: v }))} />
      </Field>

      <Field label="4. Do you need succession planning?">
        <YesNo value={profile.needsSuccession} onChange={v => setProfile(p => ({ ...p, needsSuccession: v }))} />
      </Field>

      <GradientButton onClick={() => onNext(profile)} disabled={!complete} size="lg">
        Continue →
      </GradientButton>
    </div>
  );
}

//Shared step header 

function StepHeader({ icon, iconBg, iconColor, title, subtitle }: {
  icon: string; iconBg: string; iconColor: string; title: string; subtitle: string;
}) {
  return (
    <div style={{ textAlign: "center", marginBottom: 4 }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <MaterialIcon name={icon} size={32} style={{ color: iconColor }} />
      </div>
      <h2 style={{ color: colors.onSurface, fontFamily: fontFamily.headline, fontSize: 22, margin: "0 0 8px" }}>{title}</h2>
      <p style={{ color: colors.outline, fontSize: 14, margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
    </div>
  );
}

//Step 1 — Identity 

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
      <StepHeader
        icon="badge"
        iconBg={`linear-gradient(135deg, ${colors.primaryContainer}55, ${colors.tertiary}33)`}
        iconColor={colors.primary}
        title="Create your ZK Identity"
        subtitle="Your identity is private by default. Only you control what you share."
      />      

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
      <StepHeader
        icon="account_balance_wallet"
        iconBg={`linear-gradient(135deg, ${colors.secondaryContainer}55, ${colors.primary}22)`}
        iconColor={colors.primary}
        title="Create your Vault"
        subtitle="Set guardrails that AI agents can never exceed."
      />

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

//Step 3 — Deposit 

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
      <StepHeader
        icon="south_america"
        iconBg={`linear-gradient(135deg, ${colors.tertiary}33, ${colors.primaryContainer}44)`}
        iconColor={colors.tertiary}
        title="Make your first deposit"
        subtitle="Start earning yield instantly. You can always add more later."
      />

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

// Step 4 — Agent or Stokvel 

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
      <StepHeader
        icon="explore"
        iconBg={`linear-gradient(135deg, ${colors.primaryContainer}44, ${colors.tertiary}22)`}
        iconColor={colors.primary}
        title="How do you want to grow?"
        subtitle="You can always do both — choose one to start."
      />

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

// Step 5 — Done 

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

// Main Wizard 

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

  const renderProfileStep = () => {
    if (userType === "individual") {
      return (
        <IndividualProfileStep
          onNext={profile => {
            // Store profile answers alongside wizard data if needed
            setData(v => ({ ...v, ...profile }));
            setStep(1);
          }}
        />
      );
    }
    if (userType === "stokvel") {
      return (
        <StokvelProfileStep
          onNext={profile => {
            setData(v => ({ ...v, ...profile }));
            setStep(1);
          }}
        />
      );
    }
    if (userType === "business") {
      return (
        <BusinessProfileStep
          onNext={profile => {
            setData(v => ({ ...v, ...profile }));
            setStep(1);
          }}
        />
      );
    }
    // Fallback — no userType set, skip straight to identity
    setStep(1);
    return null;
  };


  const renderStep = () => {
    switch (step) {
      case 0: return renderProfileStep();
      case 1: return <IdentityStep onNext={d => { setData(v => ({ ...v, ...d })); setStep(1); }} />;
      case 2: return <VaultStep    onNext={d => { setData(v => ({ ...v, ...d })); setStep(2); }} />;
      case 3: return <DepositStep  onNext={amt => { setData(v => ({ ...v, deposit: amt })); setStep(3); }} onSkip={() => setStep(3)} />;
      case 4: return <ChooseStep   onNext={c => { setData(v => ({ ...v, choice: c })); setStep(4); }} />;
      case 5: return <DoneStep     data={data} onFinish={finish} />;
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
