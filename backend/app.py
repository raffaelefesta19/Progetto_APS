import json
import pathlib
import secrets
import time
from datetime import datetime, timezone
from typing import Any, Dict, Tuple, List, Optional

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

from apscrypto import (
    decrypt_envelope,
    encrypt_for_recipients,
    gen_rsa_keypair,
    load_private_pem,
    load_public_pem,
    save_private_pem,
    save_public_pem,
    sha256_bytes,
    sign_bytes,
    verify_signature,
)
from apscrypto.hybrid import _unwrap_key, _wrap_key
from apscrypto.utils import dumps, b64d
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from ledger import (
    publish_report,
    revoke_report,
    update_report,
    grant_access,
    state_of,
    lookup_grants,
    lookup_grants_for_report,
    get_publish,
)

from ca import enroll as ca_enroll, revoke as ca_revoke, get_cert, in_crl

APP_DIR = pathlib.Path(__file__).parent
DATA = APP_DIR / "store.json"
KEYS_DIR = APP_DIR / "keys"
KEYS_DIR.mkdir(exist_ok=True)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# -------------------- DB helpers --------------------

def load_db() -> Dict[str, Any]:
    if DATA.exists():
        try:
            return json.loads(DATA.read_text(encoding="utf-8"))
        except Exception:
            pass
    # envelopes: reportId → envelope
    # actors: username → { uid, role, ... }
    # revoked: currentReportId → [destinatari revocati dal paziente]
    return {"envelopes": {}, "actors": {}, "revoked": {}}

def save_db(db: Dict[str, Any]):
    DATA.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")

def _key_paths(actor_id: str) -> Tuple[pathlib.Path, pathlib.Path]:
    return KEYS_DIR / f"{actor_id}_priv.pem", KEYS_DIR / f"{actor_id}_pub.pem"

def ensure_actor_keys(actor_id: str):
    ppriv, ppub = _key_paths(actor_id)
    if not ppriv.exists() or not ppub.exists():
        priv, pub = gen_rsa_keypair()
        save_private_pem(priv, str(ppriv))
        save_public_pem(pub, str(ppub))

def _read_pub_pem(actor_id: str) -> str:
    ensure_actor_keys(actor_id)
    _, ppub = _key_paths(actor_id)
    return ppub.read_text(encoding="utf-8")

def _normalize_role(role: str) -> str:
    role = (role or "").upper()
    return role if role in ("PAT", "LAB", "HOSP", "DOC") else "PAT"

def _rand_uid(role: str) -> str:
    return f"{_normalize_role(role)}-{secrets.token_hex(3).upper()}"

def get_json_body() -> Dict[str, Any]:
    if request.is_json:
        obj = request.get_json(silent=True)
        if isinstance(obj, dict):
            return obj
    if request.form:
        return dict(request.form)
    return {}

def require_fields(body: Dict[str, Any], fields: Tuple[str, ...]) -> Tuple[bool, str]:
    missing = [f for f in fields if (body.get(f) is None or str(body.get(f)).strip() == "")]
    if missing:
        return False, f"campi mancanti: {', '.join(missing)}"
    return True, ""

def _effective_report_id(report_id: str) -> str:
    """Restituisce l'ID corrente dopo eventuali UPDATE su ledger."""
    st = state_of(report_id)
    return st.get("currentReportId", report_id)

def _revoked_for(db: Dict[str, Any], report_id: str) -> set:
    """Insieme dei destinatari revocati (revoca applicativa) per il report corrente."""
    rmap = db.get("revoked") or {}
    return set(rmap.get(report_id) or [])

# ========== METRICS: struttura, decorator e util ==========

METRICS: Dict[str, Any] = {
    "requests": {},                 # route_key -> [ms...]
    "generate_latency_ms": [],      # tempi di generazione (LAB emit)
    "verify_latency_ms": [],        # tempi verifica SD
    "report_size_plain": {},        # reportId -> bytes (plaintext)
    "report_size_cipher": {},       # reportId -> bytes (ciphertext)
}

def _record_request_latency(key: str, ms: float):
    METRICS["requests"].setdefault(key, [])
    METRICS["requests"][key].append(ms)

def _percentile(vals: List[float], p: float) -> Optional[float]:
    if not vals: return None
    s = sorted(vals)
    k = (len(s)-1) * p
    f = int(k); c = min(f+1, len(s)-1)
    if f == c: return s[f]
    return s[f] + (s[c]-s[f])*(k-f)

def _agg(vals: List[float]) -> Dict[str, Any]:
    if not vals:
        return {"count": 0, "avg_ms": None, "p50_ms": None, "p95_ms": None, "max_ms": None}
    return {
        "count": len(vals),
        "avg_ms": sum(vals)/len(vals),
        "p50_ms": _percentile(vals, 0.50),
        "p95_ms": _percentile(vals, 0.95),
        "max_ms": max(vals),
    }

