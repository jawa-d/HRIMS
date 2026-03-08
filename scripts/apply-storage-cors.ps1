$ErrorActionPreference = "Stop"

$corsFile = Join-Path $PSScriptRoot "storage-cors.json"
if (!(Test-Path $corsFile)) {
  throw "CORS file not found: $corsFile"
}

$buckets = @(
  "gs://hr-ab-a7348.firebasestorage.app",
  "gs://hr-ab-a7348.appspot.com"
)

foreach ($bucket in $buckets) {
  try {
    Write-Host "Applying CORS to $bucket ..."
    gsutil cors set $corsFile $bucket
    Write-Host "CORS applied to $bucket"
    gsutil cors get $bucket
    exit 0
  } catch {
    Write-Warning "Failed on $bucket. Trying next bucket..."
  }
}

throw "Could not apply CORS. Ensure gsutil is installed and you are authenticated with gcloud."
