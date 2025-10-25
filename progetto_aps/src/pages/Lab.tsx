import { useMemo, useState } from "react";
import RoleLayout from "../components/layout/RoleLayout";
import { useReports } from "../store/ReportsContext";
import type { Report } from "../store/ReportsContext";
import { useAuth } from "../auth/AuthContext";

const API_BASE = "/api";

export default function Lab() {
    const { reports, refresh, loading, error: reportsError } = useReports();
    const { user } = useAuth();
    const LAB_ID = user?.uid ?? "LAB-01";

    const mine = useMemo(() => reports.filter(r => r.labId === LAB_ID), [reports, LAB_ID]);
    const sorted = useMemo(() => [...mine].sort((a, b) => +new Date(b.issuedAt) - +new Date(a.issuedAt)), [mine]);

    const [patientRef, setPatientRef] = useState("");
    const [examType, setExamType] = useState("");
    const [resultShort, setResultShort] = useState("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const nextId = useMemo(() => {
        const base = 1 + reports.map(r => parseInt(r.reportId.split("-").pop() || "0", 10)).reduce((a, b) => Math.max(a, b), 0);
        return (n: number) => `R-2025-${String(base + n).padStart(4, "0")}`;
    }, [reports]);

    const publish = async () => {
        const p = patientRef.trim();
        const et = examType.trim();
        if (!p || !et || busy) return;

        setBusy(true);
        setErr(null);
        const reportId = nextId(0);
        try {
            await fetch(`${API_BASE}/keys/init`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ actors: [LAB_ID, p] }),
            });

            const content = `Referto ${reportId}\nTipo: ${et}\nNote: ${note || "—"}\nEsito: ${resultShort || "—"}`;

            const resp = await fetch(`${API_BASE}/lab/emit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    reportId,
                    labId: LAB_ID,
                    patientRef: p,
                    content,
                    contentIsBase64: false,
                    examType: et,
                    resultShort: resultShort.trim() || undefined,
                    note: note.trim() || undefined,
                }),
            });
            if (!resp.ok) throw new Error(await resp.text());

            await refresh();

            setPatientRef("");
            setExamType("");
            setResultShort("");
            setNote("");
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Errore di pubblicazione");
        } finally {
            setBusy(false);
        }
    };

    const EXAM_TYPES = ["Emocromo", "RX Torace", "ECG", "Colesterolo", "Glicemia", "Visita controllo"];

    return (
        <RoleLayout title="Console laboratorio">
            <section className="panel mb-4">
                <h2 className="panel-title">Emetti referto</h2>

                <div className="grid md:grid-cols-2 gap-4">
                    <div>
                        <label className="label">Paziente (pseudonimo) <span className="text-red-500">*</span></label>
                        <input className="input-light" placeholder="Es. PAT-123" value={patientRef} onChange={e => setPatientRef(e.target.value)} />
                    </div>

                    <div>
                        <label className="label">Tipo esame <span className="text-red-500">*</span></label>
                        <input className="input-light" list="exam-types" placeholder="Es. Emocromo" value={examType} onChange={e => setExamType(e.target.value)} />
                        <datalist id="exam-types">{EXAM_TYPES.map(x => (<option key={x} value={x} />))}</datalist>
                    </div>

                    <div>
                        <label className="label">Esito sintetico</label>
                        <input className="input-light" placeholder="Es. Valori nella norma" value={resultShort} onChange={e => setResultShort(e.target.value)} />
                    </div>

                    <div>
                        <label className="label">Note interne LAB</label>
                        <input className="input-light" placeholder="Es. Prelievo ore 9:00" value={note} onChange={e => setNote(e.target.value)} />
                    </div>
                </div>

                {err && <div className="text-sm text-red-600 mt-2">{err}</div>}
                {reportsError && <div className="text-sm text-red-600 mt-2">{reportsError}</div>}

                <div className="flex justify-end mt-4">
                    <button
                        className="px-4 py-2 rounded-xl text-sm font-medium border mr-2"
                        onClick={() => { void refresh(); }}
                        disabled={loading}
                    >
                        {loading ? "Aggiorno..." : "Aggiorna lista"}
                    </button>
                    <button
                        disabled={!patientRef.trim() || !examType.trim() || busy}
                        onClick={publish}
                        className={`px-4 py-2 rounded-xl text-sm font-medium ${
                            !patientRef.trim() || !examType.trim() || busy ? "bg-slate-300 text-white cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
                        }`}
                    >
                        {busy ? "Pubblico..." : "Pubblica referto"}
                    </button>
                </div>
            </section>

            <section className="panel">
                <div className="flex items-center mb-3">
                    <h2 className="panel-title m-0 flex-1">Referti emessi</h2>
                    <div className="text-sm text-slate-500">{sorted.length} totali</div>
                </div>

                <div className="grid gap-2">
                    {sorted.map(r => (
                        <Row key={r.reportId} r={r} />
                    ))}
                </div>
            </section>
        </RoleLayout>
    );
}

function Row({ r }: { r: Report }) {
    const badge = r.status === "VALID" ? "badge-ok" : r.status === "UPDATED" ? "badge-warn" : "badge-err";
    const when = new Date(r.issuedAt).toLocaleString();
    const sharedWith = r.access.length ? r.access.join(", ") : "—";

    return (
        <div className="flex items-center justify-between p-3 rounded-lg border bg-white">
            <div className="text-left min-w-0 flex-1">
                <div className="font-medium truncate">
                    {r.reportId} <span className="text-slate-500">· v{r.version}</span>
                </div>
                <div className="muted truncate">
                    {r.examType || "—"} · {r.resultShort || "—"} · Paziente {r.patientRef} · {when} · {r.labId}
                </div>
                <div className="text-xs text-slate-500 truncate">Condiviso con: {sharedWith}</div>
            </div>

            <div className="flex items-center gap-3">
                <span className={badge}>{r.status}</span>
                <span className={`text-xs px-2 py-1 rounded-full ${r.hasSig ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {r.hasSig ? "Firma" : "No firma"}
                </span>
                <span className="text-xs text-slate-500">{r.ekFor.length} destinatari</span>
            </div>
        </div>
    );
}
