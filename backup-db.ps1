# backup-db.ps1 - Full database backup routine for the SMS project.
# Run manually, or schedule via Windows Task Scheduler for automatic daily backups.

$env:PGPASSWORD = "Zunnoon1@"
$db = "sms_dev"
$user = "postgres"
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$root = "J:\sms-project\backups"

# 1. Schema-only backup (tables, stored procedures, triggers, views, sequences, indexes)
#    Saved to a STABLE filename so it can be committed to git and diffed over time.
pg_dump -U $user -d $db --schema-only --no-owner --no-privileges -f "$root\schema\sms_dev_schema_latest.sql"
Write-Host "Schema backup written: $root\schema\sms_dev_schema_latest.sql"

# 2. Full backup (schema + all data), compressed custom format for reliable restore via pg_restore
$fullBackupPath = "$root\full\sms_dev_full_$timestamp.dump"
pg_dump -U $user -d $db -Fc -f $fullBackupPath
Write-Host "Full backup written: $fullBackupPath"

# 3. Rotate: keep only the last 14 full backups
Get-ChildItem "$root\full" -Filter "*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force

Write-Host "Backup complete. Remember to periodically copy the 'backups' folder to external/cloud storage too."
