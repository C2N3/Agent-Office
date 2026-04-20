import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

const roots = new Map<HTMLElement, Root>();

export function renderInto(element: HTMLElement | null, node: ReactNode): void {
  if (!element) return;

  let root = roots.get(element);
  if (!root) {
    root = createRoot(element);
    roots.set(element, root);
  }

  flushSync(() => {
    root.render(node);
  });
}
