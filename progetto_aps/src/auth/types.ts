import type { Role } from "./utils";

export type AuthUser = {
    uid: string;        // es. PAT-123 / LAB-01 / HOSP-01 (o PAT-XXXX)
    role: Role;
    displayName: string;
    hasKeys: boolean;
};
