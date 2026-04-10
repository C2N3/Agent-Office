# Custom Office Layouts

Agent-Office can replace the built-in office map, coordinate masks, laptop markers, and extra decor with a custom layout manifest.

## Where Agent-Office Looks

Runtime lookup order:

1. `AGENT_OFFICE_LAYOUT_DIR=<absolute-path>`
2. `dist/office-layout/manifest.json`
3. built-in default office assets

`AGENT_OFFICE_LAYOUT_DIR` takes precedence over the default runtime folder.

Important: the Electron app runs from `dist/`, so the automatic fallback folder is `dist/office-layout`, not the repository root. If you want to keep layouts elsewhere, point the app at them with `AGENT_OFFICE_LAYOUT_DIR`.

## What You Can Customize

- background and foreground map art
- collision mask for pathfinding
- coordinate mask for desk, meeting, and idle spots
- laptop marker mask and per-direction laptop sprites
- seat direction / sit-stand metadata
- idle animations for completed agents
- extra decor sprites rendered behind or in front of agents

The office system is image-driven. Most structure comes from swapping the mask images rather than editing code.

## Manifest Example

```json
{
  "name": "Loft Office",
  "mapScale": 2.1875,
  "tileSize": 70,
  "assets": {
    "background": "map/bg.webp",
    "foreground": "map/fg.webp",
    "coordinates": "map/coords.webp",
    "collision": "map/collision.webp",
    "laptopSpots": "objects/laptops.webp",
    "laptopStates": {
      "down": {
        "closed": "objects/laptop-front-closed.webp",
        "open": "objects/laptop-front-open.webp"
      },
      "up": {
        "closed": "objects/laptop-back-closed.webp",
        "open": "objects/laptop-back-open.webp"
      },
      "left": {
        "closed": "objects/laptop-left-closed.webp",
        "open": "objects/laptop-left-open.webp"
      },
      "right": {
        "closed": "objects/laptop-right-closed.webp",
        "open": "objects/laptop-right-open.webp"
      }
    }
  },
  "seatMap": {
    "10": { "dir": "right", "animType": "sit" },
    "24": { "dir": "up", "animType": "stand" }
  },
  "idleSeatMap": {
    "18": "right",
    "24": "dance"
  },
  "laptopSeatMap": {
    "0": 10,
    "1": 8
  },
  "decor": [
    {
      "id": "plant-a",
      "src": "decor/plant.webp",
      "x": 280,
      "y": 420,
      "layer": "fg",
      "scale": 1.2,
      "alpha": 0.95
    }
  ]
}
```

## Supported Fields

Top-level fields:

- `name`: display name for the layout
- `mapScale`: positive number used when rendering the office map
- `tileSize`: positive number used for pathfinding and coordinate snapping
- `assets`: map and laptop image sources
- `seatMap`: seat id to `{ dir, animType }`
- `idleSeatMap`: idle spot id to `up|down|left|right|dance`
- `laptopSeatMap`: laptop marker index to seat id
- `decor`: additional static sprites

Valid values:

- `dir`: `up`, `down`, `left`, `right`
- `animType`: `sit` or `stand`
- `decor.layer`: `bg` or `fg`

If a field is missing or invalid, Agent-Office falls back to the built-in default for that specific field.

## Asset Path Rules

Asset paths may be:

- relative to the chosen layout directory, for example `map/bg.webp`
- built-in app assets, for example `/public/office/map/office_bg_32.webp`
- remote `http://` or `https://` URLs

Relative asset paths are rewritten to local dashboard URLs such as:

```text
/api/office-layout/assets/map/bg.webp
```

Those asset requests are sandboxed to the chosen layout directory. Path traversal outside the layout directory is rejected.

## Mask Image Semantics

### `assets.collision`

- transparent pixel: walkable
- opaque pixel: blocked

### `assets.coordinates`

- green or black: idle spot
- blue: desk spot
- yellow: meeting spot

Meeting spots are currently stored in the same seat list as desk spots, after desk spots.

### `assets.laptopSpots`

- orange: laptop facing `left`
- cyan: laptop facing `down`
- magenta: laptop facing `up`
- blue: laptop facing `right`

Only one marker is used per snapped tile cell.

## Spot IDs And Mapping

`seatMap`, `idleSeatMap`, and `laptopSeatMap` use numeric ids generated from the parsed masks:

- desk spots are numbered first
- meeting spots are appended after desk spots
- idle spots are appended after that
- laptop spots are indexed in the order they are found in the laptop mask

If you change the mask images, the numeric ids used by these maps may need to change as well.

## Decor Items

Each `decor` entry supports:

- required: `src`, `x`, `y`
- optional: `id`
- optional: `layer`
- optional: `scale`
- optional: `width`, `height`
- optional: `alpha` from `0` to `1`

Decor defaults to the background layer when `layer` is omitted.

## Related Runtime Endpoints

- `GET /api/office-layout` returns the merged layout manifest the renderer will use
- `GET /api/office-layout/assets/<relative-path>` serves relative layout assets

## Notes

- There is no in-app office layout editor yet.
- A malformed `manifest.json` causes Agent-Office to fall back to the full default layout.
- Partial manifests are supported; you can override only the fields you need.
