// @ts-nocheck

export function setupTerminalResizableHandles(fitActiveTerminal) {
  const resizeVertical = document.getElementById('resizeV');
  const leftCol = document.getElementById('leftCol');
  const mainLayout = document.getElementById('mainLayout');

  if (resizeVertical && leftCol && mainLayout) {
    let startX;
    let startWidth;
    const onMouseMove = (event) => {
      const deltaX = event.clientX - startX;
      const newWidth = Math.max(280, Math.min(startWidth + deltaX, mainLayout.clientWidth - 306));
      leftCol.style.width = `${newWidth}px`;
      fitActiveTerminal();
    };
    const onMouseUp = () => {
      resizeVertical.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    resizeVertical.addEventListener('mousedown', (event) => {
      event.preventDefault();
      startX = event.clientX;
      startWidth = leftCol.offsetWidth;
      resizeVertical.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  const resizeHorizontal = document.getElementById('resizeH');
  const officePanel = document.getElementById('officePanel');
  const agentListPanel = document.getElementById('agentListPanel');
  if (resizeHorizontal && officePanel && agentListPanel && leftCol) {
    let startY;
    let startOfficeHeight;
    let totalHeight;
    const onMouseMove = (event) => {
      const deltaY = event.clientY - startY;
      const newOfficeHeight = Math.max(150, Math.min(startOfficeHeight + deltaY, totalHeight - 106));
      officePanel.style.flex = 'none';
      officePanel.style.height = `${newOfficeHeight}px`;
      agentListPanel.style.flex = '1';
    };
    const onMouseUp = () => {
      resizeHorizontal.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    resizeHorizontal.addEventListener('mousedown', (event) => {
      event.preventDefault();
      startY = event.clientY;
      startOfficeHeight = officePanel.offsetHeight;
      totalHeight = leftCol.offsetHeight;
      resizeHorizontal.classList.add('dragging');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
}
