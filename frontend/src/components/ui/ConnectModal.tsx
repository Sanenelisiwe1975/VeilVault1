import React, { useState } from "react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon, GradientButton, GradientText } from "./index";
import { useWalletSession } from "../../context/WalletSession";

interface ConnectModalProps {
  onClose?:    () => void;
  onConnected?:(address: string) => void;
  /** If true, user cannot dismiss without connecting */
  required?:   boolean;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({ onClose, onConnected, required }) => {
  const { connect } = useWalletSession();
  const [sk,     setSk]     = useState("");
  const [error,  setError]  = useState("");
  const [visible, setVisible] = useState(false);

  const handleConnect = () => {
    setError("");
    const result = connect(sk);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onConnected?.(result.address);
    onClose?.();
  };

  const INPUT: React.CSSProperties = {
    background:   colors.surfaceContainerHigh,
    border:       `1px solid ${error ? "#ef444460" : "rgba(255,255,255,0.1)"}`,
    borderRadius: 10, padding: "13px 46px 13px 14px",
    color:        colors.onSurface, fontSize: 14,
    outline:      "none", fontFamily: "monospace",
    width:        "100%", boxSizing: "border-box",
    letterSpacing: "0.04em",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: colors.surfaceContainerLow, borderRadius: 24, padding: 32, maxWidth: 420, width: "100%", border: `1px solid rgba(255,255,255,0.09)`, animation: "blurIn 0.25s ease both" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${colors.primary}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MaterialIcon name="key" size={22} style={{ color: colors.primary }} />
            </div>
            <GradientText style={{ fontSize: 18, fontWeight: 800, fontFamily: fontFamily.headline }}>
              Connect Wallet
            </GradientText>
          </div>
          {!required && onClose && (
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: colors.outline }}>
              <MaterialIcon name="close" size={22} />
            </button>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: colors.outline, lineHeight: 1.6 }}>
            Enter your Stellar secret key to sign transactions. It's held only in memory — never stored anywhere.
          </p>

          {/* Key input */}
          <div>
            <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
              Stellar Secret Key
            </label>
            <div style={{ position: "relative" }}>
              <input
                style={INPUT}
                type={visible ? "text" : "password"}
                value={sk}
                onChange={e => { setSk(e.target.value); setError(""); }}
                placeholder="S..."
                autoComplete="off"
                spellCheck={false}
                onKeyDown={e => e.key === "Enter" && sk.trim() && handleConnect()}
              />
              <button
                type="button"
                onClick={() => setVisible(v => !v)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: colors.outline, padding: 0, display: "flex" }}>
                <MaterialIcon name={visible ? "visibility_off" : "visibility"} size={18} />
              </button>
            </div>
            {error && (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#ef4444", display: "flex", alignItems: "center", gap: 5 }}>
                <MaterialIcon name="error" size={13} /> {error}
              </p>
            )}
          </div>

          {/* Security note */}
          <div style={{ background: "#f59e0b12", border: "1px solid #f59e0b30", borderRadius: 10, padding: "11px 14px", display: "flex", gap: 10 }}>
            <MaterialIcon name="warning" size={15} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, color: colors.outline, lineHeight: 1.6 }}>
              Only connect on devices you trust. Close the tab or click "Disconnect" to clear your key from memory.
            </p>
          </div>

          <GradientButton
            onClick={handleConnect}
            disabled={!sk.trim() || sk.trim().length < 50}
            size="lg">
            Connect →
          </GradientButton>
        </div>
      </div>
    </div>
  );
};
