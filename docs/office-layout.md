# Custom Office Layouts

Agent-Office can load a custom office layout from either:

- `./office-layout/manifest.json` in the project root
- `AGENT_OFFICE_LAYOUT_DIR=<absolute-path>` pointing at a layout folder

If neither exists, the built-in office assets are used.

## What You Can Customize

- Background and foreground office art
- Walkable collision map
- Desk and idle coordinates
- Laptop marker positions
- Seat facing and sit/stand metadata
- Extra decor sprites rendered behind or in front of agents

The current system is still image-driven. That means structure changes come from swapping the map masks:

- `coordinates`: desk, idle, and meeting spots
- `collision`: walkable vs blocked areas
- `laptopSpots`: where laptop sprites render

## Manifest Format

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
    "0": { "dir": "down", "animType": "sit" },
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

## Asset Paths

Manifest asset paths can be:

- Relative to the layout folder, like `map/bg.webp`
- Built-in app assets, like `/public/office/map/office_bg_32.webp`
- Remote URLs, like `https://...`

Relative paths are served through the local dashboard server and are sandboxed to the chosen layout directory.

## Decor Fields

Each `decor` item supports:

- `src`, `x`, `y`
- Optional `id`
- Optional `layer`: `bg` or `fg`
- Optional `scale`
- Optional `width`, `height`
- Optional `alpha`

## Notes

- There is no in-app layout editor yet.
- If a manifest field is omitted, Agent-Office falls back to the built-in default.
- Invalid relative asset paths outside the layout directory are rejected.
