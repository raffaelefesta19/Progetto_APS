// src/pages/Metrics.tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Stat = {
    count: number;
    avg_ms: number | null;
    p50_ms: number | null;
    p95_ms: number | null;
    max_ms: number | null;
};

type OverallSize = {
    count: number;
    avg_bytes: number;
    min_bytes: number;
    max_bytes: number;
};

type SizeByReport = { reportId: string; bytes: number };

type MetricsPayload = {
    ok: boolean;
    requests: Record<string, Stat>;
    generate_latency_ms: Stat;
    verify_latency_ms: Stat;
    report_size_bytes: {
        plaintext: { overall: OverallSize | null; by_report: SizeByReport[] };
        ciphertext: { overall: OverallSize | null; by_report: SizeByReport[] };
    };
};

export default function MetricsPage() {
    const [m, setM] = useState<MetricsPayload | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        (async () => {
            setBusy(true);
            setErr(null);
            try {
                const data = await api.get<MetricsPayload>("/metrics");
                if (!data.ok) throw new Error("Metrics not ok");
                setM(data);
            } catch (e: unknown) {
                setErr(e instanceof Error ? e.message : String(e));
            } finally {
                setBusy(false);
            }
        })();
    }, []);

    const fmt = (x: number | null) => (x == null ? "—" : `${x.toFixed(1)} ms`);

    // wrapper scorrevole: altezza viewport meno un margine per eventuale header
    return (
        <div style={{ height: "calc(100vh - 56px)", overflowY: "auto" }}>
            <div style={{ padding: 16, display: "grid", gap: 16 }}>
                <h1 style={{ margin: 0 }}>Metriche</h1>
                {busy && <div>Caricamento…</div>}
                {err && <div style={{ color: "crimson" }}>{err}</div>}
                {m && (
                    <>
                        <section style={{ display: "grid", gap: 8 }}>
                            <h2 style={{ margin: 0, fontSize: 18 }}>Latenze di interesse</h2>
                            <div
                                style={{
                                    display: "grid",
                                    gap: 8,
                                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                                }}
                            >
                                <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
                                    <div style={{ color: "#666", fontSize: 12 }}>Generazione referto (LAB)</div>
                                    <div style={{ fontWeight: 600 }}>
                                        {fmt(m.generate_latency_ms.avg_ms)} (p95 {fmt(m.generate_latency_ms.p95_ms)})
                                    </div>
                                </div>
                                <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
                                    <div style={{ color: "#666", fontSize: 12 }}>Verifica SD (simulata)</div>
                                    <div style={{ fontWeight: 600 }}>
                                        {fmt(m.verify_latency_ms.avg_ms)} (p95 {fmt(m.verify_latency_ms.p95_ms)})
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section style={{ display: "grid", gap: 8 }}>
                            <h2 style={{ margin: 0, fontSize: 18 }}>Dimensione referti</h2>
                            <div
                                style={{
                                    display: "grid",
                                    gap: 8,
                                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                                }}
                            >
                                <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
                                    <div style={{ fontWeight: 600 }}>Plaintext</div>
                                    {m.report_size_bytes.plaintext.overall ? (
                                        <ul style={{ margin: "8px 0", paddingLeft: 16 }}>
                                            <li>Totale: {m.report_size_bytes.plaintext.overall.count}</li>
                                            <li>Media: {Math.round(m.report_size_bytes.plaintext.overall.avg_bytes)} bytes</li>
                                            <li>Min: {m.report_size_bytes.plaintext.overall.min_bytes} bytes</li>
                                            <li>Max: {m.report_size_bytes.plaintext.overall.max_bytes} bytes</li>
                                        </ul>
                                    ) : (
                                        <div>—</div>
                                    )}
                                </div>
                                <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
                                    <div style={{ fontWeight: 600 }}>Ciphertext</div>
                                    {m.report_size_bytes.ciphertext.overall ? (
                                        <ul style={{ margin: "8px 0", paddingLeft: 16 }}>
                                            <li>Totale: {m.report_size_bytes.ciphertext.overall.count}</li>
                                            <li>Media: {Math.round(m.report_size_bytes.ciphertext.overall.avg_bytes)} bytes</li>
                                            <li>Min: {m.report_size_bytes.ciphertext.overall.min_bytes} bytes</li>
                                            <li>Max: {m.report_size_bytes.ciphertext.overall.max_bytes} bytes</li>
                                        </ul>
                                    ) : (
                                        <div>—</div>
                                    )}
                                </div>
                            </div>

                            <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
                                <div style={{ fontWeight: 600, marginBottom: 8 }}>Dettaglio per Report</div>
                                {/* scroll orizzontale se serve */}
                                <div style={{ overflowX: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 540 }}>
                                        <thead>
                                        <tr>
                                            <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 6 }}>Report ID</th>
                                            <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 6 }}>Plain (bytes)</th>
                                            <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 6 }}>Cipher (bytes)</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {Array.from(
                                            new Set([
                                                ...m.report_size_bytes.plaintext.by_report.map((r) => r.reportId),
                                                ...m.report_size_bytes.ciphertext.by_report.map((r) => r.reportId),
                                            ])
                                        ).map((id) => {
                                            const p =
                                                m.report_size_bytes.plaintext.by_report.find((x) => x.reportId === id)?.bytes ?? 0;
                                            const c =
                                                m.report_size_bytes.ciphertext.by_report.find((x) => x.reportId === id)?.bytes ?? 0;
                                            return (
                                                <tr key={id}>
                                                    <td style={{ borderBottom: "1px solid #f2f2f2", padding: 6 }}>{id}</td>
                                                    <td style={{ borderBottom: "1px solid #f2f2f2", padding: 6 }}>{p}</td>
                                                    <td style={{ borderBottom: "1px solid #f2f2f2", padding: 6 }}>{c}</td>
                                                </tr>
                                            );
                                        })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>

                        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
                            <div style={{ fontWeight: 600, marginBottom: 8 }}>Latenza per endpoint</div>
                            {/* scroll orizzontale per tabella larga */}
                            <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                                    <thead>
                                    <tr>
                                        <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 6 }}>Route</th>
                                        <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 6 }}>Count</th>
                                        <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 6 }}>Avg</th>
                                        <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 6 }}>p95</th>
                                        <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: 6 }}>Max</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {(Object.entries(m.requests) as [string, Stat][])
                                        .sort((a, b) => a[0].localeCompare(b[0]))
                                        .map(([route, s]) => (
                                            <tr key={route}>
                                                <td style={{ borderBottom: "1px solid #f2f2f2", padding: 6 }}>{route}</td>
                                                <td style={{ borderBottom: "1px solid #f2f2f2", padding: 6 }}>{s.count}</td>
                                                <td style={{ borderBottom: "1px solid #f2f2f2", padding: 6 }}>{fmt(s.avg_ms)}</td>
                                                <td style={{ borderBottom: "1px solid #f2f2f2", padding: 6 }}>{fmt(s.p95_ms)}</td>
                                                <td style={{ borderBottom: "1px solid #f2f2f2", padding: 6 }}>{fmt(s.max_ms)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}
