/* Map UI controls. They stay on the map across map switches and are
 * updated with set*() calls instead of being recreated. */

function stopMapEvents(element) {
  L.DomEvent.disableClickPropagation(element);
  L.DomEvent.disableScrollPropagation(element);
}

export const MousePosition = L.Control.extend({
  options: { position: 'bottomleft' },

  onAdd() {
    this._div = L.DomUtil.create('div', 'mouseposition');
    this.setPosition([0, 0]);
    return this._div;
  },

  setPosition([x, y]) {
    this._div.innerHTML = `X: ${x} ; Y: ${y}`;
  },
});

export const ColorPicker = L.Control.extend({
  options: { position: 'topleft' },

  initialize(onInput, options) {
    L.setOptions(this, options);
    this._onInput = onInput;
  },

  onAdd() {
    const container = L.DomUtil.create('div', 'colors');
    container.innerHTML = '<input type="color" value="#8adeff">';
    container.firstChild.addEventListener('input', (event) => this._onInput(event.target.value));
    stopMapEvents(container);
    return container;
  },
});

/* Object type toggles with a text filter. */
export const LayerPanel = L.Control.extend({
  options: { position: 'topright' },

  initialize(onToggle, options) {
    L.setOptions(this, options);
    this._onToggle = onToggle;
    this._rows = [];
  },

  onAdd() {
    const container = L.DomUtil.create('div',
      'leaflet-control-layers leaflet-control-layers-expanded');
    container.innerHTML = '<h2><button type="button" class="layer-panel-toggle">Object Filters</button></h2>';
    const toggle = container.querySelector('button');
    const body = L.DomUtil.create('div', 'layer-panel-body', container);
    const setOpen = (open) => {
      container.classList.toggle('layer-panel-collapsed', !open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => setOpen(container.classList.contains('layer-panel-collapsed')));
    // on phones the panel would cover most of the map
    setOpen(!window.matchMedia('(max-width: 700px)').matches);

    this._filter = L.DomUtil.create('input', '', body);
    this._filter.id = 'objectFilter';
    this._filter.type = 'search';
    this._filter.autocomplete = 'off';
    this._filter.addEventListener('input', () => this._applyFilter());

    const list = L.DomUtil.create('section', 'leaflet-control-layers-list', body);
    list.style.maxHeight = 'calc(100vh - 140px)';
    list.style.overflowY = 'auto';
    this._overlays = L.DomUtil.create('div', 'leaflet-control-layers-overlays', list);
    this._empty = L.DomUtil.create('p', 'layer-panel-empty', list);

    stopMapEvents(container);
    return container;
  },

  /* layers: { [type]: { label, highlight } }, enabled: Set of types,
   * emptyText: shown when there are no layers */
  setLayers(layers, enabled, emptyText = 'No objects mapped yet.') {
    this._overlays.replaceChildren();
    this._empty.textContent = Object.keys(layers).length ? '' : emptyText;
    this._rows = Object.entries(layers)
      .sort(([, a], [, b]) => a.label.localeCompare(b.label))
      .map(([type, layer]) => {
        const label = document.createElement('label');
        label.innerHTML = '<span><input type="checkbox" class="leaflet-control-layers-selector"><span></span></span>';
        label.querySelector('span span').textContent = ' ' + layer.label;
        const checkbox = label.querySelector('input');
        checkbox.addEventListener('change', () => this._onToggle(type, checkbox.checked));
        this._overlays.append(label);
        return { type, label, checkbox, highlight: layer.highlight, text: layer.label.toLowerCase() };
      });
    this.setEnabled(enabled);
    this._applyFilter();
  },

  setEnabled(enabled) {
    this._rows.forEach((row) => {
      const on = enabled.has(row.type);
      row.checkbox.checked = on;
      row.label.style.backgroundColor = on ? row.highlight + '88' : '';
    });
  },

  _applyFilter() {
    const search = this._filter.value.toLowerCase();
    this._rows.forEach((row) => {
      row.label.style.display = row.text.includes(search) ? '' : 'none';
    });
  },
});

/* Summary of the enabled object types with counts, plus "Clear All". */
export const LayerInfo = L.Control.extend({
  options: { position: 'topright' },

  initialize(onClear, options) {
    L.setOptions(this, options);
    this._onClear = onClear;
  },

  onAdd() {
    this._div = L.DomUtil.create('div');
    this._div.id = 'layerinfo';
    stopMapEvents(this._div);
    return this._div;
  },

  /* entries: [{ label, count, highlight }] */
  setEntries(entries) {
    this._div.style.display = entries.length ? '' : 'none';
    const list = document.createElement('ul');
    const clear = document.createElement('li');
    clear.id = 'clear_markers';
    clear.textContent = 'Clear All';
    clear.addEventListener('click', () => this._onClear());
    list.append(clear);
    entries.forEach(({ label, count, highlight }) => {
      const item = document.createElement('li');
      item.textContent = `${label} (${count})`;
      item.style.backgroundColor = highlight + '88';
      list.append(item);
    });
    this._div.replaceChildren(list);
  },
});
