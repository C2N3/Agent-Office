export const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:      ['ready', 'cancelled'],
  ready:        ['provisioning', 'cancelled'],
  provisioning: ['running', 'failed', 'cancelled'],
  running:      ['succeeded', 'failed', 'retrying', 'paused', 'cancelled'],
  paused:       ['running', 'cancelled'],
  retrying:     ['provisioning', 'failed', 'cancelled'],
  succeeded:    [],
  failed:       ['ready', 'cancelled'],
  cancelled:    ['ready'],
};

export function canTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionTask(task: any, to: string, meta?: Record<string, any>): any {
  if (!canTransition(task.status, to)) {
    throw new Error(`Invalid transition: ${task.status} -> ${to} for task ${task.id}`);
  }

  const now = Date.now();
  const updates: Record<string, any> = {
    ...meta,
    status: to,
    updatedAt: now,
  };

  if (to === 'running' && !task.startedAt) {
    updates.startedAt = now;
  }
  if (to === 'succeeded' || to === 'failed') {
    updates.completedAt = now;
  }

  return { ...task, ...updates };
}

export function isTerminalStatus(status: string): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}
