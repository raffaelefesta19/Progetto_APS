import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import "./index.css";
import { AuthProvider } from "./auth/AuthContext";
import { ReportsProvider } from "./store/ReportsContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <ReportsProvider>
                    <App />
                </ReportsProvider>
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>
);
