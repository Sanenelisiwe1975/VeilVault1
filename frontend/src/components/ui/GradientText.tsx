import React from "react";
import { colors } from "../../constants/theme";
import type { GradientTextProps } from "../../types";

export const GradientText: React.FC<GradientTextProps> = ({
  children,
  className = "",
  style,
}) => (
  <span
    className={className}
    style={{
      background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryContainer} 100%)`,
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      ...style,
    }}
  >
    {children}
  </span>
);
