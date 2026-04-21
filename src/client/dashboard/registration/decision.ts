export function getEffectiveRegistrationStrategy(preview: any, selectedStrategy = 'auto') {
  if (selectedStrategy === 'existing' || selectedStrategy === 'worktree') {
    return selectedStrategy;
  }
  return preview?.effectiveStrategy === 'worktree' ? 'worktree' : 'existing';
}

export function getRegistrationDecisionMessage(preview: any, selectedStrategy = 'auto') {
  const effectiveStrategy = getEffectiveRegistrationStrategy(preview, selectedStrategy);

  if (!preview?.isGitRepository) {
    return effectiveStrategy === 'worktree'
      ? 'This path is not a git repository. Managed worktree creation requires a git repository.'
      : 'Not a git repository; direct registration will be used';
  }

  if (effectiveStrategy === 'worktree') {
    return preview?.repositoryInUse
      ? 'Will create a managed git worktree because this repository is already in use'
      : 'Will create a managed git worktree';
  }

  return 'Will register this folder directly';
}
