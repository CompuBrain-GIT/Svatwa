from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Body
from common import (db, new_id, now_iso, require_module, get_current_user, audit,
                    next_sequence, require_roles)
from routes_billing import add_charge

router = APIRouter()
SIX_MONTHS = timedelta(days=182)


async def get_pending_threshold():
    s = await db.settings.find_one({'id': 'app'}, {'_id': 0}) or {}
    return float(s.get('pending_dues_threshold', 5000))


async def patient_dues(patient_id: str):
    charges = await db.charges.find({'patient_id': patient_id}, {'_id': 0}).to_list(100000)
    billed = sum(float(c.get('net', 0)) for c in charges)
    pays = await db.payments.find({'patient_id': patient_id}, {'_id': 0}).to_list(100000)
    paid = sum(float(p.get('amount', 0)) for p in pays)
    return round(billed - paid, 2)


# ---------------- PATIENTS ----------------
@router.post('/patients')
async def create_patient(body: dict = Body(...), user: dict = Depends(require_module('patients'))):
    uhid = await next_sequence('uhid', 'SVT', 5)
    doc = {'id': new_id(), 'uhid': uhid, 'status': 'active', 'created_at': now_iso(), 'updated_at': now_iso()}
    fields = ['name', 'mobile', 'secondary_mobile', 'gender', 'blood_group', 'dob', 'age', 'city', 'area',
              'address', 'district', 'state', 'pincode', 'preferred_doctor', 'preferred_doctor_id', 'email',
              'referral_source', 'referral_detail', 'membership', 'corporate', 'preferred_language',
              'father_name', 'mother_name', 'guardian_name', 'notes', 'id_proof_type', 'id_proof_number',
              'abha_id', 'insurance_type', 'insurance_provider', 'insurance_policy', 'tpa_detail']
    for f in fields:
        doc[f] = body.get(f, '')
    await db.patients.insert_one(dict(doc))
    await audit(user, 'create', 'patient', doc['id'], {'uhid': uhid, 'name': doc['name']})
    return doc


