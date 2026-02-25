$ErrorActionPreference = "Stop"

$gcpProjectId        = "varma-projekti"
$gcpRegion           = "europe-north1"
$serviceName         = "rag-manager-app"

function Write-Header([string]$message) {
    Write-Host ""
    Write-Host ("=" * 72) -ForegroundColor Cyan
    Write-Host ("  " + $message) -ForegroundColor Cyan
    Write-Host ("=" * 72) -ForegroundColor Cyan
}

function Write-Success([string]$message) {
    Write-Host "[SUCCESS] $message" -ForegroundColor Green
}

function Write-Error-And-Exit([string]$message) {
    Write-Host "[ERROR] $message" -ForegroundColor Red
    exit 1
}

function Get-GCloudCmdPath {
    $cmd = Get-Command "gcloud.cmd" -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $gcloud = Get-Command "gcloud" -ErrorAction SilentlyContinue
    if ($gcloud -and $gcloud.Source -like "*.cmd") { return $gcloud.Source }

    return $null
}

$gcloudCmdPath = Get-GCloudCmdPath
if (-not $gcloudCmdPath) {
    Write-Error-And-Exit "gcloud.cmd not found. Ensure Google Cloud SDK is installed and in PATH."
}

function Invoke-GCloud {
    param(
        [Parameter(Mandatory=$true)]
        [string[]]$CommandArray,

        [Parameter(Mandatory=$true)]
        [string]$ErrorMessage
    )

    $cmdLine = $CommandArray -join " "
    Write-Host "Executing: gcloud $cmdLine"

    $output = & cmd.exe /c "`"$gcloudCmdPath`" $cmdLine 2>&1"
    $exitCode = $LASTEXITCODE
    $text = ($output | Out-String).Trim()

    if ($exitCode -ne 0) {
        if ($text) { Write-Host $text }
        Write-Error-And-Exit "$ErrorMessage (gcloud exit code: $exitCode)"
    }

    return $text
}

Write-Header "Step 1: Prerequisites"

if (-not $gcpProjectId) { Write-Error-And-Exit "Set `$gcpProjectId`." }
if (-not $gcpRegion)    { Write-Error-And-Exit "Set `$gcpRegion`." }
if (-not $serviceName)  { Write-Error-And-Exit "Set `$serviceName`." }

Write-Success "Prerequisites OK"

Write-Header "Step 2: Configure project & APIs"

$null = Invoke-GCloud -CommandArray @("config", "set", "project", $gcpProjectId) -ErrorMessage "Failed to set GCP project"

$apis = @(
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com"
)

foreach ($api in $apis) {
    $null = Invoke-GCloud -CommandArray @("services", "enable", $api) -ErrorMessage "Failed to enable API: $api"
}

Write-Success "Project configured and APIs enabled"

Write-Header "Step 3: Artifact Registry"

$repositoryName = "$serviceName-repo"

$repoExists = $false
try {
    $null = & cmd.exe /c "`"$gcloudCmdPath`" artifacts repositories describe $repositoryName --location=$gcpRegion --format=value(name) 2>nul"
    if ($LASTEXITCODE -eq 0) { $repoExists = $true }
} catch { $repoExists = $false }

if (-not $repoExists) {
    $null = Invoke-GCloud -CommandArray @(
        "artifacts", "repositories", "create", $repositoryName,
        "--repository-format=docker",
        "--location=$gcpRegion"
    ) -ErrorMessage "Failed to create Artifact Registry repository"
    Write-Success "Artifact Registry repository created: $repositoryName"
} else {
    Write-Host "Artifact Registry repository already exists: $repositoryName"
}

$imageUrl = "$gcpRegion-docker.pkg.dev/$gcpProjectId/$repositoryName/$serviceName`:latest"
Write-Host "Image URL: $imageUrl" -ForegroundColor Yellow

Write-Header "Step 4: Build & push image"

$null = Invoke-GCloud -CommandArray @("builds", "submit", "--tag", $imageUrl) -ErrorMessage "Failed to build and push Docker image"
Write-Success "Image built and pushed"

Write-Header "Step 5: Deploy to Cloud Run"

$deployCommandArgs = @(
    "run", "deploy", $serviceName,
    "--image=$imageUrl",
    "--region=$gcpRegion",
    "--platform=managed",
    "--allow-unauthenticated",
    "--cpu=1",
    "--memory=256Mi",
    "--quiet"
)

$null = Invoke-GCloud -CommandArray $deployCommandArgs -ErrorMessage "Failed to deploy to Cloud Run"
Write-Success "Deployment complete"

Write-Header "Deployment Details"

$serviceUrl = Invoke-GCloud -CommandArray @(
    "run", "services", "describe", $serviceName,
    "--platform=managed",
    "--region=$gcpRegion",
    "--format=value(status.url)"
) -ErrorMessage "Failed to get service URL"

Write-Host "Service URL: $serviceUrl" -ForegroundColor Yellow