def measure(route_key: str):
    def deco(fn):
        def wrapper(*a, **kw):
            t0 = time.perf_counter()
            try:
                return fn(*a, **kw)
            finally:
                dt = (time.perf_counter() - t0) * 1000.0
                _record_request_latency(route_key, dt)
        wrapper.__name__ = fn.__name__
        return wrapper
    return deco

# ---------------------------------------------------------

# -------------------- KEYS / CA --------------------

@app.post("/api/keys/init")
@measure("/api/keys/init")
def keys_init():
    body = get_json_body()
    actors = body.get("actors") or ["LAB-01", "PAT-123", "HOSP-01"]
    if not isinstance(actors, list):
        return jsonify({"ok": False, "error": "actors deve essere lista"}), 400
    for a in actors:
        if isinstance(a, str) and a.strip():
            ensure_actor_keys(a.strip())
    return jsonify({"ok": True, "generated": actors})

@app.get("/api/keys/pub/<actor_id>")
@measure("/api/keys/pub")
def get_pub(actor_id: str):
    pem = _read_pub_pem(actor_id)
    return (pem, 200, {"Content-Type": "text/plain; charset=utf-8"})

@app.post("/api/ca/enroll")
@measure("/api/ca/enroll")
def ca_enroll_ep():
    b = get_json_body()
    ok, msg = require_fields(b, ("actorId",))
    if not ok: return jsonify({"ok": False, "error": msg}), 400
    pem = _read_pub_pem(b["actorId"])
    cert = ca_enroll(b["actorId"], pem)
    return jsonify({"ok": True, "cert": cert})

@app.post("/api/ca/revoke")
@measure("/api/ca/revoke")
def ca_revoke_ep():
    b = get_json_body()
    ok, msg = require_fields(b, ("actorId",))
    if not ok: return jsonify({"ok": False, "error": msg}), 400
    ca_revoke(b["actorId"])
    return jsonify({"ok": True})

@app.get("/api/ca/status/<actor_id>")
@measure("/api/ca/status")
def ca_status(actor_id: str):
    return jsonify({"ok": True, "cert": get_cert(actor_id), "revoked": in_crl(actor_id)})

# -------------------- AUTH --------------------

@app.post("/api/auth/register")
@measure("/api/auth/register")
def auth_register():
    db = load_db()
    b = get_json_body()
    role = _normalize_role(str(b.get("role", "PAT")))
    username = str(b.get("username", "")).strip()
    name = str(b.get("name", "")).strip() or username or "Utente"
    email = str(b.get("email", "")).strip()
    password = str(b.get("password", "")).strip()

    ok, msg = require_fields(b, ("username", "password"))
    if not ok:
        return jsonify({"ok": False, "error": msg}), 400

    # Idempotente: se l'utente esiste già, ritorniamo 200 con alreadyExists
    if username in db["actors"]:
        rec = db["actors"][username]
        return jsonify({
            "ok": True,
            "alreadyExists": True,
            "user": {
                "uid": rec["uid"],
                "role": rec["role"],
                "displayName": rec["displayName"],
                "hasKeys": True,
            },
        }), 200

    uid = _rand_uid(role)
    ensure_actor_keys(uid)

    db["actors"][username] = {
        "uid": uid,
        "role": role,
        "displayName": name,
        "email": email,
        "password": generate_password_hash(password),
        "hasKeys": True,
    }
    save_db(db)

    return jsonify({"ok": True, "user": {"uid": uid, "role": role, "displayName": name, "hasKeys": True}}), 200

@app.post("/api/auth/login")
@measure("/api/auth/login")
def auth_login():
    db = load_db()
    b = get_json_body()
    ok, msg = require_fields(b, ("username", "password"))
    if not ok:
        return jsonify({"ok": False, "error": msg}), 400

    username = str(b.get("username", "")).strip()
    password = str(b.get("password", "")).strip()

    rec = db["actors"].get(username)
    if not rec or not check_password_hash(rec.get("password",""), password):
        return jsonify({"ok": False, "error": "Credenziali errate"}), 401

    uid = rec["uid"]
    ensure_actor_keys(uid)

    return jsonify({
        "ok": True,
        "user": {
            "uid": uid,
            "role": rec["role"],
            "displayName": rec["displayName"],
            "hasKeys": True,
        },
    })

# -------------------- LAB EMIT / REVOKE / UPDATE --------------------

