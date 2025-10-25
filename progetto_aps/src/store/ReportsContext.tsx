import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Status = "VALID" | "UPDATED" | "REVOKED";

export type Report = {
    reportId: string;
    labId: string;
    patientRef: string;
    issuedAt: string;
    status: Status;
    access: string[];
    ekFor: string[];
    version: number;
    examType?: string;
    resultShort?: string;
    note?: string;
    hasSig: boolean;
    cipherLen: number;
};

const API_BASE = "/api";
export const HOSPITALS = ["HOSP-01", "HOSP-02", "HOSP-03"] as const;

type Ctx = {
    reports: Report[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
};

const ReportsContext = createContext<Ctx | null>(null);

type RawItem = Record<string, unknown> & {
    aad?: Record<string, unknown>;
    ekFor?: unknown;
};

function normalizeIso(value: unknown): string {
    if (typeof value === "string" && value.trim()) return value;
    return new Date().toISOString();
}

function parseReport(raw: RawItem): Report | null {
    const reportId = typeof raw.reportId === "string" ? raw.reportId : "";
    if (!reportId) return null;

    const aad = typeof raw.aad === "object" && raw.aad !== null ? raw.aad as Record<string, unknown> : {};
    const labId = typeof aad.labId === "string" ? aad.labId : "";
    const patientRef = typeof aad.patientRef === "string" ? aad.patientRef : "";
    const issuedAt = normalizeIso(aad.issuedAt);
    const examType = typeof aad.examType === "string" ? aad.examType : undefined;
    const resultShort = typeof aad.resultShort === "string" ? aad.resultShort : undefined;
    const note = typeof aad.note === "string" ? aad.note : undefined;

    const ekForRaw = Array.isArray(raw.ekFor) ? raw.ekFor : [];
    const ekFor = ekForRaw.filter((x): x is string => typeof x === "string");

    const access = ekFor.filter((recipient) => recipient !== patientRef);
    const hasSig = raw.hasSig === true;
    const cipherLen = typeof raw.cipherLen === "number" ? raw.cipherLen : 0;

    return {
        reportId,
        labId,
        patientRef,
        issuedAt,
        status: "VALID",
        access,
        ekFor,
        version: 1,
        examType,
        resultShort,
        note,
        hasSig,
        cipherLen,
    };
}

export function ReportsProvider({ children }: { children: React.ReactNode }) {
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const resp = await fetch(`${API_BASE}/debug/envelopes`);
            const payload: unknown = await resp.json().catch(() => ({}));
            const data = (payload && typeof payload === "object") ? payload as Record<string, unknown> : {};

            if (!resp.ok || data.ok !== true || !Array.isArray(data.items)) {
                const msg = typeof data.error === "string" ? data.error : `HTTP ${resp.status}`;
                throw new Error(msg || "Caricamento referti fallito");
            }

            const parsed = (data.items as unknown[])
                .map((item) => (typeof item === "object" && item !== null ? item as RawItem : null))
                .map((item) => (item ? parseReport(item) : null))
                .filter((item): item is Report => !!item);

            parsed.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
            setReports(parsed);
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Errore sconosciuto";
            setReports([]);
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const value = useMemo<Ctx>(() => ({ reports, loading, error, refresh }), [reports, loading, error, refresh]);

    return <ReportsContext.Provider value={value}>{children}</ReportsContext.Provider>;
}

export function useReports(): Ctx {
    const ctx = useContext(ReportsContext);
    if (!ctx) throw new Error("useReports must be used inside <ReportsProvider>");
    return ctx;
}
