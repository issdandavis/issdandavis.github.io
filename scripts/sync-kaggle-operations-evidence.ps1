#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$Source,

    [string]$Destination = $(Join-Path $PSScriptRoot "..\research\data\operations_evidence.json")
)

$ErrorActionPreference = "Stop"

function Assert-Condition {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$destinationPath = [IO.Path]::GetFullPath($Destination)
$repoPrefix = $repoRoot.TrimEnd("\") + "\"

Assert-Condition `
    ($destinationPath.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) `
    "Destination must remain inside the website repository."

$raw = [IO.File]::ReadAllText($sourcePath)
$payload = $raw | ConvertFrom-Json

Assert-Condition ($payload.schema_version -eq 2) "Unsupported public export schema."

$requiredCollections = @(
    "gold_roadmap",
    "gold_roadmap_methodology",
    "competitions",
    "experiments",
    "products",
    "platform_benchmarks",
    "capabilities",
    "npm_packages",
    "public_active_original_repositories"
)

foreach ($name in $requiredCollections) {
    Assert-Condition `
        ($payload.PSObject.Properties.Name -contains $name) `
        "Public export is missing '$name'."
}

$forbiddenPatterns = @(
    "(?i)[a-z]:\\",
    "(?i)(?:^|[\s""'])[a-z]:/",
    "(?i)proton_recipients",
    "(?i)bridge_pass",
    "(?i)issdandavis/aetherdesk",
    "(?i)issdandavis/clay",
    '(?i)"api_key"\s*:',
    '(?i)"password"\s*:',
    '(?i)"secret"\s*:'
)

foreach ($pattern in $forbiddenPatterns) {
    Assert-Condition `
        (-not [regex]::IsMatch($raw, $pattern)) `
        "Public export failed privacy validation for pattern '$pattern'."
}

foreach ($competition in $payload.competitions) {
    Assert-Condition `
        (-not [string]::IsNullOrWhiteSpace($competition.slug)) `
        "Competition row is missing a slug."

    foreach ($property in $competition.links.PSObject.Properties) {
        $uri = [Uri]$property.Value
        Assert-Condition ($uri.Scheme -eq "https") "Competition links must use HTTPS."
        Assert-Condition `
            ($uri.Host -eq "www.kaggle.com") `
            "Competition links must remain on www.kaggle.com."
    }
}

foreach ($roadmapRow in $payload.gold_roadmap) {
    Assert-Condition `
        (-not [string]::IsNullOrWhiteSpace($roadmapRow.competition_slug)) `
        "Gold roadmap row is missing a competition slug."
    Assert-Condition `
        ($roadmapRow.target_boundary -match "not an official medal cutoff") `
        "Gold roadmap row lost its medal-cutoff boundary."

    if ($roadmapRow.target_policy -eq "top_one_percent_public_proxy") {
        Assert-Condition `
            ($roadmapRow.proxy_rank -gt 0) `
            "Ranked roadmap row is missing its top-1% proxy rank."
    }

    foreach ($propertyName in @(
        "rules_url",
        "evaluation_url",
        "discussion_url",
        "leaderboard_url"
    )) {
        $uri = [Uri]$roadmapRow.$propertyName
        Assert-Condition ($uri.Scheme -eq "https") "Roadmap links must use HTTPS."
        Assert-Condition `
            ($uri.Host -eq "www.kaggle.com") `
            "Roadmap links must remain on www.kaggle.com."
    }
}

foreach ($product in $payload.products) {
    if ($product.github_visibility -eq "private") {
        Assert-Condition `
            ([string]::IsNullOrWhiteSpace($product.github_url)) `
            "Private product '$($product.product_id)' exposes a GitHub URL."
    }
}

foreach ($repository in $payload.public_active_original_repositories) {
    Assert-Condition `
        ($repository.visibility -eq "public") `
        "Public repository list contains a non-public row."
    Assert-Condition `
        (-not $repository.fork) `
        "Public original-work list contains a fork."
}

$destinationDirectory = Split-Path -Parent $destinationPath
[IO.Directory]::CreateDirectory($destinationDirectory) | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($destinationPath, $raw, $utf8)

$sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
$copiedHash = (Get-FileHash -LiteralPath $destinationPath -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-Condition ($sourceHash -eq $copiedHash) "Copied evidence hash does not match its source."

$receipt = [ordered]@{
    schema_version = 1
    source_label = "Kaggle Operations Hub publication-safe export"
    observed_at_utc = $payload.observed_at_utc
    source_sha256 = $sourceHash
    copied_sha256 = $copiedHash
    validation = "pass"
    counts = [ordered]@{
        gold_roadmap = @($payload.gold_roadmap).Count
        competitions = @($payload.competitions).Count
        experiments = @($payload.experiments).Count
        products = @($payload.products).Count
        benchmarks = @($payload.platform_benchmarks).Count
        capabilities = @($payload.capabilities).Count
        npm_packages = @($payload.npm_packages).Count
        public_active_original_repositories = @(
            $payload.public_active_original_repositories
        ).Count
    }
    boundaries = @(
        "No local paths, credentials, private repository names, or attack payloads.",
        "Public leaderboard scores remain adaptive evidence.",
        "Top-1% score targets are planning proxies, not official medal cutoffs.",
        "Platform, deterministic-system, and model records remain separate.",
        "Artifact presence is not treated as demonstrated capability."
    )
}

$receiptPath = [IO.Path]::ChangeExtension($destinationPath, "receipt.json")
$receiptJson = $receipt | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText($receiptPath, $receiptJson + "`n", $utf8)

[pscustomobject]@{
    destination = $destinationPath
    receipt = $receiptPath
    sha256 = $copiedHash
    gold_roadmap = $receipt.counts.gold_roadmap
    competitions = $receipt.counts.competitions
    experiments = $receipt.counts.experiments
    products = $receipt.counts.products
    benchmarks = $receipt.counts.benchmarks
    capabilities = $receipt.counts.capabilities
    npm_packages = $receipt.counts.npm_packages
    repositories = $receipt.counts.public_active_original_repositories
} | ConvertTo-Json -Depth 4
