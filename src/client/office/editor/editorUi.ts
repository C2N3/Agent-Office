/**
 * Editor UI — HTML overlay panel for the map editor.
 * Catalog browser, toolbar, floor selector. Injected into the office container.
 */

/* eslint-disable no-unused-vars */

import type { RoomTilemap, ObjectCatalog } from '../../../shared/tilemapSchema';
import { getObjectCatalog } from '../tilemap';
import { editorState } from './editorState';

let _panel: HTMLElement | null = null;
let _toolbar: HTMLElement | null = null;
let _onChangeCallback: (() => void) | null = null;

/** Set callback for when editor state changes (tilemap modified, need recomposite). */
export function setEditorChangeCallback(cb: () => void) {
  _onChangeCallback = cb;
}

function notifyChange() {
  if (_onChangeCallback) _onChangeCallback();
}

/** Create or show the editor UI. */
export function showEditorUi(container: HTMLElement, tilemap: RoomTilemap) {
  if (_panel) {
    _panel.style.display = '';
    _toolbar!.style.display = '';
    _updateCatalogList(tilemap);
    return;
  }

  // ── Toolbar (top bar) ──
  _toolbar = document.createElement('div');
  _toolbar.className = 'office-editor-toolbar';
  _toolbar.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:20;display:flex;gap:6px;padding:6px 12px;background:rgba(30,30,40,0.92);border-radius:8px;border:1px solid rgba(255,255,255,0.1);font-size:12px;color:#e2e8f0;user-select:none;';

  const tools = [
    { id: 'select', label: 'Select', icon: '↖' },
    { id: 'place', label: 'Place', icon: '+' },
    { id: 'delete', label: 'Delete', icon: '✕' },
  ];

  tools.forEach(function (t) {
    const btn = document.createElement('button');
    btn.dataset.tool = t.id;
    btn.textContent = t.icon + ' ' + t.label;
    btn.style.cssText = 'padding:4px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:transparent;color:#e2e8f0;cursor:pointer;font-size:12px;';
    btn.addEventListener('click', function () {
      editorState.setTool(t.id as any);
      _updateToolbarHighlight();
    });
    _toolbar!.appendChild(btn);
  });

  // Rotate button
  const rotateBtn = document.createElement('button');
  rotateBtn.textContent = '⟳ Rotate';
  rotateBtn.style.cssText = 'padding:4px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:transparent;color:#e2e8f0;cursor:pointer;font-size:12px;margin-left:8px;';
  rotateBtn.addEventListener('click', function () {
    if (editorState.selection) {
      const room = _getCurrentTilemap();
      if (room) {
        editorState.rotateSelection(room);
        notifyChange();
      }
    } else if (editorState.tool === 'place') {
      editorState.rotatePlacing();
    }
  });
  _toolbar.appendChild(rotateBtn);

  // Undo button
  const undoBtn = document.createElement('button');
  undoBtn.textContent = '↩ Undo';
  undoBtn.style.cssText = 'padding:4px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:transparent;color:#e2e8f0;cursor:pointer;font-size:12px;';
  undoBtn.addEventListener('click', function () {
    const room = _getCurrentTilemap();
    if (room && editorState.undo(room)) notifyChange();
  });
  _toolbar.appendChild(undoBtn);

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.textContent = '💾 Save';
  saveBtn.style.cssText = 'padding:4px 10px;border:1px solid #22c55e;border-radius:4px;background:rgba(34,197,94,0.15);color:#22c55e;cursor:pointer;font-size:12px;margin-left:8px;';
  saveBtn.addEventListener('click', function () {
    _saveTilemap();
  });
  _toolbar.appendChild(saveBtn);

  container.appendChild(_toolbar);

  // ── Side panel (catalog + floor selector) ──
  _panel = document.createElement('div');
  _panel.className = 'office-editor-panel';
  _panel.style.cssText = 'position:absolute;top:48px;left:8px;bottom:8px;width:180px;z-index:20;background:rgba(30,30,40,0.92);border-radius:8px;border:1px solid rgba(255,255,255,0.1);color:#e2e8f0;font-size:12px;overflow-y:auto;user-select:none;display:flex;flex-direction:column;';

  // Floor selector
  const floorSection = document.createElement('div');
  floorSection.style.cssText = 'padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.1);';
  const floorLabel = document.createElement('div');
  floorLabel.textContent = 'Floor';
  floorLabel.style.cssText = 'font-weight:600;margin-bottom:4px;color:#94a3b8;';
  floorSection.appendChild(floorLabel);

  const floorSelect = document.createElement('select');
  floorSelect.id = 'editor-floor-select';
  floorSelect.style.cssText = 'width:100%;padding:4px;background:#1e1e2e;color:#e2e8f0;border:1px solid rgba(255,255,255,0.2);border-radius:4px;font-size:12px;';
  const catalog = getObjectCatalog();
  if (catalog && catalog.floors) {
    Object.keys(catalog.floors).forEach(function (key) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = catalog!.floors[key].name;
      if (key === tilemap.floorType) opt.selected = true;
      floorSelect.appendChild(opt);
    });
  }
  floorSelect.addEventListener('change', function () {
    const room = _getCurrentTilemap();
    if (room) {
      editorState.setFloorType(room, floorSelect.value);
      notifyChange();
    }
  });
  floorSection.appendChild(floorSelect);
  _panel.appendChild(floorSection);

  // Catalog list container
  const catalogContainer = document.createElement('div');
  catalogContainer.id = 'editor-catalog-list';
  catalogContainer.style.cssText = 'flex:1;overflow-y:auto;padding:4px 0;';
  _panel.appendChild(catalogContainer);

  container.appendChild(_panel);

  _updateCatalogList(tilemap);
  _updateToolbarHighlight();
}

