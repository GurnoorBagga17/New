# Axiom NHI - Development Environment Setup Script
# Prepares local development environment with all dependencies

param(
    [switch]$SkipDocker,
    [switch]$SkipDatabase,
    [switch]$SkipDependencies
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Axiom NHI - Development Setup" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow

# Check Node.js version
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "❌ Node.js not found. Please install Node.js 20+ from https://nodejs.org" -ForegroundColor Red
    exit 1
}
$nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
if ($nodeMajor -lt 20) {
    Write-Host "❌ Node.js $nodeVersion found, but version 20+ required" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Node.js $nodeVersion" -ForegroundColor Green

# Check pnpm
$pnpmVersion = pnpm --version 2>$null
if (-not $pnpmVersion) {
    Write-Host "⚠️  pnpm not found. Installing pnpm..." -ForegroundColor Yellow
    npm install -g pnpm@9.15.4
    $pnpmVersion = pnpm --version
}
Write-Host "✅ pnpm $pnpmVersion" -ForegroundColor Green

# Check Rust
$rustVersion = cargo --version 2>$null
if (-not $rustVersion) {
    Write-Host "⚠️  Rust not found. Please install from https://rustup.rs" -ForegroundColor Yellow
    Write-Host "   After installing, run this script again." -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ Rust $rustVersion" -ForegroundColor Green

# Check Docker (optional)
if (-not $SkipDocker) {
    $dockerVersion = docker --version 2>$null
    if (-not $dockerVersion) {
        Write-Host "⚠️  Docker not found. Skipping Docker setup..." -ForegroundColor Yellow
        $SkipDocker = $true
    } else {
        Write-Host "✅ Docker $dockerVersion" -ForegroundColor Green
    }
}

Write-Host ""

# Install dependencies
if (-not $SkipDependencies) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    
    # Install Node dependencies
    Write-Host "   Installing Node.js packages (this may take a few minutes)..." -ForegroundColor Gray
    pnpm install --frozen-lockfile=false
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install Node.js dependencies" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Node.js dependencies installed" -ForegroundColor Green
    
    # Build Rust workspace
    Write-Host "   Building Rust workspace..." -ForegroundColor Gray
    cargo build --workspace
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to build Rust workspace" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Rust workspace built" -ForegroundColor Green
}

Write-Host ""

# Set up Docker services
if (-not $SkipDocker) {
    Write-Host "🐳 Setting up Docker services..." -ForegroundColor Yellow
    
    # Check if docker-compose.yml exists
    if (Test-Path "docker-compose.yml") {
        Write-Host "   Starting PostgreSQL, Redis..." -ForegroundColor Gray
        docker compose up -d postgres redis
        if ($LASTEXITCODE -ne 0) {
            Write-Host "⚠️  Failed to start Docker services. Continuing..." -ForegroundColor Yellow
        } else {
            Write-Host "   Waiting for PostgreSQL to be ready..." -ForegroundColor Gray
            Start-Sleep -Seconds 5
            Write-Host "✅ Docker services started" -ForegroundColor Green
        }
    } else {
        Write-Host "⚠️  docker-compose.yml not found. Skipping..." -ForegroundColor Yellow
    }
}

Write-Host ""

# Set up database
if (-not $SkipDatabase) {
    Write-Host "🗄️  Setting up database..." -ForegroundColor Yellow
    
    # Check if DATABASE_URL is set
    $env:DATABASE_URL = "postgresql://axiom:axiom_dev_password@localhost:5432/axiom_dev"
    
    Write-Host "   Creating databases..." -ForegroundColor Gray
    
    # Try to create databases using psql
    $psql = Get-Command psql -ErrorAction SilentlyContinue
    if ($psql) {
        psql -U postgres -c "CREATE DATABASE axiom_dev;" 2>$null
        psql -U postgres -c "CREATE USER axiom WITH PASSWORD 'axiom_dev_password';" 2>$null
        psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE axiom_dev TO axiom;" 2>$null
        psql -U postgres -c "CREATE DATABASE axiom_test;" 2>$null
        psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE axiom_test TO axiom;" 2>$null
    } else {
        Write-Host "⚠️  psql not found. You may need to create databases manually:" -ForegroundColor Yellow
        Write-Host "   CREATE DATABASE axiom_dev;" -ForegroundColor Gray
        Write-Host "   CREATE DATABASE axiom_test;" -ForegroundColor Gray
    }
    
    # Run migrations
    if (Test-Path "migrations") {
        Write-Host "   Running database migrations..." -ForegroundColor Gray
        
        # Check if sqlx is installed
        $sqlx = cargo sqlx --version 2>$null
        if (-not $sqlx) {
            Write-Host "   Installing sqlx-cli..." -ForegroundColor Gray
            cargo install sqlx-cli --no-default-features --features postgres
        }
        
        # Run migrations
        foreach ($migration in Get-ChildItem migrations/*.sql | Sort-Object Name) {
            Write-Host "   Applying $($migration.Name)..." -ForegroundColor Gray
            $content = Get-Content $migration.FullName -Raw
            psql $env:DATABASE_URL -c $content 2>$null
        }
        
        Write-Host "✅ Database migrations applied" -ForegroundColor Green
    }
}

Write-Host ""

# Create data directory
Write-Host "📁 Setting up data directory..." -ForegroundColor Yellow
$dataDir = "..\..\data\axiom"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}
Write-Host "✅ Data directory created: $dataDir" -ForegroundColor Green

Write-Host ""

# Generate secrets if needed
Write-Host "🔐 Checking environment configuration..." -ForegroundColor Yellow
if (-not (Test-Path ".env.local")) {
    Write-Host "⚠️  .env.local not found. Using template..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env.local"
}
Write-Host "✅ Environment configuration ready" -ForegroundColor Green

Write-Host ""
Write-Host "✅ Development environment setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Review and update .env.local with your configuration" -ForegroundColor White
Write-Host "  2. Start the development server:" -ForegroundColor White
Write-Host "     pnpm dev" -ForegroundColor Gray
Write-Host "  3. Visit http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "For testing:" -ForegroundColor Cyan
Write-Host "  - Run unit tests:        pnpm test" -ForegroundColor White
Write-Host "  - Run security tests:    node tests/security/tenant-isolation.test.ts" -ForegroundColor White
Write-Host "  - Run all tests:         python tests/run_tests.py" -ForegroundColor White
Write-Host ""
