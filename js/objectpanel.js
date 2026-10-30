/* The object panel on the right of the map: object type toggles with a
 * text filter and counts. Collapsed, it is a button over the map's
 * top-right corner that shows how many types are on. */

const NARROW_SCREEN = window.matchMedia('(max-width: 700px)');
const PANEL_STATE_KEY = 'slymap.objectPanelOpen';

const ICONS = {
  layers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

function readStoredOpen() {
  try {
    const value = localStorage.getItem(PANEL_STATE_KEY);
    return value === null ? null : value === 'true';
  } catch {
    return null;
  }
}

function storeOpen(open) {
  try {
    localStorage.setItem(PANEL_STATE_KEY, String(open));
  } catch {
    // private mode etc.; the state just isn't remembered
  }
}

/* onToggle(type, on) when a type is switched, onClear() for "Clear all",
 * onResize() when the panel changes the map's width. */
export function createObjectPanel(root, { onToggle, onClear, onResize }) {
  root.innerHTML = `
    <button class="object-panel-open" type="button" aria-controls="object-panel-body">
      ${ICONS.layers}<span>Objects</span><span class="object-panel-badge"></span>
    </button>
    <div class="object-panel-body" id="object-panel-body">
      <div class="object-panel-header">
        <h2>Objects</h2>
        <button class="icon-button object-panel-close" type="button" title="Hide objects" aria-label="Hide objects">${ICONS.close}</button>
      </div>
      <input class="search" type="search" placeholder="Filter object types" aria-label="Filter object types" autocomplete="off">
      <div class="object-panel-summary" hidden>
        <span></span>
        <button type="button" class="object-panel-clear">Clear all</button>
      </div>
      <div class="object-list" role="group" aria-label="Object types"></div>
      <p class="empty"></p>
    </div>`;

  const openButton = root.querySelector('.object-panel-open');
  const badge = root.querySelector('.object-panel-badge');
  const filter = root.querySelector('.search');
  const summary = root.querySelector('.object-panel-summary');
  const list = root.querySelector('.object-list');
  const empty = root.querySelector('.empty');
  let rows = [];

  function setOpen(open, remember = true) {
    root.classList.toggle('collapsed', !open);
    openButton.setAttribute('aria-expanded', String(open));
    if (remember && !NARROW_SCREEN.matches) {
      storeOpen(open);
    }
    onResize();
  }

  function applyFilter() {
    const search = filter.value.trim().toLowerCase();
    rows.forEach((row) => {
      row.label.hidden = !row.text.includes(search);
    });
  }

  openButton.addEventListener('click', () => {
    setOpen(true);
    filter.focus();
  });
  root.querySelector('.object-panel-close').addEventListener('click', () => setOpen(false));
  root.querySelector('.object-panel-clear').addEventListener('click', () => onClear());
  filter.addEventListener('input', applyFilter);

  setOpen(NARROW_SCREEN.matches ? false : readStoredOpen() ?? true, false);

  return {
    /* layers: { [type]: { label, highlight, group } }, enabled: Set of types,
     * emptyText: shown when there are no layers */
    setLayers(layers, enabled, emptyText = 'No objects mapped yet.') {
      empty.textContent = Object.keys(layers).length ? '' : emptyText;
      rows = Object.entries(layers)
        .sort(([, a], [, b]) => a.label.localeCompare(b.label))
        .map(([type, layer]) => {
          const label = document.createElement('label');
          label.className = 'object-row';
          label.style.setProperty('--swatch', layer.highlight);
          label.innerHTML = `<input type="checkbox"><span class="object-swatch" aria-hidden="true"></span>
            <span class="object-name"></span><span class="object-count"></span>`;
          label.querySelector('.object-name').textContent = layer.label;
          label.querySelector('.object-count').textContent = layer.group.getLayers().length;
          const checkbox = label.querySelector('input');
          checkbox.addEventListener('change', () => onToggle(type, checkbox.checked));
          return { type, label, checkbox, text: layer.label.toLowerCase() };
        });
      list.replaceChildren(...rows.map((row) => row.label));
      this.setEnabled(enabled);
      applyFilter();
    },

    setEnabled(enabled) {
      rows.forEach((row) => {
        row.checkbox.checked = enabled.has(row.type);
        row.label.classList.toggle('on', row.checkbox.checked);
      });
      const count = rows.filter((row) => row.checkbox.checked).length;
      summary.hidden = !count;
      summary.querySelector('span').textContent = `${count} ${count == 1 ? 'type' : 'types'} shown`;
      badge.textContent = count || '';
    },
  };
}
