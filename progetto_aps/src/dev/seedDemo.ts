// src/dev/seedDemo.ts
const API_BASE = "/api";

/**
 * Avvia un seed server-side (idempotente).
 * - Crea utenti pat1/lab1/hosp1 (se mancano)
 * - Emette DEMO-R-0001/2/3 (se mancano)
 * - Condivide con HOSP-01 i primi due e revoca il terzo
 */
export async function ensureDemoUsers() {
    // attende che il backend sia su (fino a ~5s)
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) {
        try {
            const ping = await fetch(`${API_BASE}/debug/actors`);
            if (ping.ok) break;
        } catch {
            /* retry */
        }
        await new Promise((r) => setTimeout(r, 200));
    }

    try {
        const resp = await fetch(`${API_BASE}/dev/seed`, { method: "POST" });
        const text = await resp.text();
        let json: any = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            /* noop */
        }

        if (!resp.ok || json?.ok !== true) {
            console.warn("Seed demo fallito:", resp.status, text);
        } else {
            console.info("Seed demo completato:", json);
        }
    } catch (e) {
        console.warn("Seed demo errore di rete:", e);
    }
}