@app.post("/api/lab/emit")
@measure("/api/lab/emit")
def lab_emit():
    db = load_db()
    b = get_json_body()

    ok, msg = require_fields(b, ("reportId", "labId", "patientRef", "content"))
    if not ok:
        return jsonify({"ok": False, "error": msg}), 400

    report_id = str(b["reportId"]).strip()
    lab_id = str(b["labId"]).strip()
    patient = str(b["patientRef"]).strip()

    if b.get("contentIsBase64"):
        try:
            content = __import__("base64").b64decode(str(b["content"]))
        except Exception:
            return jsonify({"ok": False, "error": "content base64 non valido"}), 400
    else:
        content = str(b["content"]).encode("utf-8")

    issued_at = datetime.now(timezone.utc).isoformat()

    exam_type = str(b.get("examType", "")).strip()
    result_short = str(b.get("resultShort", "")).strip()
    note = str(b.get("note", "")).strip()

    ensure_actor_keys(lab_id)
    ensure_actor_keys(patient)
    lab_priv = load_private_pem(str(_key_paths(lab_id)[0]))
    pat_pub = load_public_pem(str(_key_paths(patient)[1]))

    aad = {
        "reportId": report_id,
        "labId": lab_id,
        "patientRef": patient,
        "issuedAt": issued_at,
    }
    if exam_type: aad["examType"] = exam_type
    if result_short: aad["resultShort"] = result_short
    if note: aad["note"] = note

    # ===== METRICS: misura latenza generazione (encrypt + sign) =====
    t0 = time.perf_counter()

    env = encrypt_for_recipients(
        plaintext=content,
        aad=aad,
        recipients={patient: pat_pub},
    )

    # Firma su H(ciphertext_bytes)||AAD
    ct_bytes = b64d(env["ciphertext"])
    h_ct = sha256_bytes(ct_bytes)
    tosig = h_ct + dumps(env["aad"]).encode("utf-8")
    env["sig_lab"] = sign_bytes(lab_priv, tosig)

    gen_ms = (time.perf_counter() - t0) * 1000.0
    METRICS["generate_latency_ms"].append(gen_ms)

    # ===== METRICS: dimensione referto (plaintext & ciphertext) =====
    METRICS["report_size_plain"][report_id] = len(content)
    METRICS["report_size_cipher"][report_id] = len(ct_bytes)

    # Persisti envelope e pubblica evento PUBLISH_REPORT
    db["envelopes"][report_id] = env
    save_db(db)

    hash_referto_hex = sha256_bytes(ct_bytes).hex()
    publish_report(
        reportId=report_id,
        labId=lab_id,
        patientRef=patient,
        hash_referto=hash_referto_hex,
        sig_lab=env["sig_lab"],
        issuedAt=issued_at,
    )

    return jsonify({"ok": True, "envelope": env, "metrics": {"generate_ms": gen_ms}})

@app.post("/api/lab/revoke")
@measure("/api/lab/revoke")
def lab_revoke():
    b = get_json_body()
    ok, msg = require_fields(b, ("reportId", "labId"))
    if not ok:
        return jsonify({"ok": False, "error": msg}), 400

    # CONSENTITO SOLO SUL REPORT CORRENTE
    st = state_of(b["reportId"])
    if st.get("currentReportId") != b["reportId"]:
        return jsonify({"ok": False, "error": "cannot revoke non-current report"}), 409
    if st.get("status") == "REVOKED":
        return jsonify({"ok": False, "error": "already revoked"}), 409

    ev = revoke_report(b["reportId"], b["labId"], b.get("reason",""))
    return jsonify({"ok": True, "event": ev})

@app.post("/api/lab/update")
@measure("/api/lab/update")
def lab_update():
    b = get_json_body()
    ok, msg = require_fields(b, ("oldReportId", "newReportId", "labId", "envelope"))
    if not ok:
        return jsonify({"ok": False, "error": msg}), 400

    # PERMETTI UPDATE SOLO DALLA VERSIONE CORRENTE
    st = state_of(b["oldReportId"])
    if st.get("currentReportId") != b["oldReportId"]:
        return jsonify({"ok": False, "error": "cannot update from a non-current report"}), 409
    if st.get("status") == "REVOKED":
        return jsonify({"ok": False, "error": "cannot update a revoked report"}), 409

    db = load_db()
    db["envelopes"][b["newReportId"]] = b["envelope"]
    save_db(db)

    # ===== METRICS: aggiorna size anche per nuova versione =====
    try:
        ct_bytes = b64d(b["envelope"]["ciphertext"])
        METRICS["report_size_cipher"][b["newReportId"]] = len(ct_bytes)
        # Se c'è contentIsBase64/cont. plaintext non lo abbiamo qui: solo ciphertext
    except Exception:
        pass

    ev = update_report(b["oldReportId"], b["newReportId"], b["labId"])
    return jsonify({"ok": True, "event": ev})

# -------------------- PATIENT SHARE / UNSHARE --------------------

