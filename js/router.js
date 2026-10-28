/* Hash routes:
 *   #/                                    all games
 *   #/<game>                              one game's maps
 *   #/<game>/<map>?layers=Bottle,Alarms   a map
 * Page changes push a history entry (back/forward work), layer toggles
 * replace the current one. */

export function parseRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = hash.split('?');
  const layersParam = query.split('&').find((part) => part.startsWith('layers='));
  const layers = layersParam
    ? layersParam.slice('layers='.length).split(',').filter(Boolean).map(safeDecode)
    : [];
  const [gameId = '', mapId = ''] = path.split('/').filter(Boolean);
  return { gameId, mapId, mapKey: `${gameId}/${mapId}`, layers };
}

export function routeHash(path, layers = []) {
  const query = layers.length ? '?layers=' + layers.map(encodeURIComponent).join(',') : '';
  return `#/${path}${query}`;
}

/* path is '', a game id or a map key */
export function navigate(path, layers) {
  window.location.hash = routeHash(path, layers);
}

export function replaceRoute(path, layers) {
  history.replaceState(null, '', window.location.pathname + routeHash(path, layers));
}

/* Rewrites old ?map=paris&markers=Bottle links to the hash route. */
export function migrateLegacyUrl(manifest) {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('map') && !params.has('markers')) {
    return;
  }
  const map = manifest.findByMapId(params.get('map')) ?? manifest.maps.get(manifest.defaultKey);
  // markers were stored encodeURIComponent()'d a second time
  const layers = params.getAll('markers').map(safeDecode);
  if (!window.location.hash) {
    replaceRoute(map.key, layers);
  } else {
    history.replaceState(null, '', window.location.pathname + window.location.hash);
  }
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
