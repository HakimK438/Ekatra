"""Ekatra API. Run locally: uvicorn app.main:app --reload   (Vercel finds `app` in this file)."""
from __future__ import annotations

import json
import logging
import sys
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .errors import ApiError
from .routes import router

log = logging.getLogger("ekatra")
if not log.handlers:
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(h)
    log.setLevel(logging.INFO)

app = FastAPI(title="Ekatra API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json",
              description="Coordination index for institution-related cases. Prototype with synthetic data. Not an official AICTE system.")


@app.middleware("http")
async def request_context(request: Request, call_next):
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    t0 = time.perf_counter()
    response = await call_next(request)
    response.headers["x-request-id"] = rid
    log.info(json.dumps({"request_id": rid, "method": request.method, "path": request.url.path, "status": response.status_code, "ms": round((time.perf_counter() - t0) * 1000)}))
    return response


@app.exception_handler(ApiError)
async def api_error(_: Request, e: ApiError) -> JSONResponse:
    return JSONResponse(status_code=e.status, content={"code": e.code, "message": e.message, "details": e.details})


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, e: RequestValidationError) -> JSONResponse:
    fields = [{"field": ".".join(str(p) for p in err["loc"][1:]), "problem": err["msg"]} for err in e.errors()]
    return JSONResponse(status_code=422, content={"code": "validation_error", "message": "Some details are missing or not valid.", "details": {"fields": fields}})


app.include_router(router)
