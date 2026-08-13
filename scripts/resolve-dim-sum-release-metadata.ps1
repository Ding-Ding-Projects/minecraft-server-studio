[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [Parameter(Mandatory = $true)]
  [string]$CurrentReleaseTag,

  [Parameter(Mandatory = $true)]
  [string]$ProductRepository,

  [string]$CatalogRepository = 'Ding-Ding-Projects/dim-sum-photos'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-GhText {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,

    [Parameter(Mandatory = $true)]
    [string]$FailureMessage
  )

  $result = & gh @Arguments 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw $FailureMessage
  }

  $text = @($result) -join [Environment]::NewLine
  if ([string]::IsNullOrWhiteSpace($text)) {
    throw $FailureMessage
  }

  return $text
}

function Get-ReleaseInventory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Repository,

    [Parameter(Mandatory = $true)]
    [string]$FailureMessage
  )

  $raw = Invoke-GhText -Arguments @(
    'api',
    '--paginate',
    '--slurp',
    "repos/$Repository/releases?per_page=100"
  ) -FailureMessage $FailureMessage

  try {
    $pages = @($raw | ConvertFrom-Json -Depth 100)
  } catch {
    throw $FailureMessage
  }

  $releases = [System.Collections.Generic.List[object]]::new()
  foreach ($page in $pages) {
    if ($null -eq $page) {
      continue
    }

    foreach ($release in @($page)) {
      if ($null -eq $release -or $release -is [string]) {
        throw $FailureMessage
      }
      $releases.Add($release)
      if ($releases.Count -gt 10000) {
        throw $FailureMessage
      }
    }
  }

  return @($releases.ToArray())
}

function Get-RequiredSingleLineString {
  param(
    [Parameter(Mandatory = $true)]
    $Value,

    [Parameter(Mandatory = $true)]
    [string]$Label,

    [Parameter(Mandatory = $true)]
    [int]$MaximumLength
  )

  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text) -or $text.Length -gt $MaximumLength -or $text -match '[\r\n]') {
    throw "The public catalog has an invalid $Label value."
  }

  return $text.Trim()
}

function Write-Metadata {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Lines
  )

  $directory = Split-Path -Parent $OutputPath
  if (-not [string]::IsNullOrWhiteSpace($directory)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }

  $content = ($Lines -join [Environment]::NewLine) + [Environment]::NewLine
  [System.IO.File]::WriteAllText($OutputPath, $content, [System.Text.UTF8Encoding]::new($false))
}

