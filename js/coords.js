/* Converts between in-game horizontal coordinates [x, y] and Leaflet
 * CRS.Simple positions on the map image. Each map is calibrated with the
 * image pixel of the game origin and the pixels-per-game-unit scale. */

export const DEFAULT_IMAGE_SIZE = [4096, 4096];

export function createProjection({ origin: [originX, originY], scale }) {
  return {
    toLatLng: ([x, y]) => L.latLng(originY - scale * y, originX + scale * x),
    toGame: (latlng) => [
      Math.round((latlng.lng - originX) / scale),
      Math.round((originY - latlng.lat) / scale),
    ],
    toMapLength: (length) => length * scale,
    toGameLength: (length) => length / scale,
  };
}
