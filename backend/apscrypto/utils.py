import base64
import json
from typing import Any

def b64e(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")

def b64d(s: str) -> bytes:
    return base64.b64decode(s.encode("ascii"))

def dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True)

def loads(s: str) -> Any:
    return json.loads(s)

__all__ = ["b64e", "b64d", "dumps", "loads"]
