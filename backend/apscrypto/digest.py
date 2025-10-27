from cryptography.hazmat.primitives import hashes

def sha256_bytes(data: bytes) -> bytes:
    h = hashes.Hash(hashes.SHA256())
    h.update(data)
    return h.finalize()
