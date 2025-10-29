# APS Referti — Frontend (React + TypeScript + Vite)

Interfaccia web per la demo di **emissione, condivisione e consultazione** dei referti tra **LAB, PAT, HOSP e DOC**.
Il frontend parla con il backend Flask tramite le rotte `"/api/..."` (proxy Vite già configurato).

## Requisiti

* **Node.js ≥ 18** (consigliato 20)
* **npm** (o pnpm/yarn)
* Backend in esecuzione con le rotte `"/api"` (in dev è previsto su **[http://127.0.0.1:8000](http://127.0.0.1:8000)**)

> In sviluppo, **non serve CORS**: Vite inoltra `"/api"` verso `http://127.0.0.1:8000` (vedi `vite.config.ts`).

## Avvio rapido (dev)

```bash
# dentro la cartella frontend
npm ci        # oppure: npm install
npm run dev   # apre http://localhost:5173
```

Assicurati che il **backend** sia attivo sulla porta **8000** (coerente col proxy Vite).

## Build e preview

```bash
npm run build     # crea la build in dist/
npm run preview   # serve statico della build (per test locali)
```

## Script disponibili

* `npm run dev` — avvio sviluppo (HMR).
* `npm run build` — build produzione (Vite).
* `npm run preview` — server di anteprima dalla cartella `dist/`.
* `npm run lint` — lint (se configurato).
* `npm run typecheck` — type-check TypeScript (se configurato).

## Configurazione API

In questo progetto il client usa **`/api` fisso** (vedi `src/lib/api.ts`) e si affida al **proxy** di Vite:

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

Se preferisci un **BASE URL** via `.env`, puoi adattare `src/lib/api.ts` a leggere `import.meta.env.VITE_API_BASE_URL` e impostare ad es.:

```
# .env.local
VITE_API_BASE_URL=http://localhost:8000
```

> Se **disabiliti il proxy** e usi un base URL, abilita CORS nel backend per `"/api/*"`.

## Struttura principale

```
src/
├─ auth/                 # contesto auth (login/register, storage utente)
├─ components/
│  ├─ layout/            # PublicLayout, RoleLayout, shell
│  └─ ui/                # liste, pulsanti, badge, ecc.
├─ dev/seedDemo.ts       # seed demo DEV (chiama /api/dev/seed)
├─ lib/api.ts            # wrapper fetch (GET/POST) verso /api
├─ pages/                # viste: Login, Register, Patient, Hospital, Lab, Ledger, Metrics
├─ store/ReportsContext  # caricamento referti, stato ledger, grants, revoked, ecc.
├─ App.tsx               # router
├─ main.tsx              # bootstrap app + provider
└─ index.css             # stili di base (classi utility e componenti)
```

## Rotte (UI) e ruoli

* `/login`, `/register` (schermate pubbliche)
* `/patient` (spazio paziente: condivisione e revoche)
* `/hospital` (acquisizione & validazione)
* `/lab` (console laboratorio: emissione, update, revoca)
* `/ledger` (snapshot ledger simulato)
* `/metrics` (metriche raccolte dal backend)

L’intestazione mostra **ruolo, UID e stato** utente (PAT, LAB, HOSP, DOC).

## Endpoint backend usati dalla UI (indicativi)

* **Auth**: `POST /api/auth/login`, `POST /api/auth/register`
* **Chiavi**: `POST /api/keys/init`
* **LAB**: `POST /api/lab/emit`, `POST /api/lab/update`, `POST /api/lab/revoke`
* **PAT**: `POST /api/patient/share`, `POST /api/patient/unshare`
* **HOSP/DOC**: `POST /api/hosp/open`
* **Ledger/State**:
  `GET /api/debug/envelopes`, `GET /api/debug/actors`,
  `GET /api/report/state/:reportId`,
  `GET /api/report/grants/:reportId`,
  `GET /api/report/revoked/:currentReportId`
* **Metrics**: `GET /api/metrics`
* **Seed demo (DEV)**: `POST /api/dev/seed`

> La UI ricarica e incrocia **envelopes + state + grants + revoked** per calcolare: versione corrente, accessi correnti/locali, stato (VALID/UPDATED/REVOKED) e badge “attuale”.

## Dati demo e credenziali

In modalità **DEV** (`import.meta.env.DEV`), all’avvio viene chiamato `ensureDemoUsers()` che prova a eseguire il seed via `POST /api/dev/seed`.
Le credenziali demo mostrate nella UI sono:

* **Paziente**: `pat1 / pat1pass`
* **Laboratorio**: `lab1 / lab1pass`
* **Ospedale**: `hosp1 / hosp1pass`
* **Medico**: puoi registrarlo da **Register** con ruolo **DOC** (es. `doc1 / doc1pass`) se il seed non lo crea.

## Troubleshooting

* **“vite non è riconosciuto”** → esegui `npm ci`/`npm install` nella cartella corretta; verifica che **Node** sia in PATH. In alternativa: `npx vite`.
* **Backend non raggiungibile** → controlla che sia attivo su `127.0.0.1:8000` (coerente col proxy). La UI mostra errori chiari in caso di chiamate fallite.
* **404 su route client in produzione** → configura il server a fare fallback su `index.html` (o valuta `HashRouter`).
* **CORS** → solo se disattivi il proxy e usi un base URL esterno: abilita CORS nel backend per `"/api/*"`.

---

**Licenza**: uso didattico/dimostrativo.
