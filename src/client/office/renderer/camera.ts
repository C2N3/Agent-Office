
export function setupCameraControls(renderer, canvas, officeLayers) {
  const cam = renderer.camera;

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    renderer.clearFollow?.();
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width * canvas.width;
    const mouseY = (e.clientY - rect.top) / rect.height * canvas.height;

    const oldZoom = cam.zoom;
    const zoomDelta = e.deltaY < 0 ? 1.1 : 0.9;
    cam.zoom = Math.max(cam.minZoom, Math.min(cam.maxZoom, cam.zoom * zoomDelta));

    const zoomRatio = cam.zoom / oldZoom;
    cam.panX = mouseX - (mouseX - cam.panX) * zoomRatio;
    cam.panY = mouseY - (mouseY - cam.panY) * zoomRatio;
  }, { passive: false });

  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panStartX = 0;
  let panStartY = 0;
  let dragMoved = false;

  canvas.addEventListener('mousedown', function (e) {
    if (e.button !== 2) return;
    e.preventDefault();
    renderer.clearFollow?.();
    dragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = cam.panX;
    panStartY = cam.panY;
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
    const rect = canvas.getBoundingClientRect();
    cam.panX = panStartX + (dx / rect.width) * canvas.width;
    cam.panY = panStartY + (dy / rect.height) * canvas.height;
  });

  window.addEventListener('mouseup', function (e) {
    if (e.button === 2 && dragging) {
      dragging = false;
      canvas.style.cursor = '';
    }
  });

  canvas.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  canvas.addEventListener('click', function (e) {
    if (dragMoved) {
      e.stopImmediatePropagation();
      dragMoved = false;
    }
  }, true);

  canvas.addEventListener('dblclick', function () {
    renderer.clearFollow?.();
    const zoomX = canvas.width / officeLayers.width;
    const zoomY = canvas.height / officeLayers.height;
    cam.zoom = Math.max(cam.minZoom, Math.min(Math.min(zoomX, zoomY), cam.maxZoom));
    cam.panX = (canvas.width - officeLayers.width * cam.zoom) / 2;
    cam.panY = (canvas.height - officeLayers.height * cam.zoom) / 2;
  });
}

export function screenToWorld(renderer, clientX, clientY) {
  const rect = renderer.canvas.getBoundingClientRect();
  const canvasX = (clientX - rect.left) / rect.width * renderer.canvas.width;
  const canvasY = (clientY - rect.top) / rect.height * renderer.canvas.height;
  return {
    x: (canvasX - renderer.camera.panX) / renderer.camera.zoom,
    y: (canvasY - renderer.camera.panY) / renderer.camera.zoom,
  };
}
