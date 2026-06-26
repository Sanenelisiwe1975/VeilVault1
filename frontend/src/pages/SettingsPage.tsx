import React, { useState } from "react";
import { colors, fontFamily } from "../constants/theme";
import { MaterialIcon, GradientButton } from "../components/ui";
import { useIsMobile, useVault } from "../hooks";
import { useWalletSession } from "../context/WalletSession";

const DEVNET_RPC   = "https://soroban-testnet.stellar.org";
const APP_VERSION  = "1.0.0-testnet";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 14 }}>
        {title}
      </p>
      <div style={{ background: colors.surfaceContainerLow, borderRadius: 12 }}>
        {children}
      </div>
    </div>
  );
}

function Row({
  icon, label, value, children, last = false,
}: {
  icon: string; label: string; value?: string;
  children?: React.ReactNode; last?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", padding: "16px 20px",
      background: "transparent",
      borderBottom: last ? "none" : `1px solid ${colors.surfaceContainerHighest}40`,
    }}>
      <MaterialIcon name={icon} size={16} style={{ color: colors.onSurfaceVariant, marginRight: 14, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#fff", fontFamily: fontFamily.headline }}>{label}</span>
      {value && <span style={{ fontSize: 12, color: colors.onSurfaceVariant, marginRight: 12 }}>{value}</span>}
      {children}
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: 44, height: 24, borderRadius: 12, border: "none",
        background: on ? colors.primary : colors.surfaceContainerHighest,
        cursor: "pointer", position: "relative", transition: "background 0.25s", flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: on ? 22 : 3,
        width: 18, height: 18, borderRadius: "50%",
        background: on ? colors.onPrimary : "#64748b",
        transition: "left 0.25s",
      }} />
    </button>
  );
}

