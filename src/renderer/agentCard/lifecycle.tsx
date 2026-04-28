import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { buildAgentCardShellModel } from './model';
import { AgentCardShell } from './view';

const cardRoots = new WeakMap<HTMLElement, Root>();

export function mountAgentCardShell(card: HTMLElement, agent, assignedAvatar) {
  const root = createRoot(card);
  cardRoots.set(card, root);

  flushSync(() => {
    root.render(<AgentCardShell model={buildAgentCardShellModel(agent, assignedAvatar)} />);
  });
}

export function unmountAgentCardShell(card: Element | null | undefined) {
  if (typeof HTMLElement === 'undefined') return;
  if (!(card instanceof HTMLElement)) return;

  const root = cardRoots.get(card);
  if (!root) return;

  root.unmount();
  cardRoots.delete(card);
}
