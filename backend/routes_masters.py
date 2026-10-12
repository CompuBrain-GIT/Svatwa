import io
import csv
from fastapi import APIRouter, Depends, HTTPException, Body
from common import db, new_id, now_iso, require_module, require_roles, audit, get_current_user

router = APIRouter()

# Master type -> label (for the Masters UI)
MASTER_TYPES = {
    'branch': 'Hospitals / Branches', 'department': 'Departments', 'service': 'Services',
    'treatment_type': 'Treatment Types', 'disease': 'Disease / Condition Types',
    'symptom': 'Symptoms / Complaints', 'therapy_type': 'Therapy Types',
    'counselling_type': 'Counselling Types', 'appointment_type': 'Appointment Types',
    'case_status': 'Case Statuses', 'patient_status': 'Patient Statuses', 'risk_level': 'Risk Levels',
    'consent_type': 'Consent Types', 'document_type': 'Document Types',
    'notification_type': 'Notification Types', 'notification_template': 'Notification Templates',
    'medicine_category': 'Medicine Categories', 'medicine_form': 'Medicine Forms',
    'medicine_strength': 'Medicine Strengths', 'supplier': 'Suppliers',
    'inventory_category': 'Inventory Categories', 'unit': 'Units', 'ward': 'Wards',
    'room': 'Rooms', 'bed': 'Beds', 'investigation_type': 'Investigation / Test Types',
    'followup_type': 'Follow-up Types', 'billing_service': 'Billing Services',
    'billing_category': 'Billing Categories', 'payment_method': 'Payment Methods',
    'discount_type': 'Discount Types', 'invoice_type': 'Invoice Types',
    'insurance_provider': 'Insurance Providers', 'claim_type': 'Claim Types',
    'expense_category': 'Expense Categories', 'referral_source': 'Referral Sources',
    'referral_type': 'Referral Types', 'emergency_type': 'Emergency Types',
    'procedure_type': 'Procedure Types', 'ot_room': 'OT / Procedure Rooms',
    'survey_type': 'Survey Types', 'opd_tag': 'OPD / IPD Tags', 'holiday': 'OPD Holidays',
    'certificate_template': 'Certificate Templates', 'room_charge': 'Room / Package Charges',
    'reason_for_visit': 'Reasons for Visit', 'corporate': 'Corporate / Companies',
    'id_proof_type': 'ID Proof Types', 'language': 'Preferred Languages',
}


@router.get('/masters/_types')
async def master_types(user: dict = Depends(require_module('masters'))):
    out = []
    for t, label in MASTER_TYPES.items():
        count = await db.masters.count_documents({'type': t})
        out.append({'type': t, 'label': label, 'count': count})
    return {'types': out}


# Lightweight options endpoint usable by any logged-in user (dropdowns)
@router.get('/options/{mtype}')
async def options(mtype: str, user: dict = Depends(get_current_user)):
    items = await db.masters.find({'type': mtype, 'status': 'active'}, {'_id': 0}).sort('name', 1).to_list(1000)
    return {'items': items}


