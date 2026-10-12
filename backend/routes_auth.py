from fastapi import APIRouter, Depends, HTTPException, Body
from common import (db, new_id, now_iso, hash_password, verify_password, create_token,
                    get_current_user, require_roles, allowed_modules, ROLE_LABELS, ROLE_MODULES,
                    ALL_MODULES, audit, clean)

router = APIRouter()


@router.post('/auth/login')
async def login(body: dict = Body(...)):
    email = (body.get('email') or '').strip().lower()
    password = body.get('password') or ''
    user = await db.users.find_one({'email': email})
    if not user or not verify_password(password, user.get('password_hash', '')):
        raise HTTPException(status_code=401, detail='Invalid email or password')
    if user.get('status') == 'inactive':
        raise HTTPException(status_code=403, detail='Account is inactive')
    token = create_token(user)
    await audit(user, 'login', 'users', user['id'])
    safe = await db.users.find_one({'id': user['id']}, {'_id': 0, 'password_hash': 0})
    safe['modules'] = allowed_modules(safe)
    safe['role_label'] = ROLE_LABELS.get(safe['role'], safe['role'])
    return {'token': token, 'user': safe}


@router.get('/auth/me')
async def me(user: dict = Depends(get_current_user)):
    user['modules'] = allowed_modules(user)
    user['role_label'] = ROLE_LABELS.get(user['role'], user['role'])
    return user


@router.post('/auth/logout')
async def logout(user: dict = Depends(get_current_user)):
    return {'ok': True}


@router.get('/auth/roles')
async def roles(user: dict = Depends(get_current_user)):
    return {'roles': [{'value': k, 'label': v, 'modules': ROLE_MODULES.get(k, [])} for k, v in ROLE_LABELS.items()],
            'all_modules': ALL_MODULES}


# ---- Users management ----
@router.get('/staff')
async def list_staff(role: str = '', user: dict = Depends(get_current_user)):
    q = {'status': 'active'}
    if role:
        q['role'] = {'$in': role.split(',')}
    items = await db.users.find(q, {'_id': 0, 'password_hash': 0}).sort('name', 1).to_list(500)
    return {'items': items}


@router.get('/users')
async def list_users(search: str = '', user: dict = Depends(require_roles('super_admin', 'hospital_admin'))):
    q = {}
    if search:
        q['$or'] = [{'name': {'$regex': search, '$options': 'i'}}, {'email': {'$regex': search, '$options': 'i'}}]
    items = await db.users.find(q, {'_id': 0, 'password_hash': 0}).sort('created_at', -1).to_list(500)
    for it in items:
        it['role_label'] = ROLE_LABELS.get(it.get('role'), it.get('role'))
    return {'items': items}


@router.post('/users')
async def create_user(body: dict = Body(...), user: dict = Depends(require_roles('super_admin', 'hospital_admin'))):
    email = (body.get('email') or '').strip().lower()
    if not email or not body.get('password'):
        raise HTTPException(status_code=400, detail='Email and password required')
    if await db.users.find_one({'email': email}):
        raise HTTPException(status_code=400, detail='Email already exists')
    doc = {
        'id': new_id(), 'email': email, 'name': body.get('name', ''),
        'role': body.get('role', 'reception'), 'phone': body.get('phone', ''),
        'password_hash': hash_password(body['password']), 'status': 'active',
        'modules': body.get('modules'), 'created_at': now_iso(), 'updated_at': now_iso(),
    }
    await db.users.insert_one(dict(doc))
    await audit(user, 'create', 'users', doc['id'], {'email': email})
    doc.pop('password_hash', None)
    return doc


@router.put('/users/{uid}')
async def update_user(uid: str, body: dict = Body(...), user: dict = Depends(require_roles('super_admin', 'hospital_admin'))):
    upd = {k: v for k, v in body.items() if k in ('name', 'role', 'phone', 'status', 'modules')}
    if body.get('password'):
        upd['password_hash'] = hash_password(body['password'])
    upd['updated_at'] = now_iso()
    await db.users.update_one({'id': uid}, {'$set': upd})
    await audit(user, 'update', 'users', uid)
    doc = await db.users.find_one({'id': uid}, {'_id': 0, 'password_hash': 0})
    return doc


@router.delete('/users/{uid}')
async def delete_user(uid: str, user: dict = Depends(require_roles('super_admin'))):
    await db.users.update_one({'id': uid}, {'$set': {'status': 'inactive', 'updated_at': now_iso()}})
    await audit(user, 'deactivate', 'users', uid)
    return {'ok': True}
