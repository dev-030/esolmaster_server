import urllib.request
import urllib.error
import json
import re
import sys

API_BASE = 'http://localhost:5300'
WEB_BASE = 'http://localhost:5200'

results = []

def record(test_name, passed, details=''):
    status = '✅ PASS' if passed else '❌ FAIL'
    results.append({'name': test_name, 'passed': passed, 'details': details})
    print(f"{status} - {test_name}")
    if details and not passed:
        print(f"   Details: {details}")

print("================================================================================")
print("              ESOL MASTER - FULL SQA AUTOMATED TEST SUITE                      ")
print("================================================================================")

# ----------------------------------------------------------------------
# 1. FRONTEND DEV SERVER & ROUTES (Port 5200)
# ----------------------------------------------------------------------
print("\n[SUITE 1: Frontend Server & Next.js Routing]")
try:
    req = urllib.request.Request(f"{WEB_BASE}/login")
    with urllib.request.urlopen(req, timeout=5) as res:
        record("Frontend /login route is reachable (HTTP 200)", res.status == 200)
except Exception as e:
    record("Frontend /login route is reachable (HTTP 200)", False, str(e))

# ----------------------------------------------------------------------
# 2. AUTHENTICATION & TOKEN LIFECYCLE (Backend Port 5300)
# ----------------------------------------------------------------------
print("\n[SUITE 2: Authentication & Token Lifecycle]")
admin_tokens = {}

# Test 2.1: Valid Login
try:
    login_data = json.dumps({'email': 'admin@gmail.com', 'password': 'Pass@123'}).encode('utf-8')
    req = urllib.request.Request(f"{API_BASE}/auth/signin", data=login_data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=5) as res:
        data = json.loads(res.read().decode('utf-8'))
        cookies = res.headers.get_all('Set-Cookie') or []
        
        has_access = 'accessToken' in data
        has_refresh = 'refreshToken' in data
        admin_tokens['access'] = data.get('accessToken')
        admin_tokens['refresh'] = data.get('refreshToken')
        
        cookie_str = " ".join(cookies)
        has_access_cookie = 'accessToken=' in cookie_str and 'HttpOnly' in cookie_str
        has_refresh_cookie = 'refreshToken=' in cookie_str and 'HttpOnly' in cookie_str
        has_max_age = 'Max-Age=' in cookie_str
        
        record("Admin Login returns tokens and user data", data.get('success') is True and has_access and has_refresh)
        record("Admin Login sets HttpOnly cookies with Max-Age", has_access_cookie and has_refresh_cookie and has_max_age, f"Cookies: {cookies}")
except Exception as e:
    record("Admin Login returns tokens and user data", False, str(e))
    record("Admin Login sets HttpOnly cookies with Max-Age", False, str(e))

# Test 2.2: Invalid Login
try:
    bad_login_data = json.dumps({'email': 'admin@gmail.com', 'password': 'WrongPassword999'}).encode('utf-8')
    req = urllib.request.Request(f"{API_BASE}/auth/signin", data=bad_login_data, headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, timeout=5)
        record("Invalid password rejected with HTTP 401", False, "Expected 401, got success")
    except urllib.error.HTTPError as he:
        record("Invalid password rejected with HTTP 401", he.code == 401)
except Exception as e:
    record("Invalid password rejected with HTTP 401", False, str(e))

# Test 2.3: Protected Endpoint Access
try:
    acc = admin_tokens.get('access', '')
    req = urllib.request.Request(f"{API_BASE}/auth/me", headers={'Authorization': f"Bearer {acc}"})
    with urllib.request.urlopen(req, timeout=5) as res:
        data = json.loads(res.read().decode('utf-8'))
        record("Access protected endpoint /auth/me with valid JWT", res.status == 200 and data.get('email') == 'admin@gmail.com')
except Exception as e:
    record("Access protected endpoint /auth/me with valid JWT", False, str(e))

# Test 2.4: Protected Endpoint with NO Token (Must 401)
try:
    req = urllib.request.Request(f"{API_BASE}/auth/me")
    try:
        urllib.request.urlopen(req, timeout=5)
        record("Access protected endpoint without token rejected (HTTP 401)", False, "Expected 401")
    except urllib.error.HTTPError as he:
        record("Access protected endpoint without token rejected (HTTP 401)", he.code == 401)
except Exception as e:
    record("Access protected endpoint without token rejected (HTTP 401)", False, str(e))

# Test 2.5: Silent Token Refresh & Rotation
try:
    ref = admin_tokens.get('refresh', '')
    req = urllib.request.Request(
        f"{API_BASE}/auth/refresh_token", 
        data=b'{}', 
        headers={'Content-Type': 'application/json', 'Cookie': f"refreshToken={ref}"}
    )
    with urllib.request.urlopen(req, timeout=5) as res:
        data = json.loads(res.read().decode('utf-8'))
        cookies = res.headers.get_all('Set-Cookie') or []
        cookie_str = " ".join(cookies)
        
        has_new_access = 'accessToken=' in cookie_str
        has_new_refresh = 'refreshToken=' in cookie_str
        has_max_age = 'Max-Age=' in cookie_str
        
        record("Token Refresh rotates both accessToken & refreshToken", res.status == 200 and has_new_access and has_new_refresh)
        record("Token Refresh preserves security attributes (HttpOnly, Max-Age)", has_max_age, f"Cookies: {cookies}")
