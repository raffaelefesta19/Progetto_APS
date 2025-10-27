import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

type BadgeRole = "PAT" | "HOSP" | "LAB" | "DOC";

function isBadgeRole(x: unknown): x is BadgeRole {
    return x === "PAT" || x === "HOSP" || x === "LAB" || x === "DOC";
}

type Props = { children: React.ReactNode; title?: string };

export default function RoleLayout({ children, title }: Props) {
    const { user, logout } = useAuth();
    const nav = useNavigate();

    const roleForBadge: BadgeRole = isBadgeRole(user?.role) ? user!.role : "PAT";

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            <header className="sticky top-0 z-20 h-14 border-b bg-white/70 backdrop-blur">
                <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                        <RoleBadge role={roleForBadge} />
                        <div className="text-sm text-slate-600">
                            {user ? (
                                <>
                                    <span className="font-medium text-slate-900">{user.displayName}</span>{" "}
                                    <span className="text-slate-400">·</span>{" "}
                                    <span className="uppercase tracking-wide">{user.role}</span>{" "}
                                    <span className="text-slate-400">·</span>{" "}
                                    <span className="text-slate-500">{user.uid}</span>
                                </>
                            ) : (
                                <span className="italic">Utente non autenticato</span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {title ? <div className="text-sm text-slate-500">{title}</div> : null}
                        <button
                            className="btn btn-outline"
                            onClick={() => {
                                logout();
                                nav("/login");
                            }}
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-6xl p-6">{children}</main>
        </div>
    );
}

function RoleBadge({ role }: { role: BadgeRole }) {
    const styles =
        role === "PAT"
            ? "bg-emerald-100 text-emerald-700"
            : role === "LAB"
                ? "bg-amber-100 text-amber-700"
                : role === "HOSP"
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-cyan-100 text-cyan-700"; // DOC

    const label =
        role === "PAT"
            ? "Paziente"
            : role === "LAB"
                ? "Laboratorio"
                : role === "HOSP"
                    ? "Ospedale"
                    : "Medico";

    return (
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${styles}`}>
      {label}
    </span>
    );
}
