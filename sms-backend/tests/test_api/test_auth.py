"""Integration tests for /api/v1/auth endpoints."""
import pytest

def test_login_missing_body(client):
    res = client.post("/api/v1/auth/login", json={})
    assert res.status_code in (400, 422)
