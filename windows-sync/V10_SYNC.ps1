# Windows PowerShell 5.1 + Microsoft Excel desktop. Không yêu cầu Python.
$ErrorActionPreference='Stop'
$cfgFolder=Join-Path $env:LOCALAPPDATA 'V10Sync'
$cfg=Get-Content (Join-Path $cfgFolder 'config.json') -Raw | ConvertFrom-Json
$cred=Import-Clixml (Join-Path $cfgFolder 'credential.xml')
if(-not (Test-Path 'D:\')){throw 'Không tìm thấy ổ D:'}
$headers=@{apikey=$cfg.key;'Content-Type'='application/json'}
$body=@{email=$cred.UserName;password=$cred.GetNetworkCredential().Password} | ConvertTo-Json -Compress
$login=Invoke-RestMethod -Uri ($cfg.url+'/auth/v1/token?grant_type=password') -Method Post -Headers $headers -Body $body
$headers.Authorization='Bearer '+$login.access_token
# Chỉ truy cập được nếu Supabase Auth user có quyền Admin và RLS cho phép.
$endpoint=$cfg.url+'/rest/v1/v10_ky_kiem_ke?select=*&order=dong_luc.asc'
$periods=@(Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Get)
$excel=$null
try{
 $excel=New-Object -ComObject Excel.Application
 $excel.Visible=$false;$excel.DisplayAlerts=$false
 foreach($k in $periods){
  if(-not $k.id){continue}
  $day=[datetime]::Parse($k.ngay_dong)
  $store=($k.ma_ch -replace '[^0-9A-Za-z_-]','_')
  $dest=Join-Path $cfg.root ('{0}\{1}\{2}\CH_{3}\KY_{4}' -f $day.ToString('yyyy'),$day.ToString('MM'),$day.ToString('dd'),$store,$k.id)
  $marker=Join-Path $dest 'SYNC_OK.txt'
  if(Test-Path $marker){continue}
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  foreach($entry in @(@('dscl','DSCL.xlsx'),@('ct_kv','CT_KV.xlsx'),@('dieu_chinh','DIEU_CHINH.xlsx'),@('final_data','FINAL.xlsx'))){
   $rows=@($k.($entry[0]));if($null -eq $k.($entry[0])){$rows=@()}
   $target=Join-Path $dest $entry[1]
   $wb=$excel.Workbooks.Add();$ws=$wb.Worksheets.Item(1)
   try{
    if($rows.Count -gt 0){
     $cols=@($rows[0].PSObject.Properties.Name)
     for($c=0;$c -lt $cols.Count;$c++){$ws.Cells.Item(1,$c+1).Value2=$cols[$c]}
     for($r=0;$r -lt $rows.Count;$r++){
      for($c=0;$c -lt $cols.Count;$c++){
       $value=$rows[$r].($cols[$c]);if($null -ne $value){$ws.Cells.Item($r+2,$c+1).NumberFormat='@';$ws.Cells.Item($r+2,$c+1).Value2=[string]$value}
      }
     }
    }
    $wb.SaveAs($target,51)
   }finally{$wb.Close($false);[void][Runtime.InteropServices.Marshal]::ReleaseComObject($ws);[void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb)}
   if(-not (Test-Path $target)){throw 'Thiếu file '+$target}
  }
  ('SYNC OK '+$k.id+' '+(Get-Date).ToString('s')) | Set-Content -Encoding UTF8 $marker
  Write-Host ('Đã đồng bộ kỳ '+$k.id+' vào '+$dest)
 }
}finally{if($excel){$excel.Quit();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)}}
