# backend/ledger.py
import hashlib, json, os, time, pathlib
from typing import Dict, Any, List, Optional

LEDGER_FILE = pathlib.Path(__file__).parent / "ledger.jsonl"

def _append(event: Dict[str, Any]) -> Dict[str, Any]:
    os.makedirs(LEDGER_FILE.parent, exist_ok=True)
    ev = {"ts": int(time.time()), **event}
    line = json.dumps(ev, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    ev["txId"] = hashlib.sha256(line.encode("utf-8")).hexdigest()
    with LEDGER_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(ev, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n")
    return ev

def _iter_all() -> List[Dict[str, Any]]:
    if not LEDGER_FILE.exists():
        return []
    return [json.loads(l) for l in LEDGER_FILE.read_text(encoding="utf-8").splitlines() if l.strip()]

def publish_report(reportId: str, labId: str, patientRef: str, hash_referto: str, sig_lab: str, issuedAt: str) -> Dict[str, Any]:
    return _append({
        "type": "PUBLISH_REPORT",
        "reportId": reportId,
        "labId": labId,
        "patientRef": patientRef,
        "hash": hash_referto,
        "sig_lab": sig_lab,
        "issuedAt": issuedAt,
    })

def revoke_report(reportId: str, labId: str, reason: str = "") -> Dict[str, Any]:
    return _append({
        "type": "REVOKE_REPORT",
        "reportId": reportId,
        "labId": labId,
        "reason": reason,
    })

def update_report(oldReportId: str, newReportId: str, labId: str) -> Dict[str, Any]:
    return _append({
        "type": "UPDATE_REPORT",
        "oldReportId": oldReportId,
        "newReportId": newReportId,
        "labId": labId,
    })

def grant_access(reportId: str, patientId: str, toId: str, ek_to_b64: str, sig_pat: str) -> Dict[str, Any]:
    return _append({
        "type": "GRANT",
        "reportId": reportId,
        "from": patientId,
        "to": toId,
        "ek_to": ek_to_b64,
        "sig_pat": sig_pat,
    })

def state_of(reportId: str) -> Dict[str, Any]:
    evs = _iter_all()
    status = "UNKNOWN"
    latest = reportId
    updated_chain = []
    for ev in evs:
        if ev.get("type") == "PUBLISH_REPORT" and ev.get("reportId") == reportId and status == "UNKNOWN":
            status = "VALID"
        if ev.get("type") == "REVOKE_REPORT" and ev.get("reportId") == latest:
            status = "REVOKED"
        if ev.get("type") == "UPDATE_REPORT" and ev.get("oldReportId") == latest:
            status = "UPDATED"
            latest = ev.get("newReportId")
            updated_chain.append(latest)
    return {"status": status, "currentReportId": latest, "updatedChain": updated_chain}

def lookup_grants(reportId: str, toId: str) -> List[Dict[str, Any]]:
    return [ev for ev in _iter_all() if ev.get("type")=="GRANT" and ev.get("reportId")==reportId and ev.get("to")==toId]

def lookup_grants_for_report(reportId: str) -> List[Dict[str, Any]]:
    """Tutti i GRANT per un report (qualsiasi destinatario)."""
    return [ev for ev in _iter_all() if ev.get("type")=="GRANT" and ev.get("reportId")==reportId]

def get_publish(reportId: str) -> Optional[Dict[str, Any]]:
    for ev in _iter_all():
        if ev.get("type")=="PUBLISH_REPORT" and ev.get("reportId")==reportId:
            return ev
    return None
