# pptfast skill launcher (Windows, PowerShell 5.1 compatible).
#
# The Windows twin of run.sh: identical resolution order, identical diagnostic
# fields, identical exit codes. One stable action for the agent ("run
# pptfast"); this script picks a working way to run it here.
#
# Invoke it per-process so no global policy is touched:
#   powershell -ExecutionPolicy Bypass -File run.ps1 validate deck.json
#
# Resolution order (kept identical in run.sh):
#   1. A compatible pptfast already on PATH -> run it directly.
#   2. npx present, on a node meeting the floor -> run the pinned npm version.
#   3. bunx present -> run the pinned version via Bun.
#   4. Nothing usable -> structured diagnosis, exit 78.
#
# It never writes PATH, never needs admin rights, never fetches a second script,
# and has no postinstall step.

$ErrorActionPreference = 'Stop'

# --- Version constants: stamped by scripts/stamp.mts at release time. ---------
# Do not edit $Pinned by hand; scripts/stamp.test.mts asserts it equals the
# package.json version, and `pnpm release:version` rewrites it on every bump.
$Package = '@liustack/pptfast'
$Bin = 'pptfast'
$Pinned = '0.20.0'
# ------------------------------------------------------------------------------

# Environment snapshot, filled by Collect and read by the emitter.
$script:Arch = ''
$script:CliPresent = $false
$script:CliPath = $null
$script:CliVer = $null
$script:CliCompat = $false
$script:NpxPresent = $false
$script:NpxPath = $null
$script:BunxPresent = $false
$script:BunxPath = $null
$script:NodePresent = $false
$script:NodeVer = $null
$script:NodeFloorOk = $false
$script:Selected = 'none'

# First "X.Y.Z" token printed by `$Bin --version`.
function Get-CliVersion {
    try { $out = & $Bin --version 2>$null } catch { return '' }
    if (-not $out) { return '' }
    $line = [string]($out | Select-Object -First 1)
    $m = [regex]::Match($line, '[0-9]+\.[0-9]+\.[0-9]+')
    if ($m.Success) { return $m.Value } else { return '' }
}

# Compatible = same major version as $Pinned AND not older than $Pinned.
# Same major keeps a globally installed CLI usable without a forced re-download;
# not-older refuses a stale build that predates the version this skill needs.
function Test-Compatible {
    param([string] $Ver)
    $f = $Ver -split '\.'
    $p = $Pinned -split '\.'
    if ($f.Count -lt 3 -or $p.Count -lt 3) { return $false }
    $fMaj = [int]$f[0]; $fMin = [int]$f[1]; $fPat = [int]$f[2]
    $pMaj = [int]$p[0]; $pMin = [int]$p[1]; $pPat = [int]$p[2]
    if ($fMaj -ne $pMaj) { return $false }
    if ($fMin -gt $pMin) { return $true }
    if ($fMin -lt $pMin) { return $false }
    return ($fPat -ge $pPat)
}

# The npx path runs the CLI on this machine's node, so npx is only usable when
# node itself meets the package's floor (package.json engines).
$NodeFloor = '22.19.0'
function Test-NodeMeetsFloor {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
    try { $nv = ((& node --version 2>$null) -replace '^v', '') } catch { return $false }
    if (-not $nv) { return $false }
    $n = $nv -split '\.'
    $f = $NodeFloor -split '\.'
    if ($n.Count -lt 2) { return $false }
    $nMaj = [int]$n[0]; $nMin = [int]$n[1]
    $fMaj = [int]$f[0]; $fMin = [int]$f[1]
    if ($nMaj -gt $fMaj) { return $true }
    if ($nMaj -lt $fMaj) { return $false }
    return ($nMin -ge $fMin)
}

# Return exactly one word: the chosen launch path.
function Resolve-LaunchKind {
    $cli = Get-Command $Bin -ErrorAction SilentlyContinue
    if ($cli) {
        $v = Get-CliVersion
        if ($v -and (Test-Compatible $v)) { return 'path' }
    }
    if ((Get-Command npx -ErrorAction SilentlyContinue) -and (Test-NodeMeetsFloor)) { return 'npx' }
    if (Get-Command bunx -ErrorAction SilentlyContinue) { return 'bunx' }
    return 'none'
}

