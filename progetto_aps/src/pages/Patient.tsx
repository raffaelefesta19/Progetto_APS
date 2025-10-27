import { useMemo, useState } from "react";
import RoleLayout from "../components/layout/RoleLayout";
import { useReports } from "../store/ReportsContext";
import type { Report } from "../store/ReportsContext";
import { useAuth } from "../auth/AuthContext";
import ExpandableList from "../components/ui/ExpandableList";

const API_BASE = "/api";

export default function Patient() {
    const { reports, refresh, error: reportsError, recipientRoles } = useReports();
    const { user } = useAuth();
    const PAT_ID = user?.uid ?? "PAT-123";

    const mine = useMemo(() => reports.filter((r) => r.patientRef === PAT_ID), [reports, PAT_ID]);
    const sorted = useMemo(() => [...mine].sort((a, b) => +new Date(b.issuedAt) - +new Date(a.issuedAt)), [mine]);

    // share modal
    const [shareFor, setShareFor] = useState<Report | null>(null);
    const [hospId, setHospId] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // revoke confirm modal
    const [revokeFor, setRevokeFor] = useState<{ report: Report; hosp: string } | null>(null);

    const doShare = async () => {
        if (!shareFor || !hospId.trim()) return;
        setBusy(true); setErr(null);
        try {
            await fetch(`${API_BASE}/keys/init`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ actors: [PAT_ID, hospId.trim()] }),
            }).catch(() => {});
            // IMPORTANT: condivido sempre sulla VERSIONE CORRENTE
            const resp = await fetch(`${API_BASE}/patient/share`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reportId: shareFor.currentId, patientId: PAT_ID, hospitalId: hospId.trim() }),
            });
            if (!resp.ok) throw new Error("Impossibile condividere adesso. Riprova più tardi.");
            await refresh();
            setShareFor(null); setHospId("");
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Errore imprevisto");
        } finally {
            setBusy(false);
        }
    };

    return (
        <RoleLayout title="Spazio paziente">
            <section className="panel">
                <h2 className="panel-title">Referti</h2>
                {reportsError && <div className="text-sm text-red-600 mt-2">{reportsError}</div>}
                <div className="text-sm text-slate-500 mt-1">{sorted.length} risultati</div>

                <div className="mt-3">
                    <ExpandableList
                        items={sorted}
                        initiallyVisible={3}
                        renderItem={(r) => (
                            <Row
                                key={r.reportId}
                                r={r}
                                recipientRoles={recipientRoles}
                                onShare={() => { setShareFor(r); setHospId(""); setErr(null); }}
                                onRevokeAccess={(hosp) => setRevokeFor({ report: r, hosp })}
                            />
                        )}
                    />
                </div>
            </section>

            {/* Condividi */}
            {shareFor && (
                <ShareModal
                    report={shareFor}
                    hospId={hospId}
                    setHospId={setHospId}
                    busy={busy}
                    error={err}
                    onCancel={() => setShareFor(null)}
                    onConfirm={() => void doShare()}
                />
            )}

            {/* Revoca (soft) */}
            {revokeFor && (
                <RevokeConfirmModal
                    reportId={revokeFor.report.currentId}     // revoca sulla versione corrente
                    hospId={revokeFor.hosp}
                    patientId={PAT_ID}
                    onClose={() => setRevokeFor(null)}
                    onRevoked={() => void refresh()}
                />
            )}
        </RoleLayout>
    );
}

