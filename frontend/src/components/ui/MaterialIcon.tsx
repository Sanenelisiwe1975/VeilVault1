import React from "react";
import type { MaterialIconProps } from "../../types";


export const MaterialIcon: React.FC<MaterialIconProps> = ({
  name,
  className = "",
  filled = false,
  size = 24,
  style,
}) => (
  <span
    className={`material-symbols-outlined ${className}`}
    style={{
      fontSize: size,
      fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
      ...style,
    }}
  >
    {name}
  </span>
);