import { useEffect, useState } from "react";
import RoleLayout from "../components/layout/RoleLayout";

const API_BASE = "/api";

type LedgerRow = {
    reportId: string;
    status: "UNKNOWN" | "VALID" | "UPDATED" | "REVOKED";
    currentReportId: string;
    grants: { from: string; to: string; ts: number }[];
};

export default function Ledger() {
    const [items, setItems] = useState<LedgerRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setErr(null);
        try {
            const resp = await fetch(`${API_BASE}/debug/ledgerview`);
            const data = await resp.json();
            if (!resp.ok || data.ok !== true || !Array.isArray(data.items)) throw new Error(typeof data.error === "string" ? data.error : `HTTP ${resp.status}`);
            setItems(data.items as LedgerRow[]);
        } catch (e) {
            setItems([]);
            setErr(e instanceof Error ? e.message : "Errore caricamento ledger");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    return (
        <RoleLayout title="Ledger (snapshot)">
            <section className="panel">
                <div className="flex items-center mb-3">
                    <h2 className="panel-title m-0 flex-1">Ledger view</h2>
                    <button className="px-3 py-1.5 rounded-lg border text-sm hover:bg-slate-50" onClick={() => { void load(); }} disabled={loading}>
                        {loading ? "Aggiorno..." : "Aggiorna"}
                    </button>
                </div>
                {err && <div className="text-sm text-red-600 mb-2">{err}</div>}

                {items.length === 0 ? (
                    <div className="muted">Nessun evento ancora.</div>
                ) : (
                    <div className="mt-2 overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                            <tr className="text-left text-slate-600">
                                <th className="py-2 pr-4">Report ID (origin)</th>
                                <th className="py-2 pr-4">Status</th>
                                <th className="py-2 pr-4">Current ID</th>
                                <th className="py-2 pr-4">Grants</th>
                            </tr>
                            </thead>
                            <tbody>
                            {items.map((x) => (
                                <tr key={`${x.reportId}-${x.currentReportId}`} className="border-t align-top">
                                    <td className="py-2 pr-4 font-medium">{x.reportId}</td>
                                    <td className="py-2 pr-4">
                      <span className={
                          x.status === "VALID" ? "badge-ok" :
                              x.status === "UPDATED" ? "badge-warn" :
                                  x.status === "REVOKED" ? "badge-err" : "badge-info"
                      }>
                        {x.status}
                      </span>
                                    </td>
                                    <td className="py-2 pr-4">{x.currentReportId}</td>
                                    <td className="py-2 pr-4">
                                        {x.grants.length === 0 ? <span className="text-slate-400">—</span> : (
                                            <ul className="list-disc ml-5">
                                                {x.grants.map((g, i) => (
                                                    <li key={i}><span className="text-slate-600">{g.from}</span> → <span className="font-medium">{g.to}</span> <span className="text-slate-400">({new Date(g.ts * 1000).toLocaleString()})</span></li>
                                                ))}
                                            </ul>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </RoleLayout>
    );
}
