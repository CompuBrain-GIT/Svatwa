from fastapi import APIRouter, Depends, HTTPException, Body
from common import db, new_id, now_iso, require_module, get_current_user, audit, next_sequence
from routes_billing import add_charge

router = APIRouter()


# ---------------- IPD ADMISSIONS ----------------
@router.post('/ipd/admissions')
async def admit(body: dict = Body(...), user: dict = Depends(require_module('ipd'))):
    pid = body.get('patient_id')
    patient = await db.patients.find_one({'id': pid}, {'_id': 0})
    if not patient:
        raise HTTPException(status_code=404, detail='Patient not found')
    bed_id = body.get('bed_id')
    bed = await db.masters.find_one({'id': bed_id, 'type': 'bed'}) if bed_id else None
    if bed and bed.get('bed_status') in ('occupied', 'blocked', 'maintenance'):
        raise HTTPException(status_code=400, detail='Selected bed is not available')
    ipd_no = await next_sequence('ipd', 'IPD', 5)
    doc = {'id': new_id(), 'ipd_no': ipd_no, 'patient_id': pid, 'uhid': patient.get('uhid'),
           'patient_name': patient.get('name'), 'case_id': body.get('case_id', ''),
           'admitting_doctor': body.get('admitting_doctor', ''), 'department': body.get('department', ''),
           'ward_name': body.get('ward_name', ''), 'room_name': body.get('room_name', ''),
           'bed_id': bed_id or '', 'bed_name': bed.get('name') if bed else body.get('bed_name', ''),
           'reason': body.get('reason', ''), 'attendant': body.get('attendant', ''),
           'tags': body.get('tags', []), 'status': 'admitted',
           'admitted_at': now_iso(), 'created_at': now_iso()}
    await db.admissions.insert_one(dict(doc))
    if bed_id:
        await db.masters.update_one({'id': bed_id}, {'$set': {'bed_status': 'occupied', 'patient_id': pid,
                                                              'patient_name': patient.get('name'), 'admission_id': doc['id']}})
    # room charge
    rc = float(body.get('room_charge', 0) or 0)
    if rc > 0:
        await add_charge(pid, body.get('case_id', ''), f"Room: {doc['room_name'] or doc['ward_name']}", rc,
                         'ipd_room', user, meta={'admission_id': doc['id']})
    await audit(user, 'admit', 'admission', doc['id'], {'ipd_no': ipd_no})
    return doc


@router.get('/ipd/admissions')
async def list_admissions(status: str = 'admitted', patient_id: str = '', user: dict = Depends(require_module('ipd'))):
    q = {}
    if status:
        q['status'] = status
    if patient_id:
        q['patient_id'] = patient_id
    items = await db.admissions.find(q, {'_id': 0}).sort('created_at', -1).to_list(500)
    return {'items': items}


@router.get('/ipd/console')
async def ipd_console(user: dict = Depends(require_module('ipd'))):
    beds = await db.masters.find({'type': 'bed'}, {'_id': 0}).sort('name', 1).to_list(1000)
    stats = {'total': len(beds), 'occupied': 0, 'available': 0, 'reserved': 0, 'maintenance': 0, 'blocked': 0, 'cleaning': 0}
    for b in beds:
        st = b.get('bed_status', 'available')
        stats[st] = stats.get(st, 0) + 1
    return {'beds': beds, 'stats': stats}


@router.post('/ipd/transfer')
async def transfer_bed(body: dict = Body(...), user: dict = Depends(require_module('ipd'))):
    adm_id = body.get('admission_id')
    adm = await db.admissions.find_one({'id': adm_id}, {'_id': 0})
    if not adm:
        raise HTTPException(status_code=404, detail='Admission not found')
    new_bed = await db.masters.find_one({'id': body.get('bed_id'), 'type': 'bed'})
    if not new_bed or new_bed.get('bed_status') in ('occupied', 'blocked', 'maintenance'):
        raise HTTPException(status_code=400, detail='Target bed not available')
    if adm.get('bed_id'):
        await db.masters.update_one({'id': adm['bed_id']}, {'$set': {'bed_status': 'available', 'patient_id': '', 'patient_name': '', 'admission_id': ''}})
    await db.masters.update_one({'id': new_bed['id']}, {'$set': {'bed_status': 'occupied', 'patient_id': adm['patient_id'],
                                                                'patient_name': adm['patient_name'], 'admission_id': adm_id}})
    hist = adm.get('transfers', [])
    hist.append({'from': adm.get('bed_name'), 'to': new_bed.get('name'), 'reason': body.get('reason', ''), 'at': now_iso()})
    await db.admissions.update_one({'id': adm_id}, {'$set': {'bed_id': new_bed['id'], 'bed_name': new_bed.get('name'),
                                                            'room_name': new_bed.get('room_name', adm.get('room_name')),
                                                            'ward_name': new_bed.get('ward_name', adm.get('ward_name')),
                                                            'transfers': hist}})
    await audit(user, 'transfer', 'admission', adm_id)
    return await db.admissions.find_one({'id': adm_id}, {'_id': 0})


