import RoleLayout from "../components/layout/RoleLayout";
import { useReports } from "../store/ReportsContext";

export default function Ledger() {
    const { reports, loading, error, refresh } = useReports();

    return (
        <RoleLayout title="Ledger (debug)">
            <section className="panel">
                <div className="flex items-center mb-3">
                    <h2 className="panel-title m-0 flex-1">Stato envelope (on-store)</h2>
                    <button className="px-3 py-1.5 rounded-lg border text-sm hover:bg-slate-50" onClick={() => { void refresh(); }} disabled={loading}>
                        {loading ? "Aggiorno..." : "Aggiorna"}
                    </button>
                </div>

                {error && <div className="text-sm text-red-600 mb-2">{error}</div>}

                {reports.length === 0 ? (
                    <div className="muted">Nessun referto pubblicato ancora.</div>
                ) : (
                    <div className="mt-2 overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                            <tr className="text-left text-slate-600">
                                <th className="py-2 pr-4">Report ID</th>
                                <th className="py-2 pr-4">Lab</th>
                                <th className="py-2 pr-4">Patient</th>
                                <th className="py-2 pr-4">ek_for</th>
                                <th className="py-2 pr-4">Firma LAB</th>
                                <th className="py-2 pr-4">Cipher len</th>
                            </tr>
                            </thead>
                            <tbody>
                            {reports.map((x) => (
                                <tr key={x.reportId} className="border-t">
                                    <td className="py-2 pr-4 font-medium">{x.reportId}</td>
                                    <td className="py-2 pr-4">{x.labId}</td>
                                    <td className="py-2 pr-4">{x.patientRef}</td>
                                    <td className="py-2 pr-4">
                                        {x.ekFor.length ? x.ekFor.join(", ") : <span className="text-slate-400">—</span>}
                                    </td>
                                    <td className="py-2 pr-4">
                                        <span className={x.hasSig ? "badge-ok" : "badge-err"}>{x.hasSig ? "PRESENTE" : "ASSENTE"}</span>
                                    </td>
                                    <td className="py-2 pr-4">{x.cipherLen}</td>
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
