// src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import PublicShell from "./components/layout/PublicShell";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Patient from "./pages/Patient";
import Hospital from "./pages/Hospital";
import Lab from "./pages/Lab";
import Ledger from "./pages/Ledger";
import Metrics from "./pages/Metrics";

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route element={<PublicShell />}>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
            </Route>
            {/* dashboard */}
            <Route path="/patient" element={<Patient />} />
            <Route path="/hospital" element={<Hospital />} />
            <Route path="/lab" element={<Lab />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/metrics" element={<Metrics />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
    );
}
