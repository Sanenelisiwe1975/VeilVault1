/**
 * Privacy Pool — Shield / Unshield UI
 *
 * Deposit  : generate a fresh (secret, nullifier) pair → compute commitment
 *            → call deposit API → show the "note" to save → done
 *
 * Withdraw : paste saved note → get Merkle path → run Rust prover
 *            → paste proof JSON → submit attestation → withdraw
 */
import React, { useState, useRef } from "react";
import { colors, fontFamily } from "../constants/theme";
import { MaterialIcon, GradientButton, GradientText } from "../components/ui";
import { useIsMobile } from "../hooks";
import { usePrivacyPool } from "../hooks/usePrivacyPool";
import type { DepositNote } from "../hooks/usePrivacyPool";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortHash(h: string) { return h.slice(0, 8) + "…" + h.slice(-6); }
function timeSince(ts: number) {
  const d = Math.floor((Date.now() / 1000 - ts) / 86400);
  return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d}d ago`;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function Stat({ icon, label, value, color = colors.primary }: {
  icon: string; label: string; value: string; color?: string;
}) {
  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: "18px 20px", border: `1px solid rgba(255,255,255,0.05)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <MaterialIcon name={icon} size={15} style={{ color, opacity: 0.8 }} />
        <span style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{label}</span>
      </div>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: fontFamily.headline, color: colors.onSurface }}>{value}</p>
    </div>
  );
}

// ─── Note card ────────────────────────────────────────────────────────────────

function NoteCard({ note, onWithdraw, onDelete, denomination }: {
  note:         DepositNote;
  denomination: string;
  onWithdraw:   (n: DepositNote) => void;
  onDelete:     (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ background: note.spent ? colors.surfaceContainerLow : `${colors.primaryContainer}18`, borderRadius: 14, padding: "16px 18px", border: `1px solid ${note.spent ? "rgba(255,255,255,0.05)" : colors.primaryContainer + "33"}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: note.spent ? colors.surfaceContainerHigh : `${colors.primary}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <MaterialIcon name={note.spent ? "lock_open" : "lock"} size={18} style={{ color: note.spent ? colors.outline : colors.primary }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>
              {denomination} XLM note
            </span>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: note.spent ? `${colors.outline}22` : `${colors.primary}22`, color: note.spent ? colors.outline : colors.primary }}>
              {note.spent ? "Spent" : "Unspent"}
            </span>
          </div>
          <span style={{ fontSize: 12, color: colors.outline }}>
            Leaf #{note.leafIndex} · {timeSince(note.depositedAt)}
          </span>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setExpanded(v => !v)}
            style={{ padding: "6px 10px", borderRadius: 8, background: "transparent", border: `1px solid rgba(255,255,255,0.1)`, color: colors.outline, cursor: "pointer" }}>
            <MaterialIcon name={expanded ? "expand_less" : "expand_more"} size={17} />
          </button>
          {!note.spent && (
            <GradientButton onClick={() => onWithdraw(note)} size="sm">Withdraw</GradientButton>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14, padding: "14px", background: colors.surfaceContainerHigh, borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { label: "Commitment",    value: shortHash(note.commitment)    },
            { label: "Nullifier hash",value: shortHash(note.nullifierHash) },
            { label: "Tx hash",       value: shortHash(note.txHash)        },
          ].map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: colors.outline }}>{r.label}</span>
              <span style={{ fontSize: 12, color: colors.onSurface, fontFamily: "monospace" }}>{r.value}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid rgba(255,255,255,0.06)`, paddingTop: 10, display: "flex", gap: 8 }}>
            <button onClick={() => {
              const text = JSON.stringify({ secret: note.secret, nullifier: note.nullifier, leafIndex: note.leafIndex }, null, 2);
              navigator.clipboard?.writeText(text);
            }} style={{ flex: 1, padding: "8px", borderRadius: 8, background: "transparent", border: `1px solid rgba(255,255,255,0.1)`, color: colors.primary, cursor: "pointer", fontSize: 12, fontFamily: fontFamily.headline, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <MaterialIcon name="content_copy" size={14} /> Copy note
            </button>
            <button onClick={() => onDelete(note.id)}
              style={{ padding: "8px 14px", borderRadius: 8, background: "transparent", border: `1px solid #ef444440`, color: "#ef4444", cursor: "pointer", fontSize: 12, fontFamily: fontFamily.headline }}>
              Delete
            </button>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#ef4444", display: "flex", alignItems: "center", gap: 6 }}>
            <MaterialIcon name="warning" size={12} /> Store your note safely — these keys cannot be recovered if lost
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Deposit modal ────────────────────────────────────────────────────────────

