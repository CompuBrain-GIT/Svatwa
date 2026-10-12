from fastapi import APIRouter, Depends, HTTPException, Body
from common import db, new_id, now_iso, require_module, get_current_user, audit, next_sequence

router = APIRouter()


async def add_charge(patient_id, case_id, service, amount, source, user, qty=1, discount=0, tax=0, meta=None):
    """Create a billing charge entry automatically from a source workflow."""
    amount = float(amount or 0)
    discount = float(discount or 0)
    tax = float(tax or 0)
    net = round(amount * qty - discount + tax, 2)
    doc = {
        'id': new_id(), 'patient_id': patient_id, 'case_id': case_id or '',
        'service': service, 'description': (meta or {}).get('description', service),
        'qty': qty, 'rate': amount, 'discount': discount, 'tax': tax, 'net': net,
        'source': source, 'status': 'posted', 'invoiced': False, 'meta': meta or {},
        'created_by': user.get('id') if user else 'system', 'created_by_name': user.get('name') if user else 'System',
        'created_at': now_iso(),
    }
    await db.charges.insert_one(dict(doc))
    return doc


@router.post('/charges')
async def create_charge(body: dict = Body(...), user: dict = Depends(require_module('billing'))):
    doc = await add_charge(body.get('patient_id'), body.get('case_id'), body.get('service', 'Service'),
                           body.get('amount', 0), 'manual', user, int(body.get('qty', 1) or 1),
                           body.get('discount', 0), body.get('tax', 0),
                           {'description': body.get('description', ''), 'admission_id': body.get('admission_id', '')})
    await audit(user, 'create', 'charge', doc['id'], {'net': doc['net']})
    return doc


@router.get('/charges')
async def list_charges(patient_id: str = '', case_id: str = '', admission_id: str = '', uninvoiced: bool = False,
                       user: dict = Depends(require_module('billing'))):
    q = {}
    if patient_id:
        q['patient_id'] = patient_id
    if case_id:
        q['case_id'] = case_id
    if admission_id:
        q['meta.admission_id'] = admission_id
    if uninvoiced:
        q['invoiced'] = False
    items = await db.charges.find(q, {'_id': 0}).sort('created_at', -1).to_list(2000)
    return {'items': items}


@router.delete('/charges/{cid}')
async def delete_charge(cid: str, user: dict = Depends(get_current_user)):
    if user.get('role') != 'super_admin':
        raise HTTPException(status_code=403, detail='Only Super Admin can remove posted charges')
    await db.charges.delete_one({'id': cid})
    await audit(user, 'delete', 'charge', cid)
    return {'ok': True}


@router.post('/invoices')
async def create_invoice(body: dict = Body(...), user: dict = Depends(require_module('billing'))):
    charge_ids = body.get('charge_ids', [])
    charges = await db.charges.find({'id': {'$in': charge_ids}}, {'_id': 0}).to_list(2000)
    if not charges:
        raise HTTPException(status_code=400, detail='No charges selected')
    total = round(sum(float(c['net']) for c in charges), 2)
    inv_no = await next_sequence('invoice', 'INV', 6)
    doc = {'id': new_id(), 'invoice_no': inv_no, 'patient_id': body.get('patient_id'),
           'patient_name': body.get('patient_name', ''), 'case_id': body.get('case_id', ''),
           'type': body.get('type', 'OPD'), 'items': charges, 'total': total, 'status': 'unpaid',
           'created_by_name': user.get('name'), 'created_at': now_iso()}
    await db.invoices.insert_one(dict(doc))
    await db.charges.update_many({'id': {'$in': charge_ids}}, {'$set': {'invoiced': True, 'invoice_no': inv_no}})
    await audit(user, 'create', 'invoice', doc['id'], {'invoice_no': inv_no, 'total': total})
    return doc


@router.get('/invoices')
async def list_invoices(patient_id: str = '', user: dict = Depends(require_module('billing'))):
    q = {'patient_id': patient_id} if patient_id else {}
    items = await db.invoices.find(q, {'_id': 0}).sort('created_at', -1).to_list(1000)
    return {'items': items}


