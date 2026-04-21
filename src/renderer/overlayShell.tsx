import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveAgentContextMenuState } from './overlayContextMenu.js';
import { registerAgentGridElements } from './agentGrid/elements.js';
import { registerOverlayShellController, type OverlayContextMenuState } from './overlayShellController.js';
import { isOpenDashboardShortcut } from './overlayShortcuts.js';

const AgentGridShell = memo(function AgentGridShell({
  onAgentContextMenu,
}: {
  onAgentContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const idleContainerRef = useRef<HTMLDivElement | null>(null);
  const idleBubbleRef = useRef<HTMLDivElement | null>(null);
  const idleCharacterRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    registerAgentGridElements({
      grid,
      idleContainer: idleContainerRef.current,
      idleBubble: idleBubbleRef.current,
      idleCharacter: idleCharacterRef.current,
    });

    return () => {
      registerAgentGridElements(null);
    };
  }, []);

  return (
    <div ref={gridRef} className="agent-grid" id="agent-grid" onContextMenu={onAgentContextMenu}>
      <div ref={idleContainerRef} className="container" id="container" style={{ display: 'none' }}>
        <div ref={idleBubbleRef} className="speech-bubble" id="speech-bubble">Waiting...</div>
        <div ref={idleCharacterRef} className="character" id="character"></div>
      </div>
    </div>
  );
});

function WebDashboardButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current != null) {
        window.clearTimeout(resetTimer.current);
      }
    };
  }, []);

  const scheduleReset = useCallback(() => {
    if (resetTimer.current != null) {
      window.clearTimeout(resetTimer.current);
    }
    resetTimer.current = window.setTimeout(() => {
      resetTimer.current = null;
      setStatus('idle');
    }, 2000);
  }, []);

  const openDashboard = useCallback(async () => {
    if (status !== 'idle') return;

    setStatus('loading');

    try {
      if (!window.electronAPI || !window.electronAPI.openWebDashboard) {
        throw new Error('electronAPI.openWebDashboard not available');
      }

      const result = await window.electronAPI.openWebDashboard();
      if (result.success) {
        setStatus('success');
      } else {
        console.error('[Renderer] Failed to open dashboard:', result.error);
        setStatus('error');
      }
    } catch (error) {
      console.error('[Renderer] Error opening dashboard:', error);
      setStatus('error');
    }

    scheduleReset();
  }, [scheduleReset, status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isOpenDashboardShortcut(event)) return;
      event.preventDefault();
      void openDashboard();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openDashboard]);

  const label = status === 'loading'
    ? '⏳ Opening...'
    : status === 'success'
      ? '✓ Opened'
      : status === 'error'
        ? '✗ Failed'
        : '🌐 Agent Desk';

  return (
    <button
      id="web-dashboard-btn"
      className="web-dashboard-btn"
      title="Open Agent Desk (Ctrl+D)"
      onClick={() => { void openDashboard(); }}
      disabled={status !== 'idle'}
    >
      {label}
    </button>
  );
}

function ContextMenu({ state, onClose }: { state: OverlayContextMenuState; onClose: () => void; }) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!menuRef.current || menuRef.current.contains(target)) return;
      onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose]);

  const focusAgent = useCallback(async () => {
    if (window.electronAPI && window.electronAPI.focusTerminal) {
      await window.electronAPI.focusTerminal(state.agentId);
    }
    onClose();
  }, [onClose, state.agentId]);

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        left: `${state.x}px`,
        top: `${state.y}px`,
      }}
    >
      <div className="context-menu-item" data-action="focus" onClick={focusAgent}>
        <span className="menu-icon">🎯</span>
        <span className="menu-label">Focus Terminal</span>
        <span className="menu-shortcut">Enter</span>
      </div>
    </div>,
    document.body,
  );
}

export function OverlayShell() {
  const [contextMenu, setContextMenu] = useState<OverlayContextMenuState | null>(null);

  const openContextMenu = useCallback((state: OverlayContextMenuState) => {
    setContextMenu(state);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleAgentContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const contextMenuState = resolveAgentContextMenuState(event);
    if (!contextMenuState) return;

    event.preventDefault();
    openContextMenu(contextMenuState);
  }, [openContextMenu]);

  useEffect(() => {
    registerOverlayShellController({
      openContextMenu,
      closeContextMenu,
    });

    return () => {
      registerOverlayShellController(null);
    };
  }, [closeContextMenu, openContextMenu]);

  return (
    <>
      <AgentGridShell onAgentContextMenu={handleAgentContextMenu} />
      <div className="avatar-toolbar">
        <WebDashboardButton />
      </div>
      {contextMenu ? <ContextMenu state={contextMenu} onClose={closeContextMenu} /> : null}
    </>
  );
}
