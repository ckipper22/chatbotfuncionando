# exportar_projeto.ps1 - VERSÃO CORRIGIDA
$OutputFile = "projeto_completo.txt"
$ExcludeFolders = @("node_modules", ".git", "dist", "build", ".next")

if (-not (Test-Path ".git")) {
    Write-Host "❌ Esta pasta não é um repositório Git!" -ForegroundColor Red
    exit 1
}

Write-Host "🔄 Buscando branches..." -ForegroundColor Yellow
git fetch --all

Write-Host "`n📋 BRANCHES DISPONÍVEIS:" -ForegroundColor Cyan
git branch -a

Write-Host "`n🌿 DIGITE O NOME DA BRANCH:" -ForegroundColor Green
$SelectedBranch = Read-Host "Branch"

$BranchExists = git show-ref --verify --quiet "refs/heads/$SelectedBranch"
if (-not $BranchExists) {
    $RemoteBranchExists = git show-ref --verify --quiet "refs/remotes/origin/$SelectedBranch"
    if ($RemoteBranchExists) {
        Write-Host "🌿 Criando branch local..." -ForegroundColor Yellow
        git checkout -b $SelectedBranch "origin/$SelectedBranch"
    } else {
        Write-Host "❌ Branch '$SelectedBranch' não encontrada!" -ForegroundColor Red
        exit 1
    }
}

Write-Host "🔄 Mudando para branch: $SelectedBranch" -ForegroundColor Yellow
git checkout $SelectedBranch --force
git pull origin $SelectedBranch

$OutputFile = "projeto_completo_$SelectedBranch.txt"
if (Test-Path $OutputFile) {
    Remove-Item $OutputFile
}

function Write-ToFile {
    param([string]$Content)
    Add-Content -Path $OutputFile -Value $Content
}

Write-ToFile "=== ANÁLISE DO PROJETO: $(Get-Date) ==="
Write-ToFile "=== BRANCH: $SelectedBranch ==="
Write-ToFile "=== COMMIT: $(git log -1 --oneline) ==="
Write-ToFile "=== ESTRUTURA DE PASTAS ==="
Write-ToFile ""

Get-ChildItem -Recurse -Force | Where-Object {
    -not $_.PSIsContainer -eq $false -and
    $ExcludeFolders -notcontains $_.Name
} | ForEach-Object {
    if ($_.PSIsContainer) {
        Write-ToFile "📁 $($_.FullName)"
    } else {
        $size = if ($_.Length -gt 0) { " ($([math]::Round($_.Length/1KB, 2)) KB)" } else { "" }
        Write-ToFile "📄 $($_.FullName)$size"
    }
}

Write-ToFile ""
Write-ToFile "=== CONTEÚDO DOS ARQUIVOS ==="
Write-ToFile ""

$IncludeExtensions = @(".js", ".jsx", ".ts", ".tsx", ".json", ".md", ".txt", ".css", ".html")

Get-ChildItem -Recurse -Force -File | Where-Object {
    $IncludeExtensions -contains $_.Extension -and
    $_.FullName -notmatch ($ExcludeFolders -join '|')
} | ForEach-Object {
    $file = $_
    Write-ToFile ""
    Write-ToFile "=" * 50
    Write-ToFile "ARQUIVO: $($file.FullName)"
    Write-ToFile "=" * 50
    Write-ToFile ""

    try {
        $content = Get-Content -Path $file.FullName -Raw -ErrorAction Stop
        Write-ToFile $content
    } catch {
        Write-ToFile "[ERRO AO LER ARQUIVO]"
    }
}

Write-ToFile ""
Write-ToFile "=== FIM DO EXPORT - $(Get-Date) ==="

Write-Host "✅ Export concluído! Arquivo: $OutputFile" -ForegroundColor Green
Write-Host "📊 Tamanho: $((Get-Item $OutputFile).Length / 1KB) KB" -ForegroundColor Yellow