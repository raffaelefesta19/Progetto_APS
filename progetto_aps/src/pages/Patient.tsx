import { useMemo, useState } from "react";
import RoleLayout from "../components/layout/RoleLayout";
import { HOSPITALS, useReports } from "../store/ReportsContext";
import type { Status, Report } from "../store/ReportsContext";
import { useAuth } from "../auth/AuthContext";

const API_BASE = "/api";

export default function Patient() {
    const { reports, refresh, error: reportsError } = useReports();
    const { user } = useAuth();

    const currentPatient = user?.uid ?? "";

    const mine = useMemo(() => reports.filter((r) => r.patientRef === currentPatient), [reports, currentPatient]);

    const [query, setQuery] = useState("");
    const [labFilter, setLabFilter] = useState<"ALL" | string>("ALL");
    const [showAll, setShowAll] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);

    const labOptions = useMemo(() => Array.from(new Set(mine.map((r) => r.labId))).sort(), [mine]);

    const sorted = useMemo(() => [...mine].sort((a, b) => +new Date(b.issuedAt) - +new Date(a.issuedAt)), [mine]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return sorted.filter((r) => {
            const byLab = labFilter === "ALL" || r.labId === labFilter;
            const byQ = q === "" || r.reportId.toLowerCase().includes(q) || r.labId.toLowerCase().includes(q);
            return byLab && byQ;
        });
    }, [sorted, labFilter, query]);

    const collapsed = filtered.length > 3 && !showAll;

    return (
        <RoleLayout title="I miei referti">
            <section className="panel">
                <h2 className="panel-title">Referti</h2>

                <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M12.9 14.32a7 7 0 1 1 1.414-1.414l3.387 3.387a1 1 0 0 1-1.414 1.414l-3.387-3.387ZM8 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" clipRule="evenodd" />
                    </svg>
                    <input className="input-light pl-9" placeholder="Cerca per reportId o laboratorio…" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>

                {reportsError && <div className="text-sm text-red-600 mt-2">{reportsError}</div>}

                <div className="flex items-center gap-2 mt-3">
                    <div className="text-sm text-slate-500">{filtered.length} risultati</div>
                    <div className="flex-1" />
                    <label className="text-sm text-slate-600">Laboratorio:</label>
                    <select className="border rounded-lg px-2 py-1 text-sm" value={labFilter} onChange={(e) => setLabFilter(e.target.value)}>
                        <option value="ALL">Tutti</option>
                        {labOptions.map((l) => (<option key={l} value={l}>{l}</option>))}
                    </select>
                </div>

                <div className={`mt-4 grid gap-2 ${collapsed ? "collapsed-list" : ""}`}>
                    {filtered.map((r) => (
                        <ReportRow
                            key={r.reportId}
                            r={{ reportId: r.reportId, labId: r.labId, issuedAt: r.issuedAt, status: r.status as Status }}
                            onOpen={() => setOpenId(r.reportId)}
                        />
                    ))}
                </div>

                {filtered.length > 3 && (
                    <div className="flex justify-center mt-3">
                        <button className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg border text-sm hover:bg-slate-50" onClick={() => setShowAll((s) => !s)}>
                            {showAll ? "Mostra meno" : "Mostra tutti"}
                        </button>
                    </div>
                )}
            </section>

            <ReportModal
                report={filtered.find((r) => r.reportId === openId) || null}
                onClose={() => setOpenId(null)}
                onToggleAccess={async (reportId, dest, allow) => {
                    if (!allow) {
                        try {
                            const resp = await fetch(`${API_BASE}/patient/unshare`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ reportId, patientId: currentPatient, hospitalId: dest }),
                            });
                            if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
                            await refresh();
                        } catch (e) {
                            alert(e instanceof Error ? e.message : "Revoca fallita");
                        }
                        return;
                    }
                    try {
                        // bootstrap chiavi per sicurezza
                        await fetch(`${API_BASE}/keys/init`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ actors: [currentPatient, dest] }),
                        });

                        const resp = await fetch(`${API_BASE}/patient/share`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ reportId, patientId: currentPatient, hospitalId: dest }),
                        });
                        if (!resp.ok) throw new Error(await resp.text() || `HTTP ${resp.status}`);
                        await refresh();
                    } catch (e) {
                        alert(e instanceof Error ? e.message : "Condivisione fallita");
                    }
                }}
            />
        </RoleLayout>
    );
}

function ReportRow({
                       r,
                       onOpen,
                   }: {
    r: { reportId: string; labId: string; issuedAt: string; status: Status };
    onOpen: () => void;
}) {
    const badge = r.status === "VALID" ? "badge-ok" : r.status === "UPDATED" ? "badge-warn" : "badge-err";
    const dt = new Date(r.issuedAt);
    const human = `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    return (
        <button type="button" onClick={onOpen} className="text-left flex items-center justify-between p-3 rounded-lg border bg-white hover:shadow-sm hover:border-slate-300 transition">
            <div>
                <div className="font-medium">{r.reportId}</div>
                <div className="muted">Laboratorio {r.labId} • Emesso {human}</div>
            </div>
            <span className={badge}>{r.status}</span>
        </button>
    );
}

function ReportModal({
                         report,
                         onClose,
                         onToggleAccess,
                     }: {
    report: Report | null;
    onClose: () => void;
    onToggleAccess: (reportId: string, dest: string, allow: boolean) => void | Promise<void>;
}) {
    const [dest, setDest] = useState<string>(HOSPITALS[0]);

    if (!report) return null;

    const dt = new Date(report.issuedAt);
    const human = `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    const already = report.access.includes(dest);

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="absolute inset-0 grid place-items-center p-4">
                <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold">Dettaglio referto</h3>
                        <button className="px-3 py-1.5 rounded-lg border text-sm hover:bg-slate-50" onClick={onClose}>Chiudi</button>
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

                    <div className="mt-4 border-top pt-4">
                        <div className="mb-2 text-sm font-medium">Condividi con:</div>
                        <div className="flex items-center gap-2">
                            <select className="border rounded-lg px-2 py-1 text-sm" value={dest} onChange={(e) => setDest(e.target.value)}>
                                {HOSPITALS.map((h) => (<option key={h} value={h}>{h}</option>))}
                            </select>

                            {!already ? (
                                <button className="px-3 py-1.5 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700" onClick={() => onToggleAccess(report.reportId, dest, true)}>
                                    Concedi accesso
                                </button>
                            ) : (
                                <button className="px-3 py-1.5 rounded-lg text-sm border hover:bg-slate-50" onClick={() => onToggleAccess(report.reportId, dest, false)}>
                                    Revoca accesso
                                </button>
                            )}
                        </div>

                        <div className="mt-2 text-xs text-slate-500">
                            Autorizzati: {report.access.length ? report.access.join(", ") : "—"}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
