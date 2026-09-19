# Behavioral test for install.ps1's Panergos + compatibility launcher staging (PR #92092,
# reworked for the managed-binary-dir layout).
#
# Run: powershell.exe -NoProfile -File scripts/ci/test_install_ps1_cli_launchers.ps1
#
# The test lifts the real Install-PanergosCommandLaunchers function from the
# PowerShell AST and executes it against a temporary install tree. It never
# reads or changes the user's PATH. The staging destination is passed in by
# the caller (Set-PathVariable passes $PanergosHome\bin -- the managed binary
# dir OUTSIDE the git checkout); here it is a sibling temp dir, which also
# proves the function stages wherever it is pointed rather than assuming
# the legacy in-checkout location.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$installPs1 = Join-Path (Join-Path $PSScriptRoot '..') 'install.ps1' | Resolve-Path
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    $installPs1, [ref]$null, [ref]$null)

$fn = $ast.Find({
    param($n)
    $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
    $n.Name -eq 'Install-PanergosCommandLaunchers'
}, $true)

if (-not $fn) {
    throw "Install-PanergosCommandLaunchers not found in $installPs1"
}

Invoke-Expression $fn.Extent.Text

$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$caseRoot = [System.IO.Path]::GetFullPath((Join-Path $tempBase (
    'panergos-cli-launcher-test-' + [guid]::NewGuid().ToString('N')
)))
if (-not $caseRoot.StartsWith($tempBase, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to create test directory outside the system temp directory: $caseRoot"
}

$script:Failures = 0

function Assert-True {
    param([bool]$Condition, [string]$Name)
    if ($Condition) {
        Write-Host "  PASS  $Name"
    } else {
        Write-Host "  FAIL  $Name"
        $script:Failures++
    }
}

function Assert-BytesEqual {
    param([byte[]]$Expected, [byte[]]$Actual, [string]$Name)
    $same = $Expected.Length -eq $Actual.Length
    if ($same) {
        for ($i = 0; $i -lt $Expected.Length; $i++) {
            if ($Expected[$i] -ne $Actual[$i]) {
                $same = $false
                break
            }
        }
    }
    Assert-True $same $Name
}

try {
    $installRoot = Join-Path $caseRoot 'panergos-agent'
    $binDir = Join-Path $caseRoot 'bin'
    New-Item -ItemType Directory -Force -Path $installRoot | Out-Null

    # Fail-before-PATH-mutation: a missing required source must throw and
    # must not leave an empty destination for the caller to put on PATH.
    $missingThrew = $false
    try {
        Install-PanergosCommandLaunchers -Root $installRoot -Destination $binDir | Out-Null
    } catch {
        $missingThrew = $_.Exception.Message -like '*required launcher not found*'
    }
    Assert-True $missingThrew 'missing panergos.exe fails the launcher stage'
    Assert-True (-not (Test-Path -LiteralPath $binDir)) `
        'failure does not create an empty PATH directory'

    $scriptsDir = Join-Path $installRoot 'venv\Scripts'
    New-Item -ItemType Directory -Force -Path $scriptsDir | Out-Null
    $panergosV1 = [byte[]](77, 90, 1)
    $panergosV2 = [byte[]](77, 90, 2)
    $panergosAcp = [byte[]](77, 90, 3)
    [System.IO.File]::WriteAllBytes((Join-Path $scriptsDir 'panergos.exe'), $panergosV1)
    Set-Content -Path (Join-Path $installRoot 'venv\pyvenv.cfg') `
        -Value "home = X" -Encoding Ascii

    $staged = Install-PanergosCommandLaunchers -Root $installRoot -Destination $binDir
    Assert-True ($staged -eq $binDir) 'returns the destination it staged into'
    Assert-BytesEqual $panergosV1 `
        ([System.IO.File]::ReadAllBytes((Join-Path $binDir 'panergos.exe'))) `
        'normal venv: primary exe copy lands in the destination'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $binDir 'panergos-acp.exe'))) `
        'optional primary ACP launcher may be absent'

    [System.IO.File]::WriteAllBytes((Join-Path $scriptsDir 'panergos.exe'), $panergosV2)
    [System.IO.File]::WriteAllBytes((Join-Path $scriptsDir 'panergos-acp.exe'), $panergosAcp)
    Install-PanergosCommandLaunchers -Root $installRoot -Destination $binDir | Out-Null
    Assert-BytesEqual $panergosV2 `
        ([System.IO.File]::ReadAllBytes((Join-Path $binDir 'panergos.exe'))) `
        'installer refreshes an existing Panergos launcher'
    Assert-BytesEqual $panergosAcp `
        ([System.IO.File]::ReadAllBytes((Join-Path $binDir 'panergos-acp.exe'))) `
        'installer copies the primary ACP launcher when present'

    # Relocatable venv: exe trampolines die when copied out of venv\Scripts
    # ('uv trampoline failed to canonicalize script path'), so the stage
    # must emit .cmd delegators and clear the stale exe copies.
    Set-Content -Path (Join-Path $installRoot 'venv\pyvenv.cfg') `
        -Value "home = X`r`nrelocatable = true" -Encoding Ascii
    Install-PanergosCommandLaunchers -Root $installRoot -Destination $binDir | Out-Null
    Assert-True (Test-Path -LiteralPath (Join-Path $binDir 'panergos.cmd')) `
        'relocatable venv: primary .cmd delegator staged'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $binDir 'panergos.exe'))) `
        'relocatable venv: stale primary exe copy removed'
    Assert-True (Test-Path -LiteralPath (Join-Path $binDir 'panergos-acp.cmd')) `
        'relocatable venv: primary ACP .cmd delegator staged'
    $cmdBody = [System.IO.File]::ReadAllText((Join-Path $binDir 'panergos.cmd'))
    Assert-True ($cmdBody.Contains((Join-Path $scriptsDir 'panergos.exe')) -and $cmdBody.Contains('%*')) `
        'primary delegator invokes the in-venv exe and forwards args'
} finally {
    if (Test-Path -LiteralPath $caseRoot) {
        $resolvedCase = [System.IO.Path]::GetFullPath($caseRoot)
        if (-not $resolvedCase.StartsWith($tempBase, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove test directory outside the system temp directory: $resolvedCase"
        }
        Remove-Item -LiteralPath $resolvedCase -Recurse -Force
    }
}

if ($script:Failures -gt 0) {
    Write-Host ""
    Write-Host "$script:Failures assertion(s) failed"
    exit 1
}

Write-Host ""
Write-Host "all assertions passed"