@app.post("/api/patient/share")
@measure("/api/patient/share")
def patient_share():
    """Condivisione: GRANT firmato dal PAT sulla VERSIONE CORRENTE del referto."""
    db = load_db()
    b = get_json_body()
    ok, msg = require_fields(b, ("reportId", "patientId", "hospitalId"))
    if not ok:
        return jsonify({"ok": False, "error": msg}), 400

    rid_req = str(b["reportId"]).strip()
    pid = str(b["patientId"]).strip()
    hid = str(b["hospitalId"]).strip()

    # risolvi la versione corrente
    rid = _effective_report_id(rid_req)

    env = db["envelopes"].get(rid)
    if not env:
        return jsonify({"ok": False, "error": "report not found"}), 404

    ensure_actor_keys(pid)
    ensure_actor_keys(hid)
    pat_priv = load_private_pem(str(_key_paths(pid)[0]))
    hosp_pub = load_public_pem(str(_key_paths(hid)[1]))

    # unwrap della chiave del paziente sul CURRENT
    b64wrap = (env.get("ek_for") or {}).get(pid)
    if not b64wrap:
        return jsonify({"ok": False, "error": "no key for patient in envelope"}), 400

    try:
        aes_key = _unwrap_key(pat_priv, b64wrap)   # bytes
    except Exception as exc:
        return jsonify({"ok": False, "error": f"unwrap failed: {exc}"}), 400

    ek_h_b64 = _wrap_key(hosp_pub, aes_key)

    grant_obj = {
        "reportId": rid,
        "from": pid,
        "to": hid,
        "ek_to": ek_h_b64,
    }
    sig_pat = sign_bytes(pat_priv, dumps(grant_obj).encode("utf-8"))
    ev = grant_access(rid, pid, hid, ek_h_b64, sig_pat)

    # Se esisteva una revoca applicativa per questo destinatario sulla versione corrente, rimuovila
    revoked = db.get("revoked") or {}
    cur = set(revoked.get(rid) or [])
    if hid in cur:
        cur.discard(hid)
        revoked[rid] = sorted(cur)
        db["revoked"] = revoked
        save_db(db)

    return jsonify({"ok": True, "grant": ev, "currentReportId": rid})

@app.post("/api/patient/unshare")
@measure("/api/patient/unshare")
def patient_unshare():
    """Revoca 'soft' lato paziente: blocca nuove aperture per il destinatario su questo referto (versione corrente)."""
    db = load_db()
    b = get_json_body()
    ok, msg = require_fields(b, ("reportId", "patientId", "hospitalId"))
    if not ok:
        return jsonify({"ok": False, "error": msg}), 400

    rid_req = str(b["reportId"]).strip()
    pid = str(b["patientId"]).strip()
    hid = str(b["hospitalId"]).strip()

    rid = _effective_report_id(rid_req)
    env = db["envelopes"].get(rid)
    if not env:
        return jsonify({"ok": False, "error": "report not found"}), 404

    # Controllo ownership
    aad = env.get("aad") or {}
    if str(aad.get("patientRef")) != pid:
        return jsonify({"ok": False, "error": "not owner"}), 403

    # Registra revoca applicativa
    revoked = db.get("revoked") or {}
    lst = set(revoked.get(rid) or [])
    lst.add(hid)
    revoked[rid] = sorted(lst)
    db["revoked"] = revoked
    save_db(db)

    return jsonify({"ok": True, "revokedFor": rid, "target": hid})

# -------------------- HOSP/DOC OPEN --------------------

