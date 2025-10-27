const API_BASE = "/api";

async function parseSmart(resp: Response) {
    const text = await resp.text();
    if (!text) return { ok: resp.ok, status: resp.status, data: {} as any, raw: "" };
    try {
        return { ok: resp.ok, status: resp.status, data: JSON.parse(text), raw: text };
    } catch {
        return { ok: resp.ok, status: resp.status, data: {} as any, raw: text };
    }
}

function raise(msg: string, status?: number): never {
    const e = new Error(msg);
    (e as any).status = status;
    throw e;
}

export const api = {
    async get<T = any>(path: string): Promise<T> {
        const resp = await fetch(`${API_BASE}${path}`, { method: "GET" });
        const parsed = await parseSmart(resp);
        if (!parsed.ok) raise((parsed.data?.error as string) || parsed.raw || `HTTP ${parsed.status}`, parsed.status);
        return parsed.data as T;
    },
    async post<T = any>(path: string, body?: unknown): Promise<T> {
        const resp = await fetch(`${API_BASE}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
        });
        const parsed = await parseSmart(resp);
        if (!parsed.ok) raise((parsed.data?.error as string) || parsed.raw || `HTTP ${parsed.status}`, parsed.status);
        return parsed.data as T;
    },
};
