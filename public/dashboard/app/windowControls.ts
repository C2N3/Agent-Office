import { getDashboardAPI } from '../shared.js';

export function initPipControls() {
  const pipBtn = document.getElementById('pipToggleBtn');
  const pipPlaceholder = document.getElementById('pipPlaceholder');
  const pipStopBtn = document.getElementById('pipStopBtn');
  const officeCanvas = document.getElementById('office-canvas');

  function setPipState(isOpen: boolean) {
    if (pipBtn) pipBtn.classList.toggle('active', isOpen);
    if (pipPlaceholder) pipPlaceholder.style.display = isOpen ? 'flex' : 'none';
    if (officeCanvas) officeCanvas.style.display = isOpen ? 'none' : 'block';
  }

  const dashboardAPI = getDashboardAPI();
  pipBtn?.addEventListener('click', () => {
    dashboardAPI?.togglePip?.();
  });
  pipStopBtn?.addEventListener('click', () => {
    dashboardAPI?.togglePip?.();
  });
  dashboardAPI?.onPipStateChanged?.((isOpen: boolean) => {
    setPipState(isOpen);
  });
}

export function initOverlayControls() {
  const overlayBtn = document.getElementById('overlayToggleBtn');
  const dashboardAPI = getDashboardAPI();
  overlayBtn?.addEventListener('click', () => {
    dashboardAPI?.toggleOverlay?.();
  });
  dashboardAPI?.onOverlayStateChanged?.((isOpen: boolean) => {
    if (overlayBtn) overlayBtn.classList.toggle('active', isOpen);
  });
}
