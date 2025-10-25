import type { Role } from "./utils";

type SeedUser = {
    uid: string;
    role: Role;
    username: string;
    password: string;
    displayName: string;
    publicKey: string;
    privateKeyEnc: string;
    keyStatus: "issued" | "revoked" | "pending";
};

const FAKE_PUB = "-----BEGIN PUBLIC KEY-----\\n...FAKE...\\n-----END PUBLIC KEY-----";
const FAKE_PRIV_ENC = "-----BEGIN ENCRYPTED PRIVATE KEY-----\\n...FAKE...\\n-----END ENCRYPTED PRIVATE KEY-----";

export const USERS_SEED: SeedUser[] = [
    // Pazienti
    {
        uid: "PAT-123",
        role: "PAT",
        username: "pat1",
        password: "pat1pass",
        displayName: "Mario Rossi",
        publicKey: FAKE_PUB,
        privateKeyEnc: FAKE_PRIV_ENC,
        keyStatus: "issued",
    },
    {
        uid: "PAT-999",
        role: "PAT",
        username: "pat2",
        password: "pat2pass",
        displayName: "Giulia Bianchi",
        publicKey: FAKE_PUB,
        privateKeyEnc: FAKE_PRIV_ENC,
        keyStatus: "issued",
    },

    // Laboratori
    {
        uid: "LAB-01",
        role: "LAB",
        username: "lab1",
        password: "lab1pass",
        displayName: "Laboratorio Centrale",
        publicKey: FAKE_PUB,
        privateKeyEnc: FAKE_PRIV_ENC,
        keyStatus: "issued",
    },
    {
        uid: "LAB-02",
        role: "LAB",
        username: "lab2",
        password: "lab2pass",
        displayName: "Lab Diagnostica 2",
        publicKey: FAKE_PUB,
        privateKeyEnc: FAKE_PRIV_ENC,
        keyStatus: "issued",
    },

    // Ospedali
    {
        uid: "HOSP-01",
        role: "HOSP",
        username: "hosp1",
        password: "hosp1pass",
        displayName: "Ospedale San Luca",
        publicKey: FAKE_PUB,
        privateKeyEnc: FAKE_PRIV_ENC,
        keyStatus: "issued",
    },
    {
        uid: "HOSP-02",
        role: "HOSP",
        username: "hosp2",
        password: "hosp2pass",
        displayName: "Policlinico Nord",
        publicKey: FAKE_PUB,
        privateKeyEnc: FAKE_PRIV_ENC,
        keyStatus: "issued",
    },
];
