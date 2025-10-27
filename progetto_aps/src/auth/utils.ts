export type Role = "PAT" | "LAB" | "HOSP" | "DOC"; // aggiunto "DOC"

export function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
export function asString(v: unknown, fallback = ""): string {
    return typeof v === "string" ? v : fallback;
}
export function asBool(v: unknown, fallback = false): boolean {
    return typeof v === "boolean" ? v : fallback;
}