/** Hide editor UI. */
export function hideEditorUi() {
  if (_panel) _panel.style.display = 'none';
  if (_toolbar) _toolbar.style.display = 'none';
}

/** Destroy editor UI. */
export function destroyEditorUi() {
  if (_panel) { _panel.remove(); _panel = null; }
  if (_toolbar) { _toolbar.remove(); _toolbar = null; }
}

// ── Internal helpers ──

let _currentTilemapRef: RoomTilemap | null = null;

export function setCurrentTilemap(tm: RoomTilemap | null) {
  _currentTilemapRef = tm;
}

function _getCurrentTilemap(): RoomTilemap | null {
  return _currentTilemapRef;
}

function _updateToolbarHighlight() {
  if (!_toolbar) return;
  const buttons = _toolbar.querySelectorAll('button[data-tool]');
  buttons.forEach(function (btn: Element) {
    const b = btn as HTMLButtonElement;
    if (b.dataset.tool === editorState.tool) {
      b.style.background = 'rgba(59, 130, 246, 0.3)';
      b.style.borderColor = '#3b82f6';
    } else {
      b.style.background = 'transparent';
      b.style.borderColor = 'rgba(255,255,255,0.2)';
    }
  });
}

function _updateCatalogList(_tilemap: RoomTilemap) {
  const container = document.getElementById('editor-catalog-list');
  if (!container) return;
  container.innerHTML = '';

  const catalog = getObjectCatalog();
  if (!catalog) return;

  const categories = catalog.categories || [
    { id: 'wall', name: 'Walls' },
    { id: 'furniture', name: 'Furniture' },
    { id: 'decoration', name: 'Decoration' },
  ];

  categories.forEach(function (cat) {
    const section = document.createElement('div');
    section.style.cssText = 'padding:4px 10px;';

    const header = document.createElement('div');
    header.textContent = cat.name;
    header.style.cssText = 'font-weight:600;color:#94a3b8;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:2px;';
    section.appendChild(header);

    Object.keys(catalog!.objects).forEach(function (key) {
      const def = catalog!.objects[key];
      if (def.category !== cat.id) return;

      const item = document.createElement('div');
      item.style.cssText = 'padding:4px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:6px;';
      item.addEventListener('mouseenter', function () { item.style.background = 'rgba(255,255,255,0.08)'; });
      item.addEventListener('mouseleave', function () {
        item.style.background = editorState.placingObjectId === key ? 'rgba(59,130,246,0.2)' : 'transparent';
      });

      const name = document.createElement('span');
      name.textContent = def.name;
      name.style.cssText = 'flex:1;';
      item.appendChild(name);

      const size = document.createElement('span');
      size.textContent = def.widthTiles + 'x' + def.heightTiles;
      size.style.cssText = 'color:#64748b;font-size:10px;';
      item.appendChild(size);

      item.addEventListener('click', function () {
        editorState.startPlacing(key);
        _updateToolbarHighlight();
        _highlightCatalogItem(key);
      });

      item.dataset.objectId = key;
      section.appendChild(item);
    });

    container.appendChild(section);
  });
}

function _highlightCatalogItem(activeKey: string) {
  const container = document.getElementById('editor-catalog-list');
  if (!container) return;
  const items = container.querySelectorAll('[data-object-id]');
  items.forEach(function (el: Element) {
    const div = el as HTMLDivElement;
    div.style.background = div.dataset.objectId === activeKey ? 'rgba(59,130,246,0.2)' : 'transparent';
  });
}

async function _saveTilemap() {
  const tilemap = _getCurrentTilemap();
  if (!tilemap) return;

  try {
    const res = await fetch('/api/office-tilemap/' + encodeURIComponent(editorState.tilemapId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tilemap),
    });
    if (res.ok) {
      _showToast('Saved!', '#22c55e');
    } else {
      _showToast('Save failed: ' + res.status, '#ef4444');
    }
  } catch (e) {
    _showToast('Save failed', '#ef4444');
  }
}

function _showToast(message: string, color: string) {
  if (!_toolbar) return;
  const toast = document.createElement('span');
  toast.textContent = message;
  toast.style.cssText = 'color:' + color + ';padding:4px 8px;font-size:11px;animation:fadeIn 0.2s;';
  _toolbar.appendChild(toast);
  setTimeout(function () { toast.remove(); }, 2000);
}
