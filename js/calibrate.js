/* Calibration helper page (calibrate.html). Pixel positions are measured
 * from the image's top-left corner; on the Leaflet map that is
 * lng = x, lat = -y (see coords.js). */

import { loadManifest } from './manifest.js';
import { createBaseLayer, createProjection, imageBounds, DEFAULT_IMAGE_SIZE } from './coords.js';
import { fetchObjects, getTypeStyle, objectType } from './markers.js';
import { fitCalibration, parseGamePosition, roundCalibration } from './calibration.js';
import { SmoothWheelZoom } from './wheelzoom.js';

const STORAGE_PREFIX = 'slymap.calibrate.';

const manifest = await loadManifest();

const map = L.map('calib-map', {
  crs: L.CRS.Simple,
  attributionControl: false,
  zoomSnap: 0.25,
  scrollWheelZoom: false, // replaced by smoothWheelZoom
  minZoom: -4,
  maxZoom: 3,
});
map.addHandler('smoothWheelZoom', SmoothWheelZoom);
map.smoothWheelZoom.enable();

const $ = (selector) => document.querySelector(selector);
const mapSelect = $('#map-select');
const imageInfo = $('#image-info');
const objectsInfo = $('#objects-info');
const showObjects = $('#show-objects');
const pointsBody = $('#points tbody');
const placingNote = $('#placing');
const result = $('#result');

const state = {
  source: null,     // { kind: 'map', def } or { kind: 'file', name, url }
  size: null,       // [height, width]
  base: null,       // image layer
  points: [],       // { id, pixel: [x, y], gameText, game: [x, y] | null, label }
  objects: [],      // { label, color, game: [x, y] }
  placing: null,    // object waiting to be placed with a click
  selected: null,   // point id
  nextId: 1,
};
const pointLayer = L.layerGroup().addTo(map);
const errorLayer = L.layerGroup().addTo(map);
const objectLayer = L.layerGroup().addTo(map);

const toLatLng = ([x, y]) => L.latLng(-y, x);
const toPixel = (latlng) => [latlng.lng, -latlng.lat];
const round1 = (value) => Math.round(value * 10) / 10;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

/* ------------------------------------------------------------ storage */

function storageKey() {
  if (!state.source) {
    return null;
  }
  return STORAGE_PREFIX + (state.source.kind == 'map' ? state.source.def.key : 'file:' + state.source.name);
}

function savePoints() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state.points.map(({ pixel, gameText, label }) =>
      ({ pixel, gameText, label }))));
  } catch {
    // not remembered in private mode
  }
}

function restorePoints() {
  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem(storageKey()) ?? '[]');
  } catch {
    saved = [];
  }
  state.points = saved.map((point) => ({ ...point, id: state.nextId++, game: parseGamePosition(point.gameText) }));
}

/* --------------------------------------------------------- the image */

function setImage(source, size, base) {
  state.base?.remove();
  state.source = source;
  state.size = size;
  state.base = base.addTo(map);
  state.objects = [];
  state.placing = null;
  state.selected = null;
  map.fitBounds(imageBounds(size));
  imageInfo.textContent = `${source.kind == 'map' ? source.def.image : source.name} · ${size[1]} × ${size[0]} px`;
  restorePoints();
  render();
}

function openMap(key) {
  const def = manifest.maps.get(key);
  if (!def) {
    return;
  }
  mapSelect.value = key;
  history.replaceState(null, '', `?map=${encodeURIComponent(key)}`);
  const size = def.assets?.size ?? def.size ?? DEFAULT_IMAGE_SIZE;
  setImage({ kind: 'map', def }, size, createBaseLayer(def, imageBounds(size), manifest.assetBase, map));
  loadObjects(def.data.map((file) => fetchObjects(file)), `the map's data (${def.data.length} file${def.data.length == 1 ? '' : 's'})`);
}

/* Resolves once the image is shown (or could not be opened). */
function openImageFile(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  return new Promise((resolve) => {
    image.onload = () => {
      if (state.source?.kind == 'file') {
        URL.revokeObjectURL(state.source.url);
      }
      mapSelect.value = '';
      history.replaceState(null, '', window.location.pathname);
      const size = [image.naturalHeight, image.naturalWidth];
      setImage({ kind: 'file', name: file.name, url }, size, L.imageOverlay(url, imageBounds(size)));
      resolve();
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      imageInfo.textContent = `${file.name} could not be opened as an image.`;
      resolve();
    };
    image.src = url;
  });
}

