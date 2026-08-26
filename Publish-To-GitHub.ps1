# ==============================================================================
# DriveVault — 1-Click GitHub Repository & Release Publisher
# ==============================================================================
param(
    [string]$RepoUrl = "",
    [string]$ReleaseTag = "v1.0.0",
    [string]$ReleaseTitle = "DriveVault v1.0.0 — Official Release"
)

$ErrorActionPreference = "Stop"
$appDir = $PSScriptRoot

# Set local paths for Git and gh
$gitCmd = "$env:LOCALAPPDATA\Programs\Git\cmd"
$ghDir = "$env:LOCALAPPDATA\Programs\GitHubCLI"
$env:Path = "$gitCmd;$ghDir;$env:Path"

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "     DriveVault GitHub & Release Publisher" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# 1. Check Git Installation
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[!] Git is required. Please install Git or restart the terminal." -ForegroundColor Red
    exit 1
}

# 2. Check / Initialize Git Repo
if (-not (Test-Path "$appDir\.git")) {
    Write-Host "[1/5] Initializing new Git repository..." -ForegroundColor Yellow
    & git init -b main
} else {
    Write-Host "[1/5] Git repository detected." -ForegroundColor Green
}

# Set default user if not configured
$userName = (& git config user.name)
if ([string]::IsNullOrWhiteSpace($userName)) {
    & git config user.name "DriveVault Developer"
    & git config user.email "developer@drivevault.local"
    Write-Host "  -> Set local git author name and email." -ForegroundColor Gray
}

# 3. Stage & Commit files
Write-Host "[2/5] Staging files for commit..." -ForegroundColor Yellow
& git add .
$status = & git status --porcelain
if ($status) {
    & git commit -m "feat: Initial release of DriveVault v1.0.0 - Google Drive Desktop Auto-Backup"
    Write-Host "  [OK] Changes committed successfully!" -ForegroundColor Green
} else {
    Write-Host "  [OK] Working tree clean (already committed)." -ForegroundColor Green
}

# 4. Handle Remote Repository
Write-Host "[3/5] Checking Remote Origin..." -ForegroundColor Yellow
$remotes = (& git remote -v)

if (-not $remotes -and -not $RepoUrl) {
    # Check if gh is authenticated
    $ghAuth = $false
    try {
        $ghStatus = & gh auth status 2>&1
        if ($LASTEXITCODE -eq 0) { $ghAuth = $true }
    } catch { }

    if ($ghAuth) {
        Write-Host "  -> GitHub CLI authenticated! Creating GitHub repository..." -ForegroundColor Cyan
        & gh repo create drivevault-desktop --public --source=. --remote=origin --push
    } else {
        Write-Host "  [?] No git remote found." -ForegroundColor Yellow
        Write-Host "  To link your GitHub repository, run:" -ForegroundColor White
        Write-Host "    gh auth login" -ForegroundColor Cyan
        Write-Host "    -- OR --" -ForegroundColor Gray
        Write-Host "    git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git" -ForegroundColor Cyan
        Write-Host "    git push -u origin main" -ForegroundColor Cyan
        Write-Host ""
        $userRepo = Read-Host "Enter your GitHub Repo URL (or press Enter to skip remote push)"
        if ($userRepo) {
            & git remote add origin $userRepo
            & git branch -M main
            & git push -u origin main
            Write-Host "  [OK] Successfully pushed to $userRepo!" -ForegroundColor Green
        }
    }
} elseif ($RepoUrl) {
    try { & git remote remove origin 2>&1 | Out-Null } catch { }
    & git remote add origin $RepoUrl
    & git branch -M main
    & git push -u origin main -f
    Write-Host "  [OK] Pushed to $RepoUrl!" -ForegroundColor Green
} else {
    Write-Host "  -> Remote origin exists. Pushing to main..." -ForegroundColor Cyan
    & git branch -M main
    & git push -u origin main
    Write-Host "  [OK] Pushed latest commit to remote!" -ForegroundColor Green
}

# 5. Create GitHub Release with Binaries (if gh is available)
Write-Host "[4/5] Checking for Release Binaries..." -ForegroundColor Yellow
$setupExe = Join-Path $appDir "dist-installer\DriveVault-Setup-1.0.0.exe"
$portableExe = Join-Path $appDir "dist-installer\DriveVault-Portable-1.0.0.exe"
$releaseNotes = Join-Path $appDir "RELEASE_NOTES.md"

if (Get-Command gh -ErrorAction SilentlyContinue) {
    $isGhLoggedIn = $false
    try {
        $check = & gh auth status 2>&1
        if ($LASTEXITCODE -eq 0) { $isGhLoggedIn = $true }
    } catch { }

    if ($isGhLoggedIn) {
        Write-Host "[5/5] Creating GitHub Release $ReleaseTag..." -ForegroundColor Cyan
        $assets = @()
        if (Test-Path $setupExe) { $assets += $setupExe }
        if (Test-Path $portableExe) { $assets += $portableExe }

        if ($assets.Count -gt 0) {
            & gh release create $ReleaseTag $assets --title "$ReleaseTitle" --notes-file "$releaseNotes"
            Write-Host "  [OK] Release $ReleaseTag created with installers attached!" -ForegroundColor Green
        } else {
            & gh release create $ReleaseTag --title "$ReleaseTitle" --notes-file "$releaseNotes"
            Write-Host "  [OK] Release $ReleaseTag created!" -ForegroundColor Green
        }
    } else {
        Write-Host "[5/5] gh CLI is not logged in. To publish releases automatically, run: gh auth login" -ForegroundColor Yellow
    }
}

Write-Host "=====================================================" -ForegroundColor Green
Write-Host "  All done! DriveVault is ready on GitHub." -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
