import { useMemo, useState } from "react";
import RoleLayout from "../components/layout/RoleLayout";
import { useReports } from "../store/ReportsContext";
import type { Report } from "../store/ReportsContext";
import { useAuth } from "../auth/AuthContext";
import ExpandableList from "../components/ui/ExpandableList";

const API_BASE = "/api";

export default function Lab() {
    const { reports, refresh, loading, error: reportsError, recipientRoles } = useReports();
    const { user } = useAuth();
    const LAB_ID = user?.uid ?? "LAB-01";

    const mine = useMemo(() => reports.filter((r) => r.labId === LAB_ID), [reports, LAB_ID]);
    const sorted = useMemo(() => [...mine].sort((a, b) => +new Date(b.issuedAt) - +new Date(a.issuedAt)), [mine]);

    const [patientRef, setPatientRef] = useState("");
    const [examType, setExamType] = useState("");
    const [resultShort, setResultShort] = useState("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [updating, setUpdating] = useState<Report | null>(null);
    const [revokeTarget, setRevokeTarget] = useState<Report | null>(null);
    const [busyAction, setBusyAction] = useState(false);

    const nextId = useMemo(() => {
        const base = 1 + reports.map((r) => parseInt(r.reportId.split("-").pop() || "0", 10)).reduce((a, b) => Math.max(a, b), 0);
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
            setPatientRef(""); setExamType(""); setResultShort(""); setNote("");
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Errore di pubblicazione");
        } finally {
            setBusy(false);
        }
    };

    // usate davvero (niente warning)
    const startUpdate = (r: Report) => setUpdating(r);
    const revoke = (r: Report) => setRevokeTarget(r);

    const doRevoke = async () => {
        if (!revokeTarget) return;
        setBusyAction(true);
        try {
            const resp = await fetch(`${API_BASE}/lab/revoke`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reportId: revokeTarget.reportId, labId: LAB_ID, reason: "Revoca da console LAB" }),
            });
            const text = await resp.text();
            if (!resp.ok) throw new Error(text || "Revoca fallita");
            await refresh();
            setRevokeTarget(null);
        } catch (e) {
            alert(e instanceof Error ? e.message : "Revoca fallita");
        } finally {
            setBusyAction(false);
        }
    };

    const doUpdate = async (newResultShort: string, newNote: string) => {
        if (!updating) return;
        setBusyAction(true);
        try {
            const oldId = updating.reportId;
            const newId = nextId(1);
            const content = `Referto ${newId}\nTipo: ${updating.examType || "—"}\nNote: ${newNote || "—"}\nEsito: ${newResultShort || "—"}`;

            const emitResp = await fetch(`${API_BASE}/lab/emit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    reportId: newId,
                    labId: LAB_ID,
                    patientRef: updating.patientRef,
                    content,
                    contentIsBase64: false,
                    examType: updating.examType || "",
                    resultShort: newResultShort || "",
                    note: newNote || "",
                }),
            });
            if (!emitResp.ok) throw new Error(await emitResp.text());
            const { envelope } = await emitResp.json();

            const linkResp = await fetch(`${API_BASE}/lab/update`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ oldReportId: oldId, newReportId: newId, labId: LAB_ID, envelope }),
            });
            const linkText = await linkResp.text();
            if (!linkResp.ok) throw new Error(linkText || "Link update fallito");

            await refresh();
            setUpdating(null);
        } catch (e) {
            alert(e instanceof Error ? e.message : "Aggiornamento fallito");
        } finally {
            setBusyAction(false);
        }
    };

    const EXAM_TYPES = [ "Emocromo", "RX Torace", "ECG", "Colesterolo", "Glicemia", "Visita controllo" ];

    return (
        <RoleLayout title="Console laboratorio">
            <section className="panel mb-4">
                <h2 className="panel-title">Emetti referto</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="label">Paziente (pseudonimo) <span className="text-red-500">*</span></label>
                        <input className="input-light" placeholder="Es. PAT-123" value={patientRef} onChange={(e) => setPatientRef(e.target.value)} />
                    </div>
                    <div>
                        <label className="label">Tipo esame <span className="text-red-500">*</span></label>
                        <input className="input-light" list="exam-types" placeholder="Es. Emocromo" value={examType} onChange={(e) => setExamType(e.target.value)} />
                        <datalist id="exam-types">{EXAM_TYPES.map((x) => (<option key={x} value={x} />))}</datalist>
                    </div>
                    <div>
                        <label className="label">Esito sintetico</label>
                        <input className="input-light" placeholder="Es. Valori nella norma" value={resultShort} onChange={(e) => setResultShort(e.target.value)} />
                    </div>
                    <div>
                        <label className="label">Note interne LAB</label>
                        <input className="input-light" placeholder="Es. Prelievo ore 9:00" value={note} onChange={(e) => setNote(e.target.value)} />
                    </div>
                </div>
                {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
                {reportsError && <div className="mt-2 text-sm text-red-600">{reportsError}</div>}
                <div className="mt-4 flex justify-end">
                    <button className="btn btn-ghost mr-2" onClick={() => { void refresh(); }} disabled={loading}>
                        {loading ? "Aggiorno..." : "Aggiorna lista"}
                    </button>
                    <button
                        disabled={!patientRef.trim() || !examType.trim() || busy}
                        onClick={publish}
                        className={`rounded-xl px-4 py-2 text-sm font-medium ${
                            !patientRef.trim() || !examType.trim() || busy ? "cursor-not-allowed bg-slate-300 text-white" : "bg-blue-600 text-white hover:bg-blue-700"
                        }`}
                    >
                        {busy ? "Pubblico..." : "Pubblica referto"}
                    </button>
                </div>
            </section>

            <section className="panel">
                <div className="mb-3 flex items-center">
                    <h2 className="panel-title m-0 flex-1">Referti emessi</h2>
                    <div className="text-sm text-slate-500">{sorted.length} totali</div>
                </div>

                <ExpandableList
                    items={sorted}
                    initiallyVisible={3}
                    renderItem={(r) => (
                        <Row
                            key={r.reportId}
                            r={r}
                            recipientRoles={recipientRoles}
                            onUpdate={() => startUpdate(r)}   // usate → niente warning
                            onRevoke={() => revoke(r)}       // usate → niente warning
                        />
                    )}
                />
            </section>

            {updating && (
                <UpdateModal
                    report={updating}
                    busy={busyAction}
                    onCancel={() => setUpdating(null)}
                    onConfirm={(newResultShort, newNote) => { void doUpdate(newResultShort, newNote); }}
                />
            )}

            {revokeTarget && (
                <ConfirmModal
                    title="Revoca referto"
                    subtitle={`Sei sicuro di revocare ${revokeTarget.reportId}? Le strutture non potranno più aprirlo.`}
                    busy={busyAction}
                    onCancel={() => setRevokeTarget(null)}
                    onConfirm={() => { void doRevoke(); }}
                />
            )}
        </RoleLayout>
    );
}

function Row({
                 r,
                 recipientRoles,
                 onUpdate,
                 onRevoke,
             }: {
    r: Report;
    recipientRoles: Record<string, "HOSP" | "DOC">;
    onUpdate: () => void;
    onRevoke: () => void;
}) {
    const badge = r.status === "VALID" ? "badge-ok" : r.status === "UPDATED" ? "badge-warn" : "badge-err";
    const when = new Date(r.issuedAt).toLocaleString();

    const canUpdate = r.isCurrent && r.status !== "REVOKED";
    const canRevoke = r.isCurrent && r.status === "VALID";

    return (
        <div className="flex w-full items-center justify-between rounded-lg border bg-white p-3">
            <div className="min-w-0 flex-1 text-left">
                <div className="truncate font-medium">
                    {r.reportId}{" "}
                    {r.isCurrent ? (
                        <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 ml-1">attuale</span>
                    ) : (
                        <span className="text-xs text-slate-600 bg-slate-50 border rounded px-1 ml-1">sostituito → {r.currentId}</span>
                    )}
                </div>
                <div className="muted truncate">{r.examType || "—"} · {r.resultShort || "—"} · Paziente {r.patientRef} · {when} · {r.labId}</div>

                <div className="text-xs text-slate-500 mt-2">Condiviso con (versione corrente):</div>
                <div className="mt-1 flex flex-wrap gap-2">
                    {r.access.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                    ) : (
                        r.access.map((uid) => {
                            const role = recipientRoles[uid] || "HOSP";
                            const pill = role === "HOSP" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-purple-50 text-purple-700 border-purple-200";
                            return (
                                <span key={uid} className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs ${pill}`} title={`${role} ${uid}`}>
                  <span className="font-medium">{uid}</span>
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] border">{role}</span>
                </span>
                            );
                        })
                    )}
                </div>

                {!r.isCurrent && <div className="text-xs text-amber-600 mt-1">Questa versione è stata sostituita dalla {r.currentId}. Azioni disabilitate.</div>}
                {r.status === "REVOKED" && <div className="text-xs text-red-600 mt-1">Referto revocato.</div>}
            </div>

            <div className="flex items-center gap-3 pl-3">
                <span className={badge}>{r.status}</span>
                <span className={`rounded-full px-2 py-1 text-xs ${r.hasSig ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
          {r.hasSig ? "Firma" : "No firma"}
        </span>
                <button
                    className={`rounded-lg border px-3 py-1.5 text-sm ${canUpdate ? "hover:bg-slate-50" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}
                    onClick={onUpdate}
                    disabled={!canUpdate}
                    title={canUpdate ? "Aggiorna referto (nuova versione)" : "Azione non disponibile sulla versione non corrente / revocata"}
                >
                    Aggiorna
                </button>
                <button
                    className={`rounded-lg border px-3 py-1.5 text-sm ${canRevoke ? "hover:bg-slate-50" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}
                    onClick={onRevoke}
                    disabled={!canRevoke}
                    title={canRevoke ? "Revoca referto (forte)" : "Revoca permessa solo sulla versione corrente valida"}
                >
                    Revoca
                </button>
            </div>
        </div>
    );
}

/* Modali */
function ConfirmModal({
                          title,
                          subtitle,
                          busy,
                          onCancel,
                          onConfirm,
                      }: {
    title: string;
    subtitle?: string;
    busy?: boolean;
    onCancel: () => void;
    onConfirm: () => void | Promise<void>;
}) {
    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
            <div className="absolute inset-0 grid place-items-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                    <h3 className="text-lg font-semibold">{title}</h3>
                    {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
                    <div className="mt-4 flex justify-end gap-2">
                        <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={onCancel} disabled={busy}>Annulla</button>
                        <button className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700" onClick={onConfirm} disabled={busy}>
                            {busy ? "Attendere…" : "Conferma"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function UpdateModal({
                         report,
                         busy,
                         onCancel,
                         onConfirm,
                     }: {
    report: Report;
    busy?: boolean;
    onCancel: () => void;
    onConfirm: (newResultShort: string, newNote: string) => void | Promise<void>;
}) {
    const [rs, setRs] = useState(report.resultShort || "");
    const [nt, setNt] = useState(report.note || "");
    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
            <div className="absolute inset-0 grid place-items-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                    <h3 className="text-lg font-semibold">Aggiorna referto {report.reportId}</h3>
                    <div className="mt-3 space-y-3">
                        <div>
                            <label className="label">Esito sintetico</label>
                            <input className="input-light" value={rs} onChange={(e) => setRs(e.target.value)} />
                        </div>
                        <div>
                            <label className="label">Note</label>
                            <input className="input-light" value={nt} onChange={(e) => setNt(e.target.value)} />
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                        <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={onCancel} disabled={busy}>Annulla</button>
                        <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700" onClick={() => onConfirm(rs, nt)} disabled={busy}>
                            {busy ? "Aggiorno…" : "Salva nuova versione"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
