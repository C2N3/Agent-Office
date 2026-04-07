jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  renameSync: jest.fn(),
}));

jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
}));

const fs = require('fs');
const { execFileSync } = require('child_process');
const { TerminalProfileService } = require('../src/main/terminalProfileService');

describe('TerminalProfileService', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.LOCALAPPDATA = 'C:\\Users\\minijay\\AppData\\Local';

    fs.existsSync.mockImplementation(target => {
      const value = String(target);
      if (value.endsWith('terminal-preferences.json')) return false;
      if (value.includes('Programs\\Git\\bin\\bash.exe')) return true;
      if (value.includes('Programs\\Git\\git-bash.exe')) return true;
      return true;
    });
    execFileSync.mockImplementation((command, args) => {
      if (command !== 'where.exe') return '';

      switch (args[0]) {
      case 'git.exe':
      case 'git':
        return 'C:\\Users\\minijay\\AppData\\Local\\Programs\\Git\\cmd\\git.exe\r\n';
      case 'pwsh.exe':
        return 'C:\\Program Files\\PowerShell\\7\\pwsh.exe\r\n';
      case 'powershell.exe':
        return 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\r\n';
      case 'cmd.exe':
      case process.env.ComSpec:
        return 'C:\\Windows\\System32\\cmd.exe\r\n';
      case 'wsl.exe':
        return 'C:\\Windows\\System32\\wsl.exe\r\n';
      default:
        return '';
      }
    });
  });

  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  test('detects available terminal profiles and uses the first detected profile by default', () => {
    const service = new TerminalProfileService(jest.fn());
    const result = service.getProfilesWithDefault();

    expect(result.profiles.map(profile => profile.id)).toEqual(['pwsh', 'powershell', 'cmd', 'git-bash', 'wsl']);
    expect(result.defaultProfileId).toBe('pwsh');
  });

  test('restores a stored default profile when it is still available', () => {
    fs.existsSync.mockImplementation(target => String(target).endsWith('terminal-preferences.json'));
    fs.readFileSync.mockReturnValue(JSON.stringify({ defaultProfileId: 'cmd' }));

    const service = new TerminalProfileService(jest.fn());
    const result = service.getProfilesWithDefault();

    expect(result.defaultProfileId).toBe('cmd');
    expect(service.resolveProfile().id).toBe('cmd');
  });

  test('persists a new default profile selection', () => {
    const service = new TerminalProfileService(jest.fn());
    const result = service.setDefaultProfile('cmd');

    expect(result.defaultProfileId).toBe('cmd');
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(fs.renameSync).toHaveBeenCalledTimes(1);

    const [, raw] = fs.writeFileSync.mock.calls[0];
    expect(JSON.parse(raw)).toEqual({ defaultProfileId: 'cmd' });
  });
});