@router.post('/payments')
async def record_payment(body: dict = Body(...), user: dict = Depends(require_module('billing'))):
    pid = body.get('patient_id')
    amount = float(body.get('amount', 0) or 0)
    # outstanding check
    charges = await db.charges.find({'patient_id': pid}, {'_id': 0}).to_list(100000)
    billed = sum(float(c.get('net', 0)) for c in charges)
    prev = await db.payments.find({'patient_id': pid}, {'_id': 0}).to_list(100000)
    paid = sum(float(p.get('amount', 0)) for p in prev)
    outstanding = round(billed - paid, 2)
    if amount > outstanding and not body.get('allow_advance'):
        raise HTTPException(status_code=400, detail=f'Payment ₹{amount} exceeds outstanding ₹{outstanding}')
    rcpt = await next_sequence('receipt', 'RCPT', 6)
    doc = {'id': new_id(), 'receipt_no': rcpt, 'patient_id': pid, 'patient_name': body.get('patient_name', ''),
           'case_id': body.get('case_id', ''), 'invoice_id': body.get('invoice_id', ''),
           'invoice_no': body.get('invoice_no', ''), 'amount': amount, 'method': body.get('method', 'Cash'),
           'reference': body.get('reference', ''), 'notes': body.get('notes', ''),
           'collected_by': user.get('name'), 'created_at': now_iso()}
    await db.payments.insert_one(dict(doc))
    if body.get('invoice_id'):
        await db.invoices.update_one({'id': body['invoice_id']}, {'$set': {'status': 'paid'}})
    await audit(user, 'payment', 'payment', doc['id'], {'amount': amount})
    return doc


@router.get('/payments')
async def list_payments(patient_id: str = '', user: dict = Depends(require_module('billing'))):
    q = {'patient_id': patient_id} if patient_id else {}
    items = await db.payments.find(q, {'_id': 0}).sort('created_at', -1).to_list(2000)
    return {'items': items}


@router.get('/billing/summary/{patient_id}')
async def billing_summary(patient_id: str, user: dict = Depends(require_module('billing'))):
    charges = await db.charges.find({'patient_id': patient_id}, {'_id': 0}).to_list(100000)
    pays = await db.payments.find({'patient_id': patient_id}, {'_id': 0}).to_list(100000)
    billed = round(sum(float(c.get('net', 0)) for c in charges), 2)
    discount = round(sum(float(c.get('discount', 0)) for c in charges), 2)
    received = round(sum(float(p.get('amount', 0)) for p in pays), 2)
    by_service = {}
    for c in charges:
        by_service[c['service']] = round(by_service.get(c['service'], 0) + float(c['net']), 2)
    return {'billed': billed, 'discount': discount, 'received': received,
            'outstanding': round(billed - received, 2), 'by_service': by_service,
            'charges': charges, 'payments': pays}


# ---------------- EXPENSES ----------------
@router.post('/expenses')
async def create_expense(body: dict = Body(...), user: dict = Depends(require_module('expenses'))):
    doc = {'id': new_id(), 'category': body.get('category', ''), 'vendor': body.get('vendor', ''),
           'description': body.get('description', ''), 'amount': float(body.get('amount', 0) or 0),
           'date': body.get('date', now_iso()[:10]), 'method': body.get('method', 'Cash'),
           'reference': body.get('reference', ''), 'created_by': user.get('name'), 'created_at': now_iso()}
    await db.expenses.insert_one(dict(doc))
    await audit(user, 'create', 'expense', doc['id'])
    return doc


@router.get('/expenses')
async def list_expenses(user: dict = Depends(require_module('expenses'))):
    items = await db.expenses.find({}, {'_id': 0}).sort('created_at', -1).to_list(1000)
    return {'items': items}


