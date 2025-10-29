# Backend – APS (Flask + Crypto)

Sistema demo per l’emissione, condivisione e apertura di **referti cifrati** tra attori sanitari (LAB, PAT, HOSP, DOC).
Cripto ibrida **AES-256-GCM + RSA-OAEP**, firma **RSA-PSS**; ledger append-only in **NDJSON**.

## Requisiti

* **Python 3.10+** (consigliato 3.11/3.12)
* **pip** e **venv**
* Sistema: Windows, macOS o Linux

Dipendenze principali: `Flask`, `flask-cors`, `cryptography`, `Werkzeug` (in `requirements.txt`).

## Struttura del progetto

```
backend/
├─ app.py                 # API Flask (porta 8000)
├─ requirements.txt
├─ apscrypto/             # libreria crittografica locale
│  ├─ __init__.py         # re-export helper
│  ├─ digest.py           # sha256_bytes
│  ├─ hybrid.py           # AES-GCM + RSA-OAEP (wrap/unwrap)
│  ├─ keys.py             # generazione/caricamento PEM
│  ├─ sign.py             # firma/verifica RSA-PSS
│  └─ utils.py            # b64, json (dumps/loads compatti)
├─ ca.py                  # CA fittizia + CRL (file json)
├─ ledger.py              # ledger append-only (jsonl)
├─ keys/                  # PEM generati (auto)
├─ store.json             # “DB” applicativo (auto)
├─ ca_db.json             # “DB” CA (auto)
└─ ledger.jsonl           # eventi ledger (auto)
```

## Setup & avvio

### 1) Creazione ambiente

**Windows (PowerShell)**

```powershell
cd backend
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**Linux/macOS (bash/zsh)**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

> Se vedi `ModuleNotFoundError: No module named 'flask'`, non è attivo il venv o non hai installato i requirements.

### 2) Avvio server

**Windows**

```powershell
# dalla cartella backend, con venv attivo
python app.py
# (in alternativa: py app.py)
```

**Linux/macOS**

```bash
python app.py
```

Il backend espone su `http://127.0.0.1:8000` con **CORS** aperto su `/api/*`.

> Se la porta 8000 è occupata, chiudi il processo o cambia porta in fondo a `app.py`.

## Concetti rapidi

* **Cripto ibrida**

    * Simmetrica: **AES-256-GCM** su payload (`ciphertext`, `nonce`, `aad`)
    * Asimmetrica: **RSA-OAEP (SHA-256)** per incapsulare la chiave AES verso i destinatari (`ek_for`)
    * Firma **LAB** su `SHA256(ciphertext) || JSON(AAD)` con **RSA-PSS (SHA-256)**
* **Ledger** (`ledger.jsonl`)
  Append-only in NDJSON, ogni riga è un evento (PUBLISH/UPDATE/REVOKE/GRANT) con `txId = SHA256(evento_serializzato)`.
* **CA fittizia** (`ca.py`)
  Emissione/revoca **non X.509**, ma sufficiente a simulare **CRL** e status di un attore.
* **Store** (`store.json`)
  Contiene envelope cifrati e anagrafiche utenti demo.

## Endpoints principali

### Chiavi / CA

* `POST /api/keys/init` → genera PEM per attori (lista opzionale `actors: []`)
* `GET  /api/keys/pub/<actor_id>` → restituisce PEM pubblico
* `POST /api/ca/enroll` `{ actorId }` → “certifica” una chiave
* `POST /api/ca/revoke` `{ actorId }` → revoca in CRL
* `GET  /api/ca/status/<actor_id>`

### Auth (demo, password hash)

* `POST /api/auth/register` `{ username, password, role?, name?, email? }`
* `POST /api/auth/login` `{ username, password }`

### LAB – referti

* `POST /api/lab/emit`
  Richiede: `reportId`, `labId`, `patientRef`, `content` (+ opz: `examType`, `resultShort`, `note`, `contentIsBase64`)
  Salva envelope, pubblica `PUBLISH_REPORT` su ledger, produce firma `sig_lab`.
* `POST /api/lab/revoke` `{ reportId, labId }` → `REVOKE_REPORT` (solo report corrente)
* `POST /api/lab/update` `{ oldReportId, newReportId, labId, envelope }` → `UPDATE_REPORT`

### PAT – condivisione / revoca applicativa

* `POST /api/patient/share` `{ reportId, patientId, hospitalId }`
  Genera **GRANT** (re-wrap AES verso HOSP/DOC, firma PAT).
* `POST /api/patient/unshare` `{ reportId, patientId, hospitalId }`
  Revoca “soft” lato app: blocca nuove aperture per quel destinatario sul **report corrente**.

### HOSP/DOC – apertura

* `POST /api/hosp/open` `{ reportId, hospitalId }`
  Risolve versione **corrente**, verifica ledger, firma LAB, CRL, revoche applicative; decifra (via `ek_for` o ultimo **GRANT**) e restituisce `contentB64`.