try {
  if ($CurrentReleaseTag -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+-build\.[1-9]\d*\.[1-9]\d*$') {
    throw 'The current release tag is not in the expected immutable provenance format.'
  }

  if ($ProductRepository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' -or $CatalogRepository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') {
    throw 'A release metadata repository identifier is invalid.'
  }

  $catalogCommit = Invoke-GhText -Arguments @(
    'api',
    "repos/$CatalogRepository/commits/main",
    '--jq',
    '.sha'
  ) -FailureMessage 'The public dim-sum catalog revision could not be resolved.'
  $catalogCommit = $catalogCommit.Trim()
  if ($catalogCommit -notmatch '^[a-f0-9]{40}$') {
    throw 'The public dim-sum catalog revision is invalid.'
  }

  $catalogRaw = Invoke-GhText -Arguments @(
    'api',
    '-H',
    'Accept: application/vnd.github.raw+json',
    "repos/$CatalogRepository/contents/catalog/index.json?ref=$catalogCommit"
  ) -FailureMessage 'The public dim-sum catalog could not be read.'
  try {
    $catalog = $catalogRaw | ConvertFrom-Json -Depth 100
  } catch {
    throw 'The public dim-sum catalog is not valid JSON.'
  }

  if ($null -eq $catalog -or [string]$catalog.schemaVersion -ne '1.0.0') {
    throw 'The public dim-sum catalog does not use the supported schema version.'
  }

  $dishes = @($catalog.dishes)
  if ($dishes.Count -eq 0 -or $dishes.Count -gt 5000) {
    throw 'The public dim-sum catalog has an unsupported record count.'
  }
  if ([int]$catalog.total -ne $dishes.Count) {
    throw 'The public dim-sum catalog total does not match its dish records.'
  }

  $catalogReleases = @(Get-ReleaseInventory -Repository $CatalogRepository -FailureMessage 'The published dim-sum catalog release inventory could not be read.')
  $catalogAssetsByName = @{}
  foreach ($release in $catalogReleases) {
    $tag = [string]$release.tag_name
    if ([bool]$release.draft -or [bool]$release.prerelease -or $tag -notmatch '^catalog-v1(?:[-.][A-Za-z0-9._-]+)?$') {
      continue
    }

    foreach ($asset in @($release.assets)) {
      $assetName = [string]$asset.name
      $assetUrl = [string]$asset.browser_download_url
      if ([string]::IsNullOrWhiteSpace($assetName) -or [string]::IsNullOrWhiteSpace($assetUrl)) {
        continue
      }

      if (-not $catalogAssetsByName.ContainsKey($assetName)) {
        $catalogAssetsByName[$assetName] = [System.Collections.Generic.List[object]]::new()
      }
      $assetDigest = if ($asset.PSObject.Properties.Name -contains 'digest') { [string]$asset.digest } else { '' }
      $catalogAssetsByName[$assetName].Add([pscustomobject]@{
        Name = $assetName
        Url = $assetUrl
        Tag = $tag
        ContentType = [string]$asset.content_type
        Size = [int64]$asset.size
        Digest = $assetDigest
      })
    }
  }

  $seenIds = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $seenImageNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $eligibleCandidates = [System.Collections.Generic.List[object]]::new()
  $catalogIndex = 0
  foreach ($dish in $dishes) {
    $catalogIndex += 1
    $catalogRecord = Get-RequiredSingleLineString -Value $dish.id -Label 'record identifier' -MaximumLength 32
    $englishName = Get-RequiredSingleLineString -Value $dish.name.en -Label 'English dish name' -MaximumLength 160
    $cantoneseName = Get-RequiredSingleLineString -Value $dish.name.zhHant -Label 'Traditional Chinese dish name' -MaximumLength 160
    $imagePath = Get-RequiredSingleLineString -Value $dish.image.path -Label 'image path' -MaximumLength 260
    $assetName = [System.IO.Path]::GetFileName($imagePath)

    if ($catalogRecord -notmatch '^hk-dish-\d{4}$' -or
        $imagePath -notmatch '^images/hk-dish-\d{4}-[A-Za-z0-9-]+\.png$' -or
        $assetName -notmatch '^hk-dish-\d{4}-[A-Za-z0-9-]+\.png$' -or
        $assetName -ne [System.IO.Path]::GetFileName($imagePath)) {
      throw 'The public dim-sum catalog contains an unsupported dish identifier or image path.'
    }
    if (-not $seenIds.Add($catalogRecord) -or -not $seenImageNames.Add($assetName)) {
      throw 'The public dim-sum catalog contains duplicate dish metadata.'
    }

    if (-not $catalogAssetsByName.ContainsKey($assetName)) {
      continue
    }
    $assetMatches = $catalogAssetsByName[$assetName]
    if ($assetMatches.Count -ne 1) {
      continue
    }
    $asset = $assetMatches[0]
    if ($asset.ContentType -ne 'image/png' -or $asset.Size -le 0) {
      continue
    }
    try {
      $assetUri = [System.Uri]$asset.Url
    } catch {
      continue
    }
    if ($assetUri.Scheme -ne 'https' -or $assetUri.Host -ne 'github.com' -or
        -not $assetUri.AbsolutePath.StartsWith("/$CatalogRepository/releases/download/", [System.StringComparison]::Ordinal)) {
      continue
    }

    $eligibleCandidates.Add([pscustomobject]@{
      Index = $catalogIndex
      Record = $catalogRecord
      EnglishName = $englishName
      CantoneseName = $cantoneseName
      AssetName = $asset.Name
      AssetUrl = $asset.Url
      AssetTag = $asset.Tag
      AssetSize = $asset.Size
      AssetDigest = $asset.Digest
    })
  }

  if ($eligibleCandidates.Count -eq 0) {
    throw 'The public dim-sum catalog has no eligible published image records.'
  }

  $productReleases = @(Get-ReleaseInventory -Repository $ProductRepository -FailureMessage 'The product release history could not be read.')
  $usedCatalogRecords = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($release in $productReleases) {
    if ([string]$release.tag_name -eq $CurrentReleaseTag) {
      continue
    }
    $releaseText = "{0}`n{1}" -f [string]$release.name, [string]$release.body
    foreach ($match in [System.Text.RegularExpressions.Regex]::Matches($releaseText, '(?i)\bhk-dish-\d{4}\b')) {
      $usedCatalogRecords.Add($match.Value) | Out-Null
    }
  }

  $selected = @($eligibleCandidates | Sort-Object Index | Where-Object { -not $usedCatalogRecords.Contains($_.Record) } | Select-Object -First 1)
  if ($selected.Count -ne 1) {
    throw 'Every eligible public dim-sum catalog record is already referenced by the product release history.'
  }

  $candidate = $selected[0]
  $catalogUrl = "https://github.com/$CatalogRepository/blob/$catalogCommit/catalog/index.json"
  $assetDigestLine = if ($candidate.AssetDigest -match '^sha256:[a-fA-F0-9]{64}$') {
    "- Published asset SHA-256: ``$($candidate.AssetDigest.Substring(7).ToLowerInvariant())``"
  } else {
    '- Published asset SHA-256: not provided by the public release API.'
  }

  Write-Metadata -Lines @(
    '## Release code name and public photo',
    "- Code name: $($candidate.EnglishName) · $($candidate.CantoneseName)",
    "- Catalog record: $($candidate.Record)",
    "- Catalog source: [catalog/index.json]($catalogUrl) at ``$catalogCommit``",
    "- Published catalog release: ``$($candidate.AssetTag)``",
    "- Public photo: [$($candidate.AssetName)]($($candidate.AssetUrl))",
    "- Public asset metadata: ``image/png``, $($candidate.AssetSize) bytes.",
    $assetDigestLine,
    "- Eligible published catalog records observed: $($eligibleCandidates.Count); product release records already reserved: $($usedCatalogRecords.Count).",
    '- Consumer-photo boundary: this release links to the public asset only. It does not download, copy, bundle, or attach the image, and it does not claim an attached dim-sum photo.'
  )
} catch {
  Write-Warning 'No dim-sum code name was assigned because verified public catalog metadata could not be resolved.'
  Write-Metadata -Lines @(
    '## Release code name and public photo',
    '- No dim-sum code name was assigned because verified public catalog metadata could not be resolved.',
    '- Consumer-photo boundary: this workflow did not download, copy, bundle, or attach a photo, and it does not claim an attached dim-sum photo.'
  )
}
