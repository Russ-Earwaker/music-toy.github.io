param([string]$Chrome='C:\Program Files\Google\Chrome\Application\chrome.exe')
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$artifact=Join-Path $workspace 'artifacts'
$generated=Join-Path $PSScriptRoot '.tmp-model'
$profile=Join-Path $workspace '.tmp-expressive-chrome'
$enc=New-Object Text.UTF8Encoding($false)
New-Item -ItemType Directory -Path $artifact,$generated -Force | Out-Null
$suites=@('free-play-line','free-play-curve','free-play-scissors','free-play-silence','free-play-silence-polish','free-play-silence-sync','free-play-normal-playback','free-play-full-loop','container-fit','container-toys','simple-paint-interaction')
try {
 foreach($suite in $suites){
  $source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot "$suite.test.mjs")).Replace("import test from 'node:test';",'const test=window.__browserTest;').Replace("import assert from 'node:assert/strict';",'const assert=window.__browserAssert;').Replace("from '../src/","from '../../src/")
  [IO.File]::WriteAllText((Join-Path $generated "$suite.mjs"),$source,$enc)
 }
 foreach($case in @(@('model','expressive-model-regression.browser.html',''),@('draw','expressive-ui.browser.html',''),@('scissors','expressive-ui.browser.html','?tool=Scissors'),@('paint','expressive-ui.browser.html','?tool=Black%20Paint'),@('visibility','simple-paint-visibility.browser.html',''))){
  $name=$case[0];$url='file:///'+(Join-Path $PSScriptRoot $case[1]).Replace('\','/')+$case[2]
  $stdout=Join-Path $artifact "expressive-$name-dom.html";$stderr=Join-Path $artifact "expressive-$name-chrome.log"
  # This Chrome runs inside the host sandbox with an isolated local test profile.
  $arguments=@('--headless','--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-first-run','--allow-file-access-from-files',('--user-data-dir="'+$profile+'"'),'--virtual-time-budget=3000','--dump-dom','--window-size=2060,850',$url)
  if($name -ne 'model'){$arguments+=('--screenshot="'+(Join-Path $artifact "expressive-$name-comparison.png")+'"')}
  $process=Start-Process -FilePath $Chrome -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  if($process.ExitCode -ne 0){throw "Chrome failed for $name; see $stderr"}
  $dom=[IO.File]::ReadAllText($stdout);$result=[regex]::Match($dom,'<pre id="results">([\s\S]*?)</pre>').Groups[1].Value
  [IO.File]::WriteAllText((Join-Path $artifact "expressive-$name-results.txt"),[Net.WebUtility]::HtmlDecode($result),$enc)
  if(!$result -or $result -match '(?m)^FAIL ' -or ($name -eq 'model' -and $result -notmatch '^\d+ passed, 0 failed') -or ($name -ne 'model' -and $result -notmatch '^PASS \d+ UI assertions')){throw "Regression failed: $result"}
  Write-Output "$name : $($result.Split([char]10)[0])"
  Remove-Item -LiteralPath $stdout,$stderr
 }
} finally {
 # Verify temporary paths before recursive cleanup.
 foreach($temporary in @($generated,$profile)){
  $resolved=[IO.Path]::GetFullPath($temporary)
  if(!$resolved.StartsWith($workspace+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw "Cleanup path outside workspace: $resolved"}
  if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue}
 }
}
