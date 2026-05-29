import React, { useState } from "react";
import { colors, fontFamily } from "../constants/theme";
import { MaterialIcon, GradientButton, GradientText } from "../components/ui";
import { useIsMobile } from "../hooks";
import { useStokvel } from "../hooks/useStokvel";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function xlm(stroops: string) {
  return (Number(stroops) / 10_000_000).toFixed(2);
}
function shortAddr(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
function daysUntil(ts: number) {
  const d = Math.max(0, Math.floor((ts - Date.now() / 1000) / 86400));
  return d === 0 ? "Today" : `${d}d`;
}
function timeSince(ts: number) {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
const STATUS_LABEL = ["Active", "Approved", "Rejected", "Executed", "Expired"];
const STATUS_COLOR = [colors.tertiary, "#22c55e", "#ef4444", colors.primary, colors.outline];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: colors.surfaceContainerLow,
      borderRadius: 16, padding: "20px 24px",
      display: "flex", flexDirection: "column", gap: 8,
      border: `1px solid rgba(255,255,255,0.05)`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <MaterialIcon name={icon} size={18} style={{ color: colors.primary, opacity: 0.8 }} />
        <span style={{ fontSize: 12, color: colors.outline, fontFamily: fontFamily.body, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {label}
        </span>
      </div>
      <p style={{ fontSize: 26, fontWeight: 800, color: colors.onSurface, fontFamily: fontFamily.headline, margin: 0 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 12, color: colors.outline, margin: 0 }}>{sub}</p>}
    </div>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ background: colors.surfaceContainerHigh, borderRadius: 4, height: 6, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${colors.primary}, ${colors.tertiary})`, borderRadius: 4, transition: "width 0.5s ease" }} />
    </div>
  );
}

// ─── Create Stokvel Modal ─────────────────────────────────────────────────────

function CreateModal({ onClose }: { onClose: () => void }) {
  const [step, setStep]   = useState(0);
  const [name, setName]   = useState("");
  const [members, setMembers] = useState("6");
  const [amount, setAmount]   = useState("10");
  const [interval, setInterval] = useState("Weekly");
  const [threshold, setThreshold] = useState("3");
  const [loading, setLoading] = useState(false);
  const [done, setDone]   = useState(false);

  const submit = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    setLoading(false);
    setDone(true);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: colors.surfaceContainerLow, borderRadius: 24,
        padding: "32px", maxWidth: 440, width: "100%",
        border: `1px solid rgba(255,255,255,0.08)`,
        animation: "blurIn 0.25s ease both",
      }}>
        {done ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
            <h3 style={{ color: colors.onSurface, fontFamily: fontFamily.headline, fontSize: 22, margin: "0 0 8px" }}>
              Stokvel Created!
            </h3>
            <p style={{ color: colors.outline, fontSize: 14, marginBottom: 24 }}>
              Share your invite link so members can join.
            </p>
            <div style={{ background: colors.surfaceContainerHigh, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <span style={{ fontSize: 12, color: colors.primary, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                veilVault.app/stokvel/invite/abc123xyz
              </span>
              <MaterialIcon name="content_copy" size={16} style={{ color: colors.outline, cursor: "pointer" }} />
            </div>
            <GradientButton onClick={onClose}>Go to My Stokvel</GradientButton>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <GradientText style={{ fontSize: 20, fontWeight: 800, fontFamily: fontFamily.headline }}>
                Create Stokvel
              </GradientText>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: colors.outline }}>
                <MaterialIcon name="close" size={22} />
              </button>
            </div>

            {/* Step indicators */}
            <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
              {["Details", "Rules", "Confirm"].map((s, i) => (
                <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? colors.primary : colors.surfaceContainerHigh, transition: "background 0.3s" }} />
              ))}
            </div>

            {step === 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 12, color: colors.outline, textTransform: "uppercase", letterSpacing: "0.08em" }}>Group Name</span>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ubuntu Savings Circle"
                    style={{ background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "12px 16px", color: colors.onSurface, fontSize: 15, outline: "none", fontFamily: fontFamily.body }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 12, color: colors.outline, textTransform: "uppercase", letterSpacing: "0.08em" }}>Max Members</span>
                  <input value={members} onChange={e => setMembers(e.target.value)} type="number" min={2} max={20}
                    style={{ background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "12px 16px", color: colors.onSurface, fontSize: 15, outline: "none", fontFamily: fontFamily.body }} />
                </label>
              </div>
            )}

            {step === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 12, color: colors.outline, textTransform: "uppercase", letterSpacing: "0.08em" }}>Contribution (XLM)</span>
                  <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min={1}
                    style={{ background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "12px 16px", color: colors.onSurface, fontSize: 15, outline: "none", fontFamily: fontFamily.body }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 12, color: colors.outline, textTransform: "uppercase", letterSpacing: "0.08em" }}>Interval</span>
                  <select value={interval} onChange={e => setInterval(e.target.value)}
                    style={{ background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "12px 16px", color: colors.onSurface, fontSize: 15, outline: "none", fontFamily: fontFamily.body }}>
                    <option>Weekly</option><option>Bi-weekly</option><option>Monthly</option>
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 12, color: colors.outline, textTransform: "uppercase", letterSpacing: "0.08em" }}>Approval threshold</span>
                  <input value={threshold} onChange={e => setThreshold(e.target.value)} type="number" min={1} max={Number(members)}
                    style={{ background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "12px 16px", color: colors.onSurface, fontSize: 15, outline: "none", fontFamily: fontFamily.body }} />
                  <span style={{ fontSize: 11, color: colors.outline }}>Votes needed to approve a payout proposal</span>
                </label>
              </div>
            )}

            {step === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  ["Group name", name || "—"],
                  ["Max members", members],
                  ["Contribution", `${amount} XLM / ${interval}`],
                  ["Approval threshold", `${threshold} votes`],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
                    <span style={{ color: colors.outline, fontSize: 14 }}>{k}</span>
                    <span style={{ color: colors.onSurface, fontSize: 14, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
              {step > 0 && (
                <button onClick={() => setStep(s => s - 1)}
                  style={{ flex: 1, padding: "13px", borderRadius: 12, background: colors.surfaceContainerHigh, border: "none", color: colors.onSurface, cursor: "pointer", fontSize: 15, fontFamily: fontFamily.headline }}>
                  Back
                </button>
              )}
              {step < 2
                ? <GradientButton onClick={() => setStep(s => s + 1)} style={{ flex: 2 }} disabled={step === 0 && !name.trim()}>Next</GradientButton>
                : <GradientButton onClick={submit} style={{ flex: 2 }} disabled={loading}>{loading ? "Creating…" : "Create Stokvel"}</GradientButton>
              }
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "Overview" | "Members" | "Proposals";

export const StokvelPage: React.FC = () => {
  const isMobile = useIsMobile();
  const { config, members, proposals, loading, usingMock, contribute, vote } = useStokvel();
  const [tab, setTab]             = useState<Tab>("Overview");
  const [showCreate, setShowCreate] = useState(false);
  const [contributing, setContributing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const handleContribute = async () => {
    setActionLoading(true);
    await contribute();
    setActionLoading(false);
    setContributing(false);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${colors.primaryContainer}`, borderTopColor: colors.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <span style={{ color: colors.outline, fontFamily: fontFamily.body }}>Loading stokvel…</span>
        </div>
      </div>
    );
  }

  const totalXlm     = config ? xlm(config.totalContributed) : "0";
  const disbursedXlm = config ? xlm(config.totalDistributed) : "0";
  const contribXlm   = config ? xlm(config.contributionAmount) : "0";
  const nextPayout   = proposals.find(p => p.status === 0);

  return (
    <section className="blur-in" style={{ padding: isMobile ? 16 : 32, maxWidth: 1100, margin: "0 auto" }}>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <GradientText style={{ fontSize: isMobile ? 24 : 32, fontWeight: 900, fontFamily: fontFamily.headline }}>
              {config?.name ?? "My Stokvel"}
            </GradientText>
            {usingMock && (
              <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: `${colors.tertiary}22`, color: colors.tertiary, border: `1px solid ${colors.tertiary}44`, fontFamily: fontFamily.body }}>
                Demo data
              </span>
            )}
          </div>
          <p style={{ color: colors.outline, fontSize: 14, margin: 0, fontFamily: fontFamily.body }}>
            {config?.memberCount ?? 0} members · {contribXlm} XLM per cycle
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={handleContribute}
            disabled={actionLoading}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 12, background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.1)`, color: colors.onSurface, cursor: "pointer", fontSize: 14, fontFamily: fontFamily.headline }}>
            <MaterialIcon name="payments" size={18} style={{ color: colors.primary }} />
            {actionLoading ? "Processing…" : "Contribute"}
          </button>
          <GradientButton onClick={() => setShowCreate(true)} size="sm">
            <MaterialIcon name="add" size={16} /> New Stokvel
          </GradientButton>
        </div>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 14, marginBottom: 32 }}>
        <StatCard icon="account_balance"  label="Pool Size"      value={`${totalXlm} XLM`}    sub="Total contributed" />
        <StatCard icon="people"           label="Members"        value={`${config?.memberCount ?? 0} / ${config?.maxMembers ?? 0}`} sub="Active" />
        <StatCard icon="payments"         label="Distributed"    value={`${disbursedXlm} XLM`} sub="All time" />
        <StatCard icon="how_to_vote"      label="Active Votes"   value={`${proposals.filter(p => p.status === 0).length}`} sub="Proposals" />
      </div>

      {/* ── Invite banner ── */}
      <div style={{ background: `linear-gradient(135deg, ${colors.primaryContainer}18, ${colors.tertiary}10)`, border: `1px solid ${colors.primaryContainer}30`, borderRadius: 16, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        <MaterialIcon name="group_add" size={22} style={{ color: colors.primary, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: colors.onSurface, fontSize: 14, fontWeight: 600, margin: "0 0 2px", fontFamily: fontFamily.headline }}>Invite members</p>
          <p style={{ color: colors.outline, fontSize: 12, margin: 0 }}>Share your link — members can join without exposing their identity</p>
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 10, background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.1)`, color: colors.primary, cursor: "pointer", fontSize: 13, fontFamily: fontFamily.headline, whiteSpace: "nowrap" }}>
          <MaterialIcon name="share" size={16} /> Copy Link
        </button>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: colors.surfaceContainerLow, borderRadius: 12, padding: 4, width: "fit-content" }}>
        {(["Overview", "Members", "Proposals"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 14, fontFamily: fontFamily.headline, fontWeight: tab === t ? 700 : 400, background: tab === t ? colors.primary : "transparent", color: tab === t ? "#000" : colors.outline, transition: "all 0.2s" }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === "Overview" && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>

          {/* Pool progress */}
          <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 24, border: `1px solid rgba(255,255,255,0.05)` }}>
            <h3 style={{ color: colors.onSurface, fontFamily: fontFamily.headline, fontSize: 16, margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8 }}>
              <MaterialIcon name="donut_large" size={18} style={{ color: colors.primary }} />
              Pool Progress
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: colors.outline }}>Contributions received</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: colors.onSurface }}>{totalXlm} / {config ? (Number(xlm(config.contributionAmount)) * (config.maxMembers)).toFixed(2) : "—"} XLM</span>
                </div>
                <ProgressBar value={Number(totalXlm)} max={config ? Number(xlm(config.contributionAmount)) * config.maxMembers : 100} />
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: colors.outline }}>Members joined</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: colors.onSurface }}>{config?.memberCount} / {config?.maxMembers}</span>
                </div>
                <ProgressBar value={config?.memberCount ?? 0} max={config?.maxMembers ?? 1} />
              </div>
            </div>
          </div>

          {/* Next payout */}
          <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 24, border: `1px solid rgba(255,255,255,0.05)` }}>
            <h3 style={{ color: colors.onSurface, fontFamily: fontFamily.headline, fontSize: 16, margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8 }}>
              <MaterialIcon name="schedule" size={18} style={{ color: colors.tertiary }} />
              Next Payout
            </h3>
            {nextPayout ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: colors.outline, fontSize: 13 }}>Recipient</span>
                  <span style={{ color: colors.onSurface, fontSize: 13, fontFamily: "monospace" }}>{shortAddr(nextPayout.targetAddress ?? "")}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: colors.outline, fontSize: 13 }}>Amount</span>
                  <span style={{ color: colors.primary, fontSize: 16, fontWeight: 700 }}>{nextPayout.amount ? xlm(nextPayout.amount) : "—"} XLM</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: colors.outline, fontSize: 13 }}>Expires</span>
                  <span style={{ color: colors.onSurface, fontSize: 13 }}>{daysUntil(nextPayout.expiresAt)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: colors.outline, fontSize: 13 }}>Approvals</span>
                  <span style={{ color: colors.onSurface, fontSize: 13 }}>{nextPayout.approvals.length} / {config?.threshold ?? "?"}</span>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <MaterialIcon name="hourglass_empty" size={32} style={{ color: colors.outline, marginBottom: 8 }} />
                <p style={{ color: colors.outline, fontSize: 13, margin: 0 }}>No active payout proposal</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Members tab ── */}
      {tab === "Members" && (
        <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, border: `1px solid rgba(255,255,255,0.05)`, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 16, padding: "14px 20px", borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
            <span style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase", letterSpacing: "0.08em" }}>Address</span>
            <span style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "right" }}>Contributed</span>
            <span style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "right" }}>Joined</span>
          </div>
          {(members.length > 0 ? members : [{
            address: "GCLFF...AWE4", shareBps: 2500, totalContributed: "15000000",
            lastContribution: Date.now() / 1000 - 86400, joinedAt: Date.now() / 1000 - 2592000,
          }]).map((m, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 16, padding: "16px 20px", borderBottom: `1px solid rgba(255,255,255,0.04)`, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${colors.primary}55, ${colors.tertiary}55)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: colors.primary }}>
                    {(m.shareBps / 100).toFixed(0)}%
                  </span>
                </div>
                <span style={{ fontSize: 13, color: colors.onSurface, fontFamily: "monospace" }}>{shortAddr(m.address)}</span>
              </div>
              <span style={{ fontSize: 14, color: colors.primary, fontWeight: 700, textAlign: "right" }}>{xlm(m.totalContributed)} XLM</span>
              <span style={{ fontSize: 12, color: colors.outline, textAlign: "right" }}>{timeSince(m.joinedAt)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Proposals tab ── */}
      {tab === "Proposals" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {proposals.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0", color: colors.outline }}>
              <MaterialIcon name="how_to_vote" size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p style={{ fontSize: 15, margin: 0 }}>No proposals yet</p>
            </div>
          )}
          {proposals.map(p => (
            <div key={p.id} style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 20, border: `1px solid rgba(255,255,255,0.05)` }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>
                      Proposal #{p.id}
                    </span>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${STATUS_COLOR[p.status]}22`, color: STATUS_COLOR[p.status], border: `1px solid ${STATUS_COLOR[p.status]}44` }}>
                      {STATUS_LABEL[p.status] ?? "Unknown"}
                    </span>
                  </div>
                  <p style={{ color: colors.outline, fontSize: 13, margin: 0 }}>
                    Distribute {p.amount ? xlm(p.amount) : "—"} XLM → {shortAddr(p.targetAddress ?? "—")}
                  </p>
                </div>
                <span style={{ fontSize: 12, color: colors.outline }}>Expires {daysUntil(p.expiresAt)}</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: colors.outline }}>Approvals</span>
                    <span style={{ fontSize: 11, color: colors.onSurface }}>{p.approvals.length} / {config?.threshold ?? "?"}</span>
                  </div>
                  <ProgressBar value={p.approvals.length} max={config?.threshold ?? 1} />
                </div>
                {p.status === 0 && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => vote(p.id, true)}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, background: "#22c55e22", border: "1px solid #22c55e44", color: "#22c55e", cursor: "pointer", fontSize: 13, fontFamily: fontFamily.headline }}>
                      <MaterialIcon name="thumb_up" size={15} /> Approve
                    </button>
                    <button onClick={() => vote(p.id, false)}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, background: "#ef444422", border: "1px solid #ef444444", color: "#ef4444", cursor: "pointer", fontSize: 13, fontFamily: fontFamily.headline }}>
                      <MaterialIcon name="thumb_down" size={15} /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
