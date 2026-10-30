/* Converts between in-game horizontal coordinates [x, y] and Leaflet
 * CRS.Simple positions on the map image. Each map is calibrated with the
 * image pixel (from the top-left corner) of the game origin and the
 * pixels-per-game-unit scale. Game +X runs right and +Y down the image,
 * unless the calib turns the game axes: `flip` ("x" or "y") reverses that
 * axis, then `rotate` (90, 180 or 270) turns them clockwise on the image.
 *
 * At zoom 0 one map unit is one image pixel; the image's top-left corner
 * is at (0, 0) and lat goes negative downwards, which lines up with how
 * the tile pyramid is cut. */

export const DEFAULT_IMAGE_SIZE = [4096, 4096];

export function imageBounds([height, width]) {
  return L.latLngBounds([-height, 0], [0, width]);
}

/* Game [x, y] -> image-aligned [right, down] for a calib's flip and
 * rotate, and back. */
export function createOrientation({ flip, rotate = 0 }) {
  const signX = flip == 'x' ? -1 : 1;
  const signY = flip == 'y' ? -1 : 1;
  const turns = (((rotate / 90) % 4) + 4) % 4;
  return {
    toImage: ([x, y]) => {
      let [u, v] = [signX * x, signY * y];
      for (let i = 0; i < turns; i++) {
        [u, v] = [-v, u];
      }
      return [u, v];
    },
    toGame: ([u, v]) => {
      for (let i = 0; i < turns; i++) {
        [u, v] = [v, -u];
      }
      return [signX * u, signY * v];
    },
  };
}

export function createProjection(calib) {
  const { origin: [originX, originY], scale } = calib;
  const orientation = createOrientation(calib);
  // show positions to about a pixel: whole units on most maps, decimals on zoomed-in ones
  const factor = 10 ** Math.max(0, Math.ceil(Math.log10(scale)));
  const round = (value) => Math.round(value * factor) / factor;
  return {
    toLatLng: (game) => {
      const [u, v] = orientation.toImage(game);
      return L.latLng(-(originY + scale * v), originX + scale * u);
    },
    toGame: (latlng) => orientation.toGame([
      (latlng.lng - originX) / scale,
      (-latlng.lat - originY) / scale,
    ]).map(round),
    toMapLength: (length) => length * scale,
    toGameLength: (length) => length / scale,
  };
}

/* The map image: tiles when `npm run tiles` has built them, otherwise the
 * whole image. */
export function createBaseLayer(def, bounds, assetBase, map) {
  const tiles = def.assets;
  if (!tiles) {
    return L.imageOverlay(assetBase + def.image, bounds);
  }
  // the pyramid's last level is full size, which is map zoom 0
  return L.tileLayer(assetBase + tiles.tiles, {
    tileSize: tiles.tileSize,
    zoomOffset: tiles.levels,
    minNativeZoom: -tiles.levels,
    maxNativeZoom: 0,
    minZoom: map.getMinZoom(),
    maxZoom: map.getMaxZoom(),
    bounds,
    noWrap: true,
  });
}
