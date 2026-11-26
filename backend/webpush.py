"""Web Push ohne Zusatzbibliothek (RFC 8291 aes128gcm + RFC 8292 VAPID), nur mit `cryptography`.

Schlüssel (Umgebungsvariablen, siehe .env.example / tools/gen-vapid.py):
  VAPID_PUBLIC_KEY   Base64url, unkomprimierter P-256-Punkt (65 Byte) – geht auch an den Browser
  VAPID_PRIVATE_KEY  Base64url, privater Skalar (32 Byte)
  VAPID_SUBJECT      z. B. mailto:admin@trackyourcrew.de
"""
import base64
import json
import os
import struct
import time
from urllib.parse import urlparse

from cryptography.hazmat.primitives import hashes, hmac, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def b64u_encode(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


def b64u_decode(s: str) -> bytes:
    s = (s or "").strip()
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _hmac(key: bytes, data: bytes) -> bytes:
    h = hmac.HMAC(key, hashes.SHA256())
    h.update(data)
    return h.finalize()


def public_bytes(pub: ec.EllipticCurvePublicKey) -> bytes:
    return pub.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


def generate_vapid_keys() -> tuple:
    """(public_b64u, private_b64u) – für tools/gen-vapid.py und den Testmodus."""
    priv = ec.generate_private_key(ec.SECP256R1())
    d = priv.private_numbers().private_value.to_bytes(32, "big")
    return b64u_encode(public_bytes(priv.public_key())), b64u_encode(d)


def load_private_key(private_b64u: str) -> ec.EllipticCurvePrivateKey:
    d = int.from_bytes(b64u_decode(private_b64u), "big")
    return ec.derive_private_key(d, ec.SECP256R1())


def encrypt(payload: bytes, p256dh_b64u: str, auth_b64u: str, *, salt: bytes = None,
            sender_key: ec.EllipticCurvePrivateKey = None) -> bytes:
    """Verschlüsselt eine Nachricht für ein Abo (Inhaltskodierung aes128gcm, ein Datensatz)."""
    ua_public = b64u_decode(p256dh_b64u)
    auth_secret = b64u_decode(auth_b64u)
    ua_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public)
    as_priv = sender_key or ec.generate_private_key(ec.SECP256R1())
    as_public = public_bytes(as_priv.public_key())
    ecdh_secret = as_priv.exchange(ec.ECDH(), ua_key)
    prk_key = _hmac(auth_secret, ecdh_secret)
    ikm = _hmac(prk_key, b"WebPush: info\x00" + ua_public + as_public + b"\x01")
    salt = salt or os.urandom(16)
    prk = _hmac(salt, ikm)
    cek = _hmac(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
    nonce = _hmac(prk, b"Content-Encoding: nonce\x00\x01")[:12]
    ciphertext = AESGCM(cek).encrypt(nonce, payload + b"\x02", None)
    rs = 4096
    header = salt + struct.pack("!I", rs) + bytes([len(as_public)]) + as_public
    return header + ciphertext


def decrypt(body: bytes, ua_priv: ec.EllipticCurvePrivateKey, auth_secret: bytes) -> bytes:
    """Gegenstück zu `encrypt` (nur für Tests: so entschlüsselt es der Browser)."""
    salt, idlen = body[:16], body[20]
    as_public = body[21:21 + idlen]
    ciphertext = body[21 + idlen:]
    ua_public = public_bytes(ua_priv.public_key())
    as_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), as_public)
    ecdh_secret = ua_priv.exchange(ec.ECDH(), as_key)
    prk_key = _hmac(auth_secret, ecdh_secret)
    ikm = _hmac(prk_key, b"WebPush: info\x00" + ua_public + as_public + b"\x01")
    prk = _hmac(salt, ikm)
    cek = _hmac(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
    nonce = _hmac(prk, b"Content-Encoding: nonce\x00\x01")[:12]
    plain = AESGCM(cek).decrypt(nonce, ciphertext, None)
    return plain.rstrip(b"\x00")[:-1]  # Polster-Trenner 0x02 entfernen


def vapid_header(endpoint: str, private_b64u: str, public_b64u: str, subject: str, ttl_s: int = 12 * 3600) -> str:
    """Authorization-Header `vapid t=<JWT>, k=<public key>` für den Push-Dienst des Endpunkts."""
    u = urlparse(endpoint)
    aud = f"{u.scheme}://{u.netloc}"
    header = b64u_encode(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    claims = b64u_encode(json.dumps({"aud": aud, "exp": int(time.time()) + ttl_s, "sub": subject},
                                    separators=(",", ":")).encode())
    signing_input = f"{header}.{claims}".encode()
    der = load_private_key(private_b64u).sign(signing_input, ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    sig = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    return f"vapid t={header}.{claims}.{b64u_encode(sig)}, k={public_b64u}"


def build_request(sub: dict, data: dict, *, private_b64u: str, public_b64u: str, subject: str, ttl: int = 86400):
    """(url, headers, body) für httpx. `sub` = {"endpoint", "p256dh", "auth"}."""
    body = encrypt(json.dumps(data, ensure_ascii=False).encode("utf-8"), sub["p256dh"], sub["auth"])
    headers = {
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "TTL": str(ttl),
        "Urgency": "normal",
        "Authorization": vapid_header(sub["endpoint"], private_b64u, public_b64u, subject),
    }
    return sub["endpoint"], headers, body
