# dph-emotion-arc GitHub publish script (ASCII only, encoding-safe)
# Usage: pwsh -File scripts/publish-github.ps1 -Token "<your PAT>"
#    or: set $env:GH_TOKEN first, then run without -Token.
param(
  [Parameter(Mandatory = $false)][string]$Token = $env:GH_TOKEN
)

$ErrorActionPreference = 'Stop'
if (-not $Token) { Write-Error 'Missing token: pass -Token or set $env:GH_TOKEN'; exit 1 }

$repo     = Split-Path -Parent $PSScriptRoot
$owner    = 'liuxinxing123'
$oldName  = 'DSH'
$newName  = 'dph-emotion-arc'
$apiHeaders = @{ Authorization = "Bearer $Token"; 'User-Agent' = 'dph-emotion-arc-publish' }

Write-Host '== 1/6 Rename remote repo DSH -> dph-emotion-arc =='
try {
  $rename = Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$owner/$oldName" -Headers $apiHeaders -Body (@{ name = $newName } | ConvertTo-Json) -ContentType 'application/json'
  Write-Host "  renamed: $($rename.full_name)"
} catch {
  Write-Host "  rename skipped (already renamed or failed): $($_.Exception.Message)"
}

Write-Host '== 2/6 Local identity and branch =='
git -C $repo config user.name  $owner
git -C $repo config user.email "$owner@users.noreply.github.com"
git -C $repo branch -M main
git -C $repo commit --amend --reset-author --no-edit

Write-Host '== 3/6 Push main =='
$remote = "https://$owner`:$Token@github.com/$owner/$newName.git"
$originUrl = git -C $repo config --get remote.origin.url
if ($originUrl) { git -C $repo remote remove origin }
git -C $repo remote add origin $remote
git -C $repo push -u origin main
git -C $repo remote set-url origin "https://github.com/$owner/$newName.git"

Write-Host '== 4/6 Tag v0.2.0 =='
git -C $repo tag v0.2.0
git -C $repo push origin v0.2.0

Write-Host '== 5/6 Repo metadata (description + dsh-plugin topic) =='
$desc = 'Emotion Arc Director: text emotion detection -> explicit state file -> strategy mapping, plus memory ledger and SillyTavern card import. DSH/DPH plugin, MIT.'
$null = Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$owner/$newName" -Headers $apiHeaders -Body (@{ description = $desc } | ConvertTo-Json) -ContentType 'application/json'
$null = Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$owner/$newName/topics" -Headers ($apiHeaders + @{ Accept = 'application/vnd.github+json' }) -Body (@{ names = @('dsh-plugin', 'deepseek-harness', 'emotion-ai', 'sillytavern', 'character-card') } | ConvertTo-Json) -ContentType 'application/json'

Write-Host '== 6/6 Done =='
Write-Host "  https://github.com/$owner/$newName"
Write-Host '  Next: dsh.so /submit/ paste repo URL; awesome list fork + PR.'
