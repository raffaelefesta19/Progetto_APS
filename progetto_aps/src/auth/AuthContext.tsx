/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Role } from "./utils";
import { isRecord, asString, asBool } from "./utils";
import type { AuthUser } from "./types";
import { api } from "../lib/api";

type AuthContextValue = {
    user: AuthUser | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<AuthUser>;
    register: (role: Role, username: string, name: string, email: string, password: string) => Promise<AuthUser>;
    logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const STORAGE_KEY = "auth:user";

function normalizeUser(raw: unknown): AuthUser {
    const r = isRecord(raw) ? raw : {};
    const uid = asString(r.uid) || asString(r.id) || asString(r.username) || "USER";
    const roleRaw = asString(r.role).toUpperCase() as Role;
    const role: Role = roleRaw === "LAB" || roleRaw === "HOSP" || roleRaw === "DOC" ? roleRaw : "PAT";
    const displayName = asString(r.displayName) || asString(r.name) || uid;
    const hasKeys = asBool(r.hasKeys, false);
    return { uid, role, displayName, hasKeys };
}

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) setUser(JSON.parse(raw) as AuthUser);
        } finally {
            setLoading(false);
        }
    }, []);

    async function login(username: string, password: string): Promise<AuthUser> {
        const payload = await api.post("/auth/login", { username, password });
        if (payload.ok !== true) throw new Error(payload.error || "Credenziali errate");
        const u = normalizeUser(payload.user);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
        setUser(u);
        return u;
    }

    async function register(role: Role, username: string, name: string, email: string, password: string): Promise<AuthUser> {
        const payload = await api.post("/auth/register", { role, username, name, email, password });
        if (payload.ok !== true) throw new Error(payload.error || "Registrazione fallita");
        const u = normalizeUser(payload.user);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
        setUser(u);
        return u;
    }

    function logout(): void {
        localStorage.removeItem(STORAGE_KEY);
        setUser(null);
    }

    const value = useMemo<AuthContextValue>(() => ({ user, loading, login, register, logout }), [user, loading]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
    return ctx;
}
