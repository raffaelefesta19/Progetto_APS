/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Role } from "./utils";
import { isRecord, asString, asBool } from "./utils";
import type { AuthUser } from "./types";

type AuthContextValue = {
    user: AuthUser | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<AuthUser>;
    // firma a 5 argomenti
    register: (role: Role, username: string, name: string, email: string, password: string) => Promise<AuthUser>;
    logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = "auth:user";
const API_BASE = "/api";

function normalizeUser(raw: unknown): AuthUser {
    const r = isRecord(raw) ? raw : {};
    const uid = asString(r.uid) || asString(r.id) || asString(r.username) || "USER";
    const roleRaw = asString(r.role) as Role;
    const role: Role = roleRaw === "LAB" || roleRaw === "HOSP" ? roleRaw : "PAT";
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
        let resp: Response;
        try {
            resp = await fetch(`${API_BASE}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
        } catch (e) {
            throw new Error(e instanceof Error ? e.message : "Backend non raggiungibile");
        }

        const payload: unknown = await resp.json().catch(() => ({}));
        const rec = isRecord(payload) ? payload : {};

        if (!resp.ok || rec.ok !== true) {
            const msg = asString(rec.error, `HTTP ${resp.status}`);
            throw new Error(msg || "Credenziali errate");
        }

        const u = normalizeUser(rec.user);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
        setUser(u);
        return u;
    }

    async function register(role: Role, username: string, name: string, email: string, password: string): Promise<AuthUser> {
        let resp: Response;
        try {
            resp = await fetch(`${API_BASE}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role, username, name, email, password }),
            });
        } catch (e) {
            throw new Error(e instanceof Error ? e.message : "Backend non raggiungibile");
        }

        const payload: unknown = await resp.json().catch(() => ({}));
        const rec = isRecord(payload) ? payload : {};
        if (!resp.ok || rec.ok !== true) {
            throw new Error(asString(rec.error, "Registrazione fallita"));
        }

        const u = normalizeUser(rec.user);
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
