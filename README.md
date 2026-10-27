# SlyMap

Interactive maps for the Sly Cooper series. The map layout is based on SoniMap
(a Sonic Frontiers map).

## Running locally

The page loads its data with `fetch`, so serve the folder over HTTP:

```
python3 -m http.server
```

and open `http://localhost:8000/`. Maps are addressed as
`#/<game>/<map>?layers=Bottle,Job%20Triggers`; old `?map=paris` links are
redirected.

## Project layout

* `data/games.json` – every game, episode and map: display names, base image,
  coordinate calibration and object data files. Map keys are `<game>/<map>`.
  `assetBase` is prepended to image paths (point it at a CDN bucket to host
  images elsewhere).
* `data/marker-types.json` – icon / colour / label per object type. Types not
  listed get a fixed colour derived from their name.
* `hson/` – object data per map (`{"objects": [{type, position, parameters}]}`).
* `base_img/` – 4096x4096 map images.
* `js/` – the app (ES modules): `main.js` (map state), `router.js`,
  `manifest.js`, `coords.js`, `markers.js`, `controls.js`, `draw.js`.

## Adding a map

1. Put the image in `base_img/` and the object data in `hson/`.
2. Add an entry under the right game and episode in `data/games.json`:

   ```json
   { "id": "paris", "name": "Paris", "location": "Dimitri's nightclub, Paris", "kind": "hub",
     "image": "base_img/paris.png", "calib": { "origin": [1973, 2130], "scale": 0.1406 },
     "data": ["hson/paris.hson"] }
   ```

   `calib.origin` is the image pixel of the game origin and `calib.scale`
   is pixels per game unit. Optional `size: [height, width]` for images that
   are not 4096x4096.
3. New object types can be given an icon or colour in `data/marker-types.json`.

## Dependencies

* leaflet.js (linked from their CDN)
* [leaflet-canvas-markers](https://github.com/lipton-ice-tea/leaflet-canvas-markers)
* leaflet-draw
