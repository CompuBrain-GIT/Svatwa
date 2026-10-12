import os
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Body
from common import db, new_id, now_iso, require_module, get_current_user, audit

router = APIRouter()


# ---------------- DASHBOARD ----------------
@router.get('/dashboard/stats')
async def dashboard_stats(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    total_patients = await db.patients.count_documents({})
    new_today = await db.patients.count_documents({'created_at': {'$regex': f'^{today}'}})
    active_cases = await db.cases.count_documents({'status': {'$in': ['Active', 'Under Treatment']}})
    todays_appts = await db.appointments.count_documents({'date': today})
    opd_queue = await db.visits.count_documents({'visit_date': today, 'status': {'$nin': ['completed', 'cancelled', 'no_show']}})
    admissions = await db.admissions.count_documents({'status': 'admitted'})
    beds = await db.masters.find({'type': 'bed'}, {'_id': 0}).to_list(1000)
    available_beds = len([b for b in beds if b.get('bed_status', 'available') == 'available'])
    occupied_beds = len([b for b in beds if b.get('bed_status') == 'occupied'])
    meds = await db.medicines.find({}, {'_id': 0}).to_list(5000)
    low_stock = len([m for m in meds if m.get('stock', 0) <= m.get('reorder_level', 10)])
    pharmacy_pending = await db.prescriptions.count_documents({'status': 'confirmed', 'dispense_status': 'pending'})
    pays = await db.payments.find({'created_at': {'$regex': f'^{today}'}}, {'_id': 0}).to_list(5000)
    today_received = round(sum(float(p.get('amount', 0)) for p in pays), 2)
    all_charges = await db.charges.find({}, {'_id': 0}).to_list(100000)
    all_pays = await db.payments.find({}, {'_id': 0}).to_list(100000)
    billed = sum(float(c.get('net', 0)) for c in all_charges)
    received = sum(float(p.get('amount', 0)) for p in all_pays)
    return {
        'total_patients': total_patients, 'new_today': new_today, 'active_cases': active_cases,
        'todays_appointments': todays_appts, 'opd_queue': opd_queue, 'admissions': admissions,
        'available_beds': available_beds, 'occupied_beds': occupied_beds, 'total_beds': len(beds),
        'low_stock': low_stock, 'pharmacy_pending': pharmacy_pending, 'today_received': today_received,
        'total_revenue': round(received, 2), 'total_billed': round(billed, 2),
        'outstanding': round(billed - received, 2),
    }


# ---------------- ANALYTICS ----------------
@router.get('/analytics')
async def analytics(user: dict = Depends(require_module('analytics'))):
    patients = await db.patients.find({}, {'_id': 0}).to_list(100000)
    cases = await db.cases.find({}, {'_id': 0}).to_list(100000)
    visits = await db.visits.find({}, {'_id': 0}).to_list(100000)
    admissions = await db.admissions.find({}, {'_id': 0}).to_list(100000)
    charges = await db.charges.find({}, {'_id': 0}).to_list(100000)
    pays = await db.payments.find({}, {'_id': 0}).to_list(100000)

    def bucket_age(a):
        try:
            a = int(a)
        except Exception:
            return 'Unknown'
        if a < 18:
            return '0-17'
        if a < 30:
            return '18-29'
        if a < 45:
            return '30-44'
        if a < 60:
            return '45-59'
        return '60+'

    age_dist, gender_dist, disease_dist, treatment_dist = {}, {}, {}, {}
    for p in patients:
        age_dist[bucket_age(p.get('age'))] = age_dist.get(bucket_age(p.get('age')), 0) + 1
        g = p.get('gender') or 'Unknown'
        gender_dist[g] = gender_dist.get(g, 0) + 1
    for c in cases:
        t = c.get('treatment_type') or 'Other'
        treatment_dist[t] = treatment_dist.get(t, 0) + 1
        for d in (c.get('diseases') or []):
            disease_dist[d] = disease_dist.get(d, 0) + 1
    # new vs returning (returning = patient with >1 case)
    case_count = {}
    for c in cases:
        case_count[c['patient_id']] = case_count.get(c['patient_id'], 0) + 1
    returning = len([k for k, v in case_count.items() if v > 1])
    new_p = len(patients) - returning

    rev_by_service = {}
    for c in charges:
        rev_by_service[c['service']] = round(rev_by_service.get(c['service'], 0) + float(c['net']), 2)
    rev_by_method = {}
    for p in pays:
        rev_by_method[p.get('method', 'Cash')] = round(rev_by_method.get(p.get('method', 'Cash'), 0) + float(p['amount']), 2)
    billed = round(sum(float(c['net']) for c in charges), 2)
    received = round(sum(float(p['amount']) for p in pays), 2)

    # monthly revenue (last 6 months)
    monthly = {}
    for p in pays:
        m = (p.get('created_at') or '')[:7]
        if m:
            monthly[m] = round(monthly.get(m, 0) + float(p['amount']), 2)

    return {
        'patients': {'total': len(patients), 'new': new_p, 'returning': returning,
                     'age_distribution': age_dist, 'gender_distribution': gender_dist},
        'clinical': {'disease_distribution': disease_dist, 'treatment_distribution': treatment_dist,
                     'opd_visits': len(visits), 'admissions': len(admissions)},
        'billing': {'billed': billed, 'received': received, 'outstanding': round(billed - received, 2),
                    'revenue_by_service': rev_by_service, 'revenue_by_method': rev_by_method, 'monthly': monthly},
    }


# ---------------- NOTIFICATIONS / CAMPAIGNS / SURVEYS ----------------
@router.get('/notifications')
async def list_notifications(user: dict = Depends(get_current_user)):
    items = await db.notifications.find({}, {'_id': 0}).sort('created_at', -1).limit(100).to_list(100)
    unread = await db.notifications.count_documents({'read': False})
    return {'items': items, 'unread': unread}


@router.put('/notifications/{nid}/read')
async def read_notification(nid: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({'id': nid}, {'$set': {'read': True}})
    return {'ok': True}


@router.post('/segments/preview')
async def segment_preview(body: dict = Body(...), user: dict = Depends(require_module('notifications'))):
    q = {}
    if body.get('gender'):
        q['gender'] = body['gender']
    if body.get('insurance_type'):
        q['insurance_type'] = body['insurance_type']
    patients = await db.patients.find(q, {'_id': 0}).to_list(100000)
    if body.get('disease'):
        cases = await db.cases.find({'diseases': body['disease']}, {'_id': 0}).to_list(100000)
        pids = set(c['patient_id'] for c in cases)
        patients = [p for p in patients if p['id'] in pids]
    return {'count': len(patients), 'sample': [{'name': p.get('name'), 'uhid': p.get('uhid'), 'mobile': p.get('mobile')} for p in patients[:10]],
            'patient_ids': [p['id'] for p in patients]}


@router.post('/campaigns')
async def create_campaign(body: dict = Body(...), user: dict = Depends(require_module('notifications'))):
    pids = body.get('patient_ids', [])
    doc = {'id': new_id(), 'title': body.get('title', ''), 'message': body.get('message', ''),
           'segment': body.get('segment', {}), 'channel': body.get('channel', 'in_app'),
           'survey': body.get('survey'), 'recipient_count': len(pids), 'status': 'sent',
           'sent_count': len(pids), 'opened': 0, 'responses': 0, 'created_by': user.get('name'),
           'created_at': now_iso()}
    await db.campaigns.insert_one(dict(doc))
    # deliver as in-app notifications (demo)
    for pid in pids:
        await db.patient_notifications.insert_one({'id': new_id(), 'patient_id': pid, 'campaign_id': doc['id'],
                                                   'title': doc['title'], 'message': doc['message'],
                                                   'survey': doc.get('survey'), 'read': False, 'response': None,
                                                   'created_at': now_iso()})
    await audit(user, 'campaign', 'campaign', doc['id'], {'recipients': len(pids)})
    return doc


@router.get('/campaigns')
async def list_campaigns(user: dict = Depends(require_module('notifications'))):
    items = await db.campaigns.find({}, {'_id': 0}).sort('created_at', -1).to_list(500)
    totals = {'campaigns': len(items), 'sent': sum(c.get('sent_count', 0) for c in items),
              'responses': sum(c.get('responses', 0) for c in items)}
    return {'items': items, 'totals': totals}


# ---------------- AUDIT ----------------
@router.get('/audit')
async def audit_logs(user: dict = Depends(require_module('audit'))):
    items = await db.audit_logs.find({}, {'_id': 0}).sort('at', -1).limit(300).to_list(300)
    return {'items': items}


# ---------------- SETTINGS ----------------
@router.get('/settings')
async def get_settings(user: dict = Depends(get_current_user)):
    s = await db.settings.find_one({'id': 'app'}, {'_id': 0})
    if not s:
        s = {'id': 'app', 'hospital_name': 'SvaTWA Psychiatric Hospital', 'currency': '₹',
             'pending_dues_threshold': 5000, 'address': 'Ahmedabad', 'phone': '', 'email': ''}
        await db.settings.insert_one(dict(s))
    return s


@router.put('/settings')
async def update_settings(body: dict = Body(...), user: dict = Depends(require_module('settings'))):
    body.pop('_id', None)
    body['id'] = 'app'
    await db.settings.update_one({'id': 'app'}, {'$set': body}, upsert=True)
    await audit(user, 'update', 'settings', 'app')
    return await db.settings.find_one({'id': 'app'}, {'_id': 0})


# ---------------- AI PATIENT SUMMARY ----------------
@router.post('/ai/patient-summary')
async def patient_summary(body: dict = Body(...), user: dict = Depends(require_module('clinical'))):
    pid = body.get('patient_id')
    patient = await db.patients.find_one({'id': pid}, {'_id': 0})
    if not patient:
        raise HTTPException(status_code=404, detail='Patient not found')
    cases = await db.cases.find({'patient_id': pid}, {'_id': 0}).to_list(500)
    visits = await db.visits.find({'patient_id': pid}, {'_id': 0}).to_list(500)
    clinical = await db.clinical_records.find({'patient_id': pid}, {'_id': 0}).to_list(500)
    pres = await db.prescriptions.find({'patient_id': pid}, {'_id': 0}).to_list(500)

    lines = [f"PATIENT: {patient.get('name')} (UHID {patient.get('uhid')}), Age {patient.get('age')}, {patient.get('gender')}"]
    lines.append(f"Cases: {len(cases)}, OPD Visits: {len(visits)}")
    for c in cases:
        lines.append(f"- Case {c.get('case_no')}: {c.get('treatment_type')}, Dx: {c.get('diagnosis')}, Diseases: {', '.join(c.get('diseases', []))}")
    for cr in clinical[:30]:
        lines.append(f"- {cr.get('kind')}: {str(cr.get('data'))[:300]}")
    for p in pres[:10]:
        meds = ', '.join([f"{i.get('medicine','')} {i.get('dose','')}" for i in p.get('items', [])])
        lines.append(f"- Rx {p.get('created_at','')[:10]}: {meds}")
    raw = "\n".join(lines)

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=os.environ['EMERGENT_LLM_KEY'], session_id=f"summary-{pid}",
                       system_message=("You are a clinical documentation assistant for a psychiatric hospital. "
                                       "Summarize the provided patient history into a concise, structured clinical summary "
                                       "with sections: Demographics, Diagnoses, Treatment Course, Medications, Clinical Notes, "
                                       "and Follow-up. Do NOT diagnose, prescribe, or assess risk. This is for authorized "
                                       "professional review only.")).with_model("anthropic", "claude-sonnet-5-5")
        resp = await chat.send_message(UserMessage(text=f"Patient history:\n{raw}\n\nProduce the structured summary."))
        summary = resp if isinstance(resp, str) else str(resp)
    except Exception as e:
        summary = f"[AI summary unavailable: {e}]\n\nStructured raw export below:\n{raw}"
    await audit(user, 'ai_summary', 'patient', pid)
    return {'summary': summary, 'raw_export': raw}


@router.get('/patients/{pid}/export')
async def export_history(pid: str, user: dict = Depends(require_module('patients'))):
    patient = await db.patients.find_one({'id': pid}, {'_id': 0})
    if not patient:
        raise HTTPException(status_code=404, detail='Patient not found')
    cases = await db.cases.find({'patient_id': pid}, {'_id': 0}).to_list(500)
    pres = await db.prescriptions.find({'patient_id': pid}, {'_id': 0}).to_list(500)
    clinical = await db.clinical_records.find({'patient_id': pid}, {'_id': 0}).to_list(500)
    lines = [f"PATIENT HISTORY EXPORT — {patient.get('name')} (UHID {patient.get('uhid')})",
             f"Age: {patient.get('age')} | Gender: {patient.get('gender')} | Mobile: {patient.get('mobile')}", ""]
    lines.append("CASES:")
    for c in cases:
        lines.append(f"  {c.get('case_no')} — {c.get('treatment_type')} — Dx: {c.get('diagnosis')}")
    lines.append("\nPRESCRIPTIONS:")
    for p in pres:
        meds = '; '.join([f"{i.get('medicine','')} {i.get('dose','')} {i.get('frequency','')} x {i.get('duration','')}d" for i in p.get('items', [])])
        lines.append(f"  {p.get('created_at','')[:10]} ({p.get('doctor_name')}): {meds}")
    lines.append("\nCLINICAL RECORDS:")
    for cr in clinical:
        lines.append(f"  {cr.get('at','')[:10]} {cr.get('kind')}: {str(cr.get('data'))[:400]}")
    return {'text': "\n".join(lines)}
