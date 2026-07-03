import React from "react";
import { useUserType } from "../hooks/useUserType.ts";
import IndividualDashboard from "./dashboard/IndividualDashboard";
import StokvelDashboard    from "./dashboard/StokvelDashboard";
import BusinessDashboard from './dashboard/BusinessDashboard';
import { UserType } from '../context/UserTypeContext';
import type { NavItem } from "../types";


export default function DashboardRouter({ onNavigate }: { onNavigate?: (nav: NavItem) => void }) {
    const UserType = useUserType();

    if (UserType === "stokvel") return <StokvelDashboard/>;
    if (UserType === "business") return <BusinessDashboard/>;

    return <IndividualDashboard onNavigate={onNavigate}/>
}