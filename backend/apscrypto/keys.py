from typing import Optional
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

def gen_rsa_keypair(bits: int = 3072):
    priv = rsa.generate_private_key(public_exponent=65537, key_size=bits)
    pub = priv.public_key()
    return priv, pub

def save_private_pem(priv, path: str, password: Optional[bytes] = None):
    enc = serialization.NoEncryption() if not password else serialization.BestAvailableEncryption(password)
    pem = priv.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        enc,
    )
    with open(path, "wb") as f:
        f.write(pem)

def save_public_pem(pub, path: str):
    pem = pub.public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    with open(path, "wb") as f:
        f.write(pem)

def load_private_pem(path: str, password: Optional[bytes] = None):
    with open(path, "rb") as f:
        data = f.read()
    return serialization.load_pem_private_key(data, password=password)

def load_public_pem(path: str):
    with open(path, "rb") as f:
        data = f.read()
    return serialization.load_pem_public_key(data)

__all__ = [
    "gen_rsa_keypair",
    "save_private_pem",
    "save_public_pem",
    "load_private_pem",
    "load_public_pem",
]
