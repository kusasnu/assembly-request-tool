param(
    [switch]$Delete
)

$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
if (-not $Root) {
    $Root = (Get-Location).Path
}

$TargetPhrase = "국가공무원 면접"
$ThisScript = $MyInvocation.MyCommand.Name

function Normalize-Name {
    param([string]$Value)

    return $Value.
        Replace(" ", "").
        Replace("_", "").
        Replace("-", "").
        Replace("·", "").
        ToLowerInvariant()
}

$Needle = Normalize-Name $TargetPhrase
$Targets = Get-ChildItem -LiteralPath $Root -File -Recurse |
    Where-Object {
        $_.Name -ne $ThisScript -and
        (Normalize-Name $_.Name).Contains($Needle)
    } |
    Sort-Object FullName

if (-not $Targets) {
    Write-Host "대상 파일이 없습니다."
    exit 0
}

Write-Host "대상 파일:"
$Targets | ForEach-Object {
    Write-Host "- $($_.FullName)"
}

if (-not $Delete) {
    Write-Host ""
    Write-Host "삭제하지 않았습니다. 실제 삭제하려면 -Delete를 붙여 실행하세요."
    Write-Host "예: .\delete_national_exam_interview_files.ps1 -Delete"
    exit 0
}

$Targets | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
}

Write-Host ""
Write-Host "삭제 완료: $($Targets.Count)개"