@app.post("/api/hosp/open")
@measure("/api/hosp/open")
def hosp_open():
    db = load_db()
    b = get_json_body()
    # labId NON serve più: lo ricaviamo e verifichiamo dall'AAD e dal ledger
    ok, msg = require_fields(b, ("reportId", "hospitalId"))
    if not ok:
        return jsonify({"ok": False, "error": msg}), 400

    rid = str(b["reportId"]).strip()
    hid = str(b["hospitalId"]).strip()

    # Stato ledger: indirizza sempre alla versione corrente
    st = state_of(rid)
    if st["status"] in ("REVOKED", "UNKNOWN"):
        return jsonify({"ok": False, "error": f"report state {st['status']}"}), 409
    rid_effective = st["currentReportId"]

    # Enforcement revoca applicativa del paziente sulla versione corrente
    if hid in _revoked_for(db, rid_effective):
        return jsonify({"ok": False, "error": "access revoked by patient"}), 403

    # Envelope corrente
    env = db["envelopes"].get(rid_effective)
    if not env:
        return jsonify({"ok": False, "error": "report not found"}), 404

    aad = env.get("aad") or {}
    lab_id = str(aad.get("labId") or "").strip()
    patient_ref = str(aad.get("patientRef") or "").strip()
    if not lab_id or not patient_ref:
        return jsonify({"ok": False, "error": "invalid envelope (missing AAD fields)"}), 400

    # (Opzionale) verifica CA/CRL del LAB
    if in_crl(lab_id):
        return jsonify({"ok": False, "error": "lab certificate revoked (CRL)"}), 403

    # Verifica coerenza con ledger (hash + binding lab/patient)
    ct_bytes = b64d(env["ciphertext"])
    h_ct_hex = sha256_bytes(ct_bytes).hex()

    pub_ev = get_publish(rid_effective)
    if not pub_ev:
        return jsonify({"ok": False, "error": "publish event not found on ledger"}), 400

    if str(pub_ev.get("hash")) != h_ct_hex:
        return jsonify({"ok": False, "error": "ledger hash mismatch"}), 400
    if str(pub_ev.get("labId")) != lab_id:
        return jsonify({"ok": False, "error": "ledger/labId mismatch"}), 400
    if str(pub_ev.get("patientRef")) != patient_ref:
        return jsonify({"ok": False, "error": "ledger/patientRef mismatch"}), 400

    # Verifica firma del LAB su H(ct)||AAD
    ensure_actor_keys(lab_id)  # chiavi già presenti se il LAB ha emesso
    lab_pub = load_public_pem(str(_key_paths(lab_id)[1]))
    tover = sha256_bytes(ct_bytes) + dumps(aad).encode("utf-8")
    if not verify_signature(lab_pub, tover, env.get("sig_lab", "")):
        return jsonify({"ok": False, "error": "invalid lab signature"}), 400

    # Decrittazione: prima prova con chiave incapsulata direttamente nell’envelope (se mai presente);
    # in alternativa usa l’ultimo GRANT valido sul current.
    ensure_actor_keys(hid)
    hosp_priv = load_private_pem(str(_key_paths(hid)[0]))

    b64wrap = (env.get("ek_for") or {}).get(hid)
    if not b64wrap:
        # Nessuna chiave diretta per HOSP/DOC → cerca GRANT correnti
        grants = lookup_grants(rid_effective, hid)
        if not grants:
            return jsonify({"ok": False, "error": "no grant for hospital"}), 403
        last = grants[-1]
        patId = last.get("from")
        # Verifica firma PAT sul GRANT
        ensure_actor_keys(patId)
        from apscrypto.utils import dumps as _dumps  # evita shadowing
        pat_pub = load_public_pem(str(_key_paths(patId)[1]))
        grant_content = {
            "reportId": last["reportId"],
            "from": patId,
            "to": hid,
            "ek_to": last["ek_to"],
        }
        if not verify_signature(pat_pub, _dumps(grant_content).encode("utf-8"), last["sig_pat"]):
            return jsonify({"ok": False, "error": "invalid grant signature"}), 400
        b64wrap = last["ek_to"]

    # Decifra
    try:
        aes_key = _unwrap_key(hosp_priv, b64wrap)
        aesgcm = AESGCM(aes_key)
        nonce = b64d(env["nonce"])
        aad_bytes = dumps(aad).encode("utf-8")
        ct = b64d(env["ciphertext"])
        pt = aesgcm.decrypt(nonce, ct, aad_bytes)
    except Exception as exc:
        return jsonify({"ok": False, "error": f"decrypt failed: {exc}"}), 400

    b64 = __import__("base64").b64encode(pt).decode("ascii")
    return jsonify({"ok": True, "contentB64": b64, "reportId": rid_effective, "state": st["status"]})

# -------------------- SD VERIFY (simulata per metriche) --------------------

def _resolve_aes_key_for_hospital(report_id: str, hospital_id: str) -> Tuple[bool, Optional[bytes], str]:
    """Risolvi l'AES key per un HOSP sulla versione corrente, come in /hosp/open (senza decrittare)."""
    db = load_db()
    st = state_of(report_id)
    if st["status"] in ("REVOKED", "UNKNOWN"):
        return False, None, f"report state {st['status']}"
    rid = st["currentReportId"]
    if hospital_id in _revoked_for(db, rid):
        return False, None, "access revoked by patient"

    env = db["envelopes"].get(rid)
    if not env:
        return False, None, "report not found"

    aad = env.get("aad") or {}
    lab_id = str(aad.get("labId") or "").strip()
    patient_ref = str(aad.get("patientRef") or "").strip()
    if not lab_id or not patient_ref:
        return False, None, "invalid envelope (AAD)"

    # verify ledger hash + bindings (come sopra)
    ct_bytes = b64d(env["ciphertext"])
    h_ct_hex = sha256_bytes(ct_bytes).hex()
    pub_ev = get_publish(rid)
    if not pub_ev or str(pub_ev.get("hash")) != h_ct_hex or str(pub_ev.get("labId")) != lab_id or str(pub_ev.get("patientRef")) != patient_ref:
        return False, None, "ledger mismatch"

    ensure_actor_keys(hospital_id)
    hosp_priv = load_private_pem(str(_key_paths(hospital_id)[0]))

    b64wrap = (env.get("ek_for") or {}).get(hospital_id)
    if not b64wrap:
        grants = lookup_grants(rid, hospital_id)
        if not grants:
            return False, None, "no grant for hospital"
        last = grants[-1]
        patId = last.get("from")
        ensure_actor_keys(patId)
        from apscrypto.utils import dumps as _dumps
        pat_pub = load_public_pem(str(_key_paths(patId)[1]))
        grant_content = {
            "reportId": last["reportId"],
            "from": patId,
            "to": hospital_id,
            "ek_to": last["ek_to"],
        }
        if not verify_signature(pat_pub, _dumps(grant_content).encode("utf-8"), last["sig_pat"]):
            return False, None, "invalid grant signature"
        b64wrap = last["ek_to"]

    try:
        aes_key = _unwrap_key(hosp_priv, b64wrap)  # bytes
        return True, aes_key, ""
    except Exception as exc:
        return False, None, f"unwrap failed: {exc}"

