export const useUserType = (): "individual" | "stokvel" | "business" | null => {
  return localStorage.getItem("userType") as "individual" | "stokvel" | "business" | null;
};
