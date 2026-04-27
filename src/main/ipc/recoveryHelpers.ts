
import { exec, execFile } from 'child_process';
import { buildProviderResumeCommand } from '../providers/registry.js';

export function focusTerminalByPid(pid, label, debugLog) {
  if (process.platform === 'win32') {
    const psScript = `
$memberDef = '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);' +
  '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);' +
  '[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);'
Add-Type -MemberDefinition $memberDef -Name W -Namespace FocusUtil -ErrorAction SilentlyContinue
$tpid = ${pid}
$hwnd = [IntPtr]::Zero
for ($i = 0; $i -lt 5; $i++) {
  $p = Get-Process -Id $tpid -ErrorAction SilentlyContinue
  if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) {
    $hwnd = $p.MainWindowHandle
    break
  }
  $pp = (Get-CimInstance Win32_Process -Filter "ProcessId = $tpid" -ErrorAction SilentlyContinue).ParentProcessId
  if (-not $pp -or $pp -eq 0 -or $pp -eq $tpid) { break }
  $tpid = $pp
}
if ($hwnd -ne [IntPtr]::Zero) {
  if ([FocusUtil.W]::IsIconic($hwnd)) { [FocusUtil.W]::ShowWindow($hwnd, 9) | Out-Null }
  [FocusUtil.W]::SetForegroundWindow($hwnd) | Out-Null
}
`;
    execFile('powershell.exe', ['-NoProfile', '-Command', psScript], { timeout: 5000 }, (err) => {
      if (err) debugLog(`[${label}] Focus error: ${err.message}`);
    });
    return;
  }

  if (process.platform === 'darwin') {
    const script = `
      tell application "System Events"
        set targetPid to ${pid}
        repeat 5 times
          try
            set proc to first process whose unix id is targetPid
            set frontmost of proc to true
            return
          end try
          try
            set targetPid to unix id of (first process whose unix id is targetPid)'s parent process
          on error
            exit repeat
          end try
        end repeat
      end tell
    `;
    execFile('osascript', ['-e', script], { timeout: 5000 }, (err) => {
      if (err) debugLog(`[${label}] Focus error: ${err.message}`);
    });
    return;
  }

  exec(`wmctrl -i -a $(wmctrl -lp | awk '$3 == ${pid} {print $1; exit}') 2>/dev/null || xdotool search --pid ${pid} --onlyvisible windowactivate 2>/dev/null`, { timeout: 5000 }, (err) => {
    if (err) debugLog(`[${label}] Focus error (install wmctrl or xdotool): ${err.message}`);
  });
}

export function buildResumeCommand(provider, sessionId) {
  return buildProviderResumeCommand(provider, sessionId);
}

export function isPidAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function toTimestamp(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function findLatestResumableSessionEntry(history = []) {
  if (!Array.isArray(history) || history.length === 0) return null;

  let latest = null;
  let latestScore = -1;
  for (let index = 0; index < history.length; index += 1) {
    const entry = history[index];
    if (!(entry?.resumeSessionId || entry?.sessionId || entry?.runtimeSessionId)) continue;
    const score = Math.max(
      toTimestamp(entry?.startedAt),
      toTimestamp(entry?.endedAt),
      index,
    );
    if (!latest || score > latestScore) {
      latest = entry;
      latestScore = score;
    }
  }

  return latest;
}
