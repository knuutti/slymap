/* Hash routes: #/<game>/<map>?layers=Bottle,Job%20Triggers
 * Map changes push a history entry (back/forward switch maps),
 * layer toggles replace the current one. */

export function parseRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = hash.split('?');
  const layersParam = query.split('&').find((part) => part.startsWith('layers='));
  const layers = layersParam
    ? layersParam.slice('layers='.length).split(',').filter(Boolean).map(safeDecode)
    : [];
  return { mapKey: path.replace(/\/+$/, ''), layers };
}

export function routeHash(mapKey, layers = []) {
  const query = layers.length ? '?layers=' + layers.map(encodeURIComponent).join(',') : '';
  return `#/${mapKey}${query}`;
}

export function navigate(mapKey, layers) {
  window.location.hash = routeHash(mapKey, layers);
}

export function replaceRoute(mapKey, layers) {
  history.replaceState(null, '', window.location.pathname + routeHash(mapKey, layers));
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
