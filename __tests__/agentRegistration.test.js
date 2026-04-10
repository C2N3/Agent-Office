const {
  getEffectiveRegistrationStrategy,
  getRegistrationDecisionMessage,
} = require('../public/dashboard/agentRegistration.ts');

describe('agentRegistration helpers', () => {
  test('defaults to direct registration without a worktree preview', () => {
    expect(getEffectiveRegistrationStrategy(null, 'auto')).toBe('existing');
    expect(getRegistrationDecisionMessage(null, 'auto'))
      .toBe('Not a git repository; direct registration will be used');
  });

  test('uses preview-selected worktree strategy when the repository is already in use', () => {
    const preview = {
      isGitRepository: true,
      repositoryInUse: true,
      effectiveStrategy: 'worktree',
    };

    expect(getEffectiveRegistrationStrategy(preview, 'auto')).toBe('worktree');
    expect(getRegistrationDecisionMessage(preview, 'auto'))
      .toBe('Will create a managed git worktree because this repository is already in use');
  });

  test('honors explicit strategy overrides', () => {
    const preview = {
      isGitRepository: true,
      repositoryInUse: true,
      effectiveStrategy: 'worktree',
    };

    expect(getEffectiveRegistrationStrategy(preview, 'existing')).toBe('existing');
    expect(getRegistrationDecisionMessage(preview, 'existing'))
      .toBe('Will register this folder directly');
  });
});
