# Chạy trong PowerShell bằng chính tài khoản Windows sẽ dùng để đồng bộ.
$ErrorActionPreference='Stop'
$folder=Join-Path $env:LOCALAPPDATA 'V10Sync'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$url=Read-Host 'Supabase Project URL (https://...supabase.co)'
$key=Read-Host 'Supabase publishable/anon key'
$cred=Get-Credential -Message 'Tài khoản Supabase Auth của Admin (email/password, KHÔNG phải MNV)'
@{url=$url.TrimEnd('/');key=$key;root='D:\KIEM_KE_V10'} | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $folder 'config.json')
$cred | Export-Clixml (Join-Path $folder 'credential.xml')
Write-Host 'Đã lưu mật khẩu bằng Windows DPAPI (chỉ tài khoản Windows hiện tại giải mã được).'
$script=Join-Path $PSScriptRoot 'V10_SYNC.ps1'
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "'+$script+'"')
$trigger=New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
Register-ScheduledTask -TaskName 'V10 Sync Kiem Ke' -Action $action -Trigger $trigger -Description 'Dong bo V10 tu Supabase ve o D khi dang nhap' -Force | Out-Null
Write-Host 'Đã tạo tác vụ V10 Sync Kiem Ke. Chạy V10_SYNC.ps1 để kiểm tra ngay.'
