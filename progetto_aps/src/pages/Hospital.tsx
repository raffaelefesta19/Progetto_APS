import { useMemo, useState } from "react";
import RoleLayout from "../components/layout/RoleLayout";
import { useReports } from "../store/ReportsContext";
import type { Status } from "../store/ReportsContext";
import { useAuth } from "../auth/AuthContext";
import ExpandableList from "../components/ui/ExpandableList";

const API_BASE = "/api";

async function parseJsonSafe(resp: Response): Promise<{ ok: boolean; json?: Record<string, unknown>; text?: string }> {
    const raw = await resp.text();
    if (!raw) return { ok: resp.ok, text: "" };
    try {
        const obj = JSON.parse(raw) as unknown;
        if (typeof obj === "object" && obj !== null) return { ok: resp.ok, json: obj as Record<string, unknown> };
        return { ok: resp.ok, text: raw };
    } catch {
        return { ok: resp.ok, text: raw };
    }
}

export default function Hospital() {
    const { reports, error: reportsError, refresh, loading } = useReports();
    const { user } = useAuth();
    const HOSP_ID = user?.uid ?? "HOSP-01";

    const [query, setQuery] = useState("");
    const [labFilter, setLabFilter] = useState<"ALL" | string>("ALL");
    const [statusFilter, setStatusFilter] = useState<"ALL" | Status>("ALL");
    const [openId, setOpenId] = useState<string | null>(null);

    // mostro solo referti correnti per i quali ho accesso
    const allowedCurrent = useMemo(() => {
        // dedup per currentId
        const map = new Map<string, typeof reports[number]>();
        for (const r of reports) {
            if (!r.access.includes(HOSP_ID)) continue;  // access calcolato sul current
            const key = r.currentId;
            const prev = map.get(key);
            if (!prev || +new Date(r.issuedAt) > +new Date(prev.issuedAt)) {
                map.set(key, r);
            }
        }
        return Array.from(map.values());
    }, [reports, HOSP_ID]);

    const labs = useMemo(() => Array.from(new Set(allowedCurrent.map((r) => r.labId))).sort(), [allowedCurrent]);
    const sorted = useMemo(() => [...allowedCurrent].sort((a, b) => +new Date(b.issuedAt) - +new Date(a.issuedAt)), [allowedCurrent]);
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return sorted.filter((r) => {
            const byQ = q === "" || r.currentId.toLowerCase().includes(q) || r.labId.toLowerCase().includes(q) || r.patientRef.toLowerCase().includes(q);
            const byLab = labFilter === "ALL" || r.labId === labFilter;
            const byStatus = statusFilter === "ALL" || r.status === statusFilter || (r.status === "UPDATED" && statusFilter === "UPDATED");
            return byQ && byLab && byStatus;
        });
    }, [sorted, query, labFilter, statusFilter]);

    return (
        <RoleLayout title="Acquisizione & validazione">
            <section className="panel">
                <h2 className="panel-title">Referti disponibili</h2>

                <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M12.9 14.32a7 7 0 1 1 1.414-1.414l3.387 3.387a1 1 0 0 1-1.414 1.414l-3.387-3.387ZM8 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" clipRule="evenodd" />
                    </svg>
                    <input className="input-light pl-9" placeholder="Cerca per reportId, laboratorio o paziente…" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                {reportsError && <div className="text-sm text-red-600 mt-2">{reportsError}</div>}

                <div className="grid md:grid-cols-2 gap-3 mt-3">
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-600">Laboratorio:</label>
                        <select className="border rounded-lg px-2 py-1 text-sm" value={labFilter} onChange={(e) => setLabFilter(e.target.value)}>
                            <option value="ALL">Tutti</option>
                            {labs.map((l) => (
                                <option key={l} value={l}>{l}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-600">Stato:</label>
                        <select className="border rounded-lg px-2 py-1 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as Status | "ALL")}>
                            <option value="ALL">Tutti</option>
                            <option value="VALID">Valid</option>
                            <option value="UPDATED">Updated</option>
                            <option value="REVOKED">Revoked</option>
                        </select>
                    </div>
                    <div className="flex items-center justify-end">
                        <button className="px-3 py-1.5 rounded-lg border text-sm hover:bg-slate-50" onClick={() => void refresh()} disabled={loading}>
                            {loading ? "Aggiorno..." : "Aggiorna"}
                        </button>
                    </div>
                </div>

                <div className="text-sm text-slate-500 mt-3">{filtered.length} risultati</div>

                <div className="mt-3">
                    <ExpandableList
                        items={filtered}
                        initiallyVisible={3}
                        renderItem={(r) => (
                            <Row
                                key={r.currentId}
                                r={{ reportId: r.currentId, labId: r.labId, patientRef: r.patientRef, issuedAt: r.issuedAt, status: r.status }}
                                onOpen={() => setOpenId(r.currentId)}
                            />
                        )}
                    />
                </div>
            </section>

            <ReportModal
                report={filtered.find((r) => r.currentId === openId) ? {
                    reportId: filtered.find((r) => r.currentId === openId)!.currentId,
                    labId: filtered.find((r) => r.currentId === openId)!.labId,
                    issuedAt: filtered.find((r) => r.currentId === openId)!.issuedAt,
                    status: filtered.find((r) => r.currentId === openId)!.status,
                } : null}
                onClose={() => setOpenId(null)}
                onOpenReport={async (reportId, labId) => {
                    await fetch(`${API_BASE}/keys/init`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ actors: [HOSP_ID, labId] }),
                    }).catch(() => {});
                    let resp: Response;
                    try {
                        resp = await fetch(`${API_BASE}/hosp/open`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ reportId, hospitalId: HOSP_ID, labId }),
                        });
                    } catch {
                        throw new Error("Backend non raggiungibile (Flask non avviato?).");
                    }
                    const parsed = await parseJsonSafe(resp);
                    if (!parsed.ok) {
                        const msg = normalizedOpenError(parsed.json?.error, resp.status);
                        throw new Error(msg);
                    }
                    const okFlag = parsed.json?.ok;
                    const contentB64 = parsed.json?.contentB64;
                    if (okFlag === true && typeof contentB64 === "string") {
                        try {
                            return atob(contentB64);
                        } catch {
                            throw new Error("Contenuto non valido (base64).");
                        }
                    }
                    throw new Error("Risposta backend inattesa/vuota.");
                }}
            />
        </RoleLayout>
    );
}

