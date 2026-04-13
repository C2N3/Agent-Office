
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function setupTeamReportModal() {
  const modal = document.getElementById('teamReportModal');
  const closeBtn = document.getElementById('closeTeamReportBtn');
  const titleEl = document.getElementById('teamReportTitle');
  const bodyEl = document.getElementById('teamReportBody');
  const mergeBtn = document.getElementById('teamReportMergeBtn');
  const rejectBtn = document.getElementById('teamReportRejectBtn');
  if (!modal || !bodyEl || !mergeBtn || !rejectBtn) return;

  let currentTeamId = '';

  function closeModal() {
    modal.style.display = 'none';
    currentTeamId = '';
  }

  closeBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  async function openTeamReport(teamId) {
    currentTeamId = teamId;
    if (titleEl) titleEl.textContent = 'Team Report';
    bodyEl.innerHTML = '<div style="padding:20px;color:var(--color-text-muted)">Loading...</div>';
    modal.style.display = '';

    try {
      const res = await fetch(`/api/teams/${teamId}/report`);
      const data = await res.json();

      if (titleEl) titleEl.textContent = data.teamName || 'Team Report';

      const markedLib = (globalThis as any).marked;

      // Build member sections
      const memberHtml = (data.members || []).map((m) => {
        const statusClass = m.status === 'succeeded' ? 'diff-stat-add' : 'diff-stat-del';
        const outputHtml = markedLib?.parse ? markedLib.parse(m.output || '(no output)') : escapeHtml(m.output || '');
        return `<details class="team-member-report">
          <summary>
            <span class="team-member-report-name">${escapeHtml(m.agentName)}</span>
            <span class="team-member-report-title">${escapeHtml(m.title)}</span>
            <span class="${statusClass}">${m.status}</span>
          </summary>
          <div class="task-report-md">${outputHtml}</div>
        </details>`;
      }).join('');

      // Build diff section
      const diffHtml = data.diffSummary
        ? `<div class="task-report-section">
            <h4>Changes (Integration Branch)</h4>
            <pre class="task-report-pre">${escapeHtml(data.diffSummary)}</pre>
          </div>`
        : '';

      bodyEl.innerHTML = `
        <div class="task-report-section">
          <h4>Goal</h4>
          <div class="task-report-md" style="max-height:100px">${escapeHtml(data.goal || '')}</div>
        </div>
        <div class="task-report-section">
          <h4>Member Reports (${(data.members || []).length})</h4>
          ${memberHtml || '<div class="diff-empty">No member reports</div>'}
        </div>
        ${diffHtml}
      `;
    } catch (e) {
      bodyEl.innerHTML = '<div style="padding:20px;color:var(--color-state-error)">Failed to load team report.</div>';
    }
  }

  mergeBtn.addEventListener('click', async () => {
    if (!currentTeamId) return;
    mergeBtn.disabled = true;
    mergeBtn.textContent = 'Merging...';
    try {
      const res = await fetch(`/api/teams/${currentTeamId}/merge`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const officeChars = (globalThis as any).officeCharacters;
        // Clear bubble from all team members
        officeChars?.characters?.forEach?.((char) => {
          if (char.bubble?.isReport && char.bubble?.teamId === currentTeamId) {
            char.bubble = null;
          }
        });
        closeModal();
      } else {
        alert(data.error || 'Merge failed');
      }
    } catch { alert('Merge request failed'); }
    finally { mergeBtn.disabled = false; mergeBtn.textContent = 'Merge All'; }
  });

  rejectBtn.addEventListener('click', async () => {
    if (!currentTeamId) return;
    if (!confirm('Reject team results and discard all changes?')) return;
    rejectBtn.disabled = true;
    rejectBtn.textContent = 'Rejecting...';
    try {
      const res = await fetch(`/api/teams/${currentTeamId}/reject`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const officeChars = (globalThis as any).officeCharacters;
        officeChars?.characters?.forEach?.((char) => {
          if (char.bubble?.isReport && char.bubble?.teamId === currentTeamId) {
            char.bubble = null;
          }
        });
        closeModal();
      } else {
        alert(data.error || 'Reject failed');
      }
    } catch { alert('Reject request failed'); }
    finally { rejectBtn.disabled = false; rejectBtn.textContent = 'Reject'; }
  });

  (globalThis as any).openTeamReportModal = openTeamReport;
}