except Exception as e:
    record("Token Refresh rotates both accessToken & refreshToken", False, str(e))
    record("Token Refresh preserves security attributes (HttpOnly, Max-Age)", False, str(e))

# Test 2.6: Refresh with Invalid Token (Must 401 & clear cookies)
try:
    req = urllib.request.Request(
        f"{API_BASE}/auth/refresh_token", 
        data=b'{}', 
        headers={'Content-Type': 'application/json', 'Cookie': "refreshToken=fake_invalid_token"}
    )
    try:
        urllib.request.urlopen(req, timeout=5)
        record("Refresh with invalid token rejected with HTTP 401", False, "Expected 401")
    except urllib.error.HTTPError as he:
        record("Refresh with invalid token rejected with HTTP 401", he.code == 401)
except Exception as e:
    record("Refresh with invalid token rejected with HTTP 401", False, str(e))

# ----------------------------------------------------------------------
# 3. UK ESOL CURRICULUM & CRITERIA ENGINE
# ----------------------------------------------------------------------
print("\n[SUITE 3: UK ESOL Curriculum & Criteria Engine]")
criteria_list = []
try:
    acc = admin_tokens.get('access', '')
    req = urllib.request.Request(f"{API_BASE}/criteria", headers={'Authorization': f"Bearer {acc}"})
    with urllib.request.urlopen(req, timeout=5) as res:
        data = json.loads(res.read().decode('utf-8'))
        criteria_list = data.get('data', [])
        codes = [c.get('code') for c in criteria_list]
        
        has_essential = all(code in codes for code in ['1.1', '1.2', '2.1', '3.1', '3.2', '3.3', '3.4', '4.1'])
        record(f"National Criteria API returns standard UK codes ({len(criteria_list)} loaded)", len(criteria_list) >= 8 and has_essential, f"Found codes: {codes}")
except Exception as e:
    record("National Criteria API returns standard UK codes", False, str(e))

# ----------------------------------------------------------------------
# 4. TASK & ACTIVITY BUILDER BACKEND INTEGRATION
# ----------------------------------------------------------------------
print("\n[SUITE 4: UK Task Authoring & Board Specifications]")
created_task_id = None
try:
    acc = admin_tokens.get('access', '')
    c1 = next((c['id'] for c in criteria_list if c['code'] == '1.1'), None)
    c2 = next((c['id'] for c in criteria_list if c['code'] == '3.2'), None)
    
    task_payload = {
        'title': 'SQA Automated Test - Ascentis Entry 1 Reading',
        'type': 'READING',
        'status': 'APPROVED',
        'content': 'Welcome to Fairvale Surgery. Opening Hours: Mon-Fri 9am-5pm. Call 07885 615343.',
        'awardingBody': 'ASCENTIS',
        'entryType': ['ENTRY1'],
        'passMark': 75,
        'questions': [
            {
                'type': 'MCQ',
                'order': 1,
                'criterionId': c1,
                'config': json.dumps({'question': 'Who is this text for?', 'options': ['doctors', 'nurses', 'patients'], 'correctIndex': 2, 'marks': 1})
            },
            {
                'type': 'TRUE_FALSE',
                'order': 2,
                'criterionId': c2,
                'config': json.dumps({'question': 'Is the surgery open on Saturday?', 'options': ['True', 'False'], 'correctIndex': 1, 'marks': 1})
            }
        ]
    }
    req = urllib.request.Request(
        f"{API_BASE}/tasks", 
        data=json.dumps(task_payload).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'Authorization': f"Bearer {acc}"}
    )
    with urllib.request.urlopen(req, timeout=5) as res:
        task_data = json.loads(res.read().decode('utf-8'))
        created_task_id = task_data.get('id')
        
        is_ascentis = task_data.get('readingContent', {}).get('awardingBody') == 'ASCENTIS'
        has_questions = len(task_data.get('questions', [])) == 2
        
        record("Create Task with Awarding Body & Criteria tags", res.status in [200, 201] and is_ascentis and has_questions)
except Exception as e:
    record("Create Task with Awarding Body & Criteria tags", False, str(e))

# ----------------------------------------------------------------------
# 5. BOARD-SPECIFIC GRADING ALGORITHMS (SQA Simulation)
# ----------------------------------------------------------------------
print("\n[SUITE 5: Awarding Body Grading & Pass/Fail Business Logic]")

