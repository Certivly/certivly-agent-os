$BinDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ExePath = Join-Path $BinDir "agentos.exe"
if (Test-Path $ExePath) {
  & $ExePath $args
} else {
  bun run (Join-Path $BinDir "..\apps\cli\src\index.ts") $args
}
