/* Collecting objects for .hson files on the calibration page: clicks on
 * the image become objects (points, paths, areas, boxes, circles) in the
 * game coordinates of the current fit. Objects are kept as image pixels,
 * so they follow the fit when it changes, and are turned into .hson
 * entries in the format markers.js draws:
 *
 *   point   position [x, y, z]
 *   others  position [x, z, y] with parameters.points / vertices / size,
 *           relative to it (the second map axis is position[2]) */

import { createProjection } from './coords.js';
import { createObjectLayer, getTypeStyle, objectType } from './markers.js';

const STORAGE_PREFIX = 'slymap.collect.';
const BOX_HEIGHT = 100; // vertical size of boxes and circles; not shown on the map

const KINDS = {
  point: { label: 'Point', hint: 'Click to place.' },
  path: { label: 'Path', min: 2, hint: 'Click each point; double-click, Enter or Finish to end. Backspace removes the last point.' },
  area: { label: 'Area', min: 3, hint: 'Click each corner; double-click, Enter or Finish to end. Backspace removes the last corner.' },
  box: { label: 'Box', clicks: 2, hint: 'Click two opposite corners.' },
  circle: { label: 'Circle', clicks: 2, hint: 'Click the centre, then a point on the edge.' },
};
// parameters that hold an object's shape, not copied from an example
const GEOMETRY_PARAMS = ['points', 'vertices', 'size', 'extents', 'radius', 'shape'];

const toLatLng = ([x, y]) => L.latLng(-y, x);
const toPixel = (latlng) => [Math.round(latlng.lng * 10) / 10, Math.round(-latlng.lat * 10) / 10];
const tidy = (value) => Math.round(value * 1000) / 1000;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function kindOf(item) {
  const params = item.parameters ?? {};
  if (params.points) return 'path';
  if (params.vertices) return 'area';
  if (params.shape == 'Capsule') return 'circle';
  if (params.size || params.extents) return 'box';
  return 'point';
}

/* JSON as the .hson files are written: two-space indent, arrays of plain
 * values on one line. */
export function formatJson(value, indent = '') {
  const inner = indent + '  ';
  if (Array.isArray(value)) {
    if (value.every((element) => element === null || typeof element != 'object')) {
      return '[' + value.map((element) => JSON.stringify(element)).join(', ') + ']';
    }
    return '[\n' + value.map((element) => inner + formatJson(element, inner)).join(',\n') + '\n' + indent + ']';
  }
  if (value && typeof value == 'object') {
    const entries = Object.entries(value);
    if (!entries.length) {
      return '{}';
    }
    return '{\n' + entries.map(([key, element]) => inner + JSON.stringify(key) + ': ' + formatJson(element, inner))
      .join(',\n') + '\n' + indent + '}';
  }
  return JSON.stringify(value);
}

/* Adds items to the end of a .hson file's objects, leaving the rest of the
 * text as it is. */
