# Axiom NHI - One-Click Startup Script
# Starts all development services with proper dependency ordering

param(
    [switch]$Setup,
    [switch]$Clean,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

function Write-Banner {
    Write-Host ""
    Write-Host "╔═══════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                                                   ║" -ForegroundColor Cyan
    Write-Host "║              🚀 AXIOM NHI                         ║" -ForegroundColor Cyan
    Write-Host "║     Identity Intelligence & Runtime Security      ║" -ForegroundColor Cyan
    Write-Host "║                                                   ║" -ForegroundColor Cyan
    Write-Host "╚═══════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Show-Help {
    Write-Banner
    Write-Host "Usage: .\start.ps1 [options]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "  -Setup    Run first-time setup (install dependencies, create databases)" -ForegroundColor White
    Write-Host "  -Clean    Clean all data and start fresh" -ForegroundColor White
    Write-Host "  -Help     Show this help message" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\start.ps1                # Normal startup" -ForegroundColor Gray
    Write-Host "  .\start.ps1 -Setup         # First-time setup" -ForegroundColor Gray
    Write-Host "  .\start.ps1 -Clean         # Reset everything" -ForegroundColor Gray
    Write-Host ""
    exit 0
}

function Test-Command {
    param($Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Wait-ForService {
    param(
        [string]$Name,
        [string]$Container,
        [int]$MaxAttempts = 30
    )
    
    Write-Host "   Waiting for $Name..." -ForegroundColor Gray -NoNewline
    
    for ($i = 0; $i -lt $MaxAttempts; $i++) {
        $status = docker compose ps $Container --format json 2>$null | ConvertFrom-Json
        if ($status.Health -eq "healthy" -or $status.Status -like "*Up*") {
            Write-Host " Ready ✓" -ForegroundColor Green
            return $true
        }
        Write-Host "." -NoNewline -ForegroundColor Gray
        Start-Sleep -Seconds 1
    }
    
    Write-Host " Timeout ✗" -ForegroundColor Red
    return $false
}

if ($Help) {
    Show-Help
}

Write-Banner

# Check if this is first run
$isFirstRun = -not (Test-Path ".env.local") -or $Setup

if ($isFirstRun -and -not $Setup) {
    Write-Host "⚠️  First time setup required!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Run: .\start.ps1 -Setup" -ForegroundColor White
    Write-Host ""
    exit 0
}

# Clean mode
if ($Clean) {
    Write-Host "🧹 Cleaning all data..." -ForegroundColor Yellow
    Write-Host ""
    
    Write-Host "   Stopping services..." -ForegroundColor Gray
    docker compose down -v 2>$null
    
    Write-Host "   Removing node_modules..." -ForegroundColor Gray
    if (Test-Path "node_modules") {
        Remove-Item -Recurse -Force node_modules
    }
    
    Write-Host "   Removing data directory..." -ForegroundColor Gray
    if (Test-Path "..\..\data\axiom") {
        Remove-Item -Recurse -Force "..\..\data\axiom"
    }
    
    Write-Host ""
    Write-Host "✅ Clean complete!" -ForegroundColor Green
    Write-Host "   Run: .\start.ps1 -Setup" -ForegroundColor White
    Write-Host ""
    exit 0
}

# Setup mode
if ($Setup) {
    Write-Host "🔧 Running first-time setup..." -ForegroundColor Yellow
    Write-Host ""
    
    # Check prerequisites
    Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow
    
    $missingTools = @()
    
    if (-not (Test-Command "node")) { $missingTools += "Node.js 20+" }
    if (-not (Test-Command "pnpm")) { $missingTools += "pnpm" }
    if (-not (Test-Command "cargo")) { $missingTools += "Rust" }
    if (-not (Test-Command "docker")) { $missingTools += "Docker" }
    
    if ($missingTools.Count -gt 0) {
        Write-Host ""
        Write-Host "❌ Missing required tools:" -ForegroundColor Red
        $missingTools | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
        Write-Host ""
        Write-Host "Please install missing tools and run setup again." -ForegroundColor Yellow
        Write-Host "See GETTING-STARTED.md for installation instructions." -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "✅ All prerequisites installed" -ForegroundColor Green
    Write-Host ""
    
    # Run full setup script
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    & ".\scripts\setup-dev.ps1"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "❌ Setup failed. Check errors above." -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
    Write-Host "✅ Setup complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Starting services..." -ForegroundColor Yellow
    Write-Host ""
}

# Normal startup
Write-Host "🚀 Starting Axiom NHI..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Start Docker services
Write-Host "1️⃣  Starting infrastructure..." -ForegroundColor Yellow
docker compose up -d postgres redis openbao 2>$null

if ($LASTEXITCODE -ne 0) {
    Write-Host "   ❌ Failed to start Docker services" -ForegroundColor Red
    Write-Host "   Try: docker compose up -d" -ForegroundColor Gray
    exit 1
}

# Wait for services to be ready
Wait-ForService -Name "PostgreSQL" -Container "postgres" | Out-Null
Wait-ForService -Name "Redis" -Container "redis" | Out-Null

Write-Host "   ✅ Infrastructure ready" -ForegroundColor Green
Write-Host ""

# Step 2: Check database schema
Write-Host "2️⃣  Checking database..." -ForegroundColor Yellow

$dbReady = $false
try {
    $env:PGPASSWORD = "axiom_dev_password"
    $tables = psql -U axiom -h localhost -d axiom_dev -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>$null
    if ($tables -and [int]$tables -gt 0) {
        Write-Host "   ✅ Database schema exists ($tables tables)" -ForegroundColor Green
        $dbReady = $true
    }
} catch {
    Write-Host "   ⚠️  Database schema not found" -ForegroundColor Yellow
}

if (-not $dbReady) {
    Write-Host "   Running migrations..." -ForegroundColor Gray
    
    foreach ($migration in Get-ChildItem migrations\*.sql | Sort-Object Name) {
        Write-Host "      Applying $($migration.Name)..." -ForegroundColor Gray
        psql -U axiom -h localhost -d axiom_dev -f $migration.FullName 2>$null | Out-Null
    }
    
    Write-Host "   ✅ Database migrations applied" -ForegroundColor Green
}

Write-Host ""

# Step 3: Start development servers
Write-Host "3️⃣  Starting application..." -ForegroundColor Yellow
Write-Host ""

Write-Host "   Starting Next.js web app..." -ForegroundColor Gray
Write-Host "   This will open in a new terminal window." -ForegroundColor Gray
Write-Host ""

# Start pnpm dev in new terminal window
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "pnpm dev"

Write-Host "   ✅ Application starting" -ForegroundColor Green
Write-Host ""

# Step 4: Show status
Start-Sleep -Seconds 3

Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ Axiom NHI is starting up!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Write-Host "🌐 Services:" -ForegroundColor Yellow
Write-Host "   • Web App:          http://localhost:3000" -ForegroundColor White
Write-Host "   • PostgreSQL:       localhost:5432" -ForegroundColor White
Write-Host "   • Redis:            localhost:6379" -ForegroundColor White
Write-Host "   • OpenBao:          http://localhost:8200" -ForegroundColor White
Write-Host ""

Write-Host "📊 Optional Tools:" -ForegroundColor Yellow
Write-Host "   • PgAdmin:          http://localhost:5050" -ForegroundColor Gray
Write-Host "   • Redis Commander:  http://localhost:8081" -ForegroundColor Gray
Write-Host "   (Start with: docker compose --profile tools up -d)" -ForegroundColor Gray
Write-Host ""

Write-Host "📚 Documentation:" -ForegroundColor Yellow
Write-Host "   • Getting Started:  GETTING-STARTED.md" -ForegroundColor White
Write-Host "   • Architecture:     AXIOM-CUSTOMER-JOURNEY-AND-SYSTEM-ARCHITECTURE.md" -ForegroundColor White
Write-Host "   • Implementation:   IMPLEMENTATION-CHECKLIST.md" -ForegroundColor White
Write-Host ""

Write-Host "🔧 Common Commands:" -ForegroundColor Yellow
Write-Host "   • Stop all:         docker compose down" -ForegroundColor White
Write-Host "   • View logs:        docker compose logs -f" -ForegroundColor White
Write-Host "   • Run tests:        pnpm test" -ForegroundColor White
Write-Host "   • Reset data:       .\start.ps1 -Clean" -ForegroundColor White
Write-Host ""

Write-Host "⏳ Waiting for web app to be ready..." -ForegroundColor Yellow
Write-Host "   This may take 30-60 seconds on first run." -ForegroundColor Gray
Write-Host ""

# Wait for Next.js to be ready
$maxAttempts = 60
for ($i = 0; $i -lt $maxAttempts; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 1 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Host "   ✅ Web app is ready!" -ForegroundColor Green
            break
        }
    } catch {
        if ($i % 5 -eq 0) {
            Write-Host "   Still waiting... ($i/$maxAttempts)" -ForegroundColor Gray
        }
        Start-Sleep -Seconds 1
    }
}

Write-Host ""
Write-Host "🎉 Visit http://localhost:3000 to get started!" -ForegroundColor Cyan
Write-Host ""

# Open browser automatically
$openBrowser = Read-Host "Open browser now? (Y/n)"
if ($openBrowser -ne 'n' -and $openBrowser -ne 'N') {
    Start-Process "http://localhost:3000"
}

Write-Host ""
Write-Host "Press Ctrl+C to stop all services." -ForegroundColor Yellow
Write-Host ""

# Keep script running
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host ""
    Write-Host "Shutting down..." -ForegroundColor Yellow
    docker compose down 2>$null
}
