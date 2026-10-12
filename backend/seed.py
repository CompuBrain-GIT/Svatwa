from datetime import datetime, timezone, timedelta
from common import db, new_id, now_iso, hash_password
import os


async def _ensure_user(email, name, role, password):
    if not await db.users.find_one({'email': email}):
        await db.users.insert_one({'id': new_id(), 'email': email, 'name': name, 'role': role,
                                   'password_hash': hash_password(password), 'status': 'active',
                                   'phone': '', 'created_at': now_iso(), 'updated_at': now_iso()})


async def _masters(mtype, names):
    for n in names:
        if isinstance(n, dict):
            doc = {'type': mtype, **n}
            key = n.get('name')
        else:
            doc = {'type': mtype, 'name': n, 'code': ''}
            key = n
        if not await db.masters.find_one({'type': mtype, 'name': key}):
            doc.update({'id': new_id(), 'status': 'active', 'created_at': now_iso(), 'updated_at': now_iso()})
            await db.masters.insert_one(doc)


async def run_seed():
    admin_email = os.environ.get('ADMIN_EMAIL', 'admin@svatwa.com')
    admin_password = os.environ.get('ADMIN_PASSWORD', 'admin123')
    # Admin
    existing = await db.users.find_one({'email': admin_email})
    if not existing:
        await db.users.insert_one({'id': new_id(), 'email': admin_email, 'name': 'Dr. Super Admin',
                                   'role': 'super_admin', 'password_hash': hash_password(admin_password),
                                   'status': 'active', 'created_at': now_iso(), 'updated_at': now_iso()})
    # Staff
    await _ensure_user('doctor@svatwa.com', 'Dr. Marcus Vance', 'doctor', 'doctor123')
    await _ensure_user('psych@svatwa.com', 'Dr. Anita Sharma', 'psychologist', 'psych123')
    await _ensure_user('nurse@svatwa.com', 'Nurse Priya Nair', 'nurse', 'nurse123')
    await _ensure_user('reception@svatwa.com', 'Reena Shah', 'reception', 'reception123')
    await _ensure_user('pharmacy@svatwa.com', 'Pharm. Alok Desai', 'pharmacist', 'pharmacy123')
    await _ensure_user('billing@svatwa.com', 'Billing Officer', 'billing', 'billing123')

    if await db.masters.count_documents({}) == 0:
        await _masters('department', ['Psychiatry', 'Clinical Psychology', 'De-Addiction', 'Child Psychiatry', 'Geriatric Psychiatry'])
        await _masters('service', ['New Consultation', 'Follow-up Consultation', 'Therapy Session', 'Counselling', 'Psychological Assessment'])
        await _masters('treatment_type', ['Consulting', 'Therapy', 'Counseling', 'EPT', 'Other'])
        await _masters('disease', ['Depression', 'Anxiety', 'Bipolar Disorder', 'Schizophrenia', 'OCD', 'Alcohol Dependence', 'Tobacco Dependence', 'Substance Use Disorder', 'Stress Disorder'])
        await _masters('risk_level', [{'name': 'Low', 'code': 'low'}, {'name': 'Moderate', 'code': 'moderate'}, {'name': 'High', 'code': 'high'}, {'name': 'Critical', 'code': 'critical'}])
        await _masters('payment_method', ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Online Payment', 'Insurance/TPA'])
        await _masters('appointment_type', ['Consultation', 'Follow-up', 'Therapy', 'Counselling', 'Review'])
        await _masters('case_status', ['Draft', 'Active', 'Under Treatment', 'On Hold', 'Ready for Discharge', 'Discharged', 'Closed'])
        await _masters('reason_for_visit', ['Low mood', 'Anxiety', 'Sleep disturbance', 'Follow-up', 'Medication review', 'De-addiction', 'Behavioural concern'])
        await _masters('medicine_form', ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Drops'])
        await _masters('therapy_type', ['Individual', 'Family', 'Group', 'CBT', 'Supportive'])
        await _masters('opd_tag', ['Complimentary', 'Takes Too Much Time', 'Quick Case', 'Relative Only', 'Non-Cooperative Patient', 'Suicidal Patient', 'Geriatric Patient', 'Pediatric Patient'])
        await _masters('expense_category', ['Salaries', 'Utilities', 'Supplies', 'Maintenance', 'Marketing'])
        await _masters('referral_source', ['Doctor', 'Patient', 'Online', 'Signboard', 'Newspaper', 'Medical Camp', 'Other'])
        await _masters('insurance_provider', ['Star Health', 'HDFC Ergo', 'ICICI Lombard', 'New India Assurance'])
        await _masters('id_proof_type', ['Aadhaar', 'PAN', 'Driving License', 'Passport', 'Voter ID'])
        await _masters('language', ['English', 'Hindi', 'Gujarati', 'Marathi'])
        await _masters('ward', ['General Ward', 'Special Ward', 'ICU'])
        # Rooms + Beds
        rooms = [('General Ward', 'GW-101', 'Non-AC', 2000), ('General Ward', 'GW-102', 'Non-AC', 2000),
                 ('Special Ward', 'SW-201', 'Special AC', 4500), ('Special Ward', 'SW-202', 'Deluxe', 6000)]
        for ward, room, rtype, charge in rooms:
            await _masters('room', [{'name': room, 'ward_name': ward, 'room_type': rtype, 'charge': charge}])
            for i in range(1, 3):
                await _masters('bed', [{'name': f'{room}-B{i}', 'room_name': room, 'ward_name': ward,
                                        'room_type': rtype, 'charge': charge, 'bed_status': 'available'}])

    # Diagnoses
    if await db.diagnoses.count_documents({}) == 0:
        dx = [('6A70', 'Single episode depressive disorder'), ('6A71', 'Recurrent depressive disorder'),
              ('6A60', 'Bipolar type I disorder'), ('6A20', 'Schizophrenia'), ('6B00', 'Generalised anxiety disorder'),
              ('6B20', 'Obsessive-compulsive disorder'), ('6C40', 'Alcohol dependence'),
              ('6C4A', 'Nicotine dependence'), ('6B40', 'Post traumatic stress disorder'),
              ('6A05', 'Attention deficit hyperactivity disorder'), ('6D10', 'Personality disorder'),
              ('6E20', 'Mental disorder due to medical condition')]
        await db.diagnoses.insert_many([{'id': new_id(), 'code': c, 'name': n, 'status': 'active', 'created_at': now_iso()} for c, n in dx])

    # Medicines
    if await db.medicines.count_documents({}) == 0:
        meds = [('Escitalopram', 'Escitalopram', 'Nexito', 'Antidepressant', '10mg', 8, 12, 500),
                ('Sertraline', 'Sertraline', 'Serta', 'Antidepressant', '50mg', 6, 10, 400),
                ('Olanzapine', 'Olanzapine', 'Oleanz', 'Antipsychotic', '5mg', 10, 15, 300),
                ('Risperidone', 'Risperidone', 'Risdone', 'Antipsychotic', '2mg', 7, 11, 350),
                ('Lithium Carbonate', 'Lithium', 'Licab', 'Mood Stabilizer', '300mg', 5, 9, 250),
                ('Clonazepam', 'Clonazepam', 'Clonotril', 'Anxiolytic', '0.5mg', 4, 7, 200),
                ('Quetiapine', 'Quetiapine', 'Qutipin', 'Antipsychotic', '100mg', 9, 14, 280),
                ('Fluoxetine', 'Fluoxetine', 'Fludac', 'Antidepressant', '20mg', 6, 9, 450),
                ('Lorazepam', 'Lorazepam', 'Ativan', 'Anxiolytic', '2mg', 5, 8, 180),
                ('Divalproex', 'Divalproex', 'Valprol', 'Mood Stabilizer', '500mg', 8, 12, 220),
                ('Naltrexone', 'Naltrexone', 'Naltima', 'De-addiction', '50mg', 12, 18, 150),
                ('Acamprosate', 'Acamprosate', 'Campral', 'De-addiction', '333mg', 10, 16, 140)]
        await db.medicines.insert_many([{'id': new_id(), 'name': n, 'generic': g, 'brand': b, 'category': cat,
                                         'form': 'Tablet', 'strength': s, 'manufacturer': 'Generic Pharma',
                                         'unit': 'tablet', 'price': float(price), 'mrp': float(price) * 1.2,
                                         'reorder_level': int(ro), 'stock': int(stock), 'status': 'active',
                                         'created_at': now_iso(), 'updated_at': now_iso()}
                                        for n, g, b, cat, s, price, ro, stock in meds])

    # Demo patients
    if await db.patients.count_documents({}) == 0:
        demo = [
            {'name': 'Rahul Mehta', 'mobile': '9876500001', 'gender': 'Male', 'age': 34, 'dob': '1991-04-12',
             'city': 'Ahmedabad', 'disease': 'Depression', 'tt': 'Consulting', 'dx': 'Recurrent depressive disorder'},
            {'name': 'Sneha Patel', 'mobile': '9876500002', 'gender': 'Female', 'age': 27, 'dob': '1998-09-03',
             'city': 'Gandhinagar', 'disease': 'Anxiety', 'tt': 'Therapy', 'dx': 'Generalised anxiety disorder'},
            {'name': 'Imran Shaikh', 'mobile': '9876500003', 'gender': 'Male', 'age': 45, 'dob': '1980-01-20',
             'city': 'Ahmedabad', 'disease': 'Alcohol Dependence', 'tt': 'EPT', 'dx': 'Alcohol dependence'},
        ]
        from common import next_sequence
        doctor = await db.users.find_one({'role': 'doctor'})
        for i, d in enumerate(demo):
            uhid = await next_sequence('uhid', 'SVT', 5)
            pid = new_id()
            created = (datetime.now(timezone.utc) - timedelta(days=200 if i == 2 else 10)).isoformat()
            await db.patients.insert_one({'id': pid, 'uhid': uhid, 'name': d['name'], 'mobile': d['mobile'],
                                          'gender': d['gender'], 'age': d['age'], 'dob': d['dob'], 'city': d['city'],
                                          'insurance_type': 'Non-Insurance', 'status': 'active',
                                          'preferred_doctor': doctor.get('name') if doctor else '',
                                          'created_at': created, 'updated_at': created})
            case_no = await next_sequence('case', 'CASE', 5)
            cid = new_id()
            await db.cases.insert_one({'id': cid, 'case_no': case_no, 'patient_id': pid, 'treatment_type': d['tt'],
                                       'doctor_id': doctor['id'] if doctor else '', 'doctor_name': doctor.get('name') if doctor else '',
                                       'diagnosis': d['dx'], 'diseases': [d['disease']], 'status': 'Active',
                                       'created_at': created, 'updated_at': created})
            # charge + payment
            ch = {'id': new_id(), 'patient_id': pid, 'case_id': cid, 'service': 'Consultation', 'qty': 1,
                  'rate': 500, 'discount': 0, 'tax': 0, 'net': 500, 'source': 'opd_visit', 'status': 'posted',
                  'invoiced': False, 'meta': {}, 'created_by': 'system', 'created_by_name': 'System', 'created_at': created}
            await db.charges.insert_one(ch)
            if i < 2:
                await db.payments.insert_one({'id': new_id(), 'receipt_no': await next_sequence('receipt', 'RCPT', 6),
                                              'patient_id': pid, 'patient_name': d['name'], 'case_id': cid,
                                              'amount': 500, 'method': 'UPI', 'collected_by': 'System', 'created_at': created})

    # Settings
    if not await db.settings.find_one({'id': 'app'}):
        await db.settings.insert_one({'id': 'app', 'hospital_name': 'SvaTWA Psychiatric Hospital',
                                      'currency': '₹', 'pending_dues_threshold': 5000, 'address': 'Ahmedabad, Gujarat',
                                      'phone': '+91 79 0000 0000', 'email': 'care@svatwa.com'})