function Get-Arch {
    switch ($env:PROCESSOR_ARCHITECTURE) {
        'AMD64' { return 'x64' }
        'ARM64' { return 'arm64' }
        'x86' { return 'x86' }
        default { return $env:PROCESSOR_ARCHITECTURE }
    }
}

# Probe the environment once into the $script:* snapshot.
function Collect {
    $script:Arch = Get-Arch

    $cli = Get-Command $Bin -ErrorAction SilentlyContinue
    if ($cli) {
        $script:CliPresent = $true
        $script:CliPath = $cli.Source
        $script:CliVer = Get-CliVersion
        $script:CliCompat = [bool]($script:CliVer -and (Test-Compatible $script:CliVer))
    }

    $npx = Get-Command npx -ErrorAction SilentlyContinue
    if ($npx) { $script:NpxPresent = $true; $script:NpxPath = $npx.Source }

    $bunx = Get-Command bunx -ErrorAction SilentlyContinue
    if ($bunx) { $script:BunxPresent = $true; $script:BunxPath = $bunx.Source }

    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        $script:NodePresent = $true
        try { $script:NodeVer = ((& node --version 2>$null) -replace '^v', '') } catch { $script:NodeVer = $null }
        $script:NodeFloorOk = Test-NodeMeetsFloor
    }

    $script:Selected = Resolve-LaunchKind
}

# Assemble the structured diagnosis.
function Build-DiagnosisJson {
    $checked = [ordered]@{
        pathCli = [ordered]@{ present = $script:CliPresent; path = $script:CliPath; version = $script:CliVer; compatible = $script:CliCompat }
        npx     = [ordered]@{ present = $script:NpxPresent; path = $script:NpxPath; nodeMeetsFloor = $script:NodeFloorOk }
        bunx    = [ordered]@{ present = $script:BunxPresent; path = $script:BunxPath }
        node    = [ordered]@{ present = $script:NodePresent; version = $script:NodeVer }
    }
    $steps = @()
    if ($script:Selected -eq 'none') {
        $major = $Pinned.Split('.')[0]
        $first = "Install Node 22.19+ from https://nodejs.org so npx can run $Package@$Pinned, then re-run this launcher."
        if ($script:NpxPresent -and (-not $script:NodeFloorOk)) {
            $first = "npx is present but node $(if ($script:NodeVer) { $script:NodeVer } else { 'missing' }) is below the $NodeFloor floor this CLI needs. Upgrade Node at https://nodejs.org, then re-run this launcher."
        }
        $steps = @(
            $first,
            "No JavaScript runtime? Install Bun from https://bun.sh to use bunx, or put a compatible $Bin (major $major, at or above $Pinned) on PATH."
        )
    }
    $obj = [ordered]@{
        tool          = $Bin
        package       = $Package
        pinnedVersion = $Pinned
        os            = 'windows'
        arch          = $script:Arch
        checked       = $checked
        selected      = $script:Selected
        nextSteps     = @($steps)
    }
    return ($obj | ConvertTo-Json -Depth 20)
}

# Default action: forward every argument to the resolved CLI and exit with its
# code. No usable runtime -> structured diagnosis on stderr, exit 78 (EX_CONFIG)
# so the agent never mistakes the diagnosis for a result.
function Invoke-Run {
    param([string[]] $CliArgs)
    $sel = Resolve-LaunchKind
    switch ($sel) {
        'path' { & $Bin @CliArgs; exit $LASTEXITCODE }
        'npx' { & npx --yes --package "$Package@$Pinned" $Bin @CliArgs; exit $LASTEXITCODE }
        'bunx' { & bunx --bun "$Package@$Pinned" @CliArgs; exit $LASTEXITCODE }
        'none' {
            Collect
            [Console]::Error.WriteLine((Build-DiagnosisJson))
            exit 78
        }
    }
}

$Command = ''
if ($args.Count -ge 1) { $Command = [string]$args[0] }

switch ($Command) {
    'where' { Collect; Write-Output $script:Selected }
    default { Invoke-Run -CliArgs $args }
}
