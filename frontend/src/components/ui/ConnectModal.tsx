import React, { useState } from "react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon, GradientButton, GradientText } from "./index";
import { useWalletSession } from "../../context/WalletSession";
import { isFreighterAvailable } from "../../lib/stellar";
import { isPasskeySupported } from "../../lib/passkey";

interface Props {
  onClose?:    () => void;
  onConnected?:(address: string) => void;
  required?:   boolean;
}

type Mode = "choose" | "secret-key" | "passkey";

export const ConnectModal: React.FC<Props> = ({ onClose, onConnected, required }) => {
  const { connect, connectFreighter, registerPasskeyWallet, loginPasskeyWallet, storedPasskeyWallet } = useWalletSession();
  const [mode,     setMode]     = useState<Mode>("choose");
  const [sk,       setSk]       = useState("");
  const [userName, setUserName] = useState("");
  const [error,    setError]    = useState("");
  const [visible,  setVisible]  = useState(false);
  const [loading,  setLoading]  = useState(false);

  const freighterAvailable = isFreighterAvailable();
  const passkeySupported = isPasskeySupported();

  const handleFreighter = async () => {
    setLoading(true);
    setError("");
    const result = await connectFreighter();
    setLoading(false);
    if ("error" in result) { setError(result.error); return; }
    onConnected?.(result.address);
    onClose?.();
  };

  const handlePasskeyLogin = async () => {
    if (!storedPasskeyWallet) return;
    setLoading(true);
    setError("");
    const result = await loginPasskeyWallet(storedPasskeyWallet);
    setLoading(false);
    if ("error" in result) { setError(result.error); return; }
    onConnected?.(result.address);
    onClose?.();
  };

  const handlePasskeyRegister = async () => {
    if (!userName.trim()) { setError("Enter a display name first."); return; }
    setLoading(true);
    setError("");
    const result = await registerPasskeyWallet(userName.trim());
    setLoading(false);
    if ("error" in result) { setError(result.error); return; }
    onConnected?.(result.address);
    onClose?.();
  };

  const handleSecretKey = () => {
    setError("");
    const result = connect(sk);
    if ("error" in result) { setError(result.error); return; }
    onConnected?.(result.address);
    onClose?.();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: colors.surfaceContainerLow, borderRadius: 24, padding: 32, maxWidth: 400, width: "100%", border: `1px solid rgba(255,255,255,0.09)`, animation: "blurIn 0.25s ease both" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <GradientText style={{ fontSize: 20, fontWeight: 800, fontFamily: fontFamily.headline }}>
            {mode === "choose" ? "Connect Wallet" : mode === "passkey" ? "Create Passkey Wallet" : "Enter Secret Key"}
          </GradientText>
          {!required && onClose && (
            <button type="button" aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: colors.outline }}>
              <MaterialIcon name="close" size={22} />
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "#ef444418", border: "1px solid #ef444440", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 8 }}>
            <MaterialIcon name="error" size={15} style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 13, color: "#ef4444" }}>{error}</p>
          </div>
        )}

        {mode === "choose" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Freighter button */}
            <button type="button" onClick={handleFreighter} disabled={loading}
              style={{ width: "100%", padding: "16px", borderRadius: 14, border: `1.5px solid ${freighterAvailable ? colors.primaryContainer + "55" : "rgba(255,255,255,0.1)"}`, background: freighterAvailable ? `${colors.primaryContainer}18` : colors.surfaceContainerHigh, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, textAlign: "left" as const }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: `${colors.primary}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <MaterialIcon name="account_balance_wallet" size={22} style={{ color: colors.primary }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>
                  {loading ? "Connecting…" : "Freighter / Lobstr"}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: colors.outline }}>
                  {freighterAvailable ? "Browser wallet detected" : "Install from freighter.app"}
                </p>
              </div>
              {freighterAvailable
                ? <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 10, background: "#22c55e22", color: "#22c55e" }}>Available</span>
                : <MaterialIcon name="open_in_new" size={16} style={{ color: colors.outline }} />
              }
            </button>

            {/* Passkey option */}
            <button type="button" disabled={loading || !passkeySupported}
              onClick={() => storedPasskeyWallet ? handlePasskeyLogin() : setMode("passkey")}
              style={{ width: "100%", padding: "16px", borderRadius: 14, border: `1.5px solid ${passkeySupported ? colors.primaryContainer + "55" : "rgba(255,255,255,0.1)"}`, background: passkeySupported ? `${colors.primaryContainer}18` : colors.surfaceContainerHigh, cursor: passkeySupported ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 14, textAlign: "left" as const, opacity: passkeySupported ? 1 : 0.6 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: `${colors.primary}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <MaterialIcon name="fingerprint" size={22} style={{ color: colors.primary }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>
                  {loading ? "Connecting…" : storedPasskeyWallet ? "Sign in with Passkey" : "Create Passkey Wallet"}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: colors.outline }}>
                  {passkeySupported ? "Face ID, fingerprint, or Windows Hello — no seed phrase" : "Not supported in this browser"}
                </p>
              </div>
              <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 10, background: "#8b5cf622", color: "#8b5cf6" }}>New</span>
            </button>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
              <span style={{ fontSize: 12, color: colors.outline }}>or</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
            </div>

            {/* Secret key option */}
            <button type="button" onClick={() => setMode("secret-key")}
              style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left" as const }}>
              <MaterialIcon name="key" size={20} style={{ color: colors.outline }} />
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: colors.onSurface, fontFamily: fontFamily.headline }}>Secret Key</p>
                <p style={{ margin: 0, fontSize: 11, color: colors.outline }}>Enter S... key manually · dev / testing only</p>
              </div>
            </button>

            <p style={{ margin: "4px 0 0", fontSize: 11, color: `${colors.outline}88`, textAlign: "center" as const }}>
              Your key never leaves your device
            </p>
          </div>
        )}

        {mode === "secret-key" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <button type="button" onClick={() => { setMode("choose"); setError(""); setSk(""); }}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: colors.outline, padding: 0, fontSize: 13, fontFamily: fontFamily.body, marginBottom: 4 }}>
              <MaterialIcon name="arrow_back" size={16} /> Back
            </button>

            <div>
              <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
                Stellar Secret Key
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={visible ? "text" : "password"}
                  value={sk}
                  onChange={e => { setSk(e.target.value); setError(""); }}
                  placeholder="S..."
                  autoComplete="off"
                  spellCheck={false}
                  onKeyDown={e => e.key === "Enter" && sk.trim() && handleSecretKey()}
                  style={{ background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "13px 46px 13px 14px", color: colors.onSurface, fontSize: 14, outline: "none", fontFamily: "monospace", width: "100%", boxSizing: "border-box" as const }}
                />
                <button type="button" aria-label={visible ? "Hide key" : "Show key"} onClick={() => setVisible(v => !v)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: colors.outline, padding: 0, display: "flex" }}>
                  <MaterialIcon name={visible ? "visibility_off" : "visibility"} size={18} />
                </button>
              </div>
            </div>

            <div style={{ background: "#f59e0b12", border: "1px solid #f59e0b30", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 10 }}>
              <MaterialIcon name="warning" size={15} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12, color: colors.outline, lineHeight: 1.5 }}>
                Only use on devices you own. Use Freighter for production.
              </p>
            </div>

            <GradientButton onClick={handleSecretKey} disabled={!sk.trim() || sk.trim().length < 50} size="lg">
              Connect →
            </GradientButton>
          </div>
        )}

        {mode === "passkey" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <button type="button" onClick={() => { setMode("choose"); setError(""); setUserName(""); }}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: colors.outline, padding: 0, fontSize: 13, fontFamily: fontFamily.body, marginBottom: 4 }}>
              <MaterialIcon name="arrow_back" size={16} /> Back
            </button>

            <div>
              <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
                Display Name
              </label>
              <input
                type="text"
                value={userName}
                onChange={e => { setUserName(e.target.value); setError(""); }}
                placeholder="e.g. agent-7 or your email"
                autoComplete="off"
                spellCheck={false}
                onKeyDown={e => e.key === "Enter" && userName.trim() && handlePasskeyRegister()}
                style={{ background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "13px 14px", color: colors.onSurface, fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" as const }}
              />
            </div>

            <div style={{ background: `${colors.primaryContainer}12`, border: `1px solid ${colors.primaryContainer}30`, borderRadius: 10, padding: "10px 14px", display: "flex", gap: 10 }}>
              <MaterialIcon name="info" size={15} style={{ color: colors.primary, flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12, color: colors.outline, lineHeight: 1.5 }}>
                Your device will prompt for Face ID / fingerprint / Windows Hello. This deploys a new on-chain wallet bound to that passkey — no secret key to lose or leak.
              </p>
            </div>

            <GradientButton onClick={handlePasskeyRegister} disabled={!userName.trim() || loading} size="lg">
              {loading ? "Creating wallet…" : "Create Passkey →"}
            </GradientButton>
          </div>
        )}
      </div>
    </div>
  );
};
