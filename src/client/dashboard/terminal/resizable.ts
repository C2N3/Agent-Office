type ResizeStartEvent = {
  clientX: number;
  clientY: number;
  preventDefault: () => void;
};

type ResizeCleanup = () => void;

function installDocumentResizeSession(
  handle: HTMLElement,
  cursor: string,
  onMouseMove: (event: MouseEvent) => void,
): ResizeCleanup {
  const doc = handle.ownerDocument;
  const body = doc.body;
  function cleanup() {
    handle.classList.remove('dragging');
    body.style.cursor = '';
    body.style.userSelect = '';
    doc.removeEventListener('mousemove', onMouseMove);
    doc.removeEventListener('mouseup', onMouseUp);
  }
  function onMouseUp() {
    cleanup();
  }

  handle.classList.add('dragging');
  body.style.cursor = cursor;
  body.style.userSelect = 'none';
  doc.addEventListener('mousemove', onMouseMove);
  doc.addEventListener('mouseup', onMouseUp);

  return cleanup;
}

export function beginVerticalPanelResize({
  event,
  fitActiveTerminal,
  handle,
  leftCol,
  mainLayout,
}: {
  event: ResizeStartEvent;
  fitActiveTerminal: () => void;
  handle: HTMLElement | null;
  leftCol: HTMLElement | null;
  mainLayout: HTMLElement | null;
}): ResizeCleanup | null {
  if (!handle || !leftCol || !mainLayout) return null;

  event.preventDefault();
  const startX = event.clientX;
  const startWidth = leftCol.offsetWidth;
  const onMouseMove = (moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - startX;
    const newWidth = Math.max(280, Math.min(startWidth + deltaX, mainLayout.clientWidth - 306));
    leftCol.style.width = `${newWidth}px`;
    fitActiveTerminal();
  };

  return installDocumentResizeSession(handle, 'col-resize', onMouseMove);
}

export function beginHorizontalPanelResize({
  agentListPanel,
  event,
  handle,
  leftCol,
  officePanel,
}: {
  agentListPanel: HTMLElement | null;
  event: ResizeStartEvent;
  handle: HTMLElement | null;
  leftCol: HTMLElement | null;
  officePanel: HTMLElement | null;
}): ResizeCleanup | null {
  if (!handle || !officePanel || !agentListPanel || !leftCol) return null;

  event.preventDefault();
  const startY = event.clientY;
  const startOfficeHeight = officePanel.offsetHeight;
  const totalHeight = leftCol.offsetHeight;
  const onMouseMove = (moveEvent: MouseEvent) => {
    const deltaY = moveEvent.clientY - startY;
    const newOfficeHeight = Math.max(150, Math.min(startOfficeHeight + deltaY, totalHeight - 106));
    officePanel.style.flex = 'none';
    officePanel.style.height = `${newOfficeHeight}px`;
    agentListPanel.style.flex = '1';
  };

  return installDocumentResizeSession(handle, 'row-resize', onMouseMove);
}
