const {
  buildAgentCardShellModel,
  getAgentCardNameText,
  getAgentCardProjectLabel,
  getAgentCardTypeClass,
} = require('../model.ts');

describe('overlay agent card shell model', () => {
  test('builds project, nickname, avatar, and focus labels for the React shell', () => {
    expect(buildAgentCardShellModel({
      id: 'agent-1',
      displayName: 'Code Agent',
      nickname: 'Patch Pilot',
      projectPath: '/workspace/agent-office/',
      slug: 'code-agent',
    }, 'avatar_7.webp')).toEqual({
      agentId: 'agent-1',
      avatarUrl: './assets/characters/avatar_7.webp',
      focusAriaLabel: 'Focus terminal for Code Agent',
      nameText: 'Patch Pilot',
      projectLabel: 'agent-office',
      projectTitle: '/workspace/agent-office/',
      showName: true,
      typeClass: 'type-main',
    });
  });

  test('hides the name badge for generic unnamed agents', () => {
    expect(getAgentCardNameText({
      displayName: 'Agent',
      slug: '',
    })).toBe('');

    const model = buildAgentCardShellModel({
      id: 'agent-2',
      displayName: 'Agent',
    }, '');

    expect(model.showName).toBe(false);
    expect(model.nameText).toBe('');
    expect(model.avatarUrl).toBe('');
  });

  test('keeps existing shell classification and project fallback rules', () => {
    expect(getAgentCardProjectLabel('C:\\repo\\tooling\\')).toBe('tooling');
    expect(getAgentCardProjectLabel('')).toBe('Agent');
    expect(getAgentCardTypeClass({ isSubagent: true, isTeammate: true })).toBe('type-sub');
    expect(getAgentCardTypeClass({ isTeammate: true })).toBe('type-team');
    expect(getAgentCardTypeClass({})).toBe('type-main');
  });
});