@router.get('/masters/{mtype}')
async def list_master(mtype: str, search: str = '', status: str = '', page: int = 1, limit: int = 100,
                      user: dict = Depends(require_module('masters'))):
    q = {'type': mtype}
    if status:
        q['status'] = status
    if search:
        q['$or'] = [{'name': {'$regex': search, '$options': 'i'}}, {'code': {'$regex': search, '$options': 'i'}}]
    total = await db.masters.count_documents(q)
    items = await db.masters.find(q, {'_id': 0}).sort('created_at', -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {'items': items, 'total': total, 'page': page, 'limit': limit}


@router.post('/masters/{mtype}')
async def create_master(mtype: str, body: dict = Body(...), user: dict = Depends(require_module('masters'))):
    body.pop('_id', None)
    body['id'] = new_id()
    body['type'] = mtype
    body.setdefault('status', 'active')
    body.setdefault('code', '')
    body['created_at'] = now_iso()
    body['updated_at'] = now_iso()
    await db.masters.insert_one(body)
    body.pop('_id', None)
    await audit(user, 'create', f'master:{mtype}', body['id'], {'name': body.get('name')})
    return body


@router.put('/masters/{mtype}/{mid}')
async def update_master(mtype: str, mid: str, body: dict = Body(...), user: dict = Depends(require_module('masters'))):
    body.pop('_id', None)
    body.pop('id', None)
    body['updated_at'] = now_iso()
    await db.masters.update_one({'id': mid, 'type': mtype}, {'$set': body})
    await audit(user, 'update', f'master:{mtype}', mid)
    return await db.masters.find_one({'id': mid}, {'_id': 0})


@router.delete('/masters/{mtype}/{mid}')
async def delete_master(mtype: str, mid: str, user: dict = Depends(require_module('masters'))):
    await db.masters.update_one({'id': mid, 'type': mtype}, {'$set': {'status': 'inactive', 'updated_at': now_iso()}})
    await audit(user, 'deactivate', f'master:{mtype}', mid)
    return {'ok': True}


# ---- Diagnosis master (dedicated with bulk upload) ----
@router.get('/diagnoses')
async def list_diagnoses(search: str = '', page: int = 1, limit: int = 100, user: dict = Depends(get_current_user)):
    q = {}
    if search:
        q['$or'] = [{'name': {'$regex': search, '$options': 'i'}}, {'code': {'$regex': search, '$options': 'i'}}]
    total = await db.diagnoses.count_documents(q)
    items = await db.diagnoses.find(q, {'_id': 0}).sort('code', 1).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {'items': items, 'total': total, 'page': page, 'limit': limit}


@router.post('/diagnoses')
async def create_diagnosis(body: dict = Body(...), user: dict = Depends(require_module('masters'))):
    code = (body.get('code') or '').strip()
    if await db.diagnoses.find_one({'code': code}):
        raise HTTPException(status_code=400, detail='Diagnosis code already exists')
    doc = {'id': new_id(), 'code': code, 'name': body.get('name', ''),
           'status': body.get('status', 'active'), 'created_at': now_iso()}
    await db.diagnoses.insert_one(doc)
    doc.pop('_id', None)
    await audit(user, 'create', 'diagnosis', doc['id'], {'code': code})
    return doc


@router.post('/diagnoses/bulk')
async def bulk_diagnoses(body: dict = Body(...), user: dict = Depends(require_module('masters'))):
    """body: {csv: '<text>', preview: bool}  CSV columns: Code,Diagnosis"""
    text = body.get('csv', '')
    preview = body.get('preview', False)
    reader = csv.reader(io.StringIO(text))
    rows = [r for r in reader if any(c.strip() for c in r)]
    if not rows:
        raise HTTPException(status_code=400, detail='No rows found')
    header = [c.strip().lower() for c in rows[0]]
    start = 1 if ('code' in header or 'diagnosis' in header) else 0
    existing_codes = set(d['code'] for d in await db.diagnoses.find({}, {'code': 1, '_id': 0}).to_list(100000))
    valid, errors, seen = [], [], set()
    for i, r in enumerate(rows[start:], start=start + 1):
        if len(r) < 2:
            errors.append({'row': i, 'reason': 'Expected 2 columns (Code, Diagnosis)'})
            continue
        code, name = r[0].strip(), r[1].strip()
        if not code or not name:
            errors.append({'row': i, 'reason': 'Code or Diagnosis empty'})
            continue
        if code in existing_codes or code in seen:
            errors.append({'row': i, 'reason': f'Duplicate code {code}'})
            continue
        seen.add(code)
        valid.append({'code': code, 'name': name})
    result = {'valid_count': len(valid), 'error_count': len(errors), 'errors': errors[:50], 'sample': valid[:10]}
    if preview:
        return result
    if valid:
        docs = [{'id': new_id(), 'code': v['code'], 'name': v['name'], 'status': 'active', 'created_at': now_iso()} for v in valid]
        await db.diagnoses.insert_many(docs)
    await audit(user, 'bulk_import', 'diagnosis', None, {'imported': len(valid), 'errors': len(errors)})
    result['imported'] = len(valid)
    return result


@router.put('/diagnoses/{did}')
async def update_diagnosis(did: str, body: dict = Body(...), user: dict = Depends(require_module('masters'))):
    upd = {k: v for k, v in body.items() if k in ('code', 'name', 'status')}
    await db.diagnoses.update_one({'id': did}, {'$set': upd})
    await audit(user, 'update', 'diagnosis', did)
    return await db.diagnoses.find_one({'id': did}, {'_id': 0})


# ---- Medicines (dedicated) ----
@router.get('/medicines')
async def list_medicines(search: str = '', page: int = 1, limit: int = 100, user: dict = Depends(get_current_user)):
    q = {}
    if search:
        q['$or'] = [{'name': {'$regex': search, '$options': 'i'}}, {'generic': {'$regex': search, '$options': 'i'}},
                    {'brand': {'$regex': search, '$options': 'i'}}]
    total = await db.medicines.count_documents(q)
    items = await db.medicines.find(q, {'_id': 0}).sort('name', 1).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {'items': items, 'total': total, 'page': page, 'limit': limit}


@router.post('/medicines')
async def create_medicine(body: dict = Body(...), user: dict = Depends(get_current_user)):
    if not can_pharmacy(user):
        raise HTTPException(status_code=403, detail='Not allowed to add medicines')
    doc = {
        'id': new_id(), 'name': body.get('name', ''), 'generic': body.get('generic', ''),
        'brand': body.get('brand', ''), 'category': body.get('category', ''),
        'form': body.get('form', ''), 'strength': body.get('strength', ''),
        'manufacturer': body.get('manufacturer', ''), 'unit': body.get('unit', 'tablet'),
        'price': float(body.get('price', 0) or 0), 'mrp': float(body.get('mrp', 0) or 0),
        'reorder_level': int(body.get('reorder_level', 10) or 10),
        'stock': int(body.get('stock', 0) or 0), 'status': 'active',
        'created_at': now_iso(), 'updated_at': now_iso(),
    }
    await db.medicines.insert_one(doc)
    doc.pop('_id', None)
    await audit(user, 'create', 'medicine', doc['id'], {'name': doc['name']})
    return doc


@router.put('/medicines/{mid}')
async def update_medicine(mid: str, body: dict = Body(...), user: dict = Depends(get_current_user)):
    if not can_pharmacy(user):
        raise HTTPException(status_code=403, detail='Not allowed')
    body.pop('_id', None)
    body.pop('id', None)
    body['updated_at'] = now_iso()
    await db.medicines.update_one({'id': mid}, {'$set': body})
    await audit(user, 'update', 'medicine', mid)
    return await db.medicines.find_one({'id': mid}, {'_id': 0})


def can_pharmacy(user):
    return user.get('role') in ('super_admin', 'hospital_admin', 'pharmacist', 'inventory_manager', 'doctor')
