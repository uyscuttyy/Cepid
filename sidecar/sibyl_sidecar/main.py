"""Sibyl sidecar — CEPID's persistence substrate.

A deliberately thin, localhost-only REST facade over sibyl-memory-client.
No business logic lives here on purpose: ranking, importance, patterns,
scars, and lifecycle all live in the TypeScript product (@cepid/server).
This process exists so that CEPID's memory is Sibyl's memory — delete this
service and the product loses its memory entirely (the load-bearing gate).

Tenancy: the X-Agent-Tenant header selects the Sibyl tenant. The value is
chosen by CEPID's API server AFTER authenticating the caller's API key —
never taken from an external request body. The sidecar itself is guarded by
a shared bearer token (SIDECAR_TOKEN) and binds 127.0.0.1 only.
"""

from __future__ import annotations

import os
import sys

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from sibyl_memory_client import MemoryClient

SIDECAR_TOKEN = os.environ.get("SIDECAR_TOKEN", "dev-sidecar-token")
DB_PATH = os.environ.get(
    "CEPID_MEMORY_DB", os.path.expanduser("~/.sibyl-memory/cepid-memory.db")
)

app = FastAPI(title="CEPID Sibyl sidecar", version="0.1.0")

# One lightweight client per request. MemoryClient is a thin SQLite wrapper;
# connection pooling is handled by SQLite itself via the shared file.
_clients: dict[str, MemoryClient] = {}


def client_for(tenant: str) -> MemoryClient:
    if not tenant or len(tenant) > 128:
        raise HTTPException(status_code=400, detail="invalid tenant")
    if tenant not in _clients:
        _clients[tenant] = MemoryClient.local(DB_PATH, tenant_id=tenant)
    return _clients[tenant]


def tenant_from(x_agent_tenant: str | None = Header(default=None)) -> str:
    if not x_agent_tenant:
        raise HTTPException(status_code=400, detail="X-Agent-Tenant header required")
    return x_agent_tenant


def auth(x_token: str | None = Header(default=None, alias="X-Sidecar-Token")) -> None:
    if x_token != SIDECAR_TOKEN:
        raise HTTPException(status_code=401, detail="bad sidecar token")


class EntityIn(BaseModel):
    category: str
    name: str
    body: dict | list
    status: str | None = None


class StateIn(BaseModel):
    key: str
    body: dict | list


class EventIn(BaseModel):
    payload: dict


@app.get("/health")
async def health(_: None = Depends(auth)) -> dict:
    probe = client_for("cepid-platform")
    try:
        return {
            "ok": True,
            "db": DB_PATH,
            "schema_version": probe.schema_version(),
            "tier": probe.free_tier_status(),
        }
    except Exception as e:  # pragma: no cover - surfaced to the caller
        raise HTTPException(status_code=503, detail=f"substrate unhealthy: {e}") from e


@app.post("/entities")
async def put_entity(
    e: EntityIn,
    tenant: str = Depends(tenant_from),
    _: None = Depends(auth),
) -> dict:
    c = client_for(tenant)
    try:
        return c.set_entity(e.category, e.name, e.body, status=e.status)
    except Exception as ex:
        raise HTTPException(status_code=400, detail=str(ex)) from ex


@app.get("/entities/{category}/{name}")
async def get_entity(
    category: str,
    name: str,
    tenant: str = Depends(tenant_from),
    _: None = Depends(auth),
) -> JSONResponse:
    c = client_for(tenant)
    try:
        row = c.get_entity(category, name)
        return JSONResponse(row)
    except Exception:
        return JSONResponse({"not_found": True}, status_code=404)


@app.get("/entities")
async def list_entities(
    category: str | None = None,
    status: str | None = None,
    limit: int = 500,
    tenant: str = Depends(tenant_from),
    _: None = Depends(auth),
) -> dict:
    c = client_for(tenant)
    rows = c.list_entities(category, status=status, limit=min(max(limit, 1), 5000))
    return {"entities": rows}


@app.delete("/entities/{category}/{name}")
async def delete_entity(
    category: str,
    name: str,
    tenant: str = Depends(tenant_from),
    _: None = Depends(auth),
) -> dict:
    c = client_for(tenant)
    ok = c.delete_entity(category, name)
    return {"deleted": bool(ok)}


@app.post("/state")
async def set_state(
    s: StateIn,
    tenant: str = Depends(tenant_from),
    _: None = Depends(auth),
) -> dict:
    c = client_for(tenant)
    c.set_state(s.key, s.body)
    return {"ok": True}


@app.get("/state/{key}")
async def get_state(
    key: str,
    tenant: str = Depends(tenant_from),
    _: None = Depends(auth),
) -> JSONResponse:
    c = client_for(tenant)
    row = c.get_state(key)
    if row is None:
        return JSONResponse({"not_found": True}, status_code=404)
    return JSONResponse(row)


@app.post("/events")
async def write_event(
    e: EventIn,
    tenant: str = Depends(tenant_from),
    _: None = Depends(auth),
) -> dict:
    c = client_for(tenant)
    event_id = c.write_event(extra=e.payload)
    return {"id": event_id}


@app.get("/events")
async def read_events(
    limit: int = 200,
    since: str | None = None,
    until: str | None = None,
    tenant: str = Depends(tenant_from),
    _: None = Depends(auth),
) -> dict:
    c = client_for(tenant)
    events = c.read_events(limit=min(max(limit, 1), 2000), since=since, until=until)
    return {"events": events}


@app.get("/tenants")
async def tenants(_: None = Depends(auth)) -> dict:
    """Diagnostics only: which tenant clients are live in this process."""
    return {"active": sorted(_clients.keys())}


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    host = os.environ.get("SIDECAR_HOST", "127.0.0.1")
    port = int(os.environ.get("SIDECAR_PORT", "8765"))
    print(
        f"[sidecar] substrate db={DB_PATH} binding {host}:{port}",
        file=sys.stderr,
    )
    uvicorn.run(app, host=host, port=port, log_level="warning")
