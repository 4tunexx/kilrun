param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$output = [System.IO.Path]::GetFullPath($OutputPath)
$partial = "$output.partial"
$extraFiles = @(
  'KILRUNP-START-HERE.md',
  'docs/KILRUNP_INSTALL.md',
  'scripts/kilrunp-setup.html',
  'scripts/kilrunp-setup.mjs',
  'scripts/kilrunp-setup.test.mjs',
  'scripts/package-kilrunp.ps1',
  'src/lib/roles.test.ts'
)
$rootFiles = @(
  '.env.example', '.eslintrc.json', '.gitignore', 'components.json',
  'next.config.ts', 'package-lock.json', 'package.json', 'postcss.config.mjs',
  'prisma.config.ts', 'README.md', 'tailwind.config.ts', 'tsconfig.json',
  'vercel.json', 'vitest.config.ts', 'KILRUNP-START-HERE.md'
)
$builtInUploads = @(
  'public/uploads/site/bg3.png',
  'public/uploads/site/wordmark-f0ed874d3b8a105f.png'
)

if (Test-Path -LiteralPath $output) { throw "Output already exists: $output" }
if (Test-Path -LiteralPath $partial) { throw "Partial output already exists: $partial" }
if (-not (Test-Path -LiteralPath ([System.IO.Path]::GetDirectoryName($output)) -PathType Container)) {
  throw 'The output directory does not exist.'
}

$tracked = @(& git -C $root -c core.quotepath=false ls-files)
if ($LASTEXITCODE -ne 0) { throw 'Could not list tracked project files.' }
$untracked = @(& git -C $root -c core.quotepath=false ls-files --others --exclude-standard)
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect untracked project files.' }
foreach ($file in $untracked) {
  if (($file -match '^(src|server|shared|prisma|scripts|desktop|docs|public)/') -and
      ($extraFiles -notcontains $file)) {
    throw "Untracked project file needs review before packaging: $file"
  }
}

$files = @($tracked + $extraFiles | Sort-Object -Unique | Where-Object {
  $file = $_
  $included = ($rootFiles -contains $file) -or
    ($file -match '^(src|server|shared|prisma|scripts|desktop|docs|public)/')
  $private = ($file -match '(^|/)(\.env($|\.)|\.git/|node_modules/|dist/|target/|\.next/|\.clerk/|\.vercel/)' -and
    $file -ne '.env.example') -or
    ($file -match '\.(log|pem|key|p12|pfx|sqlite|db)$') -or
    ($file -match '^public/uploads/' -and $builtInUploads -notcontains $file)
  $included -and -not $private
})

foreach ($required in @($extraFiles + $builtInUploads + @('package.json', 'package-lock.json', 'server/package-lock.json'))) {
  if ($files -notcontains $required) { throw "Required package file is missing: $required" }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = $null
$archive = $null
$createdPartial = $false
try {
  $stream = [System.IO.File]::Open($partial, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write)
  $createdPartial = $true
  $archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
  foreach ($file in $files) {
    if ($file -match '(^/|(^|/)\.\.(/|$)|\\)') { throw "Invalid package path: $file" }
    $source = [System.IO.Path]::GetFullPath((Join-Path $root ($file.Replace('/', '\'))))
    if (-not $source.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Package path escapes the project: $file"
    }
    $item = Get-Item -LiteralPath $source -Force
    if ($item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
      throw "Package source must be a regular file: $file"
    }
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive, $source, $file, [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
  $archive.Dispose()
  $archive = $null
  $stream = $null
  [System.IO.File]::Move($partial, $output)
  Write-Output "Created $output with $($files.Count) files."
} finally {
  if ($null -ne $archive) { $archive.Dispose() }
  if ($null -ne $stream) { $stream.Dispose() }
  if ($createdPartial -and (Test-Path -LiteralPath $partial)) {
    Remove-Item -LiteralPath $partial -Force
  }
}
