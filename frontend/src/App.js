import "@/App.css";
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import { Loading } from "@/components/common";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Patients from "@/pages/Patients";
import Patient360 from "@/pages/Patient360";
import OPD from "@/pages/OPD";
import IPD from "@/pages/IPD";
import Appointments from "@/pages/Appointments";
import Clinical from "@/pages/Clinical";
import Pharmacy from "@/pages/Pharmacy";
import Inventory from "@/pages/Inventory";
import Diagnostics from "@/pages/Diagnostics";
import Billing from "@/pages/Billing";
import Expenses from "@/pages/Expenses";
import Insurance from "@/pages/Insurance";
import Referrals from "@/pages/Referrals";
import Notifications from "@/pages/Notifications";
import Analytics from "@/pages/Analytics";
import Masters from "@/pages/Masters";
import UsersPage from "@/pages/Users";
import SettingsPage from "@/pages/Settings";
import Audit from "@/pages/Audit";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

const routes = [
  ["/", <Dashboard />], ["/patients", <Patients />], ["/patients/:id", <Patient360 />],
  ["/opd", <OPD />], ["/ipd", <IPD />], ["/appointments", <Appointments />],
  ["/clinical", <Clinical />], ["/pharmacy", <Pharmacy />], ["/inventory", <Inventory />],
  ["/diagnostics", <Diagnostics />], ["/billing", <Billing />], ["/expenses", <Expenses />],
  ["/insurance", <Insurance />], ["/referrals", <Referrals />], ["/notifications", <Notifications />],
  ["/analytics", <Analytics />], ["/masters", <Masters />], ["/users", <UsersPage />],
  ["/settings", <SettingsPage />], ["/audit", <Audit />],
];

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          {routes.map(([path, el]) => (
            <Route key={path} path={path} element={<Protected>{el}</Protected>} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;
