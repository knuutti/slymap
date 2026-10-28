import { loadManifest } from './manifest.js';
import { createBaseLayer, createProjection, imageBounds, DEFAULT_IMAGE_SIZE } from './coords.js';
import { parseRoute, navigate, replaceRoute, migrateLegacyUrl } from './router.js';
import { loadMapLayers } from './markers.js';
import { MousePosition, ColorPicker, LayerPanel, LayerInfo } from './controls.js';
import { setupDrawing } from './draw.js';
import { createBrowse, createSidebar, isPlainClick } from './nav.js';

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

let current = null;   // { def, projection, base, links, layers, enabled, carried }
let loadToken = 0;    // ignores data that arrives after the user moved on
let savedView = null; // the map's view while the browse page is shown

const mousePosition = new MousePosition().addTo(map);
const drawing = setupDrawing(map, () => current.projection);
new ColorPicker((color) => drawing.setColor(color)).addTo(map);
const layerPanel = new LayerPanel(toggleLayer).addTo(map);
const layerInfo = new LayerInfo(() => setEnabledLayers([])).addTo(map);

// layers this map lacks stay selected for the next map that has them
const currentLayers = () => current ? [...current.enabled, ...current.carried] : [];

const sidebar = createSidebar(document.getElementById('sidebar'), manifest, {
  getLayers: currentLayers,
  onResize: () => map.invalidateSize(),
});
const browse = createBrowse(document.getElementById('browse'), manifest);

// "Open map" links in object popups keep the layers that are on
document.getElementById('map').addEventListener('click', (event) => {
  const link = event.target.closest('a[data-key]');
  if (link && isPlainClick(event)) {
    event.preventDefault();
    navigate(link.dataset.key, currentLayers());
  }
}, true);

map.on('mousemove', (event) => {
  if (current) {
    mousePosition.setPosition(current.projection.toGame(event.latlng));
  }
});

function setEnabledLayers(types) {
  current.enabled = new Set(types.filter((type) => current.layers?.[type]));
  current.carried = current.layers ? types.filter((type) => !current.layers[type]) : [];
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
  if (!document.body.classList.contains('browsing')) {
    replaceRoute(current.def.key, [...current.enabled]);
  }
}

function toggleLayer(type, on) {
  const types = new Set(current.enabled);
  if (on) {
    types.add(type);
  } else {
    types.delete(type);
  }
  setEnabledLayers([...types, ...current.carried]);
}

/* Labelled markers that open the maps this one links to. */
function createLinkLayer(def, projection) {
  const group = L.layerGroup();
  def.links.filter((link) => Array.isArray(link.at)).forEach((link) => {
    const label = document.createElement('span');
    label.textContent = link.label ?? link.target.name;
    L.marker(projection.toLatLng(link.at), {
      icon: L.divIcon({ className: 'map-link-marker', html: label, iconSize: null }),
      title: `Open map: ${link.target.name}`,
      riseOnHover: true,
      zIndexOffset: 1000,
    }).on('click', () => navigate(link.target.key, currentLayers())).addTo(group);
  });
  return group;
}

function unloadCurrentMap() {
  current.base.remove();
  current.links.remove();
  Object.values(current.layers ?? {}).forEach((layer) => layer.group.remove());
  drawing.clear();
}

function showBrowse(gameId) {
  if (!document.body.classList.contains('browsing') && current) {
    savedView = { center: map.getCenter(), zoom: map.getZoom() };
  }
  document.body.classList.add('browsing');
  browse.show(gameId);
}

function showRoute() {
  const route = parseRoute();
  const def = route.mapId && manifest.maps.get(route.mapKey);
  if (def) {
    return showMap(def, route.layers);
  }
  const game = manifest.findGame(route.gameId);
  if (route.gameId && (!game || route.mapId)) {
    // unknown game or map: show the closest page that exists
    replaceRoute(game?.id ?? '');
  }
  showBrowse(game?.id ?? null);
}

async function showMap(def, layers) {
  if (document.body.classList.contains('browsing')) {
    document.body.classList.remove('browsing');
    map.invalidateSize();
    if (savedView && current?.def === def) {
      map.setView(savedView.center, savedView.zoom, { animate: false });
    }
    savedView = null;
  }

  if (current?.def === def) {
    document.title = `${def.name} - SlyMap`;
    if (current.layers) {
      setEnabledLayers(layers);
    }
    return;
  }

  if (current) {
    unloadCurrentMap();
  }

  const token = ++loadToken;
  const bounds = imageBounds(def.assets?.size ?? def.size ?? DEFAULT_IMAGE_SIZE);
  current = {
    def,
    projection: createProjection(def.calib),
    base: createBaseLayer(def, bounds, manifest.assetBase, map).addTo(map),
    links: null,
    layers: null,
    enabled: new Set(layers),
    carried: [],
  };
  current.links = createLinkLayer(def, current.projection).addTo(map);
  map.setView(bounds.getCenter(), -1.5);
  sidebar.setMap(def);
  document.title = `${def.name} - SlyMap`;
  layerPanel.setLayers({}, current.enabled, 'Loading objects…');
  layerInfo.setEntries([]);

  const mapLayers = await loadMapLayers(def, current.projection, manifest.markerTypes,
    (key) => manifest.maps.get(key));
  if (token !== loadToken) {
    return;
  }
  current.layers = mapLayers;
  layerPanel.setLayers(mapLayers, current.enabled);
  setEnabledLayers(layers);
}

window.addEventListener('hashchange', showRoute);
showRoute();
