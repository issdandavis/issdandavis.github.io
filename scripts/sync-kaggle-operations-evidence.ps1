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

Assert-Condition ($payload.schema_version -eq 3) "Unsupported public export schema."

$requiredCollections = @(
    "gold_roadmap",
    "gold_roadmap_methodology",
    "research_watch",
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

foreach ($researchRow in $payload.research_watch) {
    Assert-Condition `
        (-not [string]::IsNullOrWhiteSpace($researchRow.competition_slug)) `
        "Research Watch row is missing a competition slug."
    Assert-Condition `
        ($researchRow.gate_boundary -match "never authorizes") `
        "Research Watch row lost its no-authorization boundary."
    Assert-Condition `
        ($researchRow.rules_sha256 -match "^[0-9a-f]{64}$") `
        "Research Watch row has no valid rules receipt."
    Assert-Condition `
        ($researchRow.evaluation_sha256 -match "^[0-9a-f]{64}$") `
        "Research Watch row has no valid evaluation receipt."

    $researchReady = (
        $researchRow.rules_state -eq "current" -and
        $researchRow.evaluation_state -eq "current" -and
        $researchRow.forum_state -eq "current_full_review"
    )
    if ($researchRow.pre_submit_research_gate -eq "PASS_RESEARCH_FRESHNESS_ONLY") {
        Assert-Condition $researchReady `
            "A Research Watch row passed without all three reviews current."
        Assert-Condition `
            ($researchRow.selected_topic_count -gt 0) `
            "A Research Watch row passed without selected critical topics."
        Assert-Condition `
            ($researchRow.complete_topic_trees -eq $researchRow.selected_topic_count) `
            "A Research Watch row passed with an incomplete topic tree."
        Assert-Condition `
            ($researchRow.reviewed_message_count -ge $researchRow.selected_topic_count) `
            "A Research Watch row passed without a complete message receipt."
    } else {
        Assert-Condition `
            ($researchRow.pre_submit_research_gate -eq "BLOCK_REVIEW_REQUIRED") `
            "An active Research Watch row has an unsupported gate state."
        Assert-Condition (-not $researchReady) `
            "A fully current Research Watch row is still marked blocked."
    }

    foreach ($propertyName in @("rules_url", "evaluation_url", "forum_url")) {
        $uri = [Uri]$researchRow.$propertyName
        Assert-Condition ($uri.Scheme -eq "https") `
            "Research Watch links must use HTTPS."
        Assert-Condition ($uri.Host -eq "www.kaggle.com") `
            "Research Watch links must remain on www.kaggle.com."
    }

    foreach ($topic in $researchRow.critical_topics) {
        $uri = [Uri]$topic.topic_url
        Assert-Condition ($uri.Scheme -eq "https") `
            "Critical-topic links must use HTTPS."
        Assert-Condition ($uri.Host -eq "www.kaggle.com") `
            "Critical-topic links must remain on www.kaggle.com."
        if ($researchRow.pre_submit_research_gate -eq "PASS_RESEARCH_FRESHNESS_ONLY") {
            Assert-Condition ($topic.message_tree_complete -eq $true) `
                "A passing Research Watch topic has an incomplete message tree."
            Assert-Condition `
                ($topic.messages_sha256 -match "^[0-9a-f]{64}$") `
                "A passing Research Watch topic has no message-tree hash."
        }
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
        research_watch = @($payload.research_watch).Count
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
        "Rules and forum bodies are represented by hashes and review receipts."
        "Research freshness never authorizes a Kaggle submission."
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
    research_watch = $receipt.counts.research_watch
    competitions = $receipt.counts.competitions
    experiments = $receipt.counts.experiments
    products = $receipt.counts.products
    benchmarks = $receipt.counts.benchmarks
    capabilities = $receipt.counts.capabilities
    npm_packages = $receipt.counts.npm_packages
    repositories = $receipt.counts.public_active_original_repositories
} | ConvertTo-Json -Depth 4