### SD (simulazione metrica)

* `POST /api/sd/verify`
  Input: `{ reportId, hospitalId, subsetKeys, proof }`
  Regola demo: `proof == sha256( aes_key || "|" || joined_subsetKeys )`.
* `POST /api/sd/proof_demo` → calcola il `proof` atteso per test locali.

### Metriche e debug

* `GET /api/metrics` → tempi (avg/p50/p95/max), dimensioni referti (plain/cipher)
* `GET /api/report/state/<report_id>` → stato ledger (VALID/UPDATED/REVOKED/UNKNOWN)
* `GET /api/report/grants/<report_id>` → lista GRANT
* `GET /api/report/revoked/<report_id>` → destinatari revocati lato app
* `GET /api/debug/envelopes` | `/api/debug/actors` | `/api/debug/ledgerview`
* `POST /api/dev/seed` → crea utenti demo e 3 referti (comodo per test)

## Flusso demo

1. **Seed di dati**

```bash
http POST :8000/api/dev/seed
# Risposta: { users: { pat, lab, hosp, doc }, seeded: [...] }
```

Annota gli ID restituiti, es:
`PAT = "PAT-AB12CD"`, `LAB = "LAB-34EF56"`, `HOSP = "HOSP-7890AB"`

2. **Emissione referto (se vuoi crearne un altro)**

```bash
http POST :8000/api/lab/emit \
  reportId=R-0009 labId==$LAB patientRef==$PAT \
  examType="RX Torace" resultShort="Normale" note="-" \
  content="Testo del referto di esempio"
```

3. **Condivisione dal paziente verso ospedale**

```bash
http POST :8000/api/patient/share \
  reportId=R-0009 patientId==$PAT hospitalId==$HOSP
```

4. **Apertura come HOSP (decifra e ottieni base64)**

```bash
http POST :8000/api/hosp/open reportId=R-0009 hospitalId==$HOSP
# Risposta: { ok: true, contentB64: "..." }
```

Per vedere il testo:

```python
# piccolo helper Python
import base64; print(base64.b64decode("PASTE_CONTENT_B64").decode("utf-8"))
```

5. **Verifica SD (simulata)**

```bash
# ottieni il proof atteso
http POST :8000/api/sd/proof_demo reportId=R-0009 hospitalId==$HOSP subsetKeys:='["hemoglobin","rbc"]'
# poi verifica
http POST :8000/api/sd/verify reportId=R-0009 hospitalId==$HOSP subsetKeys:='["hemoglobin","rbc"]' proof==<hex>
```

6. **Metriche**

```bash
http :8000/api/metrics
```

## Esempi cURL equivalenti

```bash
curl -X POST http://127.0.0.1:8000/api/dev/seed

curl -X POST http://127.0.0.1:8000/api/lab/emit \
  -H "Content-Type: application/json" \
  -d '{"reportId":"R-0010","labId":"LAB-01","patientRef":"PAT-123","content":"Referto demo"}'

curl -X POST http://127.0.0.1:8000/api/patient/share \
  -H "Content-Type: application/json" \
  -d '{"reportId":"R-0010","patientId":"PAT-123","hospitalId":"HOSP-01"}'

curl -X POST http://127.0.0.1:8000/api/hosp/open \
  -H "Content-Type: application/json" \
  -d '{"reportId":"R-0010","hospitalId":"HOSP-01"}'
```

## Note su sicurezza (demo)

* **Password** utenti salvate con `Werkzeug` hash; non c’è sessione/JWT (demo).
* **CORS** aperto: solo per sviluppo locale.
* **CA/CRL** sono simulati; nessun certificato X.509 reale.
* **Chiavi RSA** generate e salvate in `backend/keys/*.pem`.
  Non committare PEM e file `store.json`, `ca_db.json`, `ledger.jsonl`.

## Reset ambiente di sviluppo

Per “ripulire” lo stato:

```
# a server fermo
rm -f backend/store.json backend/ca_db.json backend/ledger.jsonl
rm -rf backend/keys/
```

> Su Windows: elimina i file/cartelle corrispondenti da Esplora File.

## Integrazione con il frontend (proxy Vite)

Assicurati che il frontend usi un **proxy** verso `http://127.0.0.1:8000` per `/api`:

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

## Troubleshooting

* **`ModuleNotFoundError: No module named 'flask'`**
  Attiva il venv e `pip install -r requirements.txt`.
* **Windows: esecuzione script bloccata**
  In PowerShell admin: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
* **Porta 8000 occupata**
  Chiudi il processo o modifica `app.run(..., port=8000)` in `app.py`.
* **`cryptography` non si installa**
  Usa Python recente (3.11/3.12) e pip aggiornato: `python -m pip install --upgrade pip`.

## Licenza

Solo uso didattico/dimostrativo.

---