@router.post('/ipd/alert')
async def behaviour_alert(body: dict = Body(...), user: dict = Depends(require_module('ipd'))):
    doc = {'id': new_id(), 'kind': 'incident', 'patient_id': body.get('patient_id', ''),
           'admission_id': body.get('admission_id', ''),
           'data': {'type': body.get('type', 'Rowdy Episode / Behaviour Alert'), 'note': body.get('note', '')},
           'author_name': user.get('name'), 'at': now_iso()}
    await db.clinical_records.insert_one(dict(doc))
    await db.notifications.insert_one({'id': new_id(), 'title': '⚠ Behaviour Alert', 'kind': 'alert',
                                       'message': f"{body.get('patient_name','Patient')}: {body.get('type','Alert')}",
                                       'audience': 'staff', 'read': False, 'created_at': now_iso()})
    await audit(user, 'alert', 'admission', body.get('admission_id'), {'type': body.get('type')})
    return doc


@router.post('/ipd/discharge')
async def discharge(body: dict = Body(...), user: dict = Depends(require_module('ipd'))):
    adm_id = body.get('admission_id')
    adm = await db.admissions.find_one({'id': adm_id}, {'_id': 0})
    if not adm:
        raise HTTPException(status_code=404, detail='Admission not found')
    if adm.get('bed_id'):
        await db.masters.update_one({'id': adm['bed_id']}, {'$set': {'bed_status': 'cleaning', 'patient_id': '', 'patient_name': '', 'admission_id': ''}})
    summary = {'diagnosis': body.get('diagnosis', ''), 'treatment_summary': body.get('treatment_summary', ''),
               'medication': body.get('medication', ''), 'final_condition': body.get('final_condition', ''),
               'instructions': body.get('instructions', ''), 'follow_up': body.get('follow_up', '')}
    await db.admissions.update_one({'id': adm_id}, {'$set': {'status': 'discharged', 'discharged_at': now_iso(),
                                                            'discharge_summary': summary}})
    await audit(user, 'discharge', 'admission', adm_id)
    return await db.admissions.find_one({'id': adm_id}, {'_id': 0})


# ---------------- NURSING / VITALS / ROUNDS / MED ADMIN ----------------
@router.post('/ipd/vitals')
async def add_vitals(body: dict = Body(...), user: dict = Depends(require_module('ipd'))):
    doc = {'id': new_id(), 'kind': 'vitals', 'patient_id': body.get('patient_id', ''),
           'admission_id': body.get('admission_id', ''), 'data': body.get('data', {}),
           'author_name': user.get('name'), 'at': now_iso()}
    await db.clinical_records.insert_one(dict(doc))
    return doc


@router.post('/ipd/med-admin')
async def med_admin(body: dict = Body(...), user: dict = Depends(require_module('ipd'))):
    doc = {'id': new_id(), 'kind': 'med_admin', 'patient_id': body.get('patient_id', ''),
           'admission_id': body.get('admission_id', ''),
           'data': {'medicine': body.get('medicine', ''), 'dose': body.get('dose', ''),
                    'status': body.get('status', 'administered'), 'reason': body.get('reason', ''),
                    'extra': body.get('extra', False)},
           'author_name': user.get('name'), 'at': now_iso()}
    await db.clinical_records.insert_one(dict(doc))
    await db.notifications.insert_one({'id': new_id(), 'title': 'Dose recorded', 'kind': 'activity',
                                       'message': f"{body.get('medicine','')} {body.get('status','administered')} for {body.get('patient_name','patient')}",
                                       'audience': 'doctor', 'read': False, 'created_at': now_iso()})
    return doc


@router.post('/ipd/handover')
async def handover(body: dict = Body(...), user: dict = Depends(require_module('ipd'))):
    doc = {'id': new_id(), 'kind': 'handover', 'patient_id': body.get('patient_id', ''),
           'admission_id': body.get('admission_id', ''), 'data': {'note': body.get('note', ''), 'flags': body.get('flags', [])},
           'author_name': user.get('name'), 'at': now_iso()}
    await db.clinical_records.insert_one(dict(doc))
    await audit(user, 'handover', 'nursing', body.get('admission_id'))
    return doc