@app.post("/api/sd/verify")
@measure("/api/sd/verify")
def sd_verify():
    """
    Verifica SD simulata per metriche.
    Input: { "reportId": str, "hospitalId": str, "subsetKeys": [..], "proof": "hex" }
    Regola demo: proof == sha256( aes_key || b"|" || ",".join(sorted(subsetKeys)) )
    """
    b = get_json_body()
    ok, msg = require_fields(b, ("reportId", "hospitalId", "subsetKeys", "proof"))
    if not ok:
        return jsonify({"ok": False, "error": msg}), 400

    report_id = str(b["reportId"]).strip()
    hospital_id = str(b["hospitalId"]).strip()
    subset = list(map(str, b.get("subsetKeys") or []))
    proof = str(b.get("proof") or "").strip().lower()

    t0 = time.perf_counter()
    ok_r, aes_key, err = _resolve_aes_key_for_hospital(report_id, hospital_id)
    if not ok_r:
        return jsonify({"ok": False, "error": err}), 403

    expected_hex = sha256_bytes(aes_key + b"|" + ",".join(sorted(subset)).encode("utf-8")).hex()
    valid = (expected_hex == proof)
    dt_ms = (time.perf_counter() - t0) * 1000.0
    METRICS["verify_latency_ms"].append(dt_ms)

    return jsonify({"ok": bool(valid), "latency_ms": dt_ms})

# (OPZIONALE – solo per demo locale) genera il proof atteso per test veloci
@app.post("/api/sd/proof_demo")
@measure("/api/sd/proof_demo")
def sd_proof_demo():
    b = get_json_body()
    ok, msg = require_fields(b, ("reportId", "hospitalId", "subsetKeys"))
    if not ok:
        return jsonify({"ok": False, "error": msg}), 400
    ok_r, aes_key, err = _resolve_aes_key_for_hospital(str(b["reportId"]).strip(), str(b["hospitalId"]).strip())
    if not ok_r:
        return jsonify({"ok": False, "error": err}), 403
    subset = list(map(str, b.get("subsetKeys") or []))
    expected_hex = sha256_bytes(aes_key + b"|" + ",".join(sorted(subset)).encode("utf-8")).hex()
    return jsonify({"ok": True, "proof": expected_hex})

# -------------------- METRICS endpoint --------------------

@app.get("/api/metrics")
@measure("/api/metrics")
def metrics():
    reqs = {k: _agg(v) for k, v in METRICS["requests"].items()}
    gen = _agg(METRICS["generate_latency_ms"])
    ver = _agg(METRICS["verify_latency_ms"])

    plain_sizes = list(METRICS["report_size_plain"].values())
    cipher_sizes = list(METRICS["report_size_cipher"].values())
    size_plain_stats = None
    size_cipher_stats = None
    if plain_sizes:
        size_plain_stats = {
            "count": len(plain_sizes),
            "avg_bytes": sum(plain_sizes)/len(plain_sizes),
            "min_bytes": min(plain_sizes),
            "max_bytes": max(plain_sizes),
        }
    if cipher_sizes:
        size_cipher_stats = {
            "count": len(cipher_sizes),
            "avg_bytes": sum(cipher_sizes)/len(cipher_sizes),
            "min_bytes": min(cipher_sizes),
            "max_bytes": max(cipher_sizes),
        }

    return jsonify({
        "ok": True,
        "requests": reqs,
        "generate_latency_ms": gen,
        "verify_latency_ms": ver,
        "report_size_bytes": {
            "plaintext": {
                "overall": size_plain_stats,
                "by_report": [{"reportId": k, "bytes": v} for k, v in METRICS["report_size_plain"].items()]
            },
            "ciphertext": {
                "overall": size_cipher_stats,
                "by_report": [{"reportId": k, "bytes": v} for k, v in METRICS["report_size_cipher"].items()]
            }
        }
    })

# -------------------- REPORT STATE / DEBUG --------------------

