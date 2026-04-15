export type HoverTooltipOptions = {
  root?: Document | HTMLElement;
  selector: string;
  delayMs?: number;
  offset?: number;
};

const TOOLTIP_ID = 'aoHoverTooltip';

function ensureTooltipElement(doc: Document): HTMLDivElement {
  let tooltip = doc.getElementById(TOOLTIP_ID) as HTMLDivElement | null;
  if (tooltip) return tooltip;

  tooltip = doc.createElement('div');
  tooltip.id = TOOLTIP_ID;
  tooltip.className = 'ao-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.style.display = 'none';
  doc.body.appendChild(tooltip);
  return tooltip;
}

function containsTarget(root: Document | HTMLElement, element: HTMLElement): boolean {
  return root instanceof Document || root.contains(element);
}

function closestTooltipTarget(
  target: EventTarget | null,
  selector: string,
  root: Document | HTMLElement,
): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest(selector) as HTMLElement | null;
  if (!element || !containsTarget(root, element)) return null;
  return element;
}

function readTooltipText(element: HTMLElement): string {
  const title = element.getAttribute('title');
  const text = (title || element.getAttribute('data-tooltip') || '').trim();
  if (title) {
    element.setAttribute('data-tooltip', title);
    element.removeAttribute('title');
  }
  if (text && element instanceof HTMLButtonElement && !element.getAttribute('aria-label')) {
    element.setAttribute('aria-label', text);
  }
  return text;
}

function positionTooltip(target: HTMLElement, tooltip: HTMLElement, offset: number): void {
  const rect = target.getBoundingClientRect();
  tooltip.style.display = 'block';
  tooltip.style.left = '0px';
  tooltip.style.top = '0px';

  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const margin = 8;

  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(margin, Math.min(viewportWidth - width - margin, left));

  let top = rect.top - height - offset;
  if (top < margin) top = rect.bottom + offset;
  top = Math.max(margin, Math.min(viewportHeight - height - margin, top));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

export function installHoverTooltips(options: HoverTooltipOptions): () => void {
  const root = options.root || document;
  const doc = root instanceof Document ? root : root.ownerDocument;
  const tooltip = ensureTooltipElement(doc);
  const delayMs = options.delayMs ?? 250;
  const offset = options.offset ?? 8;
  let activeTarget: HTMLElement | null = null;
  let showTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (!showTimer) return;
    clearTimeout(showTimer);
    showTimer = null;
  };

  const hide = () => {
    clearTimer();
    activeTarget = null;
    tooltip.style.display = 'none';
  };

  const showFor = (target: HTMLElement) => {
    const text = readTooltipText(target);
    if (!text) return;

    clearTimer();
    activeTarget = target;
    showTimer = setTimeout(() => {
      if (activeTarget !== target) return;
      tooltip.textContent = text;
      positionTooltip(target, tooltip, offset);
    }, delayMs);
  };

  const onPointerOver = (event: Event) => {
    const target = closestTooltipTarget(event.target, options.selector, root);
    if (!target || target === activeTarget) return;
    showFor(target);
  };

  const onPointerOut = (event: PointerEvent) => {
    if (!activeTarget) return;
    if (event.relatedTarget instanceof Node && activeTarget.contains(event.relatedTarget)) return;
    hide();
  };

  const onFocusIn = (event: Event) => {
    const target = closestTooltipTarget(event.target, options.selector, root);
    if (target) showFor(target);
  };

  const onFocusOut = () => hide();
  const onPointerMove = () => {
    if (activeTarget && tooltip.style.display !== 'none') {
      positionTooltip(activeTarget, tooltip, offset);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') hide();
  };

  root.addEventListener('pointerover', onPointerOver);
  root.addEventListener('pointerout', onPointerOut as EventListener);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('focusout', onFocusOut);
  root.addEventListener('mousedown', hide);
  doc.addEventListener('keydown', onKeyDown);
  doc.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);

  return () => {
    hide();
    root.removeEventListener('pointerover', onPointerOver);
    root.removeEventListener('pointerout', onPointerOut as EventListener);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('focusin', onFocusIn);
    root.removeEventListener('focusout', onFocusOut);
    root.removeEventListener('mousedown', hide);
    doc.removeEventListener('keydown', onKeyDown);
    doc.removeEventListener('scroll', hide, true);
    window.removeEventListener('resize', hide);
  };
}