# ---------------- INSURANCE CLAIMS ----------------
@router.post('/claims')
async def create_claim(body: dict = Body(...), user: dict = Depends(require_module('insurance'))):
    doc = {'id': new_id(), 'patient_id': body.get('patient_id', ''), 'patient_name': body.get('patient_name', ''),
           'provider': body.get('provider', ''), 'policy': body.get('policy', ''),
           'claim_number': body.get('claim_number', ''), 'claim_amount': float(body.get('claim_amount', 0) or 0),
           'approved_amount': float(body.get('approved_amount', 0) or 0), 'status': body.get('status', 'Submitted'),
           'notes': body.get('notes', ''), 'created_at': now_iso()}
    await db.claims.insert_one(dict(doc))
    await audit(user, 'create', 'claim', doc['id'])
    return doc


@router.get('/claims')
async def list_claims(user: dict = Depends(require_module('insurance'))):
    items = await db.claims.find({}, {'_id': 0}).sort('created_at', -1).to_list(1000)
    return {'items': items}


@router.put('/claims/{cid}')
async def update_claim(cid: str, body: dict = Body(...), user: dict = Depends(require_module('insurance'))):
    body.pop('_id', None); body.pop('id', None)
    await db.claims.update_one({'id': cid}, {'$set': body})
    return await db.claims.find_one({'id': cid}, {'_id': 0})


# ---------------- REFERRALS ----------------
@router.post('/referrals')
async def create_referral(body: dict = Body(...), user: dict = Depends(require_module('referrals'))):
    doc = {'id': new_id(), 'patient_id': body.get('patient_id', ''), 'patient_name': body.get('patient_name', ''),
           'source': body.get('source', ''), 'referring_doctor': body.get('referring_doctor', ''),
           'organization': body.get('organization', ''), 'type': body.get('type', 'External'),
           'reason': body.get('reason', ''), 'department': body.get('department', ''),
           'status': body.get('status', 'Open'), 'date': body.get('date', now_iso()[:10]), 'created_at': now_iso()}
    await db.referrals.insert_one(dict(doc))
    await audit(user, 'create', 'referral', doc['id'])
    return doc


@router.get('/referrals')
async def list_referrals(user: dict = Depends(require_module('referrals'))):
    items = await db.referrals.find({}, {'_id': 0}).sort('created_at', -1).to_list(1000)
    return {'items': items}


# ---------------- INVESTIGATIONS ----------------
@router.post('/investigations')
async def create_investigation(body: dict = Body(...), user: dict = Depends(require_module('diagnostics'))):
    doc = {'id': new_id(), 'patient_id': body.get('patient_id', ''), 'patient_name': body.get('patient_name', ''),
           'case_id': body.get('case_id', ''), 'test': body.get('test', ''), 'category': body.get('category', ''),
           'doctor_name': body.get('doctor_name', ''), 'status': 'Requested', 'result': '',
           'charge': float(body.get('charge', 0) or 0), 'created_at': now_iso()}
    await db.investigations.insert_one(dict(doc))
    if doc['charge'] > 0:
        await add_charge(doc['patient_id'], doc['case_id'], f"Investigation: {doc['test']}", doc['charge'],
                         'investigation', user, meta={'investigation_id': doc['id']})
    await audit(user, 'create', 'investigation', doc['id'])
    return doc


@router.get('/investigations')
async def list_investigations(patient_id: str = '', status: str = '', user: dict = Depends(require_module('diagnostics'))):
    q = {}
    if patient_id:
        q['patient_id'] = patient_id
    if status:
        q['status'] = status
    items = await db.investigations.find(q, {'_id': 0}).sort('created_at', -1).to_list(1000)
    return {'items': items}


@router.put('/investigations/{iid}')
async def update_investigation(iid: str, body: dict = Body(...), user: dict = Depends(require_module('diagnostics'))):
    upd = {k: v for k, v in body.items() if k in ('status', 'result')}
    await db.investigations.update_one({'id': iid}, {'$set': upd})
    await audit(user, 'update', 'investigation', iid)
    return await db.investigations.find_one({'id': iid}, {'_id': 0})