function Row({
                 r,
                 recipientRoles,
                 onShare,
                 onRevokeAccess,
             }: {
    r: Report;
    recipientRoles: Record<string, "HOSP" | "DOC">;
    onShare: () => void;
    onRevokeAccess: (hospId: string) => void;
}) {
    const badge =
        r.status === "VALID" ? "badge-ok" : r.status === "UPDATED" ? "badge-warn" : "badge-err";
    const when = new Date(r.issuedAt).toLocaleString();

    const shareEnabled = r.isCurrent && r.status !== "REVOKED";
    const revokeEnabled = r.isCurrent && r.status !== "REVOKED";

    const accessList = r.isCurrent ? r.access : r.accessLocal;

    return (
        <div className="flex items-center justify-between p-3 rounded-lg border bg-white">
            <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                    {r.reportId} {r.isCurrent ? <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 ml-1">attuale</span> : <span className="text-xs text-slate-600 bg-slate-50 border rounded px-1 ml-1">sostituito → {r.currentId}</span>}
                </div>
                <div className="muted truncate">
                    {r.examType || "—"} · {r.resultShort || "—"} · Emesso {when} · {r.labId}
                </div>

                {r.status === "UPDATED" && (
                    <div className="text-xs text-amber-600 mt-0.5">
                        Questa versione è stata sostituita da <span className="font-medium">{r.currentId}</span>.
                    </div>
                )}

                <div className="text-xs text-slate-500 mt-2">Autorizzati ({r.isCurrent ? "versione attuale" : "questa versione"}):</div>
                <div className="mt-1 flex flex-wrap gap-2">
                    {accessList.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                    ) : (
                        accessList.map((uid) => {
                            const role = recipientRoles[uid] || "HOSP";
                            const pill =
                                role === "HOSP"
                                    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                    : "bg-purple-50 text-purple-700 border-purple-200";
                            return (
                                <span key={uid} className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs ${pill}`} title={`${role} ${uid}`}>
                  <span className="font-medium">{uid}</span>
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] border">{role}</span>
                                    {revokeEnabled && (
                                        <button className="rounded-full border px-2 py-0.5 hover:bg-slate-100" onClick={() => onRevokeAccess(uid)}>
                                            Revoca accesso
                                        </button>
                                    )}
                </span>
                            );
                        })
                    )}
                </div>
            </div>

            <div className="ml-3 flex items-center gap-3">
                <span className={badge}>{r.status}</span>
                <button
                    className={`px-3 py-1.5 rounded-lg border text-sm ${shareEnabled ? "hover:bg-slate-50" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}
                    onClick={onShare}
                    disabled={!shareEnabled}
                    title={shareEnabled ? "Condividi versione attuale" : "Condividi disponibile solo sulla versione attuale non revocata"}
                >
                    Condividi
                </button>
            </div>
        </div>
    );
}

function ShareModal({
                        report,
                        hospId,
                        setHospId,
                        busy,
                        error,
                        onCancel,
                        onConfirm,
                    }: {
    report: Report;
    hospId: string;
    setHospId: (v: string) => void;
    busy?: boolean;
    error: string | null;
    onCancel: () => void;
    onConfirm: () => void | Promise<void>;
}) {
    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
            <div className="absolute inset-0 grid place-items-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6">
                    <h3 className="text-lg font-semibold">Condividi (versione attuale) {report.currentId}</h3>
                    <p className="text-sm text-slate-600 mt-1">
                        Inserisci l’ID della struttura o del medico (es. <code>HOSP-01</code> o <code>DOC-01</code>).
                    </p>
                    <div className="mt-3">
                        <label className="label">ID ospedale / medico</label>
                        <input className="input-light" placeholder="Es. HOSP-01 o DOC-01" value={hospId} onChange={(e) => setHospId(e.target.value)} />
                    </div>
                    {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
                    <div className="mt-4 flex justify-end gap-2">
                        <button className="px-3 py-1.5 rounded-lg border text-sm hover:bg-slate-50" onClick={onCancel} disabled={busy}>Annulla</button>
                        <button className={`px-3 py-1.5 rounded-lg text-sm ${hospId.trim() ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-200 text-slate-500 cursor-not-allowed"}`} onClick={onConfirm} disabled={!hospId.trim() || !!busy}>
                            {busy ? "Condivido…" : "Concedi accesso"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function RevokeConfirmModal({
                                reportId,
                                hospId,
                                patientId,
                                onClose,
                                onRevoked,
                            }: {
    reportId: string;
    hospId: string;
    patientId: string;
    onClose: () => void;
    onRevoked: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const doRevoke = async () => {
        setBusy(true); setErr(null);
        try {
            const resp = await fetch(`/api/patient/unshare`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reportId, patientId, hospitalId: hospId }),
            });
            const text = await resp.text();
            if (!resp.ok) throw new Error(text || "Revoca fallita");
            onRevoked();
            onClose();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Errore");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="absolute inset-0 grid place-items-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6">
                    <h3 className="text-lg font-semibold">Revoca accesso</h3>
                    <p className="text-sm text-slate-700 mt-2">
                        Revocare l’accesso di <strong>{hospId}</strong> al referto <strong>{reportId}</strong>?
                    </p>
                    <p className="text-sm text-slate-600 mt-2">
                        La revoca è <strong>immediata</strong> lato sistema per nuove aperture (soft revoke).
                        Se vuoi impedire l’uso di copie o chiavi già salvate, chiedi al LAB di pubblicare una <strong>nuova versione</strong> oppure di <strong>revocare il referto</strong> (revoca forte).
                    </p>
                    {err && <div className="text-sm text-red-600 mt-2">{err}</div>}
                    <div className="mt-4 flex justify-end gap-2">
                        <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={onClose} disabled={busy}>Annulla</button>
                        <button className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700" onClick={doRevoke} disabled={busy}>
                            {busy ? "Revoco…" : "Revoca ora"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
