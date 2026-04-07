const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_LAYOUT,
  loadOfficeLayoutManifest,
  resolveOfficeLayoutAssetPath,
  toClientAssetUrl,
} = require('../src/officeLayout');

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
    expect(layout.assets.background).toBe('/api/office-layout/assets/map/bg.webp');
    expect(layout.assets.laptopStates.down.open).toBe('/api/office-layout/assets/objects/laptop-down-open.webp');
    expect(layout.assets.laptopStates.up.open).toBe(DEFAULT_LAYOUT.assets.laptopStates.up.open);
    expect(layout.seatMap['99']).toEqual({ dir: 'left', animType: 'stand' });
    expect(layout.idleSeatMap['42']).toBe('dance');
    expect(layout.laptopSeatMap['3']).toBe(99);
    expect(layout.decor).toEqual([
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

  test('rejects traversal outside the configured layout directory', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-office-layout-'));
    process.env.AGENT_OFFICE_LAYOUT_DIR = tempDir;

    expect(resolveOfficeLayoutAssetPath('map/bg.webp')).toBe(path.join(tempDir, 'map', 'bg.webp'));
    expect(resolveOfficeLayoutAssetPath('../secret.txt')).toBeNull();
  });

  test('passes through public and remote asset URLs unchanged', () => {
    expect(toClientAssetUrl('/public/office/map/office_bg_32.webp')).toBe('/public/office/map/office_bg_32.webp');
    expect(toClientAssetUrl('https://example.com/office.webp')).toBe('https://example.com/office.webp');
  });
});
