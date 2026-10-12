from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Body
from common import db, new_id, now_iso, require_module, get_current_user, audit
from routes_billing import add_charge

router = APIRouter()


# ---------------- PHARMACY QUEUE & DISPENSING ----------------
@router.get('/pharmacy/queue')
async def pharmacy_queue(user: dict = Depends(require_module('pharmacy'))):
    items = await db.prescriptions.find({'status': 'confirmed', 'dispense_status': 'pending'},
                                        {'_id': 0}).sort('created_at', 1).to_list(500)
    return {'items': items}


@router.post('/pharmacy/dispense')
async def dispense(body: dict = Body(...), user: dict = Depends(require_module('pharmacy'))):
    pres_id = body.get('prescription_id')
    pres = await db.prescriptions.find_one({'id': pres_id}, {'_id': 0}) if pres_id else None
    items = body.get('items', [])
    total = 0.0
    for it in items:
        med_id = it.get('medicine_id')
        qty = int(it.get('quantity', 0) or 0)
        med = await db.medicines.find_one({'id': med_id}) if med_id else None
        if med:
            if med.get('stock', 0) < qty:
                raise HTTPException(status_code=400, detail=f"Insufficient stock for {med.get('name')} (have {med.get('stock',0)})")
            await db.medicines.update_one({'id': med_id}, {'$inc': {'stock': -qty}})
            price = float(med.get('price', 0) or 0)
            it['name'] = med.get('name')
            it['price'] = price
            it['amount'] = round(price * qty, 2)
            total += it['amount']
            await db.stock_movements.insert_one({'id': new_id(), 'medicine_id': med_id, 'type': 'dispense',
                                                 'qty': -qty, 'patient_id': body.get('patient_id'),
                                                 'at': now_iso(), 'by': user.get('name')})
    doc = {'id': new_id(), 'prescription_id': pres_id, 'patient_id': body.get('patient_id', ''),
           'patient_name': body.get('patient_name', ''), 'case_id': body.get('case_id', ''),
           'doctor_name': pres.get('doctor_name') if pres else body.get('doctor_name', ''),
           'items': items, 'total': round(total, 2), 'dispensed_by': user.get('name'),
           'batch': body.get('batch', ''), 'created_at': now_iso()}
    await db.pharmacy_dispense.insert_one(dict(doc))
    if pres_id:
        await db.prescriptions.update_one({'id': pres_id}, {'$set': {'dispense_status': 'dispensed'}})
    if total > 0:
        await add_charge(doc['patient_id'], doc['case_id'], 'Pharmacy / Medicine', total, 'pharmacy', user,
                         meta={'dispense_id': doc['id']})
    await audit(user, 'dispense', 'pharmacy', doc['id'], {'total': total})
    return doc


@router.get('/pharmacy/history')
async def pharmacy_history(patient_id: str = '', user: dict = Depends(require_module('pharmacy'))):
    q = {'patient_id': patient_id} if patient_id else {}
    items = await db.pharmacy_dispense.find(q, {'_id': 0}).sort('created_at', -1).to_list(1000)
    return {'items': items}


@router.get('/pharmacy/analytics')
async def pharmacy_analytics(user: dict = Depends(require_module('pharmacy'))):
    disp = await db.pharmacy_dispense.find({}, {'_id': 0}).to_list(5000)
    by_med, by_doctor = {}, {}
    revenue = 0.0
    for d in disp:
        revenue += float(d.get('total', 0))
        by_doctor[d.get('doctor_name', 'Unknown')] = round(by_doctor.get(d.get('doctor_name', 'Unknown'), 0) + float(d.get('total', 0)), 2)
        for it in d.get('items', []):
            by_med[it.get('name', '?')] = by_med.get(it.get('name', '?'), 0) + int(it.get('quantity', 0) or 0)
    return {'revenue': round(revenue, 2), 'by_medicine': by_med, 'by_doctor': by_doctor,
            'dispense_count': len(disp)}


# ---------------- INVENTORY ----------------
@router.get('/inventory/low-stock')
async def low_stock(user: dict = Depends(require_module('inventory'))):
    meds = await db.medicines.find({}, {'_id': 0}).to_list(5000)
    low = [m for m in meds if m.get('stock', 0) <= m.get('reorder_level', 10)]
    return {'items': low}


@router.post('/inventory/stock')
async def stock_movement(body: dict = Body(...), user: dict = Depends(require_module('inventory'))):
    med_id = body.get('medicine_id')
    qty = int(body.get('qty', 0) or 0)
    mtype = body.get('type', 'stock_in')
    delta = qty if mtype in ('stock_in', 'purchase', 'adjustment_add', 'return') else -qty
    await db.medicines.update_one({'id': med_id}, {'$inc': {'stock': delta}})
    doc = {'id': new_id(), 'medicine_id': med_id, 'type': mtype, 'qty': delta,
           'note': body.get('note', ''), 'at': now_iso(), 'by': user.get('name')}
    await db.stock_movements.insert_one(dict(doc))
    await audit(user, 'stock', 'inventory', med_id, {'type': mtype, 'qty': delta})
    return doc


@router.get('/inventory/movements')
async def movements(medicine_id: str = '', user: dict = Depends(require_module('inventory'))):
    q = {'medicine_id': medicine_id} if medicine_id else {}
    items = await db.stock_movements.find(q, {'_id': 0}).sort('at', -1).to_list(1000)
    return {'items': items}
