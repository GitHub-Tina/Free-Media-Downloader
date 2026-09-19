# 打开所在文件夹并选中指定文件(Shell COM,不依赖动词注册)
param(
  [Parameter(Mandatory = $true)][string]$Path
)
$Dir = Split-Path -Parent $Path
$Leaf = Split-Path -Leaf $Path
if (-not (Test-Path $Path)) {
  if (Test-Path $Dir) { Start-Process explorer.exe -ArgumentList $Dir; exit 0 }
  Write-Output 'GONE'; exit 1
}
$shell = New-Object -ComObject Shell.Application
$null = $shell.Explore($Dir)
Start-Sleep -Milliseconds 1500
$w = $shell.Windows() |
  Where-Object { $_.Document -and $_.Document.Folder -and $_.Document.Folder.Self.Path -ieq $Dir } |
  Select-Object -First 1
if (-not $w) { Start-Process explorer.exe -ArgumentList $Dir; Write-Output 'OPENED_NOSELECT'; exit 0 }
$item = $w.Document.Folder.Items() | Where-Object { $_.Name -ieq $Leaf } | Select-Object -First 1
if (-not $item) { Write-Output 'OPENED_NOSELECT'; exit 0 }
$w.Document.SelectItem($item, 29)  # SVSI_SELECT|SVSI_ENSUREVISIBLE|SVSI_FOCUSED|SVSI_DESELECTOTHERS
Write-Output 'SELECTED'