function DepositModal({ denomination, onClose, onDeposit }: {
  denomination: string;
  onClose:   () => void;
  onDeposit: (secret: string) => Promise<void>;
}) {
  const [step,     setStep]     = useState<"confirm" | "depositing" | "done">("confirm");
  const [secret,   setSecret]   = useState("");
  const [note,     setNote]     = useState<DepositNote | null>(null);
  const [error,    setError]    = useState("");
  const [copied,   setCopied]   = useState(false);
  const { deposit } = usePrivacyPool();

  const go = async () => {
    setStep("depositing");
    setError("");
    try {
      const n = await deposit(secret || "DEMO_SECRET_KEY_REPLACE_WITH_REAL");
      setNote(n);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deposit failed");
      setStep("confirm");
    }
  };

  const copyNote = () => {
    if (!note) return;
    navigator.clipboard?.writeText(JSON.stringify({ secret: note.secret, nullifier: note.nullifier, leafIndex: note.leafIndex }, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: colors.surfaceContainerLow, borderRadius: 24, padding: 28, maxWidth: 440, width: "100%", border: `1px solid rgba(255,255,255,0.08)`, animation: "blurIn 0.25s ease both" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <GradientText style={{ fontSize: 18, fontWeight: 800, fontFamily: fontFamily.headline }}>
            {step === "done" ? "Deposit Complete" : "Shield Assets"}
          </GradientText>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: colors.outline }}><MaterialIcon name="close" size={22} /></button>
        </div>

        {step === "confirm" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Amount display */}
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <p style={{ margin: "0 0 4px", fontSize: 13, color: colors.outline }}>You are shielding</p>
              <p style={{ margin: 0, fontSize: 40, fontWeight: 900, fontFamily: fontFamily.headline, color: colors.primary }}>{denomination} <span style={{ fontSize: 22, color: colors.outline }}>XLM</span></p>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: colors.outline }}>Fixed denomination · anonymous transfer</p>
            </div>

            <div>
              <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
                Your Stellar secret key (signs the deposit tx)
              </label>
              <input
                type="password"
                value={secret}
                onChange={e => setSecret(e.target.value)}
                placeholder="S..."
                style={{ background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "12px 16px", color: colors.onSurface, fontSize: 14, outline: "none", fontFamily: fontFamily.body, width: "100%", boxSizing: "border-box" as const }}
              />
            </div>

            <div style={{ background: `${colors.tertiary}15`, borderRadius: 12, padding: "12px 16px", display: "flex", gap: 10 }}>
              <MaterialIcon name="key" size={15} style={{ color: colors.tertiary, flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12, color: colors.outline, lineHeight: 1.6 }}>
                A random <strong style={{ color: colors.onSurface }}>deposit note</strong> (secret + nullifier) will be generated. Save it — it is the only way to withdraw your funds.
              </p>
            </div>

            {error && <p style={{ color: "#ef4444", fontSize: 13, margin: 0 }}>{error}</p>}

            <GradientButton onClick={go} disabled={!secret.trim()} size="lg">Deposit {denomination} XLM →</GradientButton>
          </div>
        )}

        {step === "depositing" && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ width: 52, height: 52, border: `3px solid ${colors.primaryContainer}`, borderTopColor: colors.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <p style={{ color: colors.onSurface, fontSize: 15, fontFamily: fontFamily.headline, margin: "0 0 6px" }}>Depositing…</p>
            <p style={{ color: colors.outline, fontSize: 13, margin: 0 }}>Generating commitment · sending transaction</p>
          </div>
        )}

        {step === "done" && note && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 44, marginBottom: 8 }}>🔒</div>
              <p style={{ color: "#22c55e", fontSize: 16, fontWeight: 700, fontFamily: fontFamily.headline, margin: "0 0 4px" }}>
                {denomination} XLM shielded — leaf #{note.leafIndex}
              </p>
              <p style={{ color: colors.outline, fontSize: 13, margin: 0 }}>Your deposit note is stored locally. Back it up now.</p>
            </div>

            {/* Note box */}
            <div style={{ background: "#ef444415", border: "1.5px solid #ef444444", borderRadius: 12, padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <MaterialIcon name="warning" size={16} style={{ color: "#ef4444" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", fontFamily: fontFamily.headline }}>Save this note — it cannot be recovered</span>
              </div>
              <div style={{ background: colors.surfaceContainerLow, borderRadius: 8, padding: "10px 12px", fontFamily: "monospace", fontSize: 11, color: colors.onSurface, lineHeight: 1.7, wordBreak: "break-all" }}>
                {`{ "secret": "${note.secret.slice(0,16)}…", "nullifier": "${note.nullifier.slice(0,16)}…", "leafIndex": ${note.leafIndex} }`}
              </div>
              <button onClick={copyNote}
                style={{ marginTop: 10, width: "100%", padding: "9px", borderRadius: 8, background: copied ? "#22c55e22" : colors.surfaceContainerHigh, border: `1px solid ${copied ? "#22c55e44" : "rgba(255,255,255,0.1)"}`, color: copied ? "#22c55e" : colors.onSurface, cursor: "pointer", fontSize: 13, fontFamily: fontFamily.headline, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <MaterialIcon name={copied ? "check" : "content_copy"} size={15} />
                {copied ? "Copied!" : "Copy full note to clipboard"}
              </button>
            </div>

            <GradientButton onClick={onClose} size="lg">Done — I saved my note</GradientButton>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Withdraw modal ───────────────────────────────────────────────────────────

function WithdrawModal({ note, denomination, onClose, onWithdraw }: {
  note:        DepositNote;
  denomination:string;
  onClose:     () => void;
  onWithdraw:  (params: { note: DepositNote; recipientSecret: string; attestationId: string; root: string }) => Promise<void>;
}) {
  const [step,          setStep]          = useState<"setup" | "proving" | "submit" | "done">("setup");
  const [recipSecret,   setRecipSecret]   = useState("");
  const [attestationId, setAttestationId] = useState("");
  const [root,          setRoot]          = useState("");
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");
  const [txHash,        setTxHash]        = useState("");
  const { state }  = usePrivacyPool();

  // Pre-fill root from pool state
  const poolRoot = state?.currentRoot ?? "";

  const proverCmd = `cd prover && cargo run --release -- prove \\
  --secret ${note.secret} \\
  --nullifier ${note.nullifier} \\
  --path-elements-file pe.json \\
  --path-indices-file pi.json \\
  --root ${poolRoot} \\
  --recipient 0000000000000000000000000000000000000000000000000000000000000001 \\
  --denomination 10000000 \\
  --circuit-id 0101010101010101010101010101010101010101010101010101010101010101 \\
  --pk prover-keys/pk.bin \\
  --output proof.json`;

  const fetchPath = async () => {
    setStep("proving");
    // In production: fetch path from backend
    // Here we just advance to the submit step in demo mode
    await new Promise(r => setTimeout(r, 800));
    setRoot(poolRoot);
    setStep("submit");
  };

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      await onWithdraw({ note, recipientSecret: recipSecret || "DEMO_SECRET", attestationId: attestationId || "00".repeat(32), root: root || poolRoot });
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div style={{ background: colors.surfaceContainerLow, borderRadius: 24, padding: 28, maxWidth: 480, width: "100%", border: `1px solid rgba(255,255,255,0.08)`, animation: "blurIn 0.25s ease both", margin: "auto" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <GradientText style={{ fontSize: 18, fontWeight: 800, fontFamily: fontFamily.headline }}>
            Unshield {denomination} XLM
          </GradientText>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: colors.outline }}><MaterialIcon name="close" size={22} /></button>
        </div>

        {/* Step tracker */}
        <div style={{ display: "flex", gap: 0, marginBottom: 24 }}>
          {["Setup", "Path", "Prove", "Done"].map((s, i) => {
            const stepIdx = { setup: 0, proving: 1, submit: 2, done: 3 }[step];
            const active  = i === stepIdx;
            const done    = i < stepIdx;
            return (
              <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                  {i > 0 && <div style={{ flex: 1, height: 2, background: done || active ? colors.primary : "rgba(255,255,255,0.1)", transition: "background 0.3s" }} />}
                  <div style={{ width: 24, height: 24, borderRadius: "50%", border: `2px solid ${done || active ? colors.primary : "rgba(255,255,255,0.15)"}`, background: done ? colors.primary : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.3s" }}>
                    {done ? <MaterialIcon name="check" size={12} style={{ color: "#000" }} />
                          : <span style={{ fontSize: 10, color: active ? colors.primary : colors.outline }}>{i + 1}</span>}
                  </div>
                  {i < 3 && <div style={{ flex: 1, height: 2, background: done ? colors.primary : "rgba(255,255,255,0.1)", transition: "background 0.3s" }} />}
                </div>
                <span style={{ fontSize: 10, color: active ? colors.primary : colors.outline }}>{s}</span>
              </div>
            );
          })}
        </div>

        {step === "setup" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: colors.surfaceContainerHigh, borderRadius: 12, padding: "14px 16px" }}>
              <p style={{ margin: "0 0 4px", fontSize: 12, color: colors.outline }}>Withdrawing note</p>
              <p style={{ margin: 0, fontSize: 14, color: colors.onSurface, fontFamily: "monospace" }}>
                Leaf #{note.leafIndex} · {shortHash(note.commitment)}
              </p>
            </div>
            <div>
              <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
                Recipient secret key
              </label>
              <input type="password" value={recipSecret} onChange={e => setRecipSecret(e.target.value)} placeholder="S..." style={{ background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "12px 16px", color: colors.onSurface, fontSize: 14, outline: "none", fontFamily: fontFamily.body, width: "100%", boxSizing: "border-box" as const }} />
              <p style={{ margin: "5px 0 0", fontSize: 11, color: colors.outline }}>The account that will receive the {denomination} XLM</p>
            </div>
            <GradientButton onClick={fetchPath} disabled={!recipSecret.trim()} size="lg">Fetch Merkle Path →</GradientButton>
          </div>
        )}

        {step === "proving" && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ width: 48, height: 48, border: `3px solid ${colors.primaryContainer}`, borderTopColor: colors.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <p style={{ color: colors.onSurface, fontSize: 15, fontFamily: fontFamily.headline, margin: "0 0 6px" }}>Fetching Merkle path…</p>
          </div>
        )}

        {step === "submit" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: colors.surfaceContainerHigh, borderRadius: 12, padding: "14px" }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>
                1. Run the Rust prover
              </p>
              <div style={{ background: "#0a0a0f", borderRadius: 8, padding: "10px 12px", fontFamily: "monospace", fontSize: 10, color: "#a3e635", lineHeight: 1.7, overflowX: "auto", whiteSpace: "pre" }}>
                {proverCmd}
              </div>
              <button onClick={() => navigator.clipboard?.writeText(proverCmd)} style={{ marginTop: 8, padding: "6px 12px", borderRadius: 6, background: "transparent", border: `1px solid rgba(255,255,255,0.1)`, color: colors.outline, cursor: "pointer", fontSize: 11, fontFamily: fontFamily.body, display: "flex", alignItems: "center", gap: 6 }}>
                <MaterialIcon name="content_copy" size={12} /> Copy command
              </button>
            </div>

            <div>
              <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
                2. Attestation ID (from zk-attestation.attest_performance)
              </label>
              <input value={attestationId} onChange={e => setAttestationId(e.target.value)} placeholder="64-char hex…" style={{ background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "12px 16px", color: colors.onSurface, fontSize: 13, outline: "none", fontFamily: "monospace", width: "100%", boxSizing: "border-box" as const }} />
            </div>

            {error && <p style={{ color: "#ef4444", fontSize: 13, margin: 0 }}>{error}</p>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep("setup")} style={{ flex: 1, padding: "12px", borderRadius: 12, background: colors.surfaceContainerHigh, border: "none", color: colors.outline, cursor: "pointer", fontSize: 14, fontFamily: fontFamily.headline }}>Back</button>
              <GradientButton onClick={submit} disabled={loading} style={{ flex: 2 }}>
                {loading ? "Withdrawing…" : `Withdraw ${denomination} XLM →`}
              </GradientButton>
            </div>
            <p style={{ fontSize: 11, color: colors.outline, textAlign: "center", margin: 0 }}>
              Demo mode: skip attestation ID to simulate withdrawal
            </p>
          </div>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💸</div>
            <p style={{ color: "#22c55e", fontSize: 18, fontWeight: 800, fontFamily: fontFamily.headline, margin: "0 0 6px" }}>Withdrawn successfully!</p>
            <p style={{ color: colors.outline, fontSize: 14, margin: "0 0 20px" }}>{denomination} XLM sent to your wallet · nullifier spent</p>
            <GradientButton onClick={onClose} size="lg">Done</GradientButton>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export const PrivacyPoolPage: React.FC = () => {
  const isMobile = useIsMobile();
  const { state, notes, loading, usingMock, xlmDenomination, withdraw, deleteNote } = usePrivacyPool();
  const [showDeposit,  setShowDeposit]  = useState(false);
  const [withdrawNote, setWithdrawNote] = useState<DepositNote | null>(null);
  const [tab,          setTab]          = useState<"notes" | "about">("notes");

  const unspent = notes.filter(n => !n.spent);
  const spent   = notes.filter(n =>  n.spent);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${colors.primaryContainer}`, borderTopColor: colors.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <span style={{ color: colors.outline, fontFamily: fontFamily.body }}>Loading pool…</span>
        </div>
      </div>
    );
  }

  return (
    <section className="blur-in" style={{ padding: isMobile ? 16 : 32, maxWidth: 960, margin: "0 auto" }}>
      {showDeposit && (
        <DepositModal denomination={xlmDenomination} onClose={() => setShowDeposit(false)} onDeposit={async () => {}} />
      )}
      {withdrawNote && (
        <WithdrawModal
          note={withdrawNote}
          denomination={xlmDenomination}
          onClose={() => setWithdrawNote(null)}
          onWithdraw={async (p) => { await withdraw(p); setWithdrawNote(null); }}
        />
      )}

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <GradientText style={{ fontSize: isMobile ? 24 : 30, fontWeight: 900, fontFamily: fontFamily.headline }}>
              Privacy Pool
            </GradientText>
            {usingMock && (
              <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: `${colors.tertiary}22`, color: colors.tertiary, border: `1px solid ${colors.tertiary}44` }}>Demo</span>
            )}
          </div>
          <p style={{ color: colors.outline, fontSize: 14, margin: 0 }}>
            Send and receive funds privately — nobody can link your deposit to your withdrawal.
          </p>
        </div>
        <GradientButton onClick={() => setShowDeposit(true)} size="sm">
          <MaterialIcon name="add" size={15} /> Shield {xlmDenomination} XLM
        </GradientButton>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        <Stat icon="lock"           label="Denomination"    value={`${xlmDenomination} XLM`}          />
        <Stat icon="group"          label="Privacy strength" value={`${state?.nextIndex ?? 0} notes`}   />
        <Stat icon="folder"         label="My notes"        value={`${unspent.length} unspent`}        color={colors.tertiary} />
        <Stat icon="check_circle"   label="Pool status"     value={state?.isPaused ? "Paused" : "Live"} color={state?.isPaused ? "#ef4444" : "#22c55e"} />
      </div>

      {/* ── Contract info ── */}
      <div style={{ background: `${colors.primaryContainer}12`, border: `1px solid ${colors.primaryContainer}25`, borderRadius: 14, padding: "14px 18px", marginBottom: 24, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <MaterialIcon name="link" size={18} style={{ color: colors.primary, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: colors.onSurface, fontFamily: fontFamily.headline }}>Stellar Testnet</p>
          <p style={{ margin: 0, fontSize: 11, color: colors.outline, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {state?.contractId ?? "CAE3XBP6E5DFLAEZXJNYQ2HMJWKRIXP44U2EE6E5VRGLLGCLS4PO24ZI"}
          </p>
        </div>
        <button style={{ padding: "7px 14px", borderRadius: 10, background: colors.surfaceContainerHigh, border: "none", color: colors.primary, cursor: "pointer", fontSize: 12, fontFamily: fontFamily.headline, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          <MaterialIcon name="open_in_new" size={13} /> Explorer
        </button>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: colors.surfaceContainerLow, borderRadius: 12, padding: 4, width: "fit-content" }}>
        {(["notes", "about"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "8px 20px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 14, fontFamily: fontFamily.headline, fontWeight: tab === t ? 700 : 400, background: tab === t ? colors.primary : "transparent", color: tab === t ? "#000" : colors.outline, transition: "all 0.2s", textTransform: "capitalize" as const }}>
            {t === "notes" ? `My Notes (${notes.length})` : "How it works"}
          </button>
        ))}
      </div>

      {/* ── Notes tab ── */}
      {tab === "notes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {notes.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: `${colors.primary}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MaterialIcon name="lock" size={32} style={{ color: colors.primary, opacity: 0.6 }} />
              </div>
              <div>
                <p style={{ fontSize: 16, color: colors.onSurface, fontFamily: fontFamily.headline, margin: "0 0 6px" }}>No notes yet</p>
                <p style={{ fontSize: 14, color: colors.outline, margin: "0 0 20px" }}>Shield {xlmDenomination} XLM to create your first deposit note</p>
              </div>
              <GradientButton onClick={() => setShowDeposit(true)}>
                <MaterialIcon name="add" size={16} /> Make first deposit
              </GradientButton>
            </div>
          ) : (
            <>
              {unspent.length > 0 && (
                <p style={{ fontSize: 12, color: colors.outline, margin: "0 0 4px", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                  Unspent ({unspent.length})
                </p>
              )}
              {unspent.map(n => (
                <NoteCard key={n.id} note={n} denomination={xlmDenomination} onWithdraw={setWithdrawNote} onDelete={deleteNote} />
              ))}
              {spent.length > 0 && (
                <>
                  <p style={{ fontSize: 12, color: colors.outline, margin: "12px 0 4px", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                    Spent ({spent.length})
                  </p>
                  {spent.map(n => (
                    <NoteCard key={n.id} note={n} denomination={xlmDenomination} onWithdraw={setWithdrawNote} onDelete={deleteNote} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── About tab ── */}
      {tab === "about" && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
          {[
            { icon: "download",    title: "1. Deposit",   color: colors.primary,  text: `Send exactly ${xlmDenomination} XLM. A secret "note" is generated for you — save it somewhere safe, since it's the only way to get your funds back later.` },
            { icon: "privacy_tip", title: "2. Wait",      color: colors.tertiary, text: "The longer you wait, and the more other people deposit in the meantime, the harder it becomes for anyone to connect your deposit to your eventual withdrawal." },
            { icon: "key",         title: "3. Prove",     color: colors.primary,  text: "When you're ready to withdraw, the app generates a cryptographic proof that your note is genuine — without revealing who you are or which deposit was yours." },
            { icon: "upload",      title: "4. Withdraw",  color: "#22c55e",       text: `That proof is submitted, and ${xlmDenomination} XLM is sent to any address you choose. Each note can only be used once, so the same funds can't be withdrawn twice.` },
          ].map(c => (
            <div key={c.title} style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: "20px", border: `1px solid rgba(255,255,255,0.05)` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: `${c.color}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <MaterialIcon name={c.icon} size={16} style={{ color: c.color }} />
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>{c.title}</span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: colors.outline, lineHeight: 1.6 }}>{c.text}</p>
            </div>
          ))}

          {/* Tech info */}
          <div style={{ gridColumn: isMobile ? "1" : "1 / -1", background: colors.surfaceContainerLow, borderRadius: 16, padding: "20px", border: `1px solid rgba(255,255,255,0.05)` }}>
            <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>Technical details</p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 12 }}>
              {[
                { label: "Hash function",  value: "MiMC-5 Feistel"    },
                { label: "Field",          value: "BLS12-381 Fr"      },
                { label: "Tree depth",     value: "20 levels"         },
                { label: "Proof system",   value: "Groth16"           },
                { label: "Constraints",    value: "~6,600 R1CS"       },
                { label: "Anonymity set",  value: `${state?.nextIndex ?? 0} deposits` },
              ].map(t => (
                <div key={t.label}>
                  <p style={{ margin: "0 0 2px", fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>{t.label}</p>
                  <p style={{ margin: 0, fontSize: 14, color: colors.onSurface, fontFamily: fontFamily.headline }}>{t.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
