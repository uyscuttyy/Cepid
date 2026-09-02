"""Sidecar unit tests — substrate contract, tenant isolation, auth.

Run: cd sidecar && uv run pytest tests/ -q
"""
from __future__ import annotations

import importlib.util
import os
import tempfile
import threading
import time
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "sibyl_sidecar_main", HERE.parent / "sibyl_sidecar" / "main.py"
)
main = importlib.util.module_from_spec(SPEC)

# Configure an isolated DB for tests BEFORE importing the app.
_TMPDIR = tempfile.mkdtemp(prefix="cepid-sidecar-test-")
os.environ["CEPID_MEMORY_DB"] = str(Path(_TMPDIR) / "test.db")
os.environ["SIDECAR_TOKEN"] = "test-token"
SPEC.loader.exec_module(main)  # type: ignore[union-attr]

from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(main.app)


def hdr(tenant: str, token: str = "test-token") -> dict:
    return {"X-Agent-Tenant": tenant, "X-Sidecar-Token": token}


def test_health_requires_token():
    r = client.get("/health")
    assert r.status_code == 401


def test_health_ok():
    r = client.get("/health", headers=hdr("t-health"))
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "schema_version" in body
    assert "tier" in body


def test_tenant_required():
    r = client.get("/entities", headers={"X-Sidecar-Token": "test-token"})
    assert r.status_code == 400


def test_entity_roundtrip():
    put = client.post(
        "/entities",
        json={"category": "memory", "name": "mem-x", "body": {"kind": "experience", "v": 1}},
        headers=hdr("t-roundtrip"),
    )
    assert put.status_code == 200
    got = client.get("/entities/memory/mem-x", headers=hdr("t-roundtrip"))
    assert got.status_code == 200
    assert got.json()["body"]["v"] == 1


def test_tenant_isolation_is_real():
    client.post(
        "/entities",
        json={"category": "memory", "name": "secret", "body": {"owner": "A"}},
        headers=hdr("tenant-a"),
    )
    client.post(
        "/entities",
        json={"category": "memory", "name": "secret", "body": {"owner": "B"}},
        headers=hdr("tenant-b"),
    )
    a = client.get("/entities/memory/secret", headers=hdr("tenant-a")).json()
    b = client.get("/entities/memory/secret", headers=hdr("tenant-b")).json()
    assert a["body"]["owner"] == "A"
    assert b["body"]["owner"] == "B"
    listed = client.get("/entities?category=memory", headers=hdr("tenant-a")).json()
    assert all(e["tenant_id"] == "tenant-a" for e in listed["entities"])


def test_state_and_events_roundtrip():
    client.post("/state", json={"key": "meta", "body": {"count": 3}}, headers=hdr("t-state"))
    got = client.get("/state/meta", headers=hdr("t-state")).json()
    assert got["body"]["count"] == 3
    # other tenant sees nothing
    other = client.get("/state/meta", headers=hdr("t-state-2"))
    assert other.status_code == 404

    client.post(
        "/events", json={"payload": {"type": "memory.created", "at": "now"}}, headers=hdr("t-state")
    )
    evs = client.get("/events?limit=10", headers=hdr("t-state")).json()["events"]
    assert any(e["extra"]["type"] == "memory.created" for e in evs)
    # journal is tenant-scoped too
    evs_b = client.get("/events?limit=10", headers=hdr("t-state-2")).json()["events"]
    assert all(e.get("extra", {}).get("type") != "memory.created" for e in evs_b)


def test_missing_entity_404():
    r = client.get("/entities/memory/nope", headers=hdr("t-miss"))
    assert r.status_code == 404
