/* Converts between in-game horizontal coordinates [x, y] and Leaflet
 * CRS.Simple positions on the map image. Each map is calibrated with the
 * image pixel (from the top-left corner) of the game origin and the
 * pixels-per-game-unit scale.
 *
 * At zoom 0 one map unit is one image pixel; the image's top-left corner
 * is at (0, 0) and lat goes negative downwards, which lines up with how
 * the tile pyramid is cut. */

export const DEFAULT_IMAGE_SIZE = [4096, 4096];

export function imageBounds([height, width]) {
  return L.latLngBounds([-height, 0], [0, width]);
}

export function createProjection({ origin: [originX, originY], scale }) {
  return {
    toLatLng: ([x, y]) => L.latLng(-(originY + scale * y), originX + scale * x),
    toGame: (latlng) => [
      Math.round((latlng.lng - originX) / scale),
      Math.round((-latlng.lat - originY) / scale),
    ],
    toMapLength: (length) => length * scale,
    toGameLength: (length) => length / scale,
  };
}
