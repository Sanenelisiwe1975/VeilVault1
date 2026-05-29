import React from "react";
import {colors, fontFamily } from "../../constants/theme";

interface GradientButtonProps{
    children: React.ReactNode;
    onClick?: () => void;
    fullWidth?: boolean;
    size?: "sm" | "md" | "lg";
    style?: React.CSSProperties;
    disabled?: boolean;
}

const SIZE_MAP = {
    sm: { padding: "6px 14px", fontSize: 12 },
    md: { padding: "11px 0",   fontSize: 13 },
    lg: { padding: "14px 0",   fontSize: 15 },
};


export const GradientButton: React.FC<GradientButtonProps> = ({
    children,
    onClick,
    fullWidth = false,
    size = "md",
    style,
    disabled = false,
}) =>{
    const { padding, fontSize } = SIZE_MAP[size];
    return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width:       fullWidth ? "100%" : undefined,
        padding,
        fontSize,
        fontWeight:  700,
        fontFamily:  fontFamily.headline,
        background:  `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryContainer} 100%)`,
        color:       colors.onPrimary,
        border:      "none",
        borderRadius: 6,
        cursor:      disabled ? "not-allowed" : "pointer",
        opacity:     disabled ? 0.5 : 1,
        transition:  "opacity 0.2s",
        ...style,
      }}
    >
      {children}
    </button>
  );
};
