import React, { useState } from "react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon } from "./MaterialIcon";

interface CollapsibleSectionProps {
  title:        string;
  subtitle?:    string;
  icon?:        string;
  defaultOpen?: boolean;
  children:     React.ReactNode;
}

/** Collapsed-by-default container for technical/developer-facing content —
 *  keeps it reachable without putting it in front of every user by default. */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title, subtitle, icon = "tune", defaultOpen = false, children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", padding: "16px 20px", background: "transparent", border: "none",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left" as const,
        }}
      >
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${colors.outline}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <MaterialIcon name={icon} size={16} style={{ color: colors.outline }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>{title}</p>
          {subtitle && <p style={{ margin: "2px 0 0", fontSize: 11, color: colors.outline }}>{subtitle}</p>}
        </div>
        <MaterialIcon name={open ? "expand_less" : "expand_more"} size={18} style={{ color: colors.outline, flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {children}
        </div>
      )}
    </div>
  );
};
