import requests, json
# Test set-head
r1 = requests.post('http://localhost:5000/api/v1/hr/staff/4/set-head',
    headers={'Authorization': 'Bearer TOKEN_HERE'})
print('set-head:', r1.status_code, r1.text[:200])
