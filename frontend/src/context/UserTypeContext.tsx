

export type UserType =
  | "individual"
  | "stokvel"
  | "business";

export interface UserTypeContextValue {
  userType: UserType | null;
  setUserType: (type: UserType) => void;
}

/** Display metadata per user type — Material icon name + accent color, matching the same per-type colors used on UserTypeSelectionPage's cards. */
export const USER_TYPE_META: Record<UserType, { icon: string; label: string; color: string }> = {
  individual: { icon: "person", label: "Individual", color: "#7C3AED" },
  stokvel:    { icon: "groups", label: "Stokvel",     color: "#0EA5E9" },
  business:   { icon: "business", label: "Business",  color: "#10B981" },
};