#requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

function Assert-Condition {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Read-RepoText {
    param([string]$RelativePath)

    $path = Join-Path $repoRoot $RelativePath
    Assert-Condition (Test-Path -LiteralPath $path) "Missing $RelativePath."
    return [IO.File]::ReadAllText($path)
}

$dataPath = Join-Path $repoRoot "research\data\operations_evidence.json"
$receiptPath = Join-Path $repoRoot "research\data\operations_evidence.receipt.json"
$dataRaw = Read-RepoText "research\data\operations_evidence.json"
$receiptRaw = Read-RepoText "research\data\operations_evidence.receipt.json"
$payload = $dataRaw | ConvertFrom-Json
$receipt = $receiptRaw | ConvertFrom-Json

Assert-Condition ($payload.schema_version -eq 3) "Unexpected evidence schema."
Assert-Condition ($receipt.validation -eq "pass") "Evidence receipt did not pass."

$dataHash = (Get-FileHash -LiteralPath $dataPath -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-Condition ($dataHash -eq $receipt.copied_sha256) "Receipt hash mismatch."
Assert-Condition ($receipt.source_sha256 -eq $receipt.copied_sha256) "Source/copy hash mismatch."

$countMap = [ordered]@{
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

foreach ($property in $countMap.GetEnumerator()) {
    Assert-Condition `
        ($property.Value -eq $receipt.counts.($property.Key)) `
        "Receipt count mismatch for '$($property.Key)'."
}

Assert-Condition ($countMap.gold_roadmap -ge 1) "No gold roadmap rows were published."
Assert-Condition ($countMap.research_watch -ge 1) "No Research Watch rows were published."
Assert-Condition ($countMap.competitions -ge 1) "No competition evidence was published."
Assert-Condition ($countMap.experiments -ge 1) "No experiment evidence was published."
Assert-Condition ($countMap.products -ge 1) "No product evidence was published."
Assert-Condition ($countMap.benchmarks -ge 1) "No benchmark evidence was published."
Assert-Condition ($countMap.capabilities -ge 1) "No capability evidence was published."
Assert-Condition ($countMap.npm_packages -ge 1) "No npm evidence was published."

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
        (-not [regex]::IsMatch($dataRaw, $pattern)) `
        "Published evidence contains forbidden pattern '$pattern'."
}

Assert-Condition `
    (@($payload.competitions | Where-Object { $null -eq $_.score.value }).Count -ge 1) `
    "Missing competition scores must remain null rather than zero."
Assert-Condition `
    (@($payload.gold_roadmap | Where-Object {
        $_.competition_slug -eq "biohub-cell-tracking-during-development" -and
        $_.focus_order -eq 1 -and
        $_.target_policy -eq "top_one_percent_public_proxy"
    }).Count -eq 1) `
    "Primary Biohub roadmap lane is missing or malformed."
Assert-Condition `
    (@($payload.gold_roadmap | Where-Object {
        $_.competition_slug -eq "pokemon-tcg-ai-battle" -and
        $null -ne $_.proxy_score
    }).Count -eq 1) `
    "Pokemon simulation roadmap target is missing."
Assert-Condition `
    (@($payload.gold_roadmap | Where-Object {
        $_.competition_slug -eq "arc-prize-2026-paper-track" -and
        $_.target_policy -eq "judged_finalist_evidence_packet" -and
        $null -eq $_.proxy_score
    }).Count -eq 1) `
    "ARC paper roadmap must remain a judged, non-numeric target."
Assert-Condition `
    (@($payload.gold_roadmap | Where-Object {
        $_.target_boundary -notmatch "not an official medal cutoff"
    }).Count -eq 0) `
    "A roadmap row lost its planning-proxy boundary."
Assert-Condition `
    (@($payload.research_watch | Where-Object {
        $_.competition_slug -eq "biohub-cell-tracking-during-development" -and
        $_.rules_state -eq "current" -and
        $_.evaluation_state -eq "current" -and
        $_.forum_state -eq "current_full_review" -and
        $_.pre_submit_research_gate -eq "PASS_RESEARCH_FRESHNESS_ONLY" -and
        $_.selected_topic_count -eq 8 -and
        $_.complete_topic_trees -eq 8 -and
        $_.reviewed_message_count -eq 46
    }).Count -eq 1) `
    "Biohub full-post Research Watch receipt is missing or malformed."
Assert-Condition `
    (@($payload.research_watch | Where-Object {
        $_.competition_slug -ne "biohub-cell-tracking-during-development" -and (
            $_.rules_state -ne "current" -or
            $_.evaluation_state -ne "current" -or
            $_.forum_state -ne "current_metadata_only" -or
            $_.pre_submit_research_gate -ne "BLOCK_REVIEW_REQUIRED"
        )
    }).Count -eq 0) `
    "Metadata-only Research Watch rows must remain blocked."
Assert-Condition `
    (@($payload.research_watch | Where-Object {
        $_.gate_boundary -notmatch "never authorizes"
    }).Count -eq 0) `
    "A Research Watch row lost its no-authorization boundary."
Assert-Condition `
    (@($payload.research_watch | Where-Object {
        $_.rules_sha256 -notmatch "^[0-9a-f]{64}$" -or
        $_.evaluation_sha256 -notmatch "^[0-9a-f]{64}$"
    }).Count -eq 0) `
    "A Research Watch page receipt is missing or malformed."
Assert-Condition `
    (@($payload.research_watch | Where-Object {
        $_.competition_slug -eq "biohub-cell-tracking-during-development" -and
        @($_.critical_topics | Where-Object { $_.topic_id -eq 727154 }).Count -eq 1
    }).Count -eq 1) `
    "Biohub metric-patch discussion is missing from Research Watch."
Assert-Condition `
    (@($payload.capabilities | Where-Object {
        $_.implementation_class -eq "external_model"
    }).Count -ge 1) `
    "External-model capability attribution disappeared."
Assert-Condition `
    (@($payload.platform_benchmarks | Where-Object {
        $_.agent_class -eq "deterministic_system"
    }).Count -ge 1) `
    "Deterministic-system benchmark attribution disappeared."

$page = Read-RepoText "research\operations.html"
$script = Read-RepoText "static\operations-evidence.js"
$routingRaw = Read-RepoText "assistant-routing.json"
$routing = $routingRaw | ConvertFrom-Json
$catalogRaw = Read-RepoText "assistant-catalog.json"
$catalog = $catalogRaw | ConvertFrom-Json
$llms = Read-RepoText "llms.txt"
$sitemap = Read-RepoText "sitemap.xml"
$researchIndex = Read-RepoText "research\index.html"
$evidencePage = Read-RepoText "research\evidence.html"

Assert-Condition `
    ($page.Contains("./data/operations_evidence.json")) `
    "Operations page does not declare its governed data source."
Assert-Condition `
    ($page.Contains("/static/operations-evidence.js")) `
    "Operations page does not load its renderer."
Assert-Condition `
    ($page.Contains('data-view="roadmap"')) `
    "Operations page does not expose the gold roadmap lane."
Assert-Condition `
    ($page.Contains('data-view="research"')) `
    "Operations page does not expose the Research Watch lane."
Assert-Condition `
    ($script.Contains("textContent")) `
    "Renderer must create public records with textContent."
Assert-Condition `
    ($script.Contains("roadmapRecord")) `
    "Renderer does not define the gold roadmap record surface."
Assert-Condition `
    ($script.Contains("researchRecord")) `
    "Renderer does not define the Research Watch record surface."
Assert-Condition `
    ($script.Contains("Reviewed messages")) `
    "Renderer does not expose full-post review receipt counts."
Assert-Condition `
    (-not $script.Contains("innerHTML")) `
    "Renderer must not inject evidence through innerHTML."

$surface = @($routing.surfaces | Where-Object { $_.name -eq "operations-evidence" })
$route = @($routing.routes | Where-Object { $_.intent -eq "portfolio_evidence" })
$catalogItem = @($catalog.public_products | Where-Object { $_.id -eq "operations-evidence" })
Assert-Condition ($surface.Count -eq 1) "Assistant surface route is missing or duplicated."
Assert-Condition ($route.Count -eq 1) "Assistant intent route is missing or duplicated."
Assert-Condition ($catalogItem.Count -eq 1) "Assistant catalog proof item is missing or duplicated."
Assert-Condition `
    ($surface[0].url -eq "https://aethermoore.com/research/operations.html") `
    "Assistant surface points to the wrong page."
Assert-Condition `
    ($route[0].target -eq "https://aethermoore.com/research/operations.html") `
    "Assistant intent points to the wrong page."

foreach ($text in @($llms, $sitemap, $researchIndex, $evidencePage)) {
    Assert-Condition `
        ($text.Contains("research/operations.html") -or $text.Contains("./operations.html")) `
        "A required public route does not reference operations evidence."
}

[pscustomobject]@{
    validation = "pass"
    sha256 = $dataHash
    counts = $countMap
    routing_surface = $surface[0].url
} | ConvertTo-Json -Depth 5
