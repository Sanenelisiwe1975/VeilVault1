import { useState, useCallback } from "react";

interface UseHoverReturn {
  hovered:     boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/** Lightweight hover-state helper used on interactive cards. */
export function useHover(): UseHoverReturn {
  const [hovered, setHovered] = useState(false);
  const onMouseEnter = useCallback(() => setHovered(true),  []);
  const onMouseLeave = useCallback(() => setHovered(false), []);
  return { hovered, onMouseEnter, onMouseLeave };
}
