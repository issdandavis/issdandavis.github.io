# Optional local quality pass for YouTube re-uploads.
# YouTube cannot upgrade bitrate on an existing upload without a new file.
# Usage (from a folder with masters or after yt-dlp download):
#   .\scripts\youtube-quality-pass.ps1 -InputPath .\raw.mp4 -OutputPath .\clean.mp4
#
# Requires: ffmpeg on PATH
param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [int]$Height = 1080,
  [string]$LoudNorm = "I=-16:TP=-1.5:LRA=11"
)

$ErrorActionPreference = "Stop"
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw "ffmpeg not found on PATH"
}
if (-not (Test-Path -LiteralPath $InputPath)) {
  throw "missing input: $InputPath"
}

# Voice-friendly chain: highpass mud cut, light denoise, loudness normalize, H.264 1080p
$vf = "highpass=f=80,afftdn=nr=12:nf=-25,loudnorm=$LoudNorm"
$scale = "scale=-2:${Height}"

& ffmpeg -y -i $InputPath `
  -vf $scale `
  -af $vf `
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p `
  -c:a aac -b:a 192k -ar 48000 `
  -movflags +faststart `
  $OutputPath

Write-Host "Wrote $OutputPath"
Write-Host "Next: upload via YouTube Studio (or authorized upload API). CLI cannot patch the live video stream in place."
