import os
from typing import Dict
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .utils import b64e, b64d, dumps

def _wrap_key(pub, aes_key: bytes) -> str:
    ct = pub.encrypt(
        aes_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return b64e(ct)

def _unwrap_key(priv, b64wrapped: str) -> bytes:
    ct = b64d(b64wrapped)
    return priv.decrypt(
        ct,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )

def encrypt_for_recipients(plaintext: bytes, aad: Dict[str, str], recipients: Dict[str, object]) -> Dict:
    aes_key = AESGCM.generate_key(bit_length=256)
    aesgcm = AESGCM(aes_key)
    nonce = os.urandom(12)
    aad_bytes = dumps(aad).encode("utf-8")
    ct = aesgcm.encrypt(nonce, plaintext, aad_bytes)
    ek_for = {rid: _wrap_key(pub, aes_key) for rid, pub in recipients.items()}
    envelope = {
        "alg": "AES-256-GCM+RSA-OAEP",
        "aad": aad,
        "nonce": b64e(nonce),
        "ciphertext": b64e(ct),
        "ek_for": ek_for,
    }
    return envelope

def decrypt_envelope(envelope: Dict, priv, recipient_id: str) -> bytes:
    b64wrapped = envelope["ek_for"].get(recipient_id)
    if not b64wrapped:
        raise ValueError("Nessuna chiave per questo destinatario")
    aes_key = _unwrap_key(priv, b64wrapped)
    aesgcm = AESGCM(aes_key)
    nonce = b64d(envelope["nonce"])
    aad_bytes = dumps(envelope["aad"]).encode("utf-8")
    ct = b64d(envelope["ciphertext"])
    return aesgcm.decrypt(nonce, ct, aad_bytes)

__all__ = [
    "encrypt_for_recipients",
    "decrypt_envelope",
    "_wrap_key",
    "_unwrap_key",
]
