// @ts-nocheck

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Parse unified diff into per-file sections */
function parseDiffToFiles(diff) {
  if (!diff) return [];
  const files = [];
  const lines = diff.split('\n');
  let current = null;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (current) files.push(current);
      // Extract filename: diff --git a/path b/path
      const match = line.match(/diff --git a\/(.+?) b\/(.+)/);
      current = { name: match ? match[2] : 'unknown', additions: 0, deletions: 0, lines: [] };
      continue;
    }
    if (!current) continue;
    // Skip index/--- /+++ header lines
    if (line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) continue;

    if (line.startsWith('@@')) {
      current.lines.push({ type: 'hunk', text: line });
    } else if (line.startsWith('+')) {
      current.additions++;
      current.lines.push({ type: 'add', text: line });
    } else if (line.startsWith('-')) {
      current.deletions++;
      current.lines.push({ type: 'del', text: line });
    } else {
      current.lines.push({ type: 'ctx', text: line });
    }
  }
  if (current) files.push(current);
  return files;
}

/** Render file diffs into a container element */
function renderFileDiffs(container, files) {
  if (!files.length) {
    container.innerHTML = '<div class="diff-empty">(no changes)</div>';
    return;
  }

  const html = files.map((file) => {
    const stat = `<span class="diff-stat-add">+${file.additions}</span> <span class="diff-stat-del">-${file.deletions}</span>`;
    const linesHtml = file.lines.map((l) => {
      const cls = l.type === 'add' ? 'diff-line-add' : l.type === 'del' ? 'diff-line-del' : l.type === 'hunk' ? 'diff-line-hunk' : 'diff-line-ctx';
      return `<div class="${cls}">${escapeHtml(l.text)}</div>`;
    }).join('');

    return `<details class="diff-file">
      <summary class="diff-file-header"><span class="diff-file-name">${escapeHtml(file.name)}</span>${stat}</summary>
      <div class="diff-file-body">${linesHtml}</div>
    </details>`;
  }).join('');

  container.innerHTML = html;
}

export function setupTaskReportModal() {
  const modal = document.getElementById('taskReportModal');
  const closeBtn = document.getElementById('closeTaskReportBtn');
  const outputEl = document.getElementById('taskReportOutput');
  const changesEl = document.getElementById('taskReportChanges');
  const titleEl = document.getElementById('taskReportTitle');
  const mergeBtn = document.getElementById('taskReportMergeBtn');
  const rejectBtn = document.getElementById('taskReportRejectBtn');
  if (!modal || !outputEl || !changesEl || !mergeBtn || !rejectBtn) return;

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
    changesEl.innerHTML = '';
    modal.style.display = '';

    try {
      const res = await fetch(`/api/tasks/${taskId}/report`);
      const data = await res.json();
      currentAgentId = data.agentRegistryId || '';
      if (titleEl) titleEl.textContent = data.title || 'Task Report';
      const cleanedOutput = (data.output || '').trim();
      if (cleanedOutput) {
        const markedLib = (globalThis as any).marked;
        if (markedLib?.parse) {
          outputEl.innerHTML = markedLib.parse(cleanedOutput);
        } else {
          outputEl.textContent = cleanedOutput;
        }
      } else {
        outputEl.textContent = '(이 태스크에 대한 에이전트 응답을 찾을 수 없습니다.)';
      }

      const files = parseDiffToFiles(data.diff || '');
      renderFileDiffs(changesEl, files);
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
