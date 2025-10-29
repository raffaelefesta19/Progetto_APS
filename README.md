# Progetto_APS

Sistema demo **end-to-end** per lo scambio sicuro di **referti sanitari** tra attori (LAB, PAT, HOSP, DOC) con:

* **Backend**: API Flask (Python) con crittografia ibrida **AES-256-GCM + RSA-OAEP**, firme **RSA-PSS**, CA/CRL fittizia e **ledger** append-only (NDJSON).
* **Frontend**: React + TypeScript + Vite, proxy verso il backend su `/api`.

> ⚠️ Progetto didattico.

---
## 📽️ Demo (inline)

<p align="center">
  <img src="media/1.gif" width="720" alt="Demo 1 – flusso principale" />
</p>

<p align="center">
  <img src="media/2.gif" width="720" alt="Demo 2 – condivisione e revoche" />
</p>

---

## Struttura repository

```
Progetto_APS/
├─ backend/            # API Flask, crypto, ledger, CA (leggi backend/README)
├─ progetto_aps/       # Frontend React + Vite (leggi progetto_aps/README)
└─ README.md           # questo file
```

---

## Requisiti

* **Backend**

    * Python **3.10+** (consigliato 3.11/3.12)
    * `pip`, `venv`

* **Frontend**

    * Node.js **≥ 18 LTS**
    * `npm` (o `pnpm`/`yarn` se preferisci)

---

## Avvio rapido (2 terminali)

### 1) Backend (porta 8000)

```bash
cd backend
python -m venv .venv
# Linux/macOS
source .venv/bin/activate
# Windows (PowerShell)
# . .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

**Opzionale (dati demo):**

```bash
# in un altro terminale
curl -X POST http://127.0.0.1:8000/api/dev/seed
```

### 2) Frontend (porta 5173)

```bash
cd progetto_aps
npm install
npm run dev
```

Apri: `http://127.0.0.1:5173`

> Il proxy Vite reindirizza `/api` → `http://127.0.0.1:8000`.
> Controlla in `progetto_aps/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
            }
        }
    }
})
```

---

## Funzionalità (panoramica)

* **Emissione referti (LAB)**: cifra il contenuto con AES-GCM, incapsula la chiave con RSA-OAEP, firma il binding `H(ct)||AAD`, registra evento su **ledger**.
* **Condivisione (PAT)**: genera **GRANT** (re-wrap AES al destinatario) con firma del paziente.
* **Apertura (HOSP/DOC)**: verifica stato ledger/CRL/firme, risolve versione **corrente**, controlla revoche applicative, decifra e consegna il referto (base64).
* **Aggiornamento/Revoca (LAB)**: `UPDATE_REPORT` / `REVOKE_REPORT` su ledger.
* **Metriche**: tempi (avg/p50/p95), dimensioni plaintext/ciphertext per report, conteggio richieste.

---

## API (snapshot veloce)

| Metodo | Endpoint               | Descrizione                                           |
| ------ | ---------------------- | ----------------------------------------------------- |
| POST   | `/api/lab/emit`        | Emissione referto cifrato + firma + publish su ledger |
| POST   | `/api/lab/update`      | Nuova versione di un referto (current → new)          |
| POST   | `/api/lab/revoke`      | Revoca report **corrente**                            |
| POST   | `/api/patient/share`   | Condivisione (GRANT) verso HOSP/DOC                   |
| POST   | `/api/patient/unshare` | Revoca “soft” lato paziente (blocca aperture future)  |
| POST   | `/api/hosp/open`       | Apertura/decifrazione per HOSP/DOC                    |
| GET    | `/api/metrics`         | Statistiche e metriche runtime                        |
| POST   | `/api/dev/seed`        | Dati demo (pat/lab/hosp/doc + 3 referti)              |

> Dettagli completi negli specifici README: **backend/README** e **progetto_aps/README**.

---

## Roadmap / Work Packages (bozza)

* **WP1 – Analisi & Threat Model**: attori, casi d’uso, requisiti di sicurezza, flussi (PAT/LAB/HOSP/DOC).
* **WP2 – Implementazione Sicurezza**: crypto ibrida, firma/binding, CA/CRL fittizia, ledger NDJSON, policy revoche.
* **WP3 – Frontend & Metriche**: UI demo, integrazione API, pannello metriche, script/semi-automazioni.

---

## Licenza

Uso **didattico/dimostrativo**. Nessuna garanzia.
© Raffaele Festa.
