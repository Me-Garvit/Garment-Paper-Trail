from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.cases import router as cases_router
from api.supplier_rooms import router as supplier_rooms_router
from database import engine
from models import *  # noqa: F401, F403 — registers all ORM models with Base metadata


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(
    title="Style-Anchored Garment Tracking System",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cases_router)
app.include_router(supplier_rooms_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
