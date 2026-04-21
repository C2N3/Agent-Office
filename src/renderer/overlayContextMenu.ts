import type { OverlayContextMenuState } from './overlayShellController.js';

export type OverlayContextMenuEvent = {
  target: EventTarget | null;
  currentTarget: HTMLElement;
  clientX: number;
  clientY: number;
};

export function resolveAgentContextMenuState(event: OverlayContextMenuEvent): OverlayContextMenuState | null {
  const target = event.target as HTMLElement | null;
  const agentCard = target?.closest<HTMLElement>('.agent-card');
  if (!agentCard || !event.currentTarget.contains(agentCard)) return null;

  const agentId = agentCard.dataset.agentId;
  if (!agentId) return null;

  return {
    agentId,
    x: event.clientX,
    y: event.clientY,
  };
}