@router.get('/patients')
async def list_patients(search: str = '', page: int = 1, limit: int = 25, user: dict = Depends(require_module('patients'))):
    q = {}
    if search:
        q['$or'] = [{'name': {'$regex': search, '$options': 'i'}}, {'mobile': {'$regex': search, '$options': 'i'}},
                    {'uhid': {'$regex': search, '$options': 'i'}}, {'email': {'$regex': search, '$options': 'i'}},
                    {'abha_id': {'$regex': search, '$options': 'i'}}]
    total = await db.patients.count_documents(q)
    items = await db.patients.find(q, {'_id': 0}).sort('created_at', -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    for p in items:
        await _annotate(p)
    return {'items': items, 'total': total, 'page': page, 'limit': limit}


async def _annotate(p):
    last = await db.visits.find_one({'patient_id': p['id']}, {'_id': 0}, sort=[('created_at', -1)])
    p['last_visit'] = last.get('created_at') if last else None
    is_old = False
    if last and last.get('created_at'):
        try:
            dt = datetime.fromisoformat(last['created_at'])
            is_old = (datetime.now(timezone.utc) - dt) >= SIX_MONTHS
        except Exception:
            is_old = False
    p['new_case_alert'] = is_old or not last
    p['dues'] = await patient_dues(p['id'])


@router.get('/patients/{pid}')
async def get_patient(pid: str, user: dict = Depends(require_module('patients'))):
    p = await db.patients.find_one({'id': pid}, {'_id': 0})
    if not p:
        raise HTTPException(status_code=404, detail='Patient not found')
    await _annotate(p)
    return p


@router.put('/patients/{pid}')
async def update_patient(pid: str, body: dict = Body(...), user: dict = Depends(require_module('patients'))):
    body.pop('_id', None); body.pop('id', None); body.pop('uhid', None)
    body['updated_at'] = now_iso()
    await db.patients.update_one({'id': pid}, {'$set': body})
    await audit(user, 'update', 'patient', pid)
    return await db.patients.find_one({'id': pid}, {'_id': 0})


# ---------------- CASES ----------------
@router.post('/cases')
async def create_case(body: dict = Body(...), user: dict = Depends(require_module('patients'))):
    pid = body.get('patient_id')
    if not await db.patients.find_one({'id': pid}):
        raise HTTPException(status_code=404, detail='Patient not found')
    case_no = await next_sequence('case', 'CASE', 5)
    doc = {'id': new_id(), 'case_no': case_no, 'patient_id': pid,
           'treatment_type': body.get('treatment_type', 'Consulting'),
           'doctor_id': body.get('doctor_id', ''), 'doctor_name': body.get('doctor_name', ''),
           'diagnosis': body.get('diagnosis', ''), 'complaint': body.get('complaint', ''),
           'diseases': body.get('diseases', []), 'status': body.get('status', 'Active'),
           'created_at': now_iso(), 'updated_at': now_iso()}
    await db.cases.insert_one(dict(doc))
    await audit(user, 'create', 'case', doc['id'], {'case_no': case_no})
    return doc


@router.get('/cases')
async def list_cases(patient_id: str = '', user: dict = Depends(require_module('patients'))):
    q = {'patient_id': patient_id} if patient_id else {}
    items = await db.cases.find(q, {'_id': 0}).sort('created_at', -1).to_list(500)
    return {'items': items}


@router.put('/cases/{cid}')
async def update_case(cid: str, body: dict = Body(...), user: dict = Depends(require_module('patients'))):
    body.pop('_id', None); body.pop('id', None); body['updated_at'] = now_iso()
    await db.cases.update_one({'id': cid}, {'$set': body})
    await audit(user, 'update', 'case', cid)
    return await db.cases.find_one({'id': cid}, {'_id': 0})


# ---------------- OPD VISITS / QUEUE ----------------
@router.post('/visits')
async def create_visit(body: dict = Body(...), user: dict = Depends(require_module('opd'))):
    pid = body.get('patient_id')
    patient = await db.patients.find_one({'id': pid}, {'_id': 0})
    if not patient:
        raise HTTPException(status_code=404, detail='Patient not found')
    # dues threshold check
    threshold = await get_pending_threshold()
    dues = await patient_dues(pid)
    if dues > threshold and not body.get('override_dues'):
        raise HTTPException(status_code=402, detail=f'Outstanding dues ₹{dues} exceed threshold ₹{threshold}. Authorized override required.')
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    doctor_id = body.get('doctor_id', '')
    token_count = await db.visits.count_documents({'doctor_id': doctor_id, 'visit_date': today}) + 1
    doc = {
        'id': new_id(), 'patient_id': pid, 'uhid': patient.get('uhid'), 'patient_name': patient.get('name'),
        'case_id': body.get('case_id', ''), 'doctor_id': doctor_id, 'doctor_name': body.get('doctor_name', ''),
        'department': body.get('department', ''), 'reason': body.get('reason', ''),
        'visit_date': today, 'appt_time': body.get('appt_time', ''), 'duration': body.get('duration', 15),
        'token': token_count, 'status': 'checked_in', 'tags': body.get('tags', []),
        'is_new_case': body.get('is_new_case', False),
        'timestamps': {'registration': now_iso()}, 'created_at': now_iso(), 'updated_at': now_iso(),
    }
    await db.visits.insert_one(dict(doc))
    # auto consultation charge
    fee = float(body.get('consultation_fee', 500) or 500)
    if fee > 0:
        await add_charge(pid, body.get('case_id', ''), 'Consultation', fee, 'opd_visit', user,
                         meta={'visit_id': doc['id'], 'doctor': doc['doctor_name']})
    await audit(user, 'create', 'visit', doc['id'], {'token': token_count})
    return doc


@router.get('/visits')
async def list_visits(status: str = '', doctor_id: str = '', patient_id: str = '', date: str = '',
                      user: dict = Depends(require_module('opd'))):
    q = {}
    if status:
        q['status'] = status
    if doctor_id:
        q['doctor_id'] = doctor_id
    if patient_id:
        q['patient_id'] = patient_id
    if date:
        q['visit_date'] = date
    items = await db.visits.find(q, {'_id': 0}).sort('created_at', -1).to_list(500)
    return {'items': items}


@router.put('/visits/{vid}/status')
async def visit_status(vid: str, body: dict = Body(...), user: dict = Depends(require_module('opd'))):
    status = body.get('status')
    tsmap = {'waiting': 'waiting', 'in_consultation': 'consult_start', 'completed': 'consult_end'}
    upd = {'status': status, 'updated_at': now_iso()}
    if status in tsmap:
        upd[f'timestamps.{tsmap[status]}'] = now_iso()
    await db.visits.update_one({'id': vid}, {'$set': upd})
    await audit(user, 'status', 'visit', vid, {'status': status})
    return await db.visits.find_one({'id': vid}, {'_id': 0})


@router.put('/visits/{vid}/tags')
async def visit_tags(vid: str, body: dict = Body(...), user: dict = Depends(require_module('opd'))):
    await db.visits.update_one({'id': vid}, {'$set': {'tags': body.get('tags', []), 'updated_at': now_iso()}})
    return await db.visits.find_one({'id': vid}, {'_id': 0})


# ---------------- APPOINTMENTS ----------------
@router.post('/appointments')
async def create_appt(body: dict = Body(...), user: dict = Depends(require_module('appointments'))):
    doc = {'id': new_id(), 'patient_id': body.get('patient_id', ''), 'patient_name': body.get('patient_name', ''),
           'doctor_id': body.get('doctor_id', ''), 'doctor_name': body.get('doctor_name', ''),
           'date': body.get('date', ''), 'time': body.get('time', ''), 'duration': body.get('duration', 15),
           'type': body.get('type', 'Consultation'), 'status': 'scheduled', 'notes': body.get('notes', ''),
           'kind': body.get('kind', 'appointment'), 'created_at': now_iso()}
    # overlap prevention
    if doc['doctor_id'] and await db.appointments.find_one({'doctor_id': doc['doctor_id'], 'date': doc['date'],
                                                            'time': doc['time'], 'status': {'$ne': 'cancelled'}}):
        if not body.get('force'):
            raise HTTPException(status_code=409, detail='Doctor already has an appointment at this time')
    await db.appointments.insert_one(dict(doc))
    await audit(user, 'create', 'appointment', doc['id'])
    return doc


@router.get('/appointments')
async def list_appts(doctor_id: str = '', patient_id: str = '', date_from: str = '', date_to: str = '',
                     user: dict = Depends(require_module('appointments'))):
    q = {}
    if doctor_id:
        q['doctor_id'] = doctor_id
    if patient_id:
        q['patient_id'] = patient_id
    if date_from or date_to:
        q['date'] = {}
        if date_from:
            q['date']['$gte'] = date_from
        if date_to:
            q['date']['$lte'] = date_to
    items = await db.appointments.find(q, {'_id': 0}).sort('date', 1).to_list(1000)
    return {'items': items}


@router.put('/appointments/{aid}')
async def update_appt(aid: str, body: dict = Body(...), user: dict = Depends(require_module('appointments'))):
    body.pop('_id', None); body.pop('id', None)
    await db.appointments.update_one({'id': aid}, {'$set': body})
    await audit(user, 'update', 'appointment', aid)
    return await db.appointments.find_one({'id': aid}, {'_id': 0})


# ---------------- CLINICAL RECORDS ----------------
@router.post('/clinical/{kind}')
async def create_clinical(kind: str, body: dict = Body(...), user: dict = Depends(require_module('clinical'))):
    doc = {'id': new_id(), 'kind': kind, 'patient_id': body.get('patient_id', ''),
           'case_id': body.get('case_id', ''), 'visit_id': body.get('visit_id', ''),
           'admission_id': body.get('admission_id', ''), 'data': body.get('data', {}),
           'author_id': user['id'], 'author_name': user.get('name'), 'author_role': user.get('role'),
           'at': now_iso()}
    await db.clinical_records.insert_one(dict(doc))
    await audit(user, 'create', f'clinical:{kind}', doc['id'], {'patient_id': doc['patient_id']})
    return doc


@router.get('/clinical')
async def list_clinical(patient_id: str = '', case_id: str = '', kind: str = '', admission_id: str = '',
                        user: dict = Depends(require_module('clinical'))):
    q = {}
    for k, v in (('patient_id', patient_id), ('case_id', case_id), ('kind', kind), ('admission_id', admission_id)):
        if v:
            q[k] = v
    items = await db.clinical_records.find(q, {'_id': 0}).sort('at', -1).to_list(1000)
    return {'items': items}


# ---------------- PRESCRIPTIONS ----------------
@router.post('/prescriptions')
async def create_prescription(body: dict = Body(...), user: dict = Depends(require_module('clinical'))):
    items = body.get('items', [])
    follow_up = compute_followup(items, body.get('follow_up_days'))
    doc = {'id': new_id(), 'patient_id': body.get('patient_id', ''), 'patient_name': body.get('patient_name', ''),
           'case_id': body.get('case_id', ''), 'visit_id': body.get('visit_id', ''),
           'doctor_id': body.get('doctor_id', user['id']), 'doctor_name': body.get('doctor_name', user.get('name')),
           'items': items, 'notes': body.get('notes', ''), 'follow_up_date': follow_up,
           'status': body.get('status', 'confirmed'), 'dispense_status': 'pending',
           'created_at': now_iso()}
    await db.prescriptions.insert_one(dict(doc))
    await audit(user, 'create', 'prescription', doc['id'], {'items': len(items)})
    return doc


def compute_followup(items, explicit_days=None):
    days = 0
    if explicit_days:
        days = int(explicit_days)
    else:
        for it in items:
            try:
                days = max(days, int(it.get('duration', 0)))
            except Exception:
                pass
    if days <= 0:
        return ''
    target = datetime.now(timezone.utc) + timedelta(days=days)
    # push past weekend (Sunday)
    for _ in range(10):
        if target.weekday() == 6:
            target += timedelta(days=1)
        else:
            break
    return target.strftime('%Y-%m-%d')


@router.get('/prescriptions')
async def list_prescriptions(patient_id: str = '', case_id: str = '', user: dict = Depends(get_current_user)):
    q = {}
    if patient_id:
        q['patient_id'] = patient_id
    if case_id:
        q['case_id'] = case_id
    items = await db.prescriptions.find(q, {'_id': 0}).sort('created_at', -1).to_list(500)
    return {'items': items}


@router.get('/prescriptions/previous/{patient_id}')
async def previous_prescription(patient_id: str, user: dict = Depends(require_module('clinical'))):
    p = await db.prescriptions.find_one({'patient_id': patient_id}, {'_id': 0}, sort=[('created_at', -1)])
    return {'prescription': p}


# ---------------- PATIENT TIMELINE & 360 ----------------
@router.get('/patients/{pid}/timeline')
async def timeline(pid: str, user: dict = Depends(require_module('patients'))):
    events = []
    async def add(coll, label, date_field, extra):
        docs = await db[coll].find({'patient_id': pid}, {'_id': 0}).to_list(500)
        for d in docs:
            events.append({'type': label, 'at': d.get(date_field) or d.get('created_at') or d.get('at'),
                           'id': d.get('id'), 'detail': extra(d)})
    await add('cases', 'Case', 'created_at', lambda d: f"{d.get('case_no')} · {d.get('treatment_type')}")
    await add('visits', 'OPD Visit', 'created_at', lambda d: f"Token {d.get('token')} · {d.get('doctor_name')}")
    await add('appointments', 'Appointment', 'date', lambda d: f"{d.get('type')} · {d.get('doctor_name')}")
    await add('prescriptions', 'Prescription', 'created_at', lambda d: f"{len(d.get('items', []))} medicine(s) · {d.get('doctor_name')}")
    await add('clinical_records', 'Clinical', 'at', lambda d: d.get('kind', '').replace('_', ' ').title())
    await add('admissions', 'IPD Admission', 'created_at', lambda d: f"{d.get('ipd_no')} · {d.get('ward_name')}")
    await add('pharmacy_dispense', 'Pharmacy', 'created_at', lambda d: f"{len(d.get('items', []))} item(s) dispensed")
    await add('invoices', 'Invoice', 'created_at', lambda d: f"{d.get('invoice_no')} · ₹{d.get('total')}")
    await add('payments', 'Payment', 'created_at', lambda d: f"₹{d.get('amount')} · {d.get('method')}")
    events = [e for e in events if e['at']]
    events.sort(key=lambda e: e['at'], reverse=True)
    return {'events': events}
