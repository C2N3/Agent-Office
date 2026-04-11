// @ts-nocheck

import { getDashboardAPI } from '../shared.js';

export function setupConversationViewer(resumeRegisteredSession) {
  const overlay = document.createElement('div');
  overlay.className = 'conv-overlay';
  overlay.style.display = 'none';
  document.body.appendChild(overlay);

  const modal = document.createElement('div');
  modal.className = 'conv-modal';
  modal.innerHTML = `
    <div class="conv-modal-header">
      <div class="conv-modal-title">Session History</div>
      <button class="conv-modal-close">&times;</button>
    </div>
    <div class="conv-modal-body">
      <div class="conv-session-list"></div>
      <div class="conv-chat-panel" style="display:none">
        <div class="conv-chat-header">
          <button class="conv-back-btn">&larr; Back</button>
          <span class="conv-chat-session-id"></span>
          <button class="conv-resume-btn">Resume</button>
        </div>
        <div class="conv-chat-messages"></div>
      </div>
    </div>
  `;
  overlay.appendChild(modal);

  const sessionListEl = modal.querySelector('.conv-session-list');
  const chatPanel = modal.querySelector('.conv-chat-panel');
  const chatMessages = modal.querySelector('.conv-chat-messages');
  const chatSessionId = modal.querySelector('.conv-chat-session-id');
  const backBtn = modal.querySelector('.conv-back-btn');
  const resumeBtn = modal.querySelector('.conv-resume-btn');
  const closeBtn = modal.querySelector('.conv-modal-close');
  const titleEl = modal.querySelector('.conv-modal-title');

  let currentRegistryId = null;
  let currentSessionId = null;
  let currentResumeSessionId = null;
  let currentAgentName = null;

  function closeModal() {
    overlay.style.display = 'none';
    currentRegistryId = null;
    currentSessionId = null;
    currentResumeSessionId = null;
  }

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.style.display !== 'none') closeModal();
  });
  backBtn.addEventListener('click', () => {
    chatPanel.style.display = 'none';
    sessionListEl.style.display = '';
    currentSessionId = null;
    currentResumeSessionId = null;
  });
  resumeBtn.addEventListener('click', async () => {
    if (!currentRegistryId || !(currentResumeSessionId || currentSessionId)) return;
    const dashboardAPI = getDashboardAPI();
    if (!dashboardAPI?.resumeSession) {
      alert('Resume is only available in the Electron app');
      return;
    }

    const registryId = currentRegistryId;
    const sessionId = currentResumeSessionId || currentSessionId;
    const label = currentAgentName;
    closeModal();

    const result = await resumeRegisteredSession(registryId, sessionId, label);
    if (!result?.success) {
      alert(`Failed to resume: ${result?.error || 'unknown'}`);
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString();
    } catch {
      return '';
    }
  }

  function renderMessage(message) {
    if (message.role === 'system') {
      return `<div class="conv-msg conv-msg-system"><span class="conv-msg-badge">SYSTEM</span> ${escapeHtml(message.content)}</div>`;
    }
    if (message.role === 'user') {
      return `<div class="conv-msg conv-msg-user"><span class="conv-msg-badge">USER</span><div class="conv-msg-content">${escapeHtml(message.content)}</div>${message.timestamp ? `<span class="conv-msg-time">${formatTime(message.timestamp)}</span>` : ''}</div>`;
    }
    if (message.role === 'assistant') {
      const toolHtml = message.toolUses && message.toolUses.length > 0
        ? `<div class="conv-msg-tools">${message.toolUses.map((tool) => `<span class="conv-tool-tag">${escapeHtml(tool.name)}</span>`).join('')}</div>`
        : '';
      return `<div class="conv-msg conv-msg-assistant"><span class="conv-msg-badge">ASSISTANT</span>${toolHtml}<div class="conv-msg-content">${escapeHtml(message.content)}</div><div class="conv-msg-meta">${message.model ? `<span class="conv-msg-model">${message.model}</span>` : ''}${message.timestamp ? `<span class="conv-msg-time">${formatTime(message.timestamp)}</span>` : ''}</div></div>`;
    }
    return '';
  }

  async function openConversation(registryId, sessionId, resumeSessionId) {
    currentSessionId = sessionId;
    currentResumeSessionId = resumeSessionId || sessionId;
    sessionListEl.style.display = 'none';
    chatPanel.style.display = '';
    chatSessionId.textContent = `${(currentResumeSessionId || sessionId).slice(0, 16)}...`;
    chatMessages.innerHTML = '<div class="conv-loading">Loading conversation...</div>';

    try {
      let data;
      const dashboardAPI = getDashboardAPI();
      if (dashboardAPI?.getConversation) {
        data = await dashboardAPI.getConversation(registryId, sessionId, {});
      } else {
        const response = await fetch(`/api/agents/${registryId}/conversation/${sessionId}`);
        data = await response.json();
      }

      if (data.error) {
        chatMessages.innerHTML = `<div class="conv-empty">${data.error}</div>`;
        return;
      }
      if (!data.messages || data.messages.length === 0) {
        chatMessages.innerHTML = '<div class="conv-empty">No messages in this session.</div>';
        return;
      }

      chatMessages.innerHTML = data.messages.map(renderMessage).join('');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
      chatMessages.innerHTML = '<div class="conv-empty">Failed to load conversation.</div>';
      console.error('[Conversation]', error);
    }
  }

  async function openSessionHistory(registryId, agentName) {
    currentRegistryId = registryId;
    currentSessionId = null;
    currentResumeSessionId = null;
    currentAgentName = agentName || 'Agent';
    titleEl.textContent = `${currentAgentName} — Session History`;
    sessionListEl.style.display = '';
    chatPanel.style.display = 'none';
    sessionListEl.innerHTML = '<div class="conv-loading">Loading...</div>';
    overlay.style.display = '';

    try {
      let history;
      const dashboardAPI = getDashboardAPI();
      if (dashboardAPI?.getSessionHistory) {
        history = await dashboardAPI.getSessionHistory(registryId);
      } else {
        const response = await fetch(`/api/agents/${registryId}/history`);
        history = await response.json();
      }

      if (!history || history.length === 0) {
        sessionListEl.innerHTML = '<div class="conv-empty">No session history yet.</div>';
        return;
      }

      history.sort((left, right) => (right.startedAt || 0) - (left.startedAt || 0));
      sessionListEl.innerHTML = history.map((entry) => {
        const started = entry.startedAt ? new Date(entry.startedAt).toLocaleString() : '-';
        const ended = entry.endedAt ? new Date(entry.endedAt).toLocaleString() : 'Active';
        const msgCount = entry.summary ? entry.summary.messageCount : '?';
        const hasTranscript = !!entry.transcriptPath;
        const conversationSessionId = entry.sessionId || entry.resumeSessionId || entry.runtimeSessionId || '';
        const resumeSessionId = entry.resumeSessionId || entry.sessionId || entry.runtimeSessionId || '';
        const labelSessionId = resumeSessionId || conversationSessionId;
        return `
          <div class="conv-session-item ${hasTranscript ? '' : 'no-transcript'}" data-session-id="${conversationSessionId}" data-resume-session-id="${resumeSessionId}" data-has-transcript="${hasTranscript}">
            <div class="conv-session-main">
              <span class="conv-session-id-label">${labelSessionId.slice(0, 12)}...</span>
              <span class="conv-session-msgs">${msgCount} messages${hasTranscript ? '' : ' · transcript unavailable'}</span>
            </div>
            <div class="conv-session-dates">
              <span>${started}</span>
              <span class="conv-session-arrow">&rarr;</span>
              <span>${ended}</span>
            </div>
          </div>
        `;
      }).join('');

      sessionListEl.querySelectorAll('.conv-session-item').forEach((item) => {
        item.addEventListener('click', () => {
          openConversation(registryId, item.dataset.sessionId, item.dataset.resumeSessionId || item.dataset.sessionId);
        });
      });
    } catch (error) {
      sessionListEl.innerHTML = '<div class="conv-empty">Failed to load history.</div>';
      console.error('[History]', error);
    }
  }

  globalThis.openSessionHistory = openSessionHistory;
}
