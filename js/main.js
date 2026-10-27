import { loadManifest } from './manifest.js';
import { createProjection, DEFAULT_IMAGE_SIZE } from './coords.js';
import { parseRoute, navigate, replaceRoute, migrateLegacyUrl } from './router.js';
import { loadMapLayers } from './markers.js';
import { MapSwitcher, MousePosition, ColorPicker, LayerPanel, LayerInfo } from './controls.js';
import { setupDrawing } from './draw.js';

const manifest = await loadManifest();
migrateLegacyUrl(manifest);

/* One Leaflet map for the whole session; switching maps swaps its layers. */
const map = L.map('map', {
  crs: L.CRS.Simple,
  preferCanvas: true,
  attributionControl: false,
  zoomSnap: 0.25,
  minZoom: -3,
  maxZoom: 2,
});

let current = null;   // { def, projection, image, layers, enabled }
let loadToken = 0;    // ignores data that arrives after the user moved on

const mousePosition = new MousePosition().addTo(map);
const switcher = new MapSwitcher(manifest.games, (mapKey) => navigate(mapKey, [...current.enabled])).addTo(map);
const drawing = setupDrawing(map, () => current.projection);
new ColorPicker((color) => drawing.setColor(color)).addTo(map);
const layerPanel = new LayerPanel(toggleLayer).addTo(map);
const layerInfo = new LayerInfo(() => setEnabledLayers([])).addTo(map);

map.on('mousemove', (event) => {
  if (current) {
    mousePosition.setPosition(current.projection.toGame(event.latlng));
  }
});

function setEnabledLayers(types) {
  current.enabled = new Set(types.filter((type) => current.layers?.[type]));
  Object.entries(current.layers ?? {}).forEach(([type, layer]) => {
    if (current.enabled.has(type)) {
      layer.group.addTo(map);
    } else {
      layer.group.remove();
    }
  });
  layerPanel.setEnabled(current.enabled);
  layerInfo.setEntries([...current.enabled].map((type) => ({
    label: current.layers[type].label,
    count: current.layers[type].group.getLayers().length,
    highlight: current.layers[type].highlight,
  })));
  replaceRoute(current.def.key, [...current.enabled]);
}

function toggleLayer(type, on) {
  const types = new Set(current.enabled);
  if (on) {
    types.add(type);
  } else {
    types.delete(type);
  }
  setEnabledLayers([...types]);
}

function unloadCurrentMap() {
  current.image.remove();
  Object.values(current.layers ?? {}).forEach((layer) => layer.group.remove());
  drawing.clear();
}

async function showRoute() {
  const route = parseRoute();
  const def = manifest.maps.get(route.mapKey);
  if (!def) {
    replaceRoute(manifest.defaultKey, route.layers);
    return showRoute();
  }

  if (current?.def === def) {
    if (current.layers) {
      setEnabledLayers(route.layers);
    }
    return;
  }

  if (current) {
    unloadCurrentMap();
  }

  const token = ++loadToken;
  const [height, width] = def.size ?? DEFAULT_IMAGE_SIZE;
  const bounds = [[0, 0], [height, width]];
  current = {
    def,
    projection: createProjection(def.calib),
    image: L.imageOverlay(manifest.assetBase + def.image, bounds).addTo(map),
    layers: null,
    enabled: new Set(route.layers),
  };
  map.setView(L.latLngBounds(bounds).getCenter(), -1.5);
  switcher.setValue(def.key);
  document.title = `${def.name} - SlyMap`;
  layerPanel.setLayers({}, current.enabled);
  layerInfo.setEntries([]);

  const layers = await loadMapLayers(def, current.projection, manifest.markerTypes);
  if (token !== loadToken) {
    return;
  }
  current.layers = layers;
  layerPanel.setLayers(layers, current.enabled);
  setEnabledLayers(route.layers);
}

window.addEventListener('hashchange', showRoute);
showRoute();