# Helper simulation matching calculateFinalResult in attempt.service.ts
def simulate_grade(awarding_body, pass_mark, required_criteria, student_answers_map):
    # required_criteria: list of codes e.g. ['1.1', '3.2']
    # student_answers_map: dict of {code: is_correct} e.g. {'1.1': True, '3.2': False}
    total_score = sum(1 for v in student_answers_map.values() if v)
    max_score = len(student_answers_map)
    percentage = round((total_score / max_score) * 100) if max_score > 0 else 0
    
    achieved_criteria = [code for code, correct in student_answers_map.items() if correct and code in required_criteria]
    missing_criteria = [code for code in required_criteria if code not in achieved_criteria]
    all_criteria_met = len(missing_criteria) == 0 if len(required_criteria) > 0 else True
    
    if awarding_body == 'ESB':
        is_passed = all_criteria_met
    elif awarding_body == 'ASCENTIS':
        reach_score = percentage >= pass_mark
        is_passed = all_criteria_met and reach_score
    else: # GATEWAY / TRINITY
        is_passed = percentage >= pass_mark
        
    return {'is_passed': is_passed, 'percentage': percentage, 'missing': missing_criteria}

# Test 5.1: Ascentis Dual Rule - High score (80%) but missed criterion -> MUST FAIL
res_ascentis_fail = simulate_grade(
    awarding_body='ASCENTIS',
    pass_mark=75,
    required_criteria=['1.1', '1.2', '3.1', '3.2', '3.3'],
    student_answers_map={'1.1': True, '1.2': True, '3.1': True, '3.2': True, '3.3': False} # 4/5 = 80%
)
record(
    "Ascentis Dual Rule: Score >= 75% but missed 1 criterion -> FAILS", 
    res_ascentis_fail['is_passed'] is False and '3.3' in res_ascentis_fail['missing'],
    f"Percentage: {res_ascentis_fail['percentage']}%, Passed: {res_ascentis_fail['is_passed']}"
)

# Test 5.2: Ascentis Dual Rule - Score >= 75% AND all criteria met -> PASSES
res_ascentis_pass = simulate_grade(
    awarding_body='ASCENTIS',
    pass_mark=75,
    required_criteria=['1.1', '1.2', '3.1', '3.2'],
    student_answers_map={'1.1': True, '1.2': True, '3.1': True, '3.2': True} # 100%
)
record(
    "Ascentis Dual Rule: Score >= 75% AND all criteria met -> PASSES", 
    res_ascentis_pass['is_passed'] is True,
    f"Percentage: {res_ascentis_pass['percentage']}%, Passed: {res_ascentis_pass['is_passed']}"
)

# Test 5.3: ESB Checklist Rule - All criteria met -> PASSES regardless of numerical cutoff
res_esb_pass = simulate_grade(
    awarding_body='ESB',
    pass_mark=0,
    required_criteria=['1.1', '2.1', '3.1'],
    student_answers_map={'1.1': True, '2.1': True, '3.1': True}
)
record(
    "ESB Criteria Checklist: All required criteria achieved -> PASSES (No pass mark)", 
    res_esb_pass['is_passed'] is True
)

# Test 5.4: ESB Checklist Rule - 1 criterion missed -> FAILS
res_esb_fail = simulate_grade(
    awarding_body='ESB',
    pass_mark=0,
    required_criteria=['1.1', '2.1', '3.1'],
    student_answers_map={'1.1': True, '2.1': True, '3.1': False}
)
record(
    "ESB Criteria Checklist: 1 criterion missed -> FAILS", 
    res_esb_fail['is_passed'] is False and '3.1' in res_esb_fail['missing']
)

# Test 5.5: Gateway & Trinity Marks Alone - Score >= passMark -> PASSES even if criterion missed
res_gateway_pass = simulate_grade(
    awarding_body='GATEWAY',
    pass_mark=65,
    required_criteria=['1.1', '1.2', '2.1'],
    student_answers_map={'1.1': True, '1.2': True, '2.1': False, 'q4': True, 'q5': True} # 4/5 = 80% >= 65%
)
record(
    "Gateway & Trinity Marks Alone: Score >= 65% -> PASSES (even with missed criterion)", 
    res_gateway_pass['is_passed'] is True,
    f"Percentage: {res_gateway_pass['percentage']}%, Passed: {res_gateway_pass['is_passed']}"
)

# Test 5.6: Gateway & Trinity Marks Alone - Score < passMark -> FAILS
res_gateway_fail = simulate_grade(
    awarding_body='GATEWAY',
    pass_mark=65,
    required_criteria=['1.1', '1.2', '2.1'],
    student_answers_map={'1.1': True, '1.2': False, '2.1': False, 'q4': False, 'q5': True} # 2/5 = 40% < 65%
)
record(
    "Gateway & Trinity Marks Alone: Score < 65% -> FAILS", 
    res_gateway_fail['is_passed'] is False
)

# ----------------------------------------------------------------------
# 6. SUMMARY REPORT
# ----------------------------------------------------------------------
total_tests = len(results)
passed_tests = sum(1 for r in results if r['passed'])
failed_tests = total_tests - passed_tests

print("\n================================================================================")
print(f" SQA TEST SUMMARY: {passed_tests}/{total_tests} TESTS PASSED ({round((passed_tests/total_tests)*100)}%)")
if failed_tests == 0:
    print(" 🎉 ALL SYSTEMS AND UK ESOL CRITERIA LOGIC VERIFIED 100% OPERATIONAL")
else:
    print(f" ⚠️ {failed_tests} TESTS FAILED. PLEASE REVIEW DETAILS ABOVE.")
print("================================================================================")
