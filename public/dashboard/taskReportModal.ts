// @ts-nocheck

export function setupTaskReportModal() {
  const modal = document.getElementById('taskReportModal');
  const closeBtn = document.getElementById('closeTaskReportBtn');
  const outputEl = document.getElementById('taskReportOutput');
  const diffSummaryEl = document.getElementById('taskReportDiffSummary');
  const diffEl = document.getElementById('taskReportDiff');
  const titleEl = document.getElementById('taskReportTitle');
  const mergeBtn = document.getElementById('taskReportMergeBtn');
  const rejectBtn = document.getElementById('taskReportRejectBtn');
  if (!modal || !outputEl || !diffSummaryEl || !diffEl || !mergeBtn || !rejectBtn) return;

  let currentTaskId = '';
  let currentAgentId = '';

  function closeModal() {
    modal.style.display = 'none';
    currentTaskId = '';
    currentAgentId = '';
  }

  closeBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  async function openTaskReport(taskId) {
    currentTaskId = taskId;
    if (titleEl) titleEl.textContent = 'Task Report';
    outputEl.textContent = 'Loading...';
    diffSummaryEl.textContent = '';
    diffEl.textContent = '';
    modal.style.display = '';

    try {
      const res = await fetch(`/api/tasks/${taskId}/report`);
      const data = await res.json();
      currentAgentId = data.agentRegistryId || '';
      if (titleEl) titleEl.textContent = data.title || 'Task Report';
      outputEl.textContent = data.output || '(no output)';
      diffSummaryEl.textContent = data.diffSummary || '(no changes)';
      diffEl.textContent = data.diff || '';
    } catch (e) {
      outputEl.textContent = 'Failed to load report.';
    }
  }

  mergeBtn.addEventListener('click', async () => {
    if (!currentTaskId) return;
    mergeBtn.disabled = true;
    mergeBtn.textContent = 'Merging...';
    try {
      const res = await fetch(`/api/tasks/${currentTaskId}/merge`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const officeChars = (globalThis as any).officeCharacters;
        if (officeChars?.clearReportBubble && currentAgentId) officeChars.clearReportBubble(currentAgentId);
        closeModal();
      } else {
        alert(data.error || 'Merge failed');
      }
    } catch (e) {
      alert('Merge request failed');
    } finally {
      mergeBtn.disabled = false;
      mergeBtn.textContent = 'Merge';
    }
  });

  rejectBtn.addEventListener('click', async () => {
    if (!currentTaskId) return;
    if (!confirm('Reject this task and discard all changes?')) return;
    rejectBtn.disabled = true;
    rejectBtn.textContent = 'Rejecting...';
    try {
      const res = await fetch(`/api/tasks/${currentTaskId}/reject`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const officeChars = (globalThis as any).officeCharacters;
        if (officeChars?.clearReportBubble && currentAgentId) officeChars.clearReportBubble(currentAgentId);
        closeModal();
      } else {
        alert(data.error || 'Reject failed');
      }
    } catch (e) {
      alert('Reject request failed');
    } finally {
      rejectBtn.disabled = false;
      rejectBtn.textContent = 'Reject';
    }
  });

  (globalThis as any).openTaskReportModal = openTaskReport;
}
