import React, { type ReactElement } from 'react';
import type { DashboardTerminalEntry } from '../shared.js';

export function TerminalTabs({
  activeId,
  terminals,
  onActivate,
  onClose,
}: {
  activeId: string | null;
  terminals: Array<[string, DashboardTerminalEntry]>;
  onActivate: (terminalId: string) => void;
  onClose: (terminalId: string) => void;
}): ReactElement {
  return (
    <>
      {terminals.map(([terminalId, terminal]) => (
        <div
          key={terminalId}
          className={`terminal-tab${activeId === terminalId ? ' active' : ''}`}
          data-agent-id={terminalId}
          onClick={() => onActivate(terminalId)}
        >
          <span className={`terminal-tab-dot${terminal.exited ? ' exited' : ''}`} />
          <span className="terminal-tab-label">{terminal.label}</span>
          <button
            className="terminal-tab-close"
            title="Close"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose(terminalId);
            }}
          >
            &times;
          </button>
        </div>
      ))}
    </>
  );
}