function normalizedOpenError(raw: unknown, status: number): string {
    const s = typeof raw === "string" ? raw : "";
    if (status === 409 && s.includes("report state REVOKED")) {
        return "Referto revocato dal Laboratorio. Non è più utilizzabile ai fini clinici.";
    }
    if (status === 403 && s.includes("access revoked by patient")) {
        return "Accesso revocato dal paziente per questo referto.";
    }
    if (s.includes("no grant for hospital")) {
        return "Accesso non autorizzato: il paziente non ha concesso l’accesso a questa struttura oppure ha ricevuto una nuova versione che non include questa struttura.";
    }
    if (s.includes("invalid lab signature")) {
        return "Firma del laboratorio non valida. Rifiutare il referto e contattare il LAB.";
    }
    if (s.includes("decrypt failed")) {
        return "Impossibile decifrare: chiave non disponibile per questa struttura.";
    }
    return s || `Errore (${status}).`;
}

function Row({
                 r,
                 onOpen,
             }: {
    r: { reportId: string; labId: string; patientRef: string; issuedAt: string; status: Status };
    onOpen: () => void;
}) {
    const stateBadge = r.status === "VALID" ? "badge-ok" : r.status === "UPDATED" ? "badge-warn" : "badge-err";
    const when = new Date(r.issuedAt).toLocaleString();
    const canOpen = r.status !== "REVOKED";
    return (
        <div className="flex items-center justify-between p-3 rounded-lg border bg-white">
            <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{r.reportId}</div>
                <div className="muted truncate">
                    Paziente {r.patientRef} · {when} · {r.labId}
                </div>
                {r.status === "UPDATED" && (
                    <div className="text-xs text-amber-600 mt-0.5">Versione aggiornata disponibile (aprirai sempre la versione corrente).</div>
                )}
                {r.status === "REVOKED" && (
                    <div className="text-xs text-red-600 mt-0.5">Referto revocato dal Laboratorio.</div>
                )}
            </div>
            <div className="ml-3 flex items-center gap-2">
                <span className={stateBadge}>{r.status}</span>
                <button
                    className={`inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-sm ${
                        canOpen ? "border hover:bg-slate-50" : "border bg-slate-100 text-slate-400 cursor-not-allowed"
                    }`}
                    disabled={!canOpen}
                    onClick={onOpen}
                    title={canOpen ? "Apri referto" : "Referto revocato"}
                >
                    Apri
                </button>
            </div>
        </div>
    );
}

function ReportModal({
                         report,
                         onClose,
                         onOpenReport,
                     }: {
    report: { reportId: string; labId: string; issuedAt: string; status: Status } | null;
    onClose: () => void;
    onOpenReport: (reportId: string, labId: string) => Promise<string>;
}) {
    const [loading, setLoading] = useState(false);
    const [plain, setPlain] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    if (!report) return null;
    const dt = new Date(report.issuedAt);
    const human = `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    const openNow = async () => {
        setErr(null);
        setLoading(true);
        setPlain(null);
        try {
            const text = await onOpenReport(report.reportId, report.labId);
            setPlain(text);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Errore imprevisto");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="absolute inset-0 grid place-items-center p-4">
                <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold">Referto</h3>
                        <button className="px-3 py-1.5 rounded-lg border text-sm hover:bg-slate-50" onClick={onClose}>
                            Chiudi
                        </button>
                    </div>
                    <div className="space-y-1 text-sm">
                        <div><span className="text-slate-500">Report ID: </span>{report.reportId}</div>
                        <div><span className="text-slate-500">Laboratorio: </span>{report.labId}</div>
                        <div><span className="text-slate-500">Emesso: </span>{human}</div>
                        <div className="pt-2">
                            <span className="text-slate-500">Stato: </span>
                            <span className={report.status === "VALID" ? "badge-ok" : report.status === "UPDATED" ? "badge-warn" : "badge-err"}>{report.status}</span>
                        </div>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                        <button className="px-3 py-1.5 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700" onClick={openNow} disabled={loading || report.status === "REVOKED"}>
                            {loading ? "Apro..." : "Apri (verifica e decifra)"}
                        </button>
                        {err && <span className="text-sm text-red-600">{err}</span>}
                    </div>
                    {plain && <div className="mt-3 rounded-lg bg-slate-50 border p-3 text-sm whitespace-pre-wrap">{plain}</div>}
                </div>
            </div>
        </div>
    );
}
