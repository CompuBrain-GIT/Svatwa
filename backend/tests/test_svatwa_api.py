"""End-to-end API tests for SvaTWA HMS backend.

Covers: auth, role modules, patients, cases, prescriptions, OPD visits/queue,
pharmacy dispense, billing (charges/payments/summary/overpay guard),
IPD admit/discharge, masters (CRUD + bulk diagnoses), medicines, analytics,
dashboard, notifications/campaigns, AI summary, audit log.
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"

CREDS = {
    'super_admin': ('bijoy@compubrain.com', 'admin123'),
    'doctor': ('doctor@svatwa.com', 'doctor123'),
    'pharmacist': ('pharmacy@svatwa.com', 'pharmacy123'),
    'billing': ('billing@svatwa.com', 'billing123'),
    'reception': ('reception@svatwa.com', 'reception123'),
    'nurse': ('nurse@svatwa.com', 'nurse123'),
    'psychologist': ('psych@svatwa.com', 'psych123'),
}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={'email': email, 'password': password}, timeout=30)
    return r


def _hdr(token):
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}


# -------- fixtures --------
@pytest.fixture(scope='session')
def admin_token():
    r = _login(*CREDS['super_admin'])
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()['token']


@pytest.fixture(scope='session')
def admin_hdr(admin_token):
    return _hdr(admin_token)


@pytest.fixture(scope='session')
def doctor_token():
    r = _login(*CREDS['doctor'])
    assert r.status_code == 200
    return r.json()['token']


@pytest.fixture(scope='session')
def seed_patient(admin_hdr):
    """Create a dedicated test patient for the whole session."""
    body = {'name': f"TEST_Patient_{uuid.uuid4().hex[:6]}", 'mobile': '9000000001',
            'gender': 'Male', 'age': 30, 'city': 'Ahmedabad'}
    r = requests.post(f"{API}/patients", json=body, headers=admin_hdr, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# -------- Auth / Login for all roles --------
class TestAuth:
    def test_super_admin_login(self):
        r = _login(*CREDS['super_admin'])
        assert r.status_code == 200
        data = r.json()
        assert 'token' in data and isinstance(data['token'], str)
        assert data['user']['role'] == 'super_admin'
        # super_admin should see all modules
        assert 'audit' in data['user']['modules']
        assert 'masters' in data['user']['modules']

    @pytest.mark.parametrize('role', ['doctor', 'pharmacist', 'billing', 'reception', 'nurse', 'psychologist'])
    def test_demo_logins(self, role):
        r = _login(*CREDS[role])
        assert r.status_code == 200, f"{role}: {r.text}"
        assert r.json()['user']['role'] == role

    def test_invalid_credentials(self):
        r = _login('bijoy@compubrain.com', 'wrong')
        assert r.status_code == 401

    def test_me_requires_token(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401

    def test_me_with_token(self, admin_hdr):
        r = requests.get(f"{API}/auth/me", headers=admin_hdr, timeout=30)
        assert r.status_code == 200
        assert r.json()['role'] == 'super_admin'


# -------- Role module access --------
class TestRoleAccess:
    def test_pharmacist_modules(self):
        r = _login(*CREDS['pharmacist'])
        mods = r.json()['user']['modules']
        for m in ('dashboard', 'patients', 'pharmacy', 'inventory'):
            assert m in mods, f"pharmacist missing {m}: {mods}"
        for m in ('billing', 'audit', 'ipd', 'masters'):
            assert m not in mods, f"pharmacist should not have {m}"

    def test_pharmacist_forbidden_from_billing(self):
        tok = _login(*CREDS['pharmacist']).json()['token']
        r = requests.get(f"{API}/charges", headers=_hdr(tok), timeout=30)
        assert r.status_code == 403

    def test_doctor_cannot_access_audit(self):
        tok = _login(*CREDS['doctor']).json()['token']
        r = requests.get(f"{API}/audit", headers=_hdr(tok), timeout=30)
        assert r.status_code == 403


# -------- Dashboard --------
class TestDashboard:
    def test_stats_shape(self, admin_hdr):
        r = requests.get(f"{API}/dashboard/stats", headers=admin_hdr, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ('total_patients', 'opd_queue', 'available_beds', 'outstanding'):
            assert k in d


# -------- Patients --------
class TestPatients:
    def test_create_and_get_uhid(self, admin_hdr):
        body = {'name': f"TEST_UHID_{uuid.uuid4().hex[:5]}", 'mobile': '9876500001'}
        r = requests.post(f"{API}/patients", json=body, headers=admin_hdr, timeout=30)
        assert r.status_code == 200
        p = r.json()
        assert p['uhid'].startswith('SVT') and len(p['uhid']) == 8
        # verify GET persistence
        g = requests.get(f"{API}/patients/{p['id']}", headers=admin_hdr, timeout=30)
        assert g.status_code == 200
        assert g.json()['uhid'] == p['uhid']

    def test_search_by_name(self, admin_hdr, seed_patient):
        r = requests.get(f"{API}/patients", params={'search': seed_patient['name']},
                         headers=admin_hdr, timeout=30)
        assert r.status_code == 200
        names = [x['name'] for x in r.json()['items']]
        assert seed_patient['name'] in names

    def test_search_by_mobile(self, admin_hdr, seed_patient):
        r = requests.get(f"{API}/patients", params={'search': seed_patient['mobile']},
                         headers=admin_hdr, timeout=30)
        assert r.status_code == 200
        assert any(x['uhid'] == seed_patient['uhid'] for x in r.json()['items'])

    def test_new_case_badge_for_fresh(self, admin_hdr, seed_patient):
        r = requests.get(f"{API}/patients/{seed_patient['id']}", headers=admin_hdr, timeout=30)
        # Fresh patient with no visits => new_case_alert True
        assert r.json()['new_case_alert'] is True


# -------- Cases + Prescriptions + Pharmacy queue --------
class TestClinicalPharmacyFlow:
    def test_full_flow(self, admin_hdr, seed_patient):
        pid = seed_patient['id']
        # Create case
        r = requests.post(f"{API}/cases", headers=admin_hdr, timeout=30,
                          json={'patient_id': pid, 'treatment_type': 'Consulting',
                                'diagnosis': 'F32', 'complaint': 'Low mood'})
        assert r.status_code == 200, r.text
        case = r.json()
        assert case['case_no'].startswith('CASE')

        # Need medicine for dispense + stock deduction
        meds = requests.get(f"{API}/medicines", headers=admin_hdr, timeout=30).json()['items']
        assert len(meds) > 0, 'No medicines seeded'
        med = next((m for m in meds if m.get('stock', 0) > 5), meds[0])
        start_stock = med.get('stock', 0)

        # Create prescription (status confirmed by default)
        rx_body = {'patient_id': pid, 'case_id': case['id'],
                   'items': [{'medicine_id': med['id'], 'medicine': med['name'],
                              'dose': '1-0-1', 'frequency': 'BD', 'duration': 7, 'quantity': 2}],
                   'notes': 'TEST'}
        r = requests.post(f"{API}/prescriptions", headers=admin_hdr, json=rx_body, timeout=30)
        assert r.status_code == 200
        rx = r.json()
        assert rx['status'] == 'confirmed'
        assert rx['dispense_status'] == 'pending'

        # Appears in pharmacy queue (login as pharmacist)
        ptok = _login(*CREDS['pharmacist']).json()['token']
        q = requests.get(f"{API}/pharmacy/queue", headers=_hdr(ptok), timeout=30)
        assert q.status_code == 200
        ids = [x['id'] for x in q.json()['items']]
        assert rx['id'] in ids, 'Prescription not in pharmacy queue'

        # Dispense
        disp_body = {'prescription_id': rx['id'], 'patient_id': pid,
                     'patient_name': seed_patient['name'], 'case_id': case['id'],
                     'items': [{'medicine_id': med['id'], 'quantity': 2}]}
        r = requests.post(f"{API}/pharmacy/dispense", headers=_hdr(ptok), json=disp_body, timeout=30)
        assert r.status_code == 200, r.text
        dsp = r.json()
        assert dsp['total'] == round(float(med['price']) * 2, 2)

        # Stock should be deducted
        m2 = requests.get(f"{API}/medicines", headers=_hdr(ptok),
                          params={'search': med['name']}, timeout=30).json()['items']
        updated = next(x for x in m2 if x['id'] == med['id'])
        assert updated['stock'] == start_stock - 2

        # History should contain it
        hist = requests.get(f"{API}/pharmacy/history", headers=_hdr(ptok),
                            params={'patient_id': pid}, timeout=30).json()['items']
        assert any(h['id'] == dsp['id'] for h in hist)

        # Pharmacy charge created in billing
        charges = requests.get(f"{API}/charges", headers=admin_hdr,
                               params={'patient_id': pid}, timeout=30).json()['items']
        assert any(c['service'] == 'Pharmacy / Medicine' for c in charges)


# -------- OPD visit flow --------
class TestOPD:
    def test_create_visit_token_and_advance(self, admin_hdr, seed_patient):
        # need a doctor id
        staff = requests.get(f"{API}/staff", headers=admin_hdr,
                             params={'role': 'doctor'}, timeout=30).json()['items']
        assert staff, 'No doctor staff'
        doctor = staff[0]
        body = {'patient_id': seed_patient['id'], 'doctor_id': doctor['id'],
                'doctor_name': doctor['name'], 'reason': 'Follow-up',
                'consultation_fee': 300, 'override_dues': True}
        r = requests.post(f"{API}/visits", headers=admin_hdr, json=body, timeout=30)
        assert r.status_code == 200, r.text
        v = r.json()
        assert v['token'] >= 1
        assert v['status'] == 'checked_in'

        # Advance status
        r = requests.put(f"{API}/visits/{v['id']}/status", headers=admin_hdr,
                        json={'status': 'in_consultation'}, timeout=30)
        assert r.status_code == 200
        assert r.json()['status'] == 'in_consultation'

        # Query by status
        r = requests.get(f"{API}/visits", headers=admin_hdr,
                        params={'status': 'in_consultation'}, timeout=30)
        assert any(x['id'] == v['id'] for x in r.json()['items'])


# -------- Billing --------
class TestBilling:
    def test_add_charge_payment_summary_and_overpay(self, admin_hdr, seed_patient):
        pid = seed_patient['id']
        r = requests.post(f"{API}/charges", headers=admin_hdr,
                         json={'patient_id': pid, 'service': 'Lab', 'amount': 1000}, timeout=30)
        assert r.status_code == 200

        # Summary
        s = requests.get(f"{API}/billing/summary/{pid}", headers=admin_hdr, timeout=30).json()
        assert s['billed'] >= 1000
        outstanding_before = s['outstanding']
        assert outstanding_before > 0

        # Pay partial
        r = requests.post(f"{API}/payments", headers=admin_hdr,
                         json={'patient_id': pid, 'amount': 100, 'method': 'Cash'}, timeout=30)
        assert r.status_code == 200

        # Overpay should fail
        r = requests.post(f"{API}/payments", headers=admin_hdr,
                         json={'patient_id': pid, 'amount': 9999999, 'method': 'Cash'}, timeout=30)
        assert r.status_code == 400

        # With allow_advance should pass
        r = requests.post(f"{API}/payments", headers=admin_hdr,
                         json={'patient_id': pid, 'amount': 9999999, 'method': 'Cash',
                               'allow_advance': True}, timeout=30)
        assert r.status_code == 200


# -------- IPD --------
class TestIPD:
    def test_console_admit_discharge(self, admin_hdr, seed_patient):
        c = requests.get(f"{API}/ipd/console", headers=admin_hdr, timeout=30).json()
        assert 'beds' in c and 'stats' in c
        avail = [b for b in c['beds'] if b.get('bed_status', 'available') == 'available']
        if not avail:
            pytest.skip('No available beds in seed')
        bed = avail[0]
        r = requests.post(f"{API}/ipd/admissions", headers=admin_hdr, timeout=30,
                          json={'patient_id': seed_patient['id'], 'bed_id': bed['id'],
                                'ward_name': bed.get('ward_name', ''),
                                'room_name': bed.get('room_name', ''),
                                'admitting_doctor': 'Dr. Test', 'reason': 'TEST'})
        assert r.status_code == 200, r.text
        adm = r.json()
        assert adm['ipd_no'].startswith('IPD')

        # Bed now occupied
        c2 = requests.get(f"{API}/ipd/console", headers=admin_hdr, timeout=30).json()
        b2 = next(b for b in c2['beds'] if b['id'] == bed['id'])
        assert b2['bed_status'] == 'occupied'

        # Discharge
        r = requests.post(f"{API}/ipd/discharge", headers=admin_hdr, timeout=30,
                          json={'admission_id': adm['id'], 'final_condition': 'Stable'})
        assert r.status_code == 200
        assert r.json()['status'] == 'discharged'


# -------- Masters --------
class TestMasters:
    def test_types_list(self, admin_hdr):
        r = requests.get(f"{API}/masters/_types", headers=admin_hdr, timeout=30)
        assert r.status_code == 200
        assert len(r.json()['types']) >= 40

    def test_create_master_entry(self, admin_hdr):
        r = requests.post(f"{API}/masters/department", headers=admin_hdr,
                         json={'name': f'TEST_DEPT_{uuid.uuid4().hex[:5]}'}, timeout=30)
        assert r.status_code == 200
        assert r.json()['type'] == 'department'

    def test_diagnoses_bulk_preview_and_import(self, admin_hdr):
        csv_text = f"Code,Diagnosis\nTST{uuid.uuid4().hex[:5].upper()},Test Depression\nTST{uuid.uuid4().hex[:5].upper()},Test Anxiety\n,BadRow"
        r = requests.post(f"{API}/diagnoses/bulk", headers=admin_hdr,
                         json={'csv': csv_text, 'preview': True}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d['valid_count'] == 2 and d['error_count'] >= 1
        r = requests.post(f"{API}/diagnoses/bulk", headers=admin_hdr,
                         json={'csv': csv_text, 'preview': False}, timeout=30)
        assert r.status_code == 200
        assert r.json()['imported'] == 2

    def test_create_medicine(self, admin_hdr):
        r = requests.post(f"{API}/medicines", headers=admin_hdr,
                         json={'name': f'TEST_MED_{uuid.uuid4().hex[:5]}',
                               'price': 10, 'mrp': 15, 'stock': 100}, timeout=30)
        assert r.status_code == 200


# -------- Analytics --------
class TestAnalytics:
    def test_shape(self, admin_hdr):
        r = requests.get(f"{API}/analytics", headers=admin_hdr, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ('patients', 'clinical', 'billing'):
            assert k in d


# -------- Notifications / Campaigns --------
class TestCampaigns:
    def test_segment_preview_and_send(self, admin_hdr):
        r = requests.post(f"{API}/segments/preview", headers=admin_hdr,
                         json={'gender': 'Male'}, timeout=30)
        assert r.status_code == 200
        pids = r.json()['patient_ids'][:3]
        r = requests.post(f"{API}/campaigns", headers=admin_hdr,
                         json={'title': 'TEST_CAMP', 'message': 'hi',
                               'segment': {'gender': 'Male'}, 'patient_ids': pids}, timeout=30)
        assert r.status_code == 200
        assert r.json()['status'] == 'sent'
        r = requests.get(f"{API}/campaigns", headers=admin_hdr, timeout=30)
        assert any(c['title'] == 'TEST_CAMP' for c in r.json()['items'])


# -------- AI Summary --------
class TestAISummary:
    def test_summary(self, admin_hdr, seed_patient):
        r = requests.post(f"{API}/ai/patient-summary", headers=admin_hdr,
                         json={'patient_id': seed_patient['id']}, timeout=120)
        assert r.status_code == 200
        d = r.json()
        assert 'summary' in d and isinstance(d['summary'], str)
        assert len(d['summary']) > 20


# -------- Audit --------
class TestAudit:
    def test_audit_log(self, admin_hdr):
        r = requests.get(f"{API}/audit", headers=admin_hdr, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json()['items'], list)
        assert len(r.json()['items']) > 0
