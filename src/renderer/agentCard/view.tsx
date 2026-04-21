import React, { useCallback, useEffect, useRef } from 'react';
import type { AgentCardShellModel } from './model.js';

const FOCUS_TOOLTIP = 'Focus terminal (click to switch to this terminal)';

const POKE_MESSAGES = [
  'Eek, you startled me!',
  'Hard at work here!',
  'Writing code...',
  'Need more coffee',
  "This isn't a bug, right?",
  'That tickles!',
  'Pretty fast typing, huh?',
  'Say something nice!',
];

export function AgentCardShell({ model }: { model: AgentCardShellModel }) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const focusResetTimer = useRef<number | null>(null);
  const focusFailureTimer = useRef<number | null>(null);
  const pokeResetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (focusResetTimer.current != null) window.clearTimeout(focusResetTimer.current);
      if (focusFailureTimer.current != null) window.clearTimeout(focusFailureTimer.current);
      if (pokeResetTimer.current != null) window.clearTimeout(pokeResetTimer.current);
    };
  }, []);

  const focusTerminal = useCallback(async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const button = event.currentTarget;

    if (!window.electronAPI || !window.electronAPI.focusTerminal) return;

    const result = await window.electronAPI.focusTerminal(model.agentId);
    if (result && result.success) {
      button.classList.add('clicked');
      if (focusResetTimer.current != null) window.clearTimeout(focusResetTimer.current);
      focusResetTimer.current = window.setTimeout(() => {
        focusResetTimer.current = null;
        button.classList.remove('clicked');
      }, 300);
      return;
    }

    button.style.animation = 'shake 0.3s ease';
    button.dataset.tooltip = 'Could not find PID';
    if (focusFailureTimer.current != null) window.clearTimeout(focusFailureTimer.current);
    focusFailureTimer.current = window.setTimeout(() => {
      focusFailureTimer.current = null;
      button.style.animation = '';
      button.dataset.tooltip = FOCUS_TOOLTIP;
    }, 1500);
  }, [model.agentId]);

  const pokeCharacter = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const bubble = bubbleRef.current;
    if (!bubble || pokeResetTimer.current != null) return;

    const originalText = bubble.textContent || '';
    const randomMessage = POKE_MESSAGES[Math.floor(Math.random() * POKE_MESSAGES.length)];
    bubble.textContent = randomMessage;
    bubble.style.borderColor = '#ff4081';
    pokeResetTimer.current = window.setTimeout(() => {
      pokeResetTimer.current = null;
      bubble.style.borderColor = '';
      bubble.textContent = originalText;
    }, 2000);
  }, []);

  const characterStyle: React.CSSProperties = {
    cursor: 'pointer',
  };
  if (model.avatarUrl) {
    characterStyle.backgroundImage = `url('${model.avatarUrl}')`;
  }

  return (
    <>
      <div className="satellite-tray"></div>
      <span className={`type-tag ${model.typeClass}`} title={model.projectTitle}>
        {model.projectLabel}
      </span>
      <div ref={bubbleRef} className="agent-bubble" role="status" aria-live="polite">
        Waiting...
      </div>
      <div className="agent-timer" style={{ visibility: 'hidden' }}></div>
      <div className="agent-character" style={characterStyle} onClick={pokeCharacter}></div>
      <div
        className="agent-name"
        title={model.projectTitle}
        style={model.showName ? undefined : { display: 'none' }}
      >
        {model.nameText}
      </div>
      <button
        className="focus-terminal-btn"
        data-tooltip={FOCUS_TOOLTIP}
        aria-label={model.focusAriaLabel}
        onClick={focusTerminal}
      >
        <span className="focus-icon">{'\u00f0'}</span>
      </button>
    </>
  );
}
