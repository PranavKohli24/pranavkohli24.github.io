param(
    [Parameter(Mandatory=$true)]
    [string]$Name
)

$input = "$Name-demo.mp4"
$fast = "$Name-demo-fast.mp4"
$sprite = "$Name-sprite.jpg"

Write-Host "Step 1: Compressing + fast-start..." -ForegroundColor Cyan
ffmpeg -i $input -c:v libx264 -crf 23 -preset slow -c:a aac -b:a 128k -movflags +faststart $fast -y

Write-Host "Step 2: Swapping in compressed version..." -ForegroundColor Cyan
Remove-Item $input
Rename-Item $fast $input

Write-Host "Step 3: Checking file size..." -ForegroundColor Cyan
$sizeMB = (Get-Item $input).Length / 1MB
Write-Host ("File size: {0:N2} MB" -f $sizeMB)
if ($sizeMB -gt 50) {
    Write-Host "WARNING: Still over 50MB! Edit this script to raise -crf and rerun." -ForegroundColor Red
}

Write-Host "Step 4: Getting duration and computing sprite grid..." -ForegroundColor Cyan
$duration = [double](ffprobe -i $input -show_entries format=duration -v quiet -of csv="p=0")
$framesNeeded = [math]::Ceiling($duration / 2)
$cols = [math]::Ceiling([math]::Sqrt($framesNeeded))
$rows = [math]::Ceiling($framesNeeded / $cols)

Write-Host ("Duration: {0:N1}s -> needs {1} frames -> grid {2}x{3}" -f $duration, $framesNeeded, $cols, $rows)

ffmpeg -i $input -vf "fps=1/2,scale=160:-1,tile=${cols}x${rows}" -q:v 3 $sprite -y

Write-Host ""
Write-Host "DONE. Paste this into that project's entry in projects-data.js:" -ForegroundColor Green
Write-Host ""
Write-Host "video: 'src/images/projects/$input',"
Write-Host "spriteSheet: 'src/images/projects/$sprite',"
Write-Host "spriteInterval: 2,"
Write-Host "spriteCols: $cols,"
Write-Host "spriteRows: $rows,"
Write-Host "spriteFrameWidth: 160,"
Write-Host "spriteFrameHeight: 90,"