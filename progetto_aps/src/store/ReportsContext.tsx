/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Status = "VALID" | "UPDATED" | "REVOKED";

export type Report = {
    reportId: string;        // ID originario
    currentId: string;       // ID corrente (post-UPDATE)
    isCurrent: boolean;      // reportId === currentId
    labId: string;
    patientRef: string;
    issuedAt: string;
    status: Status;          // stato del report originario (VALID/UPDATED/REVOKED)
    access: string[];        // destinatari sulla VERSIONE CORRENTE (ek_for ∪ grants \ revoked)
    accessLocal: string[];   // destinatari su QUESTA VERSIONE (ek_for ∪ grants) \ revoked(current)
    ekFor: string[];
    examType?: string;
    resultShort?: string;
    note?: string;
    hasSig: boolean;
    cipherLen: number;
};

const API_BASE = "/api";

type Ctx = {
    reports: Report[];
    hospitals: string[];
    recipientRoles: Record<string, "HOSP" | "DOC">;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
};

const ReportsContext = createContext<Ctx | null>(null);

/** Struttura che arriva da /api/debug/envelopes */
type EnvelopeItem = {
    reportId: string;
    aad?: Record<string, unknown>;
    hasSig?: boolean;
    ekFor?: string[];
    cipherLen?: number;
};

type EnvelopesResponse = { ok: boolean; items?: EnvelopeItem[]; error?: string; };
type GrantsResponse = { ok: boolean; items?: { reportId?: string; from?: string; to?: string; ts?: number }[]; error?: string; };
type StateResponse  = { ok?: boolean; status?: Status | "UNKNOWN"; currentReportId?: string; };
type ActorsResponse = { ok: boolean; items?: { username?: string; uid?: string; role?: string; displayName?: string; hasKeys?: boolean }[]; error?: string; };

function normalizeIso(value: unknown): string {
    if (typeof value === "string" && value.trim()) return value;
    return new Date().toISOString();
}

function parseBaseEnvelope(raw: EnvelopeItem) {
    const reportId = typeof raw.reportId === "string" ? raw.reportId : "";
    const aad = typeof raw.aad === "object" && raw.aad !== null ? (raw.aad as Record<string, unknown>) : {};
    return {
        reportId,
        labId: typeof aad.labId === "string" ? (aad.labId as string) : "",
        patientRef: typeof aad.patientRef === "string" ? (aad.patientRef as string) : "",
        issuedAt: normalizeIso(aad.issuedAt),
        examType: typeof aad.examType === "string" ? (aad.examType as string) : undefined,
        resultShort: typeof aad.resultShort === "string" ? (aad.resultShort as string) : undefined,
        note: typeof aad.note === "string" ? (aad.note as string) : undefined,
        ekFor: Array.isArray(raw.ekFor) ? raw.ekFor.filter((x): x is string => typeof x === "string") : [],
        hasSig: raw.hasSig === true,
        cipherLen: typeof raw.cipherLen === "number" ? raw.cipherLen : 0,
    };
}

async function getJson<T>(url: string): Promise<{ ok: boolean; status: number; json: T | null; text: string }> {
    const resp = await fetch(url);
    const text = await resp.text();
    let json: T | null = null;
    try { json = text ? (JSON.parse(text) as T) : null; } catch { json = null; }
    return { ok: resp.ok, status: resp.status, json, text };
}

