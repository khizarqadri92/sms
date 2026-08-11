"START $(Get-Date)" | Out-File -Append -FilePath "E:\Projects\sms\scripts\processing-date-log.txt"
try {
    $env:Path += ";C:\Program Files\PostgreSQL\18\bin"
    $env:PGPASSWORD = "Zunnoon1@"
    $result = & psql -U postgres -d sms_dev -c "SELECT sp_advance_processing_date();" 2>&1
    $result | Out-File -Append -FilePath "E:\Projects\sms\scripts\processing-date-log.txt"
    "SUCCESS $(Get-Date)" | Out-File -Append -FilePath "E:\Projects\sms\scripts\processing-date-log.txt"
} catch {
    "ERROR: $_" | Out-File -Append -FilePath "E:\Projects\sms\scripts\processing-date-log.txt"
}
