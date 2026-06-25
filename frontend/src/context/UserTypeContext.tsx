

export type UserType =
  | "individual"
  | "stokvel"
  | "business";

export interface UserTypeContextValue {
  userType: UserType | null;
  setUserType: (type: UserType) => void;
}