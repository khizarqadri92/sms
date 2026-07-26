# === CONFIG - adjust if needed ===
$baseUrl   = "http://localhost:5000"
$loginUrl  = "$baseUrl/auth/login"          # <-- change if your login route differs
$email     = "hr@school.com"
$password  = "Hr@1234"

# === 1. Login and get JWT token ===
$loginBody = @{ email = $email; password = $password } | ConvertTo-Json
try {
    $loginResp = Invoke-RestMethod -Uri $loginUrl -Method Post -Body $loginBody -ContentType "application/json"
} catch {
    Write-Host "LOGIN FAILED. Check the loginUrl / body field names (email/password vs username)." -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit
}

Write-Host "`n--- LOGIN RESPONSE ---" -ForegroundColor Cyan
$loginResp | ConvertTo-Json -Depth 5

# Try common token field names
$token = $loginResp.access_token
if (-not $token) { $token = $loginResp.token }
if (-not $token) { $token = $loginResp.data.access_token }
if (-not $token) { $token = $loginResp.data.token }

if (-not $token) {
    Write-Host "`nCouldn't auto-find token field. Look at the LOGIN RESPONSE above and note the exact field name." -ForegroundColor Yellow
    exit
}

$headers = @{ Authorization = "Bearer $token" }

# === 2. Get my profile (to find staff id) ===
Write-Host "`n--- /hr/my-profile RESPONSE ---" -ForegroundColor Cyan
$profileResp = Invoke-RestMethod -Uri "$baseUrl/hr/my-profile" -Method Get -Headers $headers
$profileResp | ConvertTo-Json -Depth 5

$staffId = $profileResp.data.id
if (-not $staffId) { $staffId = $profileResp.id }

Write-Host "`nUsing staffId = $staffId" -ForegroundColor Yellow

# === 3. Get is-head status ===
Write-Host "`n--- /hr/staff/$staffId/is-head RESPONSE ---" -ForegroundColor Cyan
try {
    $isHeadResp = Invoke-RestMethod -Uri "$baseUrl/hr/staff/$staffId/is-head" -Method Get -Headers $headers
    $isHeadResp | ConvertTo-Json -Depth 5
} catch {
    Write-Host "is-head call failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message
}
