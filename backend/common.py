import os
import uuid
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import HTTPException, Request, Depends, APIRouter

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALG = 'HS256'


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def new_id():
    return str(uuid.uuid4())


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode('utf-8'), h.encode('utf-8'))
    except Exception:
        return False


def create_token(user: dict) -> str:
    payload = {
        'sub': user['id'],
        'email': user['email'],
        'role': user['role'],
        'exp': datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(request: Request) -> dict:
    token = None
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        token = auth[7:]
    if not token:
        token = request.cookies.get('access_token')
    if not token:
        raise HTTPException(status_code=401, detail='Not authenticated')
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')
    user = await db.users.find_one({'id': payload['sub']}, {'_id': 0, 'password_hash': 0})
    if not user:
        raise HTTPException(status_code=401, detail='User not found')
    return user


# ---- Roles & module access ----
ALL_MODULES = [
    'dashboard', 'patients', 'opd', 'ipd', 'appointments', 'clinical', 'therapy',
    'pharmacy', 'inventory', 'diagnostics', 'billing', 'expenses', 'insurance',
    'referrals', 'notifications', 'analytics', 'reports', 'masters', 'users',
    'settings', 'audit',
]

ROLE_MODULES = {
    'super_admin': ALL_MODULES,
    'hospital_admin': [m for m in ALL_MODULES if m not in ('audit',)],
    'doctor': ['dashboard', 'patients', 'opd', 'ipd', 'appointments', 'clinical', 'therapy', 'diagnostics', 'analytics', 'reports'],
    'psychologist': ['dashboard', 'patients', 'opd', 'appointments', 'clinical', 'therapy', 'reports'],
    'nurse': ['dashboard', 'patients', 'ipd', 'clinical'],
    'reception': ['dashboard', 'patients', 'opd', 'ipd', 'appointments', 'billing', 'referrals'],
    'pharmacist': ['dashboard', 'patients', 'pharmacy', 'inventory'],
    'inventory_manager': ['dashboard', 'inventory', 'pharmacy'],
    'billing': ['dashboard', 'patients', 'billing', 'expenses', 'insurance', 'analytics', 'reports'],
    'lab': ['dashboard', 'patients', 'diagnostics'],
    'patient': ['dashboard'],
    'caregiver': ['dashboard'],
}

ROLE_LABELS = {
    'super_admin': 'Super Admin', 'hospital_admin': 'Hospital Admin', 'doctor': 'Psychiatrist / Doctor',
    'psychologist': 'Psychologist / Therapist', 'nurse': 'Nurse', 'reception': 'Reception / Registration',
    'pharmacist': 'Pharmacist', 'inventory_manager': 'Inventory Manager', 'billing': 'Billing / Accounts',
    'lab': 'Diagnostic / Lab', 'patient': 'Patient', 'caregiver': 'Caregiver',
}


def allowed_modules(user: dict):
    if user.get('role') == 'super_admin':
        return ALL_MODULES
    custom = user.get('modules')
    if custom:
        return custom
    return ROLE_MODULES.get(user.get('role'), ['dashboard'])


def can_access(user: dict, module: str) -> bool:
    return module in allowed_modules(user)


def require_module(module: str):
    async def dep(user: dict = Depends(get_current_user)):
        if not can_access(user, module):
            raise HTTPException(status_code=403, detail='You do not have permission for this module')
        return user
    return dep


def require_roles(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user.get('role') not in roles:
            raise HTTPException(status_code=403, detail='Insufficient role')
        return user
    return dep


async def audit(user: dict, action: str, entity: str, entity_id=None, meta=None):
    await db.audit_logs.insert_one({
        'id': new_id(),
        'user_id': user.get('id') if user else None,
        'user_name': user.get('name') if user else None,
        'role': user.get('role') if user else None,
        'action': action,
        'entity': entity,
        'entity_id': entity_id,
        'meta': meta or {},
        'at': now_iso(),
    })


def clean(doc: dict):
    if doc:
        doc.pop('_id', None)
    return doc


async def next_sequence(name: str, prefix: str, width: int = 5) -> str:
    res = await db.counters.find_one_and_update(
        {'id': name}, {'$inc': {'seq': 1}}, upsert=True, return_document=True)
    seq = res.get('seq', 1) if res else 1
    return f"{prefix}{str(seq).zfill(width)}"