@app.get("/api/report/state/<report_id>")
@measure("/api/report/state")
def report_state(report_id: str):
    return jsonify({"ok": True, **state_of(report_id)})

@app.get("/api/report/grants/<report_id>")
@measure("/api/report/grants")
def report_grants(report_id: str):
    items = []
    try:
        grants = lookup_grants_for_report(report_id)
        for g in grants:
            items.append({
                "reportId": g.get("reportId"),
                "from": g.get("from"),
                "to": g.get("to"),
                "ts": g.get("ts"),
            })
        return jsonify({"ok": True, "items": items})
    except Exception as exc:
        return jsonify({"ok": False, "error": f"{exc}"}), 500

@app.get("/api/report/revoked/<report_id>")
@measure("/api/report/revoked")
def report_revoked(report_id: str):
    db = load_db()
    rid = _effective_report_id(report_id)
    items = sorted(list(_revoked_for(db, rid)))
    return jsonify({"ok": True, "items": items, "currentReportId": rid})

@app.get("/api/debug/envelopes")
@measure("/api/debug/envelopes")
def debug_envelopes():
    db = load_db()
    out = []
    for rid, env in db.get("envelopes", {}).items():
        ek_for = list((env.get("ek_for") or {}).keys())
        out.append(
            {
                "reportId": rid,
                "aad": env.get("aad"),
                "hasSig": bool(env.get("sig_lab")),
                "ekFor": ek_for,
                "cipherLen": len(env.get("ciphertext", "")),
            }
        )
    return jsonify({"ok": True, "items": out})

@app.get("/api/debug/actors")
@measure("/api/debug/actors")
def debug_actors():
    db = load_db()
    items = []
    for username, rec in db.get("actors", {}).items():
        items.append(
            {
                "username": username,
                "uid": rec.get("uid"),
                "role": rec.get("role"),
                "displayName": rec.get("displayName"),
                "hasKeys": True,
            }
        )
    return jsonify({"ok": True, "items": items})

@app.get("/api/debug/ledgerview")
@measure("/api/debug/ledgerview")
def debug_ledgerview():
    """Snapshot ledger: per ogni report noto (anche aggiornato) mostra stato e grants correnti."""
    db = load_db()
    report_ids = list(db.get("envelopes", {}).keys())
    out = []
    seen = set()

    # includi anche i report "effettivi" dopo eventuali update
    for rid in list(report_ids):
        st = state_of(rid)
        effective = st.get("currentReportId", rid)
        report_ids.append(effective)

    for rid in report_ids:
        if rid in seen:
            continue
        seen.add(rid)
        st = state_of(rid)
        eff = st.get("currentReportId", rid)
        grants = []
        try:
            g = lookup_grants_for_report(eff)
            for item in g:
                grants.append({
                    "from": item.get("from"),
                    "to": item.get("to"),
                    "ts": item.get("ts"),
                })
        except Exception:
            pass
        out.append({
            "reportId": rid,
            "status": st.get("status"),
            "currentReportId": eff,
            "grants": grants,
        })
    return jsonify({"ok": True, "items": out})

# -------------------- DEV SEED (demo utenti + 3 referti) --------------------