export function ReportsProvider({ children }: { children: React.ReactNode }) {
    const [reports, setReports] = useState<Report[]>([]);
    const [hospitals, setHospitals] = useState<string[]>([]);
    const [recipientRoles, setRecipientRoles] = useState<Record<string, "HOSP" | "DOC">>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // 1) envelopes
            const envRes = await getJson<EnvelopesResponse>(`${API_BASE}/debug/envelopes`);
            const envBody = envRes.json;
            if (!envRes.ok || !envBody || envBody.ok !== true || !Array.isArray(envBody.items)) {
                const msg = envBody?.error ?? `HTTP ${envRes.status}`;
                throw new Error(msg || "Caricamento referti fallito");
            }
            const baseItems = envBody.items.map(parseBaseEnvelope);
            const envById = new Map(baseItems.map((e) => [e.reportId, e]));

            // 2) per ogni report originario calcola stato, currentId, accessLocal ed access (sul current)
            const results: Report[] = [];
            for (const base of baseItems) {
                if (!base.reportId) continue;

                const stRes = await getJson<StateResponse>(`${API_BASE}/report/state/${encodeURIComponent(base.reportId)}`);
                const status = (stRes.json?.status === "VALID" || stRes.json?.status === "UPDATED" || stRes.json?.status === "REVOKED")
                    ? stRes.json.status
                    : "VALID";
                const currentId = typeof stRes.json?.currentReportId === "string" && stRes.json.currentReportId
                    ? stRes.json.currentReportId
                    : base.reportId;
                const isCurrent = currentId === base.reportId;

                // revoked sul current
                const revRes = await getJson<{ ok: boolean; items?: string[] }>(`${API_BASE}/report/revoked/${encodeURIComponent(currentId)}`);
                const revokedNow = revRes.ok && Array.isArray(revRes.json?.items) ? new Set(revRes.json!.items!) : new Set<string>();

                // accessLocal = ek_for(this) ∪ grants(this) \ revoked(current)
                const ekForLocal = (envById.get(base.reportId)?.ekFor || []).filter((x) => x && x !== base.patientRef);
                const grantsLocalRes = await getJson<GrantsResponse>(`${API_BASE}/report/grants/${encodeURIComponent(base.reportId)}`);
                const grantLocalTos = (grantsLocalRes.ok && grantsLocalRes.json?.ok === true && Array.isArray(grantsLocalRes.json.items))
                    ? grantsLocalRes.json.items!.map((g) => (typeof g?.to === "string" ? g.to : "")).filter(Boolean)
                    : [];
                const accessLocal = Array.from(new Set([...ekForLocal, ...grantLocalTos])).filter((u) => !revokedNow.has(u)).sort();

                // access sul current = ek_for(current) ∪ grants(current) \ revoked(current)
                const ekForCurrent = (envById.get(currentId)?.ekFor || []).filter((x) => x && x !== base.patientRef);
                const grantsRes = await getJson<GrantsResponse>(`${API_BASE}/report/grants/${encodeURIComponent(currentId)}`);
                const grantTos = (grantsRes.ok && grantsRes.json?.ok === true && Array.isArray(grantsRes.json.items))
                    ? Array.from(new Set(grantsRes.json.items
                        .map((g) => (typeof g?.to === "string" ? g.to : ""))
                        .filter(Boolean)))
                    : [];
                const access = Array.from(new Set([...ekForCurrent, ...grantTos])).filter((u) => !revokedNow.has(u)).sort();

                results.push({
                    reportId: base.reportId,
                    currentId,
                    isCurrent,
                    labId: base.labId,
                    patientRef: base.patientRef,
                    issuedAt: base.issuedAt,
                    status,
                    access,
                    accessLocal,
                    ekFor: base.ekFor,
                    examType: base.examType,
                    resultShort: base.resultShort,
                    note: base.note,
                    hasSig: base.hasSig,
                    cipherLen: base.cipherLen,
                });
            }

            // 3) ordina per data
            results.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
            setReports(results);

            // 4) elenco destinatari + ruoli (HOSP/DOC) per badge
            const actorsRes = await getJson<ActorsResponse>(`${API_BASE}/debug/actors`);
            const recipients: string[] = [];
            const rolesMap: Record<string, "HOSP" | "DOC"> = {};
            if (Array.isArray(actorsRes.json?.items)) {
                for (const x of actorsRes.json!.items!) {
                    const r = String(x?.role || "").toUpperCase();
                    const uid = typeof x?.uid === "string" ? x.uid : "";
                    if (!uid) continue;
                    if (r === "HOSP" || r === "DOC") {
                        recipients.push(uid);
                        rolesMap[uid] = r;
                    }
                }
            }
            recipients.sort();
            setHospitals(recipients);
            setRecipientRoles(rolesMap);
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Errore sconosciuto";
            setReports([]);
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const value = useMemo<Ctx>(
        () => ({ reports, hospitals, recipientRoles, loading, error, refresh }),
        [reports, hospitals, recipientRoles, loading, error, refresh]
    );

    return <ReportsContext.Provider value={value}>{children}</ReportsContext.Provider>;
}

export function useReports(): Ctx {
    const ctx = useContext(ReportsContext);
    if (!ctx) throw new Error("useReports must be used inside <ReportsProvider>");
    return ctx;
}
