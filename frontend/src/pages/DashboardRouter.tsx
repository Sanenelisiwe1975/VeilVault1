import React from "react";
import { useUserType } from "../hooks/useUserType";
import IndividualDashboard from "./dashboard/IndividualDashboard";
import StokvelDashboard    from "./dashboard/StokvelDashboard";
import BusinessDashboard from './dashboard/BusinessDashboard';
import { UserType } from '../context/UserTypeContext';


export default function DashboardRouter() {
    const UserType = useUserType();

    if (UserType === "stokvel") return <StokvelDashboard/>;
    if (UserType === "business") return <BusinessDashboard/>;

    return <IndividualDashboard/>
}