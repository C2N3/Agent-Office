
async function launchExternalResumeTerminal({ cwd, resumeCommand, terminalProfileService }) {
  const { spawn, execFile } = require('child_process');
  const trimmedResumeCommand = String(resumeCommand || '').replace(/\r/g, '').trim();
  if (!trimmedResumeCommand) {
    return { success: false, error: 'Missing resume command' };
  }

  if (process.platform === 'win32') {
    const preferredPowerShell = terminalProfileService?.resolveProfile?.('pwsh')
      || terminalProfileService?.resolveProfile?.('powershell')
      || null;
    const powerShellPath = preferredPowerShell?.command || 'powershell.exe';
    const powerShellScript = [
      cwd ? `Set-Location -LiteralPath '${String(cwd).replace(/'/g, "''")}'` : null,
      trimmedResumeCommand,
    ].filter(Boolean).join('; ');

    const child = spawn('cmd.exe', ['/c', 'start', '', powerShellPath, '-NoExit', '-Command', powerShellScript], {
      cwd: cwd || undefined,
      detached: true,
      stdio: 'ignore',
      shell: false,
    });
    child.unref();
    return { success: true };
  }

  if (process.platform === 'darwin') {
    const macScript = [
      'tell application "Terminal"',
      'activate',
      `do script ${JSON.stringify(`${cwd ? `cd ${JSON.stringify(cwd)}; ` : ''}${trimmedResumeCommand}`)}`,
      'end tell',
    ].join('\n');

    await new Promise((resolve, reject) => {
      execFile('osascript', ['-e', macScript], { timeout: 5000 }, (error) => {
        if (error) reject(error);
        else resolve(null);
      });
    });
    return { success: true };
  }

  const linuxLaunchers = [
    ['x-terminal-emulator', ['-e', `${cwd ? `cd ${JSON.stringify(cwd)} && ` : ''}${trimmedResumeCommand}`]],
    ['gnome-terminal', ['--', 'bash', '-lc', `${cwd ? `cd ${JSON.stringify(cwd)} && ` : ''}${trimmedResumeCommand}; exec bash -l`]],
    ['konsole', ['-e', 'bash', '-lc', `${cwd ? `cd ${JSON.stringify(cwd)} && ` : ''}${trimmedResumeCommand}; exec bash -l`]],
    ['xfce4-terminal', ['--command', `bash -lc ${JSON.stringify(`${cwd ? `cd ${JSON.stringify(cwd)} && ` : ''}${trimmedResumeCommand}; exec bash -l`)}`]],
    ['xterm', ['-e', `${cwd ? `cd ${JSON.stringify(cwd)} && ` : ''}${trimmedResumeCommand}; exec bash -l`]],
  ];

  for (const [command, args] of linuxLaunchers) {
    try {
      const child = spawn(command, args, {
        cwd: cwd || undefined,
        detached: true,
        stdio: 'ignore',
        shell: false,
      });
      child.unref();
      return { success: true };
    } catch {
      // Try the next launcher.
    }
  }

  return { success: false, error: 'No supported terminal launcher found' };
}

module.exports = { launchExternalResumeTerminal };
