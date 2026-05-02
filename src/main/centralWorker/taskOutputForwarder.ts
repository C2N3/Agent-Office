type SendPayload = (payload: Record<string, unknown>) => void;

export function installCentralTaskOutputForwarder(options: {
  bindings: Map<string, string>;
  orchestrator: any;
  sequences: Map<string, number>;
  send: SendPayload;
  workerId: string;
  protocolVersion: number;
}): void {
  const { bindings, orchestrator, sequences, send, workerId, protocolVersion } = options;
  if (!orchestrator || orchestrator.__centralWorkerOutputForwarderInstalled) return;

  const previous = orchestrator.broadcastTaskOutput;
  orchestrator.broadcastTaskOutput = (taskId: string, text: string, stream: 'stdout' | 'stderr') => {
    if (typeof previous === 'function') previous(taskId, text, stream);
    const centralTaskId = bindings.get(taskId);
    if (!centralTaskId) return;

    const sequence = (sequences.get(taskId) || 0) + 1;
    sequences.set(taskId, sequence);
    send({
      type: 'worker.task.output',
      workerId,
      protocolVersion,
      taskId: centralTaskId,
      sequence,
      stream,
      content: text,
      timestamp: Date.now(),
    });
  };
  orchestrator.__centralWorkerOutputForwarderInstalled = true;
}
