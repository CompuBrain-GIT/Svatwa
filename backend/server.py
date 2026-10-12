from fastapi import FastAPI, APIRouter, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from pathlib import Path
import os
import logging

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from common import db, get_current_user  # noqa: E402
import routes_auth, routes_masters, routes_clinical, routes_pharmacy, routes_ipd, routes_billing, routes_ops  # noqa: E402
from seed import run_seed  # noqa: E402

app = FastAPI(title="SvaTWA HMS")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "SvaTWA Psychiatric Hospital Management System API"}


for mod in (routes_auth, routes_masters, routes_clinical, routes_pharmacy, routes_ipd, routes_billing, routes_ops):
    api_router.include_router(mod.router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.patients.create_index("uhid")
    await db.patients.create_index("mobile")
    await db.visits.create_index([("visit_date", 1), ("doctor_id", 1)])
    await db.charges.create_index("patient_id")
    await db.diagnoses.create_index("code")
    try:
        await run_seed()
        logger.info("Seed completed")
    except Exception as e:
        logger.error(f"Seed error: {e}")


@app.on_event("shutdown")
async def shutdown():
    pass
