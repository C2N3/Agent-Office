const fs = require('fs');
const os = require('os');
const path = require('path');

import {
  DEFAULT_LAYOUT,
  loadOfficeLayoutManifest,
  resolveOfficeLayoutAssetPath,
  toClientAssetUrl,
} from '../src/officeLayout';

describe('officeLayout', () => {
  const originalDir = process.env.AGENT_OFFICE_LAYOUT_DIR;

  afterEach(() => {
    if (originalDir === undefined) delete process.env.AGENT_OFFICE_LAYOUT_DIR;
    else process.env.AGENT_OFFICE_LAYOUT_DIR = originalDir;
  });

  test('returns the built-in layout when no custom directory is configured', () => {
    delete process.env.AGENT_OFFICE_LAYOUT_DIR;
    expect(loadOfficeLayoutManifest()).toEqual(DEFAULT_LAYOUT);
  });

  test('loads a custom manifest and rewrites relative assets to API URLs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-office-layout-'));
    process.env.AGENT_OFFICE_LAYOUT_DIR = tempDir;

    fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify({
      name: 'Custom Office',
      mapScale: 3,
      tileSize: 96,
      assets: {
        background: 'map/bg.webp',
        coordinates: 'map/xy.webp',
        collision: 'map/collision.webp',
        laptopSpots: 'objects/laptop-spots.webp',
        laptopStates: {
          down: {
            closed: 'objects/laptop-down-closed.webp',
            open: 'objects/laptop-down-open.webp',
          },
        },
      },
      seatMap: {
        99: { dir: 'left', animType: 'stand' },
      },
      idleSeatMap: {
        42: 'dance',
      },
      laptopSeatMap: {
        3: 99,
      },
      decor: [
        { id: 'plant', src: 'decor/plant.webp', x: 120, y: 220, layer: 'fg', scale: 1.5 },
      ],
    }, null, 2));

    const layout = loadOfficeLayoutManifest();

    expect(layout.name).toBe('Custom Office');
    expect(layout.mapScale).toBe(3);
    expect(layout.tileSize).toBe(96);

    // Legacy top-level manifest fields are wrapped into a single room.
    expect(Array.isArray(layout.rooms)).toBe(true);
    expect(layout.rooms).toHaveLength(1);
    const room = layout.rooms[0];
    expect(room.id).toBe('room1');
    expect(room.assets.background).toBe('/api/office-layout/assets/map/bg.webp');
    expect(room.assets.laptopStates.down.open).toBe('/api/office-layout/assets/objects/laptop-down-open.webp');
    expect(room.assets.laptopStates.up.open).toBe(DEFAULT_LAYOUT.rooms[0].assets.laptopStates.up.open);
    expect(room.seatMap['99']).toEqual({ dir: 'left', animType: 'stand' });
    expect(room.idleSeatMap['42']).toBe('dance');
    expect(room.laptopSeatMap['3']).toBe(99);
    expect(room.decor).toEqual([
      {
        id: 'plant',
        src: '/api/office-layout/assets/decor/plant.webp',
        x: 120,
        y: 220,
        layer: 'fg',
        scale: 1.5,
      },
    ]);
  });

  test('accepts an explicit rooms array and places each room', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-office-layout-'));
    process.env.AGENT_OFFICE_LAYOUT_DIR = tempDir;

    fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify({
      name: 'Two Room Office',
      rooms: [
        {
          id: 'alpha',
          assets: { background: 'alpha/bg.webp' },
        },
        {
          id: 'beta',
          originX: 3000,
          assets: { background: 'beta/bg.webp' },
        },
      ],
    }, null, 2));

    const layout = loadOfficeLayoutManifest();
    expect(layout.rooms).toHaveLength(2);
    expect(layout.rooms[0].id).toBe('alpha');
    expect(layout.rooms[0].assets.background).toBe('/api/office-layout/assets/alpha/bg.webp');
    expect(layout.rooms[1].id).toBe('beta');
    expect(layout.rooms[1].originX).toBe(3000);
    expect(layout.rooms[1].assets.background).toBe('/api/office-layout/assets/beta/bg.webp');
  });

  test('rejects traversal outside the configured layout directory', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-office-layout-'));
    process.env.AGENT_OFFICE_LAYOUT_DIR = tempDir;

    expect(resolveOfficeLayoutAssetPath('map/bg.webp')).toBe(path.join(tempDir, 'map', 'bg.webp'));
    expect(resolveOfficeLayoutAssetPath('../secret.txt')).toBeNull();
  });

  test('passes through assets and remote asset URLs unchanged', () => {
    expect(toClientAssetUrl('/assets/office/map/office_bg_32.webp')).toBe('/assets/office/map/office_bg_32.webp');
    expect(toClientAssetUrl('https://example.com/office.webp')).toBe('https://example.com/office.webp');
  });
});
