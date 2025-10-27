# backend/ca.py
import json, pathlib, time
from typing import Dict, Any

CA_DB = pathlib.Path(__file__).parent / "ca_db.json"

def _load():
    if CA_DB.exists():
        return json.loads(CA_DB.read_text(encoding="utf-8"))
    return {"certs":{}, "crl": []}

def _save(db):
    CA_DB.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")

def enroll(actorId: str, pub_pem: str) -> Dict[str, Any]:
    db = _load()
    cert = {"actorId": actorId, "pub": pub_pem, "issuedAt": int(time.time()), "valid": True}
    db["certs"][actorId] = cert
    _save(db)
    return cert

def revoke(actorId: str):
    db = _load()
    db["crl"].append({"actorId": actorId, "revokedAt": int(time.time())})
    if actorId in db["certs"]:
        db["certs"][actorId]["valid"] = False
    _save(db)
    return True

def get_cert(actorId: str):
    return _load()["certs"].get(actorId)

def in_crl(actorId: str) -> bool:
    return any(x["actorId"]==actorId for x in _load()["crl"])