/* ------------------------------------------------------------ objects */

async function loadObjects(filePromises, from) {
  const source = state.source;
  const files = await Promise.all(filePromises);
  if (source !== state.source) {
    return;
  }
  const objects = [];
  files.flat().forEach((item) => {
    const params = item.parameters ?? {};
    // areas and lines are placed differently; points are enough here
    if (!Array.isArray(item.position) || params.vertices || params.points || params.size || params.extents) {
      return;
    }
    const style = getTypeStyle(manifest.markerTypes, objectType(item));
    objects.push({
      label: item.name ?? params.jobName ?? style.label,
      color: style.color,
      game: [item.position[0], item.position[1]],
    });
  });
  state.objects = state.objects.concat(objects);
  objectsInfo.textContent = `${state.objects.length} objects loaded (latest from ${from}).`;
  render();
}

async function readHsonFile(file) {
  try {
    return JSON.parse(await file.text())?.objects ?? [];
  } catch {
    objectsInfo.textContent = `${file.name} is not valid .hson / JSON.`;
    return [];
  }
}

/* ------------------------------------------------------------- points */

function addPoint(pixel, gameText = '', label = '') {
  const point = { id: state.nextId++, pixel, gameText, game: parseGamePosition(gameText), label };
  state.points.push(point);
  state.selected = point.id;
  savePoints();
  render();
  if (!gameText) {
    pointsBody.querySelector(`tr[data-id="${point.id}"] input`)?.focus();
  }
}

function startPlacing(object) {
  state.placing = object;
  map.closePopup();
  render();
}

/* The fit from the points, or the map's current calib to start from. */
function currentFit() {
  const fit = fitCalibration(state.points.filter((point) => point.game));
  if (fit) {
    return { ...fit, fromPoints: true };
  }
  const calib = state.source?.kind == 'map' && state.source.def.calib;
  return calib ? { origin: calib.origin, scale: calib.scale, flip: calib.flip, rotate: calib.rotate, fromPoints: false } : null;
}

/* ------------------------------------------------------------- render */

function errorClass(error) {
  return error < 5 ? 'error-good' : error < 15 ? 'error-ok' : 'error-bad';
}

function render() {
  const fit = currentFit();
  const usable = state.points.filter((point) => point.game);
  const residualOf = (point) => fit?.fromPoints && point.game ? fit.residuals[usable.indexOf(point)] : null;

  // table
  pointsBody.innerHTML = state.points.map((point, index) => {
    const residual = residualOf(point);
    return `<tr data-id="${point.id}" class="${point.id === state.selected ? 'selected' : ''}">
      <td>${index + 1}</td>
      <td><input type="text" value="${escapeHtml(point.gameText)}" placeholder="X, Y"
            aria-label="In-game X, Y of point ${index + 1}" class="${point.gameText && !point.game ? 'invalid' : ''}">
          <span class="point-label">${escapeHtml(point.label || `pixel ${round1(point.pixel[0])}, ${round1(point.pixel[1])}`)}</span></td>
      <td>${residual === null ? '' : `<span class="${errorClass(residual)}">${residual.toFixed(1)} px</span>`}</td>
      <td><button type="button" class="remove" aria-label="Remove point ${index + 1}">✕</button></td>
    </tr>`;
  }).join('');
  $('#no-points').hidden = state.points.length > 0;

  // point markers and their error lines
  pointLayer.clearLayers();
  errorLayer.clearLayers();
  state.points.forEach((point, index) => {
    const marker = L.marker(toLatLng(point.pixel), {
      draggable: true,
      icon: L.divIcon({
        className: 'calib-point' + (point.id === state.selected ? ' selected' : ''),
        html: `<span>${index + 1}</span>`,
        iconSize: null,
      }),
      title: `Point ${index + 1}`,
    }).addTo(pointLayer);
    marker.on('dragend', () => {
      point.pixel = toPixel(marker.getLatLng()).map(round1);
      savePoints();
      render();
    });
    marker.on('click', () => {
      state.selected = point.id;
      render();
    });
    if (fit && point.game) {
      const predicted = createProjection(fit).toLatLng(point.game);
      L.polyline([toLatLng(point.pixel), predicted], { color: '#ff6b6b', weight: 2, dashArray: '4 4', interactive: false })
        .addTo(errorLayer);
      L.circleMarker(predicted, { radius: 4, color: '#ff6b6b', weight: 2, fill: false, interactive: false })
        .addTo(errorLayer);
    }
  });

  // objects where the fit puts them
  objectLayer.clearLayers();
  if (fit && showObjects.checked) {
    const projection = createProjection(fit);
    state.objects.forEach((object) => {
      const marker = L.circleMarker(projection.toLatLng(object.game), {
        radius: 6, color: '#000', weight: 1, fillColor: object.color, fillOpacity: 0.85,
        bubblingMouseEvents: false, // a click opens the popup, it doesn't add a point
        interactive: !state.placing, // while placing, every click places
      }).addTo(objectLayer);
      const popup = document.createElement('div');
      popup.innerHTML = `<strong>${escapeHtml(object.label)}</strong><br>In-game ${object.game.join(', ')}<br>
        <button type="button">Use as reference point</button>`;
      popup.querySelector('button').addEventListener('click', () => startPlacing(object));
      marker.bindPopup(popup);
    });
  }

  // placing mode
  placingNote.hidden = !state.placing;
  $('#calib-map').classList.toggle('placing', !!state.placing);
  if (state.placing) {
    placingNote.innerHTML = `Click where <strong>${escapeHtml(state.placing.label)}</strong>
      (${state.placing.game.join(', ')}) really is on the image. <button type="button">Cancel</button>`;
    placingNote.querySelector('button').addEventListener('click', () => {
      state.placing = null;
      render();
    });
  }

  renderResult(fit);
}