@app.post("/api/dev/seed")
@measure("/api/dev/seed")
def dev_seed():
    """
    Crea utenti demo (pat1/lab1/hosp1/doc1) + 3 referti DEMO-R-0001..3.
    Idempotente: se qualcosa esiste già, viene riusato/skippato.
    """
    db = load_db()

    def ensure_user(role: str, username: str, display_name: str, password: str) -> str:
        rec = db["actors"].get(username)
        if rec and rec.get("uid"):
            uid = rec["uid"]
            ensure_actor_keys(uid)
            return uid
        uid = _rand_uid(role)
        ensure_actor_keys(uid)
        db["actors"][username] = {
            "uid": uid,
            "role": role,
            "displayName": display_name,
            "email": f"{username}@example.com",
            "password": generate_password_hash(password),
            "hasKeys": True,
        }
        return uid

    # utenti demo
    pat_uid = ensure_user("PAT",  "pat1",  "Mario Rossi",           "pat1pass")
    lab_uid = ensure_user("LAB",  "lab1",  "Laboratorio Centrale",  "lab1pass")
    hosp_uid= ensure_user("HOSP", "hosp1", "Ospedale San Luca",     "hosp1pass")
    doc_uid = ensure_user("DOC",  "doc1",  "Dott.ssa Verdi",        "doc1pass")
    save_db(db)

    # helper per emissione come /lab/emit + eventuale share + optional revoke
    def emit_share_revoke(report_id: str, exam_type: str, result_short: str, note: str,
                          content: str, share_with_hosp: bool, share_with_doc: bool, do_revoke: bool):
        db_local = load_db()
        if report_id in db_local["envelopes"]:
            return False  # già presente

        issued_at = datetime.now(timezone.utc).isoformat()
        aad = {
            "reportId": report_id,
            "labId": lab_uid,
            "patientRef": pat_uid,
            "issuedAt": issued_at,
            "examType": exam_type,
            "resultShort": result_short,
            "note": note,
        }

        lab_priv = load_private_pem(str(_key_paths(lab_uid)[0]))
        pat_pub = load_public_pem(str(_key_paths(pat_uid)[1]))

        t0 = time.perf_counter()
        env = encrypt_for_recipients(
            plaintext=content.encode("utf-8"),
            aad=aad,
            recipients={pat_uid: pat_pub},
        )
        ct_bytes = b64d(env["ciphertext"])
        h_ct = sha256_bytes(ct_bytes)
        tosig = h_ct + dumps(env["aad"]).encode("utf-8")
        env["sig_lab"] = sign_bytes(lab_priv, tosig)
        gen_ms = (time.perf_counter() - t0) * 1000.0
        METRICS["generate_latency_ms"].append(gen_ms)
        METRICS["report_size_plain"][report_id] = len(content.encode("utf-8"))
        METRICS["report_size_cipher"][report_id] = len(ct_bytes)

        db_local["envelopes"][report_id] = env
        save_db(db_local)

        publish_report(
            reportId=report_id,
            labId=lab_uid,
            patientRef=pat_uid,
            hash_referto=sha256_bytes(ct_bytes).hex(),
            sig_lab=env["sig_lab"],
            issuedAt=issued_at,
        )

        # Condivisioni demo (via GRANT)
        pat_priv = load_private_pem(str(_key_paths(pat_uid)[0]))

        if share_with_hosp:
            hosp_pub = load_public_pem(str(_key_paths(hosp_uid)[1]))
            wrap_pat = (env.get("ek_for") or {}).get(pat_uid)
            aes_key = _unwrap_key(pat_priv, wrap_pat)
            ek_h_b64 = _wrap_key(hosp_pub, aes_key)
            grant_obj = {"reportId": report_id, "from": pat_uid, "to": hosp_uid, "ek_to": ek_h_b64}
            sig_pat = sign_bytes(pat_priv, dumps(grant_obj).encode("utf-8"))
            grant_access(report_id, pat_uid, hosp_uid, ek_h_b64, sig_pat)

        if share_with_doc:
            doc_pub = load_public_pem(str(_key_paths(doc_uid)[1]))
            wrap_pat = (env.get("ek_for") or {}).get(pat_uid)
            aes_key = _unwrap_key(pat_priv, wrap_pat)
            ek_d_b64 = _wrap_key(doc_pub, aes_key)
            grant_obj = {"reportId": report_id, "from": pat_uid, "to": doc_uid, "ek_to": ek_d_b64}
            sig_pat = sign_bytes(pat_priv, dumps(grant_obj).encode("utf-8"))
            grant_access(report_id, pat_uid, doc_uid, ek_d_b64, sig_pat)

        if do_revoke:
            revoke_report(report_id, lab_uid, "Revoca dimostrativa demo")

        return True

    seeded = []
    if emit_share_revoke(
            "DEMO-R-0001",
            "Emocromo", "Valori nella norma", "Prelievo ore 9:10",
            "Referto DEMO-R-0001\nTipo: Emocromo\nEsito: Valori nella norma\nNote: Prelievo ore 9:10",
            share_with_hosp=True, share_with_doc=False, do_revoke=False
    ):
        seeded.append("DEMO-R-0001")

    if emit_share_revoke(
            "DEMO-R-0002",
            "RX Torace", "Nessuna anomalia evidente", "Paziente collaborante",
            "Referto DEMO-R-0002\nTipo: RX Torace\nEsito: Nessuna anomalia evidente\nNote: Paziente collaborante",
            share_with_hosp=True, share_with_doc=True, do_revoke=False
    ):
        seeded.append("DEMO-R-0002")

    if emit_share_revoke(
            "DEMO-R-0003",
            "Colesterolo", "LDL leggermente alto", "Consigliata dieta",
            "Referto DEMO-R-0003\nTipo: Colesterolo\nEsito: LDL leggermente alto\nNote: Consigliata dieta",
            share_with_hosp=False, share_with_doc=False, do_revoke=True
    ):
        seeded.append("DEMO-R-0003")

    return jsonify({
        "ok": True,
        "users": {"pat": pat_uid, "lab": lab_uid, "hosp": hosp_uid, "doc": doc_uid},
        "seeded": seeded
    })

# -------------------- MAIN --------------------

if __name__ == "__main__":
    ensure_actor_keys("LAB-01")
    ensure_actor_keys("PAT-123")
    ensure_actor_keys("HOSP-01")
    ensure_actor_keys("DOC-01")
    app.run(host="127.0.0.1", port=8000, debug=True)