export const SettingsPage: React.FC = () => {
  const isMobile = useIsMobile();
  const { walletType, addBackupPasskeyWallet } = useWalletSession();
  const { vaultContractId } = useVault();

  const [customRpc,       setCustomRpc]       = useState("");
  const [useCustomRpc,    setUseCustomRpc]     = useState(false);
  const [hideBalances,    setHideBalances]     = useState(false);
  const [reduceMotion,    setReduceMotion]     = useState(false);
  const [notifications,   setNotifications]    = useState(true);
  const [cleared,         setCleared]          = useState(false);

  const [backupName,      setBackupName]       = useState("");
  const [backupLoading,   setBackupLoading]    = useState(false);
  const [backupError,     setBackupError]      = useState("");
  const [backupSuccess,   setBackupSuccess]    = useState<number | null>(null);

  const handleAddBackupPasskey = async () => {
    if (!backupName.trim()) { setBackupError("Enter a name for this backup passkey first."); return; }
    setBackupLoading(true);
    setBackupError("");
    setBackupSuccess(null);
    const result = await addBackupPasskeyWallet(backupName.trim());
    setBackupLoading(false);
    if ("error" in result) { setBackupError(result.error); return; }
    setBackupSuccess(result.signerIndex);
    setBackupName("");
  };

  const handleClearData = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("vv-"));
    keys.forEach(k => localStorage.removeItem(k));
    setCleared(true);
    setTimeout(() => setCleared(false), 2500);
  };

  const activeRpc = useCustomRpc && customRpc ? customRpc : DEVNET_RPC;

  return (
    <section className="blur-in" style={{ padding: isMobile ? "16px" : "32px", maxWidth: 680, margin: "0 auto" }}>

      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontFamily: fontFamily.headline, fontSize: isMobile ? 28 : 36, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff", marginBottom: 8 }}>
          Settings
        </h2>
        <p style={{ color: colors.onSurfaceVariant, fontSize: 14 }}>
          App configuration and preferences. Changes apply to this browser session.
        </p>
      </div>

      {/* ── Network ── */}
      <Section title="Network">
        <Row icon="wifi" label="Network" value="Stellar Testnet" last={false}>
          <span style={{ fontSize: 9, fontWeight: 700, background: "#4ade8018", color: "#4ade80",
            padding: "3px 8px", borderRadius: 4, textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>
            Active
          </span>
        </Row>

        <Row icon="lock" label="Mainnet" value="Not available" last={false}>
          <span style={{ fontSize: 9, fontWeight: 700, background: "#64748b18", color: "#64748b",
            padding: "3px 8px", borderRadius: 4, textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>
            Coming Soon
          </span>
        </Row>

        <Row icon="dns" label="Use Custom RPC" last={false}>
          <Toggle on={useCustomRpc} onToggle={() => setUseCustomRpc(v => !v)} />
        </Row>

        {useCustomRpc && (
          <div style={{ padding: "0 20px 16px" }}>
            <input
              type="text"
              placeholder="https://your-rpc-endpoint.com"
              value={customRpc}
              onChange={e => setCustomRpc(e.target.value)}
              style={{
                width: "100%", background: colors.surfaceContainer,
                border: `1px solid ${customRpc ? colors.primary + "40" : colors.outlineVariant + "30"}`,
                borderRadius: 8, padding: "10px 14px",
                color: "#fff", fontSize: 12, outline: "none",
                fontFamily: "monospace",
              }}
            />
          </div>
        )}

        <Row icon="cable" label="Active Endpoint" last>
          <span style={{ fontSize: 11, fontFamily: "monospace", color: colors.primary,
            maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
            {activeRpc.replace("https://", "")}
          </span>
        </Row>
      </Section>

      {/* — Wallet (passkey recovery) — */}
      {walletType === "passkey" && (
        <Section title="Wallet">
          <div style={{ padding: "16px 20px" }}>
            <p style={{ fontSize: 12, color: colors.onSurfaceVariant, marginBottom: 14, lineHeight: 1.6 }}>
              Add a backup passkey (a second device, or one kept somewhere safe) so losing one device doesn't mean losing this wallet.
              You'll be asked to create the new passkey, then confirm with your current one.
            </p>

            {backupError && (
              <div style={{ background: "#ef444418", border: "1px solid #ef444440", borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", gap: 8 }}>
                <MaterialIcon name="error" size={15} style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 12, color: "#ef4444" }}>{backupError}</p>
              </div>
            )}
            {backupSuccess !== null && (
              <div style={{ background: "#22c55e18", border: "1px solid #22c55e40", borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", gap: 8 }}>
                <MaterialIcon name="check_circle" size={15} style={{ color: "#22c55e", flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 12, color: "#22c55e" }}>Backup passkey added (signer index {backupSuccess}).</p>
              </div>
            )}

            <input
              type="text"
              placeholder="e.g. my-laptop or backup-key"
              value={backupName}
              onChange={e => { setBackupName(e.target.value); setBackupError(""); }}
              onKeyDown={e => e.key === "Enter" && backupName.trim() && handleAddBackupPasskey()}
              autoComplete="off"
              spellCheck={false}
              style={{
                width: "100%", background: colors.surfaceContainer,
                border: `1px solid ${colors.outlineVariant}30`,
                borderRadius: 8, padding: "10px 14px",
                color: "#fff", fontSize: 13, outline: "none",
                marginBottom: 14, boxSizing: "border-box" as const,
              }}
            />

            <GradientButton onClick={handleAddBackupPasskey} disabled={!backupName.trim() || backupLoading} style={{ fontSize: 12 }}>
              {backupLoading ? "Adding…" : "Add Backup Passkey →"}
            </GradientButton>
          </div>
        </Section>
      )}

      {/* ── Display ── */}
      <Section title="Display">
        <Row icon="visibility_off" label="Hide Balances" value={hideBalances ? "On" : "Off"} last={false}>
          <Toggle on={hideBalances} onToggle={() => setHideBalances(v => !v)} />
        </Row>
        <Row icon="motion_photos_off" label="Reduce Animations" value={reduceMotion ? "On" : "Off"} last={false}>
          <Toggle on={reduceMotion} onToggle={() => setReduceMotion(v => !v)} />
        </Row>
        <Row icon="notifications" label="Transaction Notifications" value={notifications ? "On" : "Off"} last>
          <Toggle on={notifications} onToggle={() => setNotifications(v => !v)} />
        </Row>
      </Section>

      {/* ── About ── */}
      <Section title="About">
        <Row icon="info" label="App Version" value={APP_VERSION} last={false} />
        <Row icon="code" label="Contract ID" last={false}>
          <span style={{ fontSize: 10, fontFamily: "monospace", color: colors.primary,
            maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
            {vaultContractId ?? "Not connected"}
          </span>
        </Row>
        {[
          ...(vaultContractId ? [{ icon: "open_in_new", label: "View on Explorer", href: `https://stellar.expert/explorer/testnet/contract/${vaultContractId}` }] : []),
          { icon: "description",   label: "Ika Integration",   href: "https://docs.ika.xyz" },
          { icon: "science",       label: "Encrypt REFHE",     href: "https://docs.encrypt.xyz" },
          { icon: "sports_esports",label: "Colosseum Hackathon",href: "https://colosseum.org" },
        ].map(({ icon, label, href }, i, arr) => (
          <Row key={label} icon={icon} label={label} last={i === arr.length - 1}>
            <button
              type="button"
              onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
              style={{
                background: "transparent", border: "none",
                color: colors.onSurfaceVariant, cursor: "pointer", padding: 4,
              }}
            >
              <MaterialIcon name="chevron_right" size={16} style={{ color: "#64748b" }} />
            </button>
          </Row>
        ))}
      </Section>

      {/* ── Danger zone ── */}
      <Section title="Data">
        <div style={{ padding: "16px 20px" }}>
          <p style={{ fontSize: 12, color: colors.onSurfaceVariant, marginBottom: 14, lineHeight: 1.6 }}>
            Clears local deposit index counters stored in this browser.
            On-chain vault state is never affected.
          </p>
          <GradientButton
            onClick={handleClearData}
            style={{ background: cleared ? "#14532d" : "#7f1d1d", fontSize: 12 }}
          >
            {cleared ? "✓ Local data cleared" : "Clear Local Data"}
          </GradientButton>
        </div>
      </Section>

    </section>
  );
};