function renderResult(fit) {
  if (!fit) {
    result.innerHTML = '<p class="hint">Add at least two points with in-game positions.</p>';
    return;
  }
  if (!fit.fromPoints) {
    result.innerHTML = `<p class="hint">Showing objects with the map's current calibration
      (origin ${fit.origin.join(', ')}, scale ${fit.scale}${fit.flip ? `, flip ${fit.flip}` : ''}${fit.rotate ? `, rotate ${fit.rotate}` : ''}). Add two or more points to fit a new one.</p>`;
    return;
  }
  const calib = roundCalibration(fit);
  const isDefaultSize = state.size[0] == DEFAULT_IMAGE_SIZE[0] && state.size[1] == DEFAULT_IMAGE_SIZE[1];
  const snippet = `"calib": { "origin": [${calib.origin.join(', ')}], "scale": ${calib.scale}` +
    (calib.flip ? `, "flip": "${calib.flip}"` : '') + (calib.rotate ? `, "rotate": ${calib.rotate}` : '') + ' }' +
    (isDefaultSize ? '' : `,\n"size": [${state.size.join(', ')}]`);
  const current = state.source.kind == 'map' ? state.source.def.calib : null;

  result.innerHTML = `
    <dl>
      <dt>Origin</dt><dd>${calib.origin.join(', ')}</dd>
      <dt>Scale</dt><dd>${calib.scale} px per unit</dd>
      ${calib.flip ? `<dt>Flipped</dt><dd>${calib.flip.toUpperCase()} axis</dd>` : ''}
      ${calib.rotate ? `<dt>Turned</dt><dd>${calib.rotate}° clockwise</dd>` : ''}
      <dt>Points</dt><dd>${fit.residuals.length}</dd>
      <dt>Off by</dt><dd><span class="${errorClass(fit.meanError)}">${fit.meanError.toFixed(1)} px</span> on average,
        <span class="${errorClass(fit.maxError)}">${fit.maxError.toFixed(1)} px</span> at most</dd>
      ${current ? `<dt>Now in games.json</dt><dd>${current.origin.join(', ')} · ${current.scale}${current.flip ? ` · flip ${current.flip}` : ''}${current.rotate ? ` · rotate ${current.rotate}` : ''}</dd>` : ''}
    </dl>
    ${fit.warnings.map((warning) => `<p class="warning">${escapeHtml(warning)}</p>`).join('')}
    <p class="hint">Paste into the map's entry in <code>data/games.json</code>:</p>
    <pre id="snippet">${escapeHtml(snippet)}</pre>
    <button type="button" id="copy-snippet">Copy</button>`;
  $('#copy-snippet').addEventListener('click', async (event) => {
    try {
      await navigator.clipboard.writeText(snippet);
      event.target.textContent = 'Copied';
    } catch {
      getSelection().selectAllChildren($('#snippet'));
      event.target.textContent = 'Press Ctrl+C to copy';
    }
  });
}

