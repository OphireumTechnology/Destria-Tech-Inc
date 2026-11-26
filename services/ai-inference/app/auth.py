"""Constant-time service-to-service authentication for private AI inference."""

from __future__ import annotations

import hmac


def extract_bearer_token(header_value: str | None) -> str:
    if not header_value:
        return ""
    cleaned = header_value.strip()
    if cleaned.lower().startswith("bearer "):
        return cleaned[7:].strip()
    return cleaned


def verify_service_auth(header_value: str | None, expected_secret: str) -> tuple[bool, str]:
    """Fail-closed constant-time verification for X-Service-Auth / Authorization headers."""
    if not expected_secret or len(expected_secret.strip()) < 16:
        return False, "SERVICE_AUTH_NOT_CONFIGURED"
    provided = extract_bearer_token(header_value)
    if not provided:
        return False, "MISSING_SERVICE_AUTH"
    if not hmac.compare_digest(provided.encode("utf-8"), expected_secret.strip().encode("utf-8")):
        return False, "INVALID_SERVICE_AUTH"
    return True, "OK"
