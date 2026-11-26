[CmdletBinding()]
param(
    [string]$Godot = 'D:\dev\windssea\game\godot4.7.2\Godot_v4.7.2-stable_win64_console.exe',
    [switch]$Publish
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$project = Join-Path $repo 'game'
$export = Join-Path $repo 'build/web'
$site = Join-Path $repo 'build/site'
[IO.Directory]::CreateDirectory($export) | Out-Null
function Clear-GeneratedExport([string]$OutputDirectory) {
    $resolvedOutput = (Resolve-Path -LiteralPath $OutputDirectory).Path
    if ($resolvedOutput -notin @($export, $site)) { throw "Unexpected export directory: $resolvedOutput" }
    Get-ChildItem -LiteralPath $resolvedOutput -File -Filter 'index.*' | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName
    }
}
Push-Location $repo
try {
    Clear-GeneratedExport $export
    & $Godot --headless --path $project --import
    if ($LASTEXITCODE -ne 0) { throw 'Godot import failed' }
    $invalid = Get-ChildItem -Path $project -Filter '*.import' -File -Recurse |
        Select-String -Pattern '^valid=false$' | Select-Object -First 1
    if ($invalid) { throw "Invalid Godot import: $($invalid.Path)" }
    & $Godot --headless --path $project --export-release Web (Join-Path $export 'index.html')
    if ($LASTEXITCODE -ne 0) { throw 'Godot Web export failed' }
    $fontLicense = [IO.File]::ReadAllText((Join-Path $project 'art/OFL-NotoSansSC.txt'))
    $credits = "Godot Engine · MIT and third-party notices: https://godotengine.org/license/" + [Environment]::NewLine + [Environment]::NewLine + $fontLicense
    $credits += [Environment]::NewLine + "Original AI-generated soundtrack and performances: Google Lyria / Gemini. Production notes: https://github.com/windssea/drum/blob/main/docs/music-score.md"
    [IO.File]::WriteAllText((Join-Path $export 'index.credits.txt'), $credits)
    $htmlFile = Join-Path $export 'index.html'
    $html = [IO.File]::ReadAllText($htmlFile).Replace('<html lang="en">', '<html lang="zh-CN">')
    $html = $html.Replace('<title>Tidebeat Harbor</title>', '<title>潮汐鼓港 · 鼓浪迎击</title>')
    $html = $html.Replace('</head>', '<link rel="license" href="index.credits.txt"><link rel="stylesheet" href="index.loading.css"></head>')
    $html = $html.Replace('<progress id="status-progress">', '<p class="launch-note" role="status">鼓浪迎击 · 正在装载战斗舞台</p><progress aria-label="游戏下载进度" id="status-progress">')
    [IO.File]::WriteAllText($htmlFile, $html)
    Copy-Item -LiteralPath (Join-Path $repo 'infra/loading.css') -Destination (Join-Path $export 'index.loading.css')
    Copy-Item -LiteralPath (Join-Path $repo 'infra/splash.webp') -Destination (Join-Path $export 'index.cover.webp')
    Copy-Item -LiteralPath (Join-Path $project 'music/battle.ogg') -Destination (Join-Path $export 'index.theme.ogg')
    $practice = Join-Path $export 'practice/index.html'
    & node (Join-Path $PSScriptRoot 'build-practice-page.mjs') $practice
    if ($LASTEXITCODE -ne 0) { throw 'Practice guide generation failed' }
    Write-Host "Local export: $export"
    if (!$Publish) { return }

    $config = Get-Content -Raw -LiteralPath (Join-Path $repo 'wrangler.jsonc') | ConvertFrom-Json
    $wasm = Join-Path $export 'index.wasm'
    $sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $wasm).Hash.ToLowerInvariant()
    if ($sha -ne $config.vars.WASM_SHA256) { throw 'The exported engine differs from the pinned R2 runtime. Check template version and update WASM_SHA256.' }
    $gzipPath = Join-Path $repo 'build/index.wasm.gz'
    $source = [IO.File]::OpenRead($wasm)
    try {
        $destination = [IO.File]::Create($gzipPath)
        try {
            $compressor = [IO.Compression.GzipStream]::new($destination,[IO.Compression.CompressionLevel]::Optimal,$true)
            try { $source.CopyTo($compressor) } finally { $compressor.Dispose() }
        } finally { $destination.Dispose() }
    } finally { $source.Dispose() }

    [IO.Directory]::CreateDirectory($site) | Out-Null
    Clear-GeneratedExport $site
    Get-ChildItem -LiteralPath $export -File -Filter 'index.*' |
        Where-Object { $_.Name -ne 'index.wasm' } |
        Copy-Item -Destination $site
    $sitePractice = Join-Path $site 'practice/index.html'
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($sitePractice)) | Out-Null
    Copy-Item -LiteralPath $practice -Destination $sitePractice
    $bucket = $config.r2_buckets[0].bucket_name
    $enginePresent = $false
    try {
        # The worker reads the pinned R2 object on HEAD before returning its hash.
        $engineUrl = "https://$($config.name).windssea526.workers.dev/index.wasm"
        $head = Invoke-WebRequest -Method Head -Uri $engineUrl -TimeoutSec 12 -UseBasicParsing
        $enginePresent = $head.StatusCode -eq 200 -and ($head.Headers.ETag -join '') -ceq ('W/"' + $sha + '"')
    } catch {
        Write-Verbose "Could not confirm the published engine. Uploading the pinned object."
    }
    if (!$enginePresent) {
        & npx --yes --registry=https://registry.npmjs.org wrangler@4.168.0 r2 object put "$bucket/engine/$sha.wasm.gz" --file $gzipPath --content-type application/gzip --remote
        if ($LASTEXITCODE -ne 0) { throw 'R2 upload failed' }
    }
    & npx --yes --registry=https://registry.npmjs.org wrangler@4.168.0 deploy
    if ($LASTEXITCODE -ne 0) { throw 'Worker deployment failed' }
} finally { Pop-Location }
