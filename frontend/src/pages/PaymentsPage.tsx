import React, { useState, useMemo } from "react";
import { colors, fontFamily } from "../constants/theme";
import { MaterialIcon, GradientButton, GradientText } from "../components/ui";
import { useIsMobile } from "../hooks";
import { usePayments, CORRIDORS } from "../hooks/usePayments";
import type { Payment, RecurringPayment } from "../hooks/usePayments";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortAddr(s: string) {
  if (!s || s.length <= 12) return s;
  return s.slice(0, 6) + "…" + s.slice(-4);
}
function timeSince(ts: number) {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 3600)   return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)  return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function nextRunLabel(ts: number) {
  const d = Math.floor((ts - Date.now() / 1000) / 86400);
  if (d <= 0) return "Due now";
  return `in ${d}d`;
}

const INPUT_STYLE: React.CSSProperties = {
  background:   colors.surfaceContainerHigh,
  border:       `1px solid rgba(255,255,255,0.1)`,
  borderRadius: 10, padding: "12px 14px",
  color:        colors.onSurface, fontSize: 14,
  outline:      "none", fontFamily: fontFamily.body,
  width:        "100%", boxSizing: "border-box",
};

// ─── Send modal ───────────────────────────────────────────────────────────────

function SendModal({ onClose }: { onClose: () => void }) {
  const { send, xlm }      = usePayments();
  const [step, setStep]    = useState<"form" | "confirm" | "sending" | "done">("form");
  const [recipient, setRecipient] = useState("");
  const [amount,    setAmount]    = useState("");
  const [asset,     setAsset]     = useState("XLM");
  const [memo,      setMemo]      = useState("");
  const [secret,    setSecret]    = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [txHash,    setTxHash]    = useState("");

  // Detect phone number input
  const isPhone = /^\+?\d[\d\s\-]{7,}$/.test(recipient.trim());

  const go = async () => {
    setStep("sending");
    try {
      const p = await send({
        senderSecret: secret || "DEMO_SECRET",
        recipient,
        amount: String(Math.round(Number(amount) * 1e7)),
        asset,
        memo: memo || undefined,
        private: isPrivate,
      });
      setTxHash(p.txHash ?? "");
      setStep("done");
    } catch {
      setStep("form");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: colors.surfaceContainerLow, borderRadius: 24, padding: 28, maxWidth: 420, width: "100%", border: `1px solid rgba(255,255,255,0.08)`, animation: "blurIn 0.25s ease both" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <GradientText style={{ fontSize: 18, fontWeight: 800, fontFamily: fontFamily.headline }}>Send Payment</GradientText>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: colors.outline }}><MaterialIcon name="close" size={22} /></button>
        </div>

        {(step === "form" || step === "confirm") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Recipient */}
            <div>
              <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>To</label>
              <div style={{ position: "relative" }}>
                <input style={{ ...INPUT_STYLE, paddingLeft: 40 }} value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="G... address or +27812345678" />
                <MaterialIcon name={isPhone ? "phone" : "person"} size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: colors.outline }} />
              </div>
              {isPhone && (
                <p style={{ fontSize: 11, color: colors.primary, margin: "4px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
                  <MaterialIcon name="check_circle" size={12} /> Phone number detected — will resolve to Stellar address
                </p>
              )}
            </div>

            {/* Amount + asset */}
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Amount</label>
                <input style={INPUT_STYLE} type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" min="0" />
              </div>
              <div style={{ width: 100 }}>
                <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Asset</label>
                <select value={asset} onChange={e => setAsset(e.target.value)} style={{ ...INPUT_STYLE, paddingRight: 8 }}>
                  <option value="XLM">XLM</option>
                  <option value="USDC">USDC</option>
                </select>
              </div>
            </div>

            {/* Quick amounts */}
            <div style={{ display: "flex", gap: 6 }}>
              {["10", "50", "100", "500"].map(v => (
                <button key={v} type="button" onClick={() => setAmount(v)}
                  style={{ flex: 1, padding: "6px", borderRadius: 7, border: `1px solid rgba(255,255,255,0.1)`, background: amount === v ? `${colors.primary}22` : "transparent", color: amount === v ? colors.primary : colors.outline, cursor: "pointer", fontSize: 12, fontFamily: fontFamily.body }}>
                  {v}
                </button>
              ))}
            </div>

            {/* Memo */}
            <div>
              <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Memo (optional)</label>
              <input style={INPUT_STYLE} value={memo} onChange={e => setMemo(e.target.value)} placeholder="e.g. Rent, Stokvel, Groceries…" maxLength={28} />
            </div>

            {/* Private toggle */}
            <button type="button" onClick={() => setIsPrivate(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12, border: `1.5px solid ${isPrivate ? colors.primary + "60" : "rgba(255,255,255,0.1)"}`, background: isPrivate ? `${colors.primary}12` : "transparent", cursor: "pointer", textAlign: "left" as const }}>
              <MaterialIcon name="privacy_tip" size={20} style={{ color: isPrivate ? colors.primary : colors.outline }} />
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: isPrivate ? colors.primary : colors.onSurface, fontFamily: fontFamily.headline }}>Private transfer</p>
                <p style={{ margin: 0, fontSize: 11, color: colors.outline }}>Route through Privacy Pool · hides sender/receiver link</p>
              </div>
              <div style={{ width: 38, height: 22, borderRadius: 11, background: isPrivate ? colors.primary : colors.surfaceContainerHigh, position: "relative", transition: "background 0.25s", flexShrink: 0 }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: isPrivate ? 19 : 3, transition: "left 0.25s" }} />
              </div>
            </button>

            {step === "confirm" && (
              <>
                <div>
                  <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Your Stellar secret key</label>
                  <input type="password" style={INPUT_STYLE} value={secret} onChange={e => setSecret(e.target.value)} placeholder="S..." />
                </div>
                {/* Summary */}
                <div style={{ background: colors.surfaceContainerHigh, borderRadius: 12, padding: "14px 16px" }}>
                  {[
                    ["To",     isPhone ? `${recipient} (mobile)` : shortAddr(recipient)],
                    ["Amount", `${amount} ${asset}`],
                    ["Memo",   memo || "—"],
                    ["Type",   isPrivate ? "🔒 Private" : "Public"],
                    ["Fee",    "< 0.0001 XLM"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ fontSize: 13, color: colors.outline }}>{k}</span>
                      <span style={{ fontSize: 13, color: colors.onSurface, fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              {step === "confirm" && (
                <button onClick={() => setStep("form")} style={{ flex: 1, padding: "12px", borderRadius: 12, background: colors.surfaceContainerHigh, border: "none", color: colors.outline, cursor: "pointer", fontSize: 14, fontFamily: fontFamily.headline }}>Back</button>
              )}
              <GradientButton
                onClick={() => step === "form" ? setStep("confirm") : go()}
                disabled={!recipient.trim() || !amount || Number(amount) <= 0}
                style={{ flex: 2 }}
                size="lg">
                {step === "form" ? "Review →" : "Send Now →"}
              </GradientButton>
            </div>
          </div>
        )}

        {step === "sending" && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ width: 52, height: 52, border: `3px solid ${colors.primaryContainer}`, borderTopColor: colors.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <p style={{ color: colors.onSurface, fontSize: 15, fontFamily: fontFamily.headline, margin: "0 0 6px" }}>Sending…</p>
            <p style={{ color: colors.outline, fontSize: 13 }}>Broadcasting transaction · ~5 seconds</p>
          </div>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center", padding: "16px 0", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 52 }}>✅</div>
            <div>
              <p style={{ color: "#22c55e", fontSize: 18, fontWeight: 800, fontFamily: fontFamily.headline, margin: "0 0 4px" }}>Sent!</p>
              <p style={{ color: colors.outline, fontSize: 14, margin: 0 }}>{amount} {asset} → {shortAddr(recipient)}</p>
            </div>
            {txHash && (
              <div style={{ background: colors.surfaceContainerHigh, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: colors.outline, flexShrink: 0 }}>Tx</span>
                <span style={{ fontSize: 11, color: colors.primary, fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{txHash}</span>
                <button onClick={() => navigator.clipboard?.writeText(txHash ?? "")} style={{ background: "none", border: "none", cursor: "pointer", color: colors.outline }}><MaterialIcon name="content_copy" size={14} /></button>
              </div>
            )}
            <GradientButton onClick={onClose} size="lg">Done</GradientButton>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Receive panel ────────────────────────────────────────────────────────────

function ReceivePanel() {
  const myAddress = "GCLFFNMPD6FXBHMBK2BONRIXBWALO3EOA6NYX3BJ42QBGH6FJPQUAWE4"; // from wallet
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(myAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 400 }}>
      {/* QR placeholder */}
      <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 28, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid rgba(255,255,255,0.06)` }}>
        <div style={{ width: 160, height: 160, background: colors.surfaceContainerHigh, borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <MaterialIcon name="qr_code_2" size={64} style={{ color: colors.primary, opacity: 0.7 }} />
          <span style={{ fontSize: 11, color: colors.outline }}>QR code</span>
        </div>
      </div>

      <div style={{ background: colors.surfaceContainerLow, borderRadius: 14, padding: "14px 16px", border: `1px solid rgba(255,255,255,0.06)` }}>
        <p style={{ margin: "0 0 8px", fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Your Stellar address</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <p style={{ flex: 1, margin: 0, fontSize: 12, color: colors.onSurface, fontFamily: "monospace", wordBreak: "break-all" as const }}>{myAddress}</p>
          <button onClick={copy} style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 8, background: copied ? "#22c55e22" : colors.surfaceContainerHigh, border: `1px solid ${copied ? "#22c55e44" : "rgba(255,255,255,0.1)"}`, color: copied ? "#22c55e" : colors.outline, cursor: "pointer", fontSize: 12, fontFamily: fontFamily.headline }}>
            {copied ? "✓" : "Copy"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        {[
          { icon: "share",          label: "Share link"  },
          { icon: "download",       label: "Save QR"     },
        ].map(b => (
          <button key={b.label} style={{ flex: 1, padding: "11px", borderRadius: 12, background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.08)`, color: colors.onSurface, cursor: "pointer", fontSize: 13, fontFamily: fontFamily.headline, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <MaterialIcon name={b.icon} size={16} style={{ color: colors.primary }} />{b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Recurring card ───────────────────────────────────────────────────────────

function RecurringCard({ r, onToggle, onDelete, xlm }: {
  r: RecurringPayment; xlm: (s: string) => string;
  onToggle: (id: string) => void; onDelete: (id: string) => void;
}) {
  const INTERVAL_ICON: Record<string, string> = { daily: "today", weekly: "view_week", monthly: "calendar_month" };
  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 14, padding: "16px 18px", border: `1px solid rgba(255,255,255,0.05)`, display: "flex", gap: 12, alignItems: "center" }}>
      <div style={{ width: 38, height: 38, borderRadius: 12, background: r.active ? `${colors.primary}22` : colors.surfaceContainerHigh, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <MaterialIcon name={INTERVAL_ICON[r.interval] ?? "repeat"} size={18} style={{ color: r.active ? colors.primary : colors.outline }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>
            {xlm(r.amount)} {r.asset}
          </span>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: r.active ? `${colors.primary}22` : `${colors.outline}22`, color: r.active ? colors.primary : colors.outline }}>
            {r.active ? r.interval : "paused"}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: colors.outline }}>
          → {shortAddr(r.recipient)}{r.memo ? ` · ${r.memo}` : ""} · {nextRunLabel(r.nextRun)}
        </p>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={() => onToggle(r.id)}
          style={{ padding: "6px 12px", borderRadius: 8, background: r.active ? `${colors.outline}22` : `${colors.primary}22`, border: "none", color: r.active ? colors.outline : colors.primary, cursor: "pointer", fontSize: 12, fontFamily: fontFamily.headline }}>
          {r.active ? "Pause" : "Resume"}
        </button>
        <button onClick={() => onDelete(r.id)}
          style={{ padding: "6px 8px", borderRadius: 8, background: "transparent", border: `1px solid #ef444430`, color: "#ef4444", cursor: "pointer" }}>
          <MaterialIcon name="delete" size={15} />
        </button>
      </div>
    </div>
  );
}

// ─── Payment history row ──────────────────────────────────────────────────────

function HistoryRow({ p, xlm }: { p: Payment; xlm: (s: string) => string }) {
  const sent = p.direction === "sent";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
      <div style={{ width: 38, height: 38, borderRadius: "50%", background: p.private ? `${colors.primary}22` : sent ? `${colors.outline}18` : "#22c55e18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <MaterialIcon name={p.private ? "privacy_tip" : sent ? "arrow_upward" : "arrow_downward"} size={18} style={{ color: p.private ? colors.primary : sent ? colors.outline : "#22c55e" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: "0 0 2px", fontSize: 14, color: colors.onSurface, fontFamily: fontFamily.headline, fontWeight: 600 }}>
          {sent ? `To ${shortAddr(p.recipient)}` : `From ${shortAddr(p.sender ?? "—")}`}
          {p.private && <span style={{ marginLeft: 6, fontSize: 10, padding: "2px 6px", borderRadius: 10, background: `${colors.primary}22`, color: colors.primary }}>Private</span>}
        </p>
        <p style={{ margin: 0, fontSize: 12, color: colors.outline }}>{p.memo ?? ""} · {timeSince(p.createdAt)}</p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700, fontFamily: fontFamily.headline, color: sent ? colors.onSurface : "#22c55e" }}>
          {sent ? "−" : "+"}{xlm(p.amount)} {p.asset}
        </p>
        <span style={{ fontSize: 11, color: p.status === "confirmed" ? "#22c55e" : p.status === "failed" ? "#ef4444" : colors.outline }}>
          {p.status}
        </span>
      </div>
    </div>
  );
}

// ─── Recurring setup modal ────────────────────────────────────────────────────

function RecurringModal({ onClose, onAdd }: { onClose: () => void; onAdd: (r: Omit<RecurringPayment, "id"|"createdAt">) => void }) {
  const [recipient, setRecipient] = useState("");
  const [amount,    setAmount]    = useState("");
  const [asset,     setAsset]     = useState("XLM");
  const [memo,      setMemo]      = useState("");
  const [interval,  setInterval]  = useState<RecurringPayment["interval"]>("monthly");
  const [done,      setDone]      = useState(false);

  const add = () => {
    const nextRun = Math.floor(Date.now() / 1000) + (interval === "daily" ? 86400 : interval === "weekly" ? 604800 : 2592000);
    onAdd({ recipient, amount: String(Math.round(Number(amount) * 1e7)), asset, memo: memo || undefined, interval, nextRun, active: true });
    setDone(true);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: colors.surfaceContainerLow, borderRadius: 24, padding: 28, maxWidth: 400, width: "100%", border: `1px solid rgba(255,255,255,0.08)`, animation: "blurIn 0.25s ease both" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <GradientText style={{ fontSize: 18, fontWeight: 800, fontFamily: fontFamily.headline }}>Recurring Payment</GradientText>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: colors.outline }}><MaterialIcon name="close" size={22} /></button>
        </div>
        {done ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔄</div>
            <p style={{ color: "#22c55e", fontSize: 17, fontWeight: 800, fontFamily: fontFamily.headline, margin: "0 0 6px" }}>Scheduled!</p>
            <p style={{ color: colors.outline, fontSize: 13, margin: "0 0 20px" }}>First payment runs {interval === "daily" ? "tomorrow" : interval === "weekly" ? "in 7 days" : "in 30 days"}</p>
            <GradientButton onClick={onClose} size="lg">Done</GradientButton>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Recipient</label>
              <input style={INPUT_STYLE} value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="G... or +27812345678" />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Amount</label>
                <input style={INPUT_STYLE} type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div style={{ width: 90 }}>
                <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Asset</label>
                <select value={asset} onChange={e => setAsset(e.target.value)} style={{ ...INPUT_STYLE, paddingRight: 6 }}>
                  <option>XLM</option><option>USDC</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Frequency</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["daily","weekly","monthly"] as const).map(i => (
                  <button key={i} type="button" onClick={() => setInterval(i)}
                    style={{ flex: 1, padding: "9px", borderRadius: 9, border: `1.5px solid ${interval === i ? colors.primary : "rgba(255,255,255,0.1)"}`, background: interval === i ? `${colors.primary}18` : "transparent", color: interval === i ? colors.primary : colors.outline, cursor: "pointer", fontSize: 12, fontFamily: fontFamily.headline, textTransform: "capitalize" as const }}>
                    {i}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>Memo</label>
              <input style={INPUT_STYLE} value={memo} onChange={e => setMemo(e.target.value)} placeholder="e.g. School fees, Savings…" />
            </div>
            <GradientButton onClick={add} disabled={!recipient.trim() || !amount || Number(amount) <= 0} size="lg">Schedule Payment →</GradientButton>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "send" | "receive" | "recurring" | "history";

export const PaymentsPage: React.FC = () => {
  const isMobile = useIsMobile();
  const { payments, recurring, xlm, toggleRecurring, deleteRecurring, addRecurring } = usePayments();
  const [tab,          setTab]          = useState<Tab>("send");
  const [showSend,     setShowSend]     = useState(false);
  const [showRecModal, setShowRecModal] = useState(false);
  const [filter,       setFilter]       = useState<"all" | "sent" | "received" | "private">("all");

  const filteredPayments = useMemo(() => payments.filter(p => {
    if (filter === "all")      return true;
    if (filter === "private")  return p.private;
    return p.direction === filter;
  }), [payments, filter]);

  const TAB_CFG: { key: Tab; icon: string; label: string }[] = [
    { key: "send",      icon: "send",            label: "Send"       },
    { key: "receive",   icon: "call_received",   label: "Receive"    },
    { key: "recurring", icon: "repeat",          label: "Recurring"  },
    { key: "history",   icon: "history",         label: "History"    },
  ];

  const totalSent     = payments.filter(p => p.direction === "sent"     && !p.private).reduce((a, p) => a + Number(xlm(p.amount)), 0);
  const totalReceived = payments.filter(p => p.direction === "received"             ).reduce((a, p) => a + Number(xlm(p.amount)), 0);
  const privateCount  = payments.filter(p => p.private).length;

  return (
    <section className="blur-in" style={{ padding: isMobile ? 16 : 32, maxWidth: 900, margin: "0 auto" }}>
      {showSend     && <SendModal     onClose={() => setShowSend(false)} />}
      {showRecModal && <RecurringModal onClose={() => setShowRecModal(false)} onAdd={r => { addRecurring(r); setShowRecModal(false); }} />}

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <GradientText style={{ fontSize: isMobile ? 24 : 30, fontWeight: 900, fontFamily: fontFamily.headline, display: "block", marginBottom: 6 }}>
            Payments
          </GradientText>
          <p style={{ color: colors.outline, fontSize: 14, margin: 0 }}>
            Send, receive, and schedule — on Stellar in under 5 seconds
          </p>
        </div>
        <GradientButton onClick={() => setShowSend(true)} size="sm">
          <MaterialIcon name="send" size={14} /> Send Payment
        </GradientButton>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { icon: "arrow_upward",   label: "Total sent",     value: `${totalSent.toFixed(1)} XLM`,   color: colors.primary  },
          { icon: "arrow_downward", label: "Total received", value: `${totalReceived.toFixed(1)} XLM`, color: "#22c55e"      },
          { icon: "privacy_tip",    label: "Private",        value: `${privateCount} txns`,           color: colors.tertiary },
          { icon: "timer",          label: "Avg settlement", value: "< 5s",                           color: colors.outline  },
        ].map(s => (
          <div key={s.label} style={{ background: colors.surfaceContainerLow, borderRadius: 14, padding: "16px 18px", border: `1px solid rgba(255,255,255,0.05)` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
              <MaterialIcon name={s.icon} size={14} style={{ color: s.color }} />
              <span style={{ fontSize: 10, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>{s.label}</span>
            </div>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 800, fontFamily: fontFamily.headline, color: colors.onSurface }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Corridor rates ── */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 12, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", margin: "0 0 10px" }}>Popular corridors</p>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
          {CORRIDORS.filter(c => c.popular).map(c => (
            <button key={c.to} type="button" onClick={() => setShowSend(true)}
              style={{ flexShrink: 0, background: colors.surfaceContainerLow, border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 12, padding: "10px 16px", cursor: "pointer", display: "flex", flex: "column", alignItems: "flex-start", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 18 }}>{c.flag}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>XLM → {c.to}</span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: colors.primary }}>1 XLM ≈ {c.rate} {c.to}</p>
              <p style={{ margin: 0, fontSize: 10, color: colors.outline }}>{c.fee} fee · {c.time}</p>
            </button>
          ))}
          <button type="button" onClick={() => {}}
            style={{ flexShrink: 0, background: "transparent", border: `1px dashed rgba(255,255,255,0.12)`, borderRadius: 12, padding: "10px 20px", cursor: "pointer", color: colors.outline, fontSize: 12, fontFamily: fontFamily.body }}>
            More →
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, background: colors.surfaceContainerLow, borderRadius: 14, padding: 4 }}>
        {TAB_CFG.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: isMobile ? 0 : 7, padding: "9px 8px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontFamily: fontFamily.headline, fontWeight: tab === t.key ? 700 : 400, background: tab === t.key ? colors.primary : "transparent", color: tab === t.key ? "#000" : colors.outline, transition: "all 0.2s" }}>
            <MaterialIcon name={t.icon} size={16} />
            {!isMobile && t.label}
          </button>
        ))}
      </div>

      {/* ── Send tab ── */}
      {tab === "send" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 460 }}>
          <div style={{ background: `linear-gradient(135deg, ${colors.primaryContainer}20, ${colors.tertiary}10)`, borderRadius: 20, padding: "28px", border: `1px solid ${colors.primaryContainer}28`, textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${colors.primary}22`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <MaterialIcon name="send" size={26} style={{ color: colors.primary }} />
            </div>
            <p style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: colors.onSurface, fontFamily: fontFamily.headline }}>Send XLM or USDC</p>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: colors.outline, lineHeight: 1.5 }}>
              To any Stellar address or mobile number · settles in &lt;5s · fee &lt;0.0001 XLM
            </p>
            <GradientButton onClick={() => setShowSend(true)} size="lg" fullWidth>
              Send a payment →
            </GradientButton>
          </div>

          <div style={{ background: `${colors.primary}12`, border: `1px solid ${colors.primary}25`, borderRadius: 14, padding: "14px 16px", display: "flex", gap: 10 }}>
            <MaterialIcon name="privacy_tip" size={16} style={{ color: colors.primary, flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, color: colors.outline, lineHeight: 1.6 }}>
              <strong style={{ color: colors.onSurface }}>Private mode</strong> routes through the Privacy Pool — hides the sender/receiver link on-chain. Toggle it in the send form.
            </p>
          </div>

          {/* All corridors */}
          <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, border: `1px solid rgba(255,255,255,0.05)`, overflow: "hidden" }}>
            <p style={{ margin: 0, padding: "14px 16px 10px", fontSize: 12, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
              All remittance corridors
            </p>
            {CORRIDORS.map((c, i) => (
              <div key={c.to} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderBottom: i < CORRIDORS.length - 1 ? `1px solid rgba(255,255,255,0.04)` : "none" }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{c.flag}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: colors.onSurface, fontFamily: fontFamily.headline }}>XLM → {c.to}</p>
                  <p style={{ margin: 0, fontSize: 11, color: colors.outline }}>1 XLM ≈ {c.rate} {c.to} · {c.fee} fee</p>
                </div>
                <button onClick={() => setShowSend(true)} style={{ padding: "6px 14px", borderRadius: 8, background: `${colors.primary}18`, border: `1px solid ${colors.primary}30`, color: colors.primary, cursor: "pointer", fontSize: 12, fontFamily: fontFamily.headline }}>Send</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Receive tab ── */}
      {tab === "receive" && <ReceivePanel />}

      {/* ── Recurring tab ── */}
      {tab === "recurring" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <GradientButton onClick={() => setShowRecModal(true)} size="sm">
              <MaterialIcon name="add" size={14} /> New schedule
            </GradientButton>
          </div>
          {recurring.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: colors.outline }}>
              <MaterialIcon name="repeat" size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p style={{ fontSize: 15, margin: "0 0 4px" }}>No recurring payments</p>
              <p style={{ fontSize: 13, margin: 0 }}>Set up automatic payments for rent, savings, or subscriptions</p>
            </div>
          ) : recurring.map(r => (
            <RecurringCard key={r.id} r={r} xlm={xlm} onToggle={toggleRecurring} onDelete={deleteRecurring} />
          ))}
        </div>
      )}

      {/* ── History tab ── */}
      {tab === "history" && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {(["all","sent","received","private"] as const).map(f => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${filter === f ? colors.primary : "rgba(255,255,255,0.1)"}`, background: filter === f ? `${colors.primary}22` : "transparent", color: filter === f ? colors.primary : colors.outline, cursor: "pointer", fontSize: 12, fontFamily: fontFamily.headline, textTransform: "capitalize" as const }}>
                {f}
              </button>
            ))}
          </div>
          {filteredPayments.length === 0 ? (
            <p style={{ color: colors.outline, textAlign: "center", padding: "40px 0", fontSize: 14 }}>No transactions</p>
          ) : (
            <div>
              {filteredPayments.map(p => <HistoryRow key={p.id} p={p} xlm={xlm} />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