export function appendToHson(text, items) {
  const data = JSON.parse(text);
  const objects = Array.isArray(data.objects) ? data.objects : [];
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const entries = items.map((item) => '    ' + formatJson(item, '    ')).join(',\n').replace(/\n/g, eol);
  const end = text.lastIndexOf(']');
  if (Array.isArray(data.objects) && end >= 0) {
    const before = text.slice(0, end).replace(/\s*$/, '');
    const spliced = before + (objects.length ? ',' : '') + eol + entries + eol + '  ' + text.slice(end);
    try {
      if (JSON.parse(spliced).objects?.length == objects.length + items.length) {
        return spliced;
      }
    } catch {
      // objects isn't the last array in the file; rewrite it below
    }
  }
  return formatJson({ ...data, objects: [...objects, ...items] }).replace(/\n/g, eol) + eol;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* map: the Leaflet map; getFit() the current calib or null; imageId() a
 * name for the open image (null when none); getDataFiles() the map's
 * .hson files. */
export function setupCollector({ map, markerTypes, getFit, imageId, getDataFiles }) {
  const $ = (selector) => document.querySelector(selector);
  const typeInput = $('#collect-type');
  const typeList = $('#collect-types');
  const kindButtons = $('#collect-kinds');
  const kindHint = $('#collect-kind-hint');
  const nameInput = $('#collect-name');
  const zInput = $('#collect-z');
  const paramsInput = $('#collect-params');
  const drawingNote = $('#collect-drawing');
  const list = $('#collected');
  const exportBox = $('#collect-export');

  const state = {
    active: false,
    kind: 'point',
    items: [],      // { id, type, kind, pixels, name, z, params }
    drawing: null,  // pixels clicked so far for a path, area, box or circle
    cursor: null,   // mouse pixel, for the line to it while drawing
    examples: {},   // type -> an object of that type from the loaded data
    nextId: 1,
  };
  const layer = L.layerGroup().addTo(map);
  const drawingLayer = L.layerGroup().addTo(map);

  /* ---------------------------------------------------------- storage */

  function save() {
    const id = imageId();
    if (!id) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(state.items.map(({ id, ...item }) => item)));
    } catch {
      // not remembered in private mode
    }
  }

  function restore() {
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_PREFIX + imageId()) ?? '[]');
    } catch {
      saved = [];
    }
    state.items = saved.map((item) => ({ ...item, id: state.nextId++ }));
  }

  /* ----------------------------------------------------------- fields */

  function readParams() {
    const text = paramsInput.value.trim();
    if (!text) {
      return {};
    }
    try {
      const params = JSON.parse(text);
      return params && typeof params == 'object' && !Array.isArray(params) ? params : null;
    } catch {
      return null;
    }
  }

  function setKind(kind) {
    state.kind = kind;
    state.drawing = null;
    render();
  }

  /* An object of the chosen type in the map's data suggests its shape and
   * parameters. */
  function applyExample() {
    const example = state.examples[typeInput.value.trim()];
    if (!example) {
      return;
    }
    const params = Object.fromEntries(Object.entries(example.parameters ?? {})
      .filter(([key]) => !GEOMETRY_PARAMS.includes(key)));
    paramsInput.value = Object.keys(params).length ? JSON.stringify(params) : '';
    paramsInput.classList.remove('invalid');
    setKind(kindOf(example));
  }

  /* --------------------------------------------------------- geometry */

  /* The .hson entry for a collected object, or null without a fit. */
  function toItem(item, projection) {
    const game = item.pixels.map((pixel) => projection.toGame(toLatLng(pixel)));
    const z = Number(item.z) || 0;
    const [x, y] = game[0];
    const entry = { type: item.type };
    if (item.name) {
      entry.name = item.name;
    }
    const params = { ...item.params };

    if (item.kind == 'point') {
      entry.position = [x, y, z];
    } else if (item.kind == 'path' || item.kind == 'area') {
      entry.position = [x, z, y];
      params[item.kind == 'path' ? 'points' : 'vertices'] =
        game.map(([gx, gy]) => [tidy(gx - x), tidy(gy - y)]);
    } else if (item.kind == 'box') {
      const [[x1, y1], [x2, y2]] = game;
      entry.position = [tidy((x1 + x2) / 2), z, tidy((y1 + y2) / 2)];
      entry.rotation = [0, 0, 0, 1];
      params.size = [tidy(Math.abs(x2 - x1)), BOX_HEIGHT, tidy(Math.abs(y2 - y1))];
    } else if (item.kind == 'circle') {
      const radius = tidy(Math.hypot(game[1][0] - x, game[1][1] - y));
      entry.position = [x, z, y];
      Object.assign(params, { shape: 'Capsule', radius, size: [radius * 2, BOX_HEIGHT, radius * 2] });
    }
    entry.parameters = params;
    return entry;
  }

  function currentItems() {
    const fit = getFit();
    if (!fit) {
      return null;
    }
    const projection = createProjection(fit);
    return state.items.map((item) => toItem(item, projection));
  }

  /* ----------------------------------------------------------- adding */

  function add(pixels) {
    const params = readParams();
    const type = typeInput.value.trim();
    if (!type || !params) {
      drawingNote.hidden = false;
      drawingNote.textContent = !type ? 'Give the object a type first.' : 'The parameters are not valid JSON.';
      (type ? paramsInput : typeInput).focus();
      return;
    }
    state.items.push({
      id: state.nextId++,
      type,
      kind: state.kind,
      pixels,
      name: nameInput.value.trim(),
      z: zInput.value,
      params,
    });
    state.drawing = null;
    save();
    render();
  }

  function finishDrawing() {
    const drawing = state.drawing;
    if (!drawing) {
      return;
    }
    if (drawing.length >= (KINDS[state.kind].min ?? 0)) {
      add(drawing);
    }
  }

  function click(latlng) {
    if (!getFit()) {
      drawingNote.hidden = false;
      drawingNote.textContent = 'There is no fit yet: calibrate the image first.';
      return;
    }
    const pixel = toPixel(latlng);
    const kind = KINDS[state.kind];
    if (state.kind == 'point') {
      add([pixel]);
      return;
    }
    const drawing = state.drawing ?? [];
    const last = drawing[drawing.length - 1];
    // the second click of a double-click lands on the same spot
    if (last && Math.hypot(last[0] - pixel[0], last[1] - pixel[1]) < 1) {
      return;
    }
    state.drawing = [...drawing, pixel];
    if (kind.clicks && state.drawing.length == kind.clicks) {
      add(state.drawing);
    } else {
      render();
    }
  }

  /* ------------------------------------------------------------ render */

  function renderDrawing() {
    drawingLayer.clearLayers();
    const drawing = state.drawing;
    if (!drawing) {
      return;
    }
    const style = { color: '#f2c14e', weight: 2, dashArray: '6 4', interactive: false };
    const latlngs = drawing.map(toLatLng);
    const cursor = state.cursor && toLatLng(state.cursor);
    if (state.kind == 'box' && cursor) {
      L.rectangle(L.latLngBounds(latlngs[0], cursor), style).addTo(drawingLayer);
    } else if (state.kind == 'circle' && cursor) {
      L.circle(latlngs[0], { ...style, radius: latlngs[0].distanceTo(cursor) }).addTo(drawingLayer);
    } else {
      const line = cursor ? [...latlngs, cursor] : latlngs;
      (state.kind == 'area' ? L.polygon : L.polyline)(line, style).addTo(drawingLayer);
    }
    latlngs.forEach((latlng) => L.circleMarker(latlng, {
      radius: 4, color: '#f2c14e', weight: 2, fillColor: '#000', fillOpacity: 1, interactive: false,
    }).addTo(drawingLayer));
  }

  function renderList(items) {
    list.innerHTML = state.items.map((item, index) => {
      const entry = items?.[index];
      const where = entry ? entry.position.filter((_, i) => item.kind == 'point' ? i < 2 : i != 1).join(', ') : '';
      return `<li data-id="${item.id}">
        <button type="button" class="collected-item">
          <strong>${escapeHtml(item.name || item.type)}</strong>
          <span class="point-label">${KINDS[item.kind].label}${item.name ? ` · ${escapeHtml(item.type)}` : ''}${where ? ` · ${where}` : ''}</span>
        </button>
        <button type="button" class="remove" aria-label="Remove ${escapeHtml(item.name || item.type)}">✕</button>
      </li>`;
    }).join('');
    $('#no-collected').hidden = state.items.length > 0;
    exportBox.hidden = !state.items.length;

    const files = getDataFiles();
    $('#collect-append').innerHTML = files.map((file) =>
      `<button type="button" class="secondary" data-file="${escapeHtml(file)}">Download ${escapeHtml(file.split('/').pop())} with these added</button>`).join('');
  }

  function render() {
    const fit = state.active ? getFit() : null;
    const projection = fit && createProjection(fit);
    const items = projection ? state.items.map((item) => toItem(item, projection)) : null;

    layer.clearLayers();
    items?.forEach((entry, index) => {
      const style = getTypeStyle(markerTypes, objectType(entry));
      const shape = createObjectLayer(entry, style, projection);
      const popup = document.createElement('div');
      popup.innerHTML = `<pre class="collect-popup">${escapeHtml(formatJson(entry))}</pre>
        <button type="button">Remove</button>`;
      popup.querySelector('button').addEventListener('click', () => remove(state.items[index].id));
      shape.options.bubblingMouseEvents = false;
      shape.bindPopup(popup, { maxWidth: 400 }).addTo(layer);
    });

    kindButtons.querySelectorAll('button').forEach((button) =>
      button.setAttribute('aria-pressed', button.dataset.kind == state.kind));
    kindHint.textContent = KINDS[state.kind].hint;

    drawingNote.hidden = !state.drawing;
    if (state.drawing) {
      const kind = KINDS[state.kind];
      drawingNote.innerHTML = `Drawing a ${kind.label.toLowerCase()}: ${state.drawing.length} point${state.drawing.length == 1 ? '' : 's'}.
        ${kind.min ? `<button type="button" data-action="finish"${state.drawing.length < kind.min ? ' disabled' : ''}>Finish</button>` : ''}
        <button type="button" data-action="cancel">Cancel</button>`;
    }
    renderDrawing();
    renderList(items);
  }

  function remove(id) {
    state.items = state.items.filter((item) => item.id !== id);
    map.closePopup();
    save();
    render();
  }

  /* ------------------------------------------------------------ events */

  kindButtons.innerHTML = Object.entries(KINDS).map(([kind, { label }]) =>
    `<button type="button" data-kind="${kind}" aria-pressed="false">${label}</button>`).join('');
  kindButtons.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-kind]');
    if (button) {
      setKind(button.dataset.kind);
    }
  });

  typeInput.addEventListener('change', applyExample);
  paramsInput.addEventListener('input', () => paramsInput.classList.toggle('invalid', !readParams()));

  drawingNote.addEventListener('click', (event) => {
    const action = event.target.closest('button')?.dataset.action;
    if (action == 'finish') {
      finishDrawing();
    } else if (action == 'cancel') {
      state.drawing = null;
      render();
    }
  });

  list.addEventListener('click', (event) => {
    const id = Number(event.target.closest('li')?.dataset.id);
    if (event.target.closest('button.remove')) {
      remove(id);
      return;
    }
    const index = state.items.findIndex((item) => item.id === id);
    const shape = layer.getLayers()[index];
    if (shape) {
      map.panTo(shape.getBounds?.().getCenter() ?? shape.getLatLng());
      shape.openPopup();
    }
  });

  map.on('dblclick', () => {
    if (state.active) {
      finishDrawing();
    }
  });
  map.on('mousemove', (event) => {
    if (state.active && state.drawing) {
      state.cursor = toPixel(event.latlng);
      renderDrawing();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!state.active || !state.drawing || event.target.closest('input, textarea, select')) {
      return;
    }
    if (event.key == 'Enter') {
      finishDrawing();
    } else if (event.key == 'Escape') {
      state.drawing = null;
      render();
    } else if (event.key == 'Backspace') {
      event.preventDefault();
      state.drawing = state.drawing.length > 1 ? state.drawing.slice(0, -1) : null;
      render();
    }
  });

  $('#collect-copy').addEventListener('click', async (event) => {
    const items = currentItems();
    if (!items) {
      return;
    }
    // ready to paste into an "objects" array
    const text = items.map((item) => '    ' + formatJson(item, '    ')).join(',\n');
    try {
      await navigator.clipboard.writeText(text);
      event.target.textContent = 'Copied';
    } catch {
      event.target.textContent = 'Could not copy';
    }
    setTimeout(() => { event.target.textContent = 'Copy entries'; }, 1500);
  });

  $('#collect-download').addEventListener('click', () => {
    const items = currentItems();
    if (items) {
      download(`${(imageId() ?? 'objects').split(/[/:]/).pop().replace(/\.[^.]+$/, '')}-collected.hson`,
        formatJson({ objects: items }) + '\n');
    }
  });

  $('#collect-append').addEventListener('click', async (event) => {
    const file = event.target.closest('button')?.dataset.file;
    const items = currentItems();
    if (!file || !items) {
      return;
    }
    try {
      const response = await fetch('./' + file, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(response.status);
      }
      download(file.split('/').pop(), appendToHson(await response.text(), items));
    } catch (error) {
      drawingNote.hidden = false;
      drawingNote.textContent = `Could not read ${file} (${error.message}).`;
    }
  });

  $('#collect-clear').addEventListener('click', () => {
    if (state.items.length && confirm('Remove all collected objects for this image?')) {
      state.items = [];
      save();
      render();
    }
  });

  return {
    get active() {
      return state.active;
    },
    setActive(active) {
      state.active = active;
      state.drawing = null;
      render();
    },
    click,
    /* A new image: its own collected objects. */
    reset() {
      state.drawing = null;
      state.examples = {};
      restore();
      render();
    },
    /* Objects loaded for the image, for suggestions of types and shapes. */
    addExamples(items) {
      items.forEach((item) => {
        if (item.type && Array.isArray(item.position)) {
          state.examples[item.type] ??= item;
        }
      });
      const types = new Set([...Object.keys(markerTypes), ...Object.keys(state.examples)]);
      typeList.innerHTML = [...types].sort().map((type) => `<option value="${escapeHtml(type)}">`).join('');
    },
    render,
  };
}