/* ------------------------------------------------------------- events */

map.on('click', (event) => {
  if (!state.source) {
    return;
  }
  const pixel = toPixel(event.latlng).map(round1);
  if (state.placing) {
    const object = state.placing;
    state.placing = null;
    addPoint(pixel, object.game.join(', '), object.label);
  } else {
    addPoint(pixel);
  }
});

pointsBody.addEventListener('input', (event) => {
  const row = event.target.closest('tr');
  const point = state.points.find((p) => p.id == row?.dataset.id);
  if (!point || event.target.tagName != 'INPUT') {
    return;
  }
  point.gameText = event.target.value;
  point.game = parseGamePosition(point.gameText);
  savePoints();
});

// re-render when the user leaves a field, so typing isn't interrupted
pointsBody.addEventListener('change', () => render());
pointsBody.addEventListener('keydown', (event) => {
  if (event.key == 'Enter' && event.target.tagName == 'INPUT') {
    event.target.blur(); // fires 'change', which renders
  }
});

pointsBody.addEventListener('click', (event) => {
  const row = event.target.closest('tr');
  const point = state.points.find((p) => p.id == row?.dataset.id);
  if (!point) {
    return;
  }
  if (event.target.closest('button.remove')) {
    state.points = state.points.filter((p) => p !== point);
    savePoints();
    render();
  } else if (state.selected !== point.id) {
    state.selected = point.id;
    map.panTo(toLatLng(point.pixel));
    render();
    pointsBody.querySelector(`tr[data-id="${point.id}"] input`)?.focus();
  }
});

$('#clear-points').addEventListener('click', () => {
  if (state.points.length && confirm('Remove all reference points for this image?')) {
    state.points = [];
    savePoints();
    render();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key == 'Escape' && state.placing) {
    state.placing = null;
    render();
  }
});

mapSelect.addEventListener('change', () => openMap(mapSelect.value));
$('#image-file').addEventListener('change', (event) => {
  if (event.target.files[0]) {
    openImageFile(event.target.files[0]);
  }
});
$('#hson-file').addEventListener('change', (event) => {
  const files = [...event.target.files];
  if (!state.source) {
    objectsInfo.textContent = 'Open an image first.';
    return;
  }
  loadObjects(files.map(readHsonFile), files.map((file) => file.name).join(', '));
  event.target.value = '';
});
showObjects.addEventListener('change', () => render());

// dropping an image or .hson files onto the map
const mapElement = $('#calib-map');
mapElement.addEventListener('dragover', (event) => event.preventDefault());
mapElement.addEventListener('drop', async (event) => {
  event.preventDefault();
  const files = [...event.dataTransfer.files];
  const image = files.find((file) => file.type.startsWith('image/'));
  if (image) {
    await openImageFile(image);
  }
  const data = files.filter((file) => /\.(hson|json)$/i.test(file.name));
  if (data.length && state.source) {
    loadObjects(data.map(readHsonFile), data.map((file) => file.name).join(', '));
  }
});

// mouse position as image pixel and, with a fit, in-game position
const Readout = L.Control.extend({
  options: { position: 'bottomleft' },
  onAdd() {
    this._div = L.DomUtil.create('div', 'calib-readout');
    return this._div;
  },
  update(latlng) {
    const pixel = toPixel(latlng);
    const fit = currentFit();
    const game = fit ? createProjection(fit).toGame(latlng) : null;
    this._div.textContent = `pixel ${Math.round(pixel[0])}, ${Math.round(pixel[1])}` +
      (game ? ` · in-game ${game[0]}, ${game[1]}` : '');
  },
});
const readout = new Readout().addTo(map);
map.on('mousemove', (event) => readout.update(event.latlng));

// map list
manifest.games.filter((game) => game.entries.length).forEach((game) => {
  const group = document.createElement('optgroup');
  group.label = game.title;
  game.entries.forEach((entry) => group.append(new Option(entry.name, entry.key)));
  mapSelect.append(group);
});

map.setView([-2048, 2048], -2);
const startKey = new URLSearchParams(window.location.search).get('map');
if (startKey) {
  openMap(startKey);
} else {
  render();
}
