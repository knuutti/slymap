/* Navigation outside the map itself: the browse page (#/ and #/<game>)
 * and the sidebar next to the map. Both are built from the manifest. */

import { navigate, routeHash } from './router.js';
import { findObjects } from './objects.js';

const KIND_LABELS = { hub: 'Hub world', level: 'Level', mission: 'Mission', boss: 'Boss' };
const NARROW_SCREEN = window.matchMedia('(max-width: 700px)');
const SIDEBAR_STATE_KEY = 'slymap.sidebarOpen';

const ICONS = {
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7M5 10v10h14V10"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function kindLabel(kind) {
  return KIND_LABELS[kind] ?? (kind ? kind[0].toUpperCase() + kind.slice(1) : '');
}

function episodeHeading(episode) {
  return [episode.label, episode.title].filter(Boolean).join(' · ');
}

function searchText(entry) {
  return [entry.name, entry.location, entry.episode.label, entry.episode.title,
    entry.game.title, entry.game.short, kindLabel(entry.kind)].join(' ').toLowerCase();
}

function matches(entry, query) {
  return query.split(/\s+/).filter(Boolean).every((word) => searchText(entry).includes(word));
}

/* Plain clicks on map links keep the object layers that are switched on. */
export function isPlainClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function readStoredOpen() {
  try {
    const value = localStorage.getItem(SIDEBAR_STATE_KEY);
    return value === null ? null : value === 'true';
  } catch {
    return null;
  }
}

function storeOpen(open) {
  try {
    localStorage.setItem(SIDEBAR_STATE_KEY, String(open));
  } catch {
    // private mode etc.; the state just isn't remembered
  }
}

/* ---------------------------------------------------------------- browse */

export function createBrowse(root, manifest) {
  const kinds = [...new Set([...manifest.maps.values()].map((entry) => entry.kind).filter(Boolean))];
  root.innerHTML = `
    <header class="browse-header">
      <a class="brand" href="#/">SlyMap</a>
      <p class="browse-tagline">Interactive maps for the Sly Cooper series</p>
    </header>
    <div class="browse-toolbar">
      <nav class="game-tabs" aria-label="Games"></nav>
      <div class="browse-filters">
        <input class="search" type="search" placeholder="Search maps, places or objects (e.g. treasure)" aria-label="Search maps and objects">
        <select class="kind-filter" aria-label="Map type">
          <option value="">All map types</option>
          ${kinds.map((kind) => `<option value="${escapeHtml(kind)}">${escapeHtml(kindLabel(kind))}</option>`).join('')}
        </select>
      </div>
    </div>
    <main class="browse-content">
      <section class="object-results" aria-live="polite"></section>
      <div class="game-sections"></div>
    </main>`;

  const tabs = root.querySelector('.game-tabs');
  const search = root.querySelector('.search');
  const kindFilter = root.querySelector('.kind-filter');
  const objectResults = root.querySelector('.object-results');
  const content = root.querySelector('.game-sections');
  let gameId = null;
  let objectSearch = 0; // ignores results of searches that were replaced

  tabs.innerHTML = [{ id: '', short: 'All games' }, ...manifest.games]
    .map((game) => `<a href="${routeHash(game.id)}" data-game="${escapeHtml(game.id)}">${escapeHtml(game.short)}</a>`)
    .join('');

  function card(entry) {
    const preview = manifest.previewUrl(entry);
    return `
      <a class="map-card" href="${routeHash(entry.key)}">
        <span class="map-card-preview">
          ${preview
            ? `<img src="${escapeHtml(preview)}" alt="" loading="lazy">`
            : `<span class="map-card-placeholder">${escapeHtml(entry.game.short)}</span>`}
          ${entry.kind ? `<span class="badge">${escapeHtml(kindLabel(entry.kind))}</span>` : ''}
        </span>
        <span class="map-card-episode">${escapeHtml(episodeHeading(entry.episode))}</span>
        <span class="map-card-name">${escapeHtml(entry.name)}</span>
        <span class="map-card-location">${escapeHtml(entry.location ?? '')}</span>
      </a>`;
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const kind = kindFilter.value;
    const filtering = query || kind;
    const keep = (entry) => (!kind || entry.kind === kind) && (!query || matches(entry, query));
    const games = manifest.games.filter((game) => !gameId || game.id === gameId);

    const sections = games.map((game) => {
      const entries = game.entries.filter(keep);
      if (!entries.length && filtering) {
        return '';
      }
      const count = game.entries.length;
      return `
        <section class="game-section">
          <h2>${escapeHtml(game.title)}${game.year ? ` <span class="game-year">${game.year}</span>` : ''}</h2>
          <p class="game-count">${count ? `${count} map${count == 1 ? '' : 's'}` : 'Maps coming soon'}</p>
          ${entries.length ? `<div class="map-grid">${entries.map(card).join('')}</div>` : ''}
        </section>`;
    }).join('');

    content.innerHTML = sections || `<p class="empty">No map names match “${escapeHtml(search.value.trim())}”.</p>`;
    renderObjects(query, games, kind);
  }

  async function renderObjects(query, games, kind) {
    const token = ++objectSearch;
    if (query.length < 2) {
      objectResults.innerHTML = '';
      return;
    }
    const entries = games.flatMap((game) => game.entries).filter((entry) => !kind || entry.kind === kind);
    const results = await findObjects(entries, manifest.markerTypes, query);
    if (token !== objectSearch) {
      return;
    }
    objectResults.innerHTML = results.length ? `
      <h2>Objects</h2>
      ${results.slice(0, 8).map((result) => `
        <div class="object-result">
          <h3>${escapeHtml(result.label)}
            <span>${result.total} on ${result.maps.length} map${result.maps.length == 1 ? '' : 's'}</span></h3>
          <div class="object-maps">${result.maps.map(({ entry, count }) => `
            <a href="${routeHash(entry.key, [result.type])}">${escapeHtml(entry.name)}
              <span class="count">${count}</span></a>`).join('')}</div>
        </div>`).join('')}` : '';
  }

  search.addEventListener('input', render);
  kindFilter.addEventListener('change', render);

  return {
    show(id) {
      gameId = id;
      tabs.querySelectorAll('a').forEach((tab) => {
        if (tab.dataset.game === (id ?? '')) {
          tab.setAttribute('aria-current', 'page');
        } else {
          tab.removeAttribute('aria-current');
        }
      });
      render();
      const game = id && manifest.findGame(id);
      document.title = game ? `${game.title} - SlyMap` : 'SlyMap - Sly Cooper maps';
      window.scrollTo(0, 0);
    },
  };
}

/* --------------------------------------------------------------- sidebar */

/* getLayers() returns the object layers to carry over to the next map;
 * onResize() is called when the sidebar changes the map's width. */
export function createSidebar(root, manifest, { getLayers, onResize }) {
  root.innerHTML = `
    <div class="sidebar-rail">
      <button class="icon-button sidebar-toggle" type="button" aria-controls="sidebar-panel">${ICONS.menu}</button>
      <a class="icon-button" href="#/" title="All maps" aria-label="All maps">${ICONS.home}</a>
    </div>
    <div class="sidebar-panel" id="sidebar-panel">
      <a class="brand" href="#/">SlyMap</a>
      <nav class="crumbs" aria-label="Breadcrumb"></nav>
      <h1 class="current-name"></h1>
      <p class="current-location"></p>
      <a class="download-map" download></a>
      <div class="prev-next"></div>
      <div class="connected"></div>
      <div class="sidebar-games" role="group" aria-label="Show maps from"></div>
      <input class="search" type="search" placeholder="Find a map" aria-label="Find a map">
      <div class="map-list"></div>
    </div>`;

  const toggle = root.querySelector('.sidebar-toggle');
  const crumbs = root.querySelector('.crumbs');
  const name = root.querySelector('.current-name');
  const location = root.querySelector('.current-location');
  const downloadLink = root.querySelector('.download-map');
  const prevNext = root.querySelector('.prev-next');
  const connected = root.querySelector('.connected');
  const gameButtons = root.querySelector('.sidebar-games');
  const search = root.querySelector('.search');
  const list = root.querySelector('.map-list');
  let current = null;
  let listGame = null;

  gameButtons.innerHTML = manifest.games
    .map((game) => `<button type="button" data-game="${escapeHtml(game.id)}">${escapeHtml(game.short)}</button>`)
    .join('');

  function setOpen(open, remember = true) {
    root.classList.toggle('collapsed', !open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.title = open ? 'Hide map list' : 'Show map list';
    toggle.setAttribute('aria-label', toggle.title);
    if (remember && !NARROW_SCREEN.matches) {
      storeOpen(open);
    }
    onResize();
  }

  function mapLink(entry, detail) {
    const here = entry === current ? ' aria-current="page"' : '';
    return `<li><a href="${routeHash(entry.key)}" data-key="${escapeHtml(entry.key)}"${here}>
      <span class="map-link-name">${escapeHtml(entry.name)}</span>
      ${detail ? `<span class="map-link-detail">${escapeHtml(detail)}</span>` : ''}</a></li>`;
  }

  function renderList() {
    const query = search.value.trim().toLowerCase();
    gameButtons.querySelectorAll('button').forEach((button) =>
      button.setAttribute('aria-pressed', String(!query && button.dataset.game === listGame.id)));

    if (query) {
      const results = [...manifest.maps.values()].filter((entry) => matches(entry, query));
      list.innerHTML = results.length
        ? `<ul>${results.map((entry) => mapLink(entry,
          [entry.game.short, entry.episode.label || entry.episode.title].filter(Boolean).join(' · '))).join('')}</ul>`
        : '<p class="empty">No maps found.</p>';
      return;
    }
    list.innerHTML = listGame.entries.length
      ? listGame.episodes.filter((episode) => episode.entries.length).map((episode) => `
          <h2>${escapeHtml(episodeHeading(episode))}</h2>
          <ul>${episode.entries.map((entry) => mapLink(entry)).join('')}</ul>`).join('')
      : `<p class="empty">Maps for ${escapeHtml(listGame.title)} are coming soon.</p>`;
  }

  function renderCurrent() {
    const { game, episode } = current;
    crumbs.innerHTML = `<a href="#/">All maps</a><span aria-hidden="true">›</span>` +
      `<a href="${routeHash(game.id)}">${escapeHtml(game.short)}</a>` +
      (episode.label || episode.title
        ? `<span aria-hidden="true">›</span><span>${escapeHtml(episode.label || episode.title)}</span>`
        : '');
    name.textContent = current.name;
    location.textContent = [current.location, episode.title].filter(Boolean).join(' — ');

    const download = manifest.download(current);
    downloadLink.href = download.url;
    downloadLink.innerHTML = `${ICONS.download}<span>Download map image</span>` +
      (download.bytes
        ? `<span class="download-size">${download.url.split('.').pop().toUpperCase()}, ${(download.bytes / 1e6).toFixed(1)} MB</span>`
        : '');

    const index = game.entries.indexOf(current);
    const step = (entry, direction) => entry
      ? `<a class="${direction}" href="${routeHash(entry.key)}" data-key="${escapeHtml(entry.key)}"
           title="${direction == 'prev' ? 'Previous' : 'Next'} map: ${escapeHtml(entry.name)}">
           ${direction == 'prev' ? ICONS.prev : ''}<span>${escapeHtml(entry.name)}</span>${direction == 'next' ? ICONS.next : ''}</a>`
      : '<span></span>';
    prevNext.innerHTML = step(game.entries[index - 1], 'prev') + step(game.entries[index + 1], 'next');

    const linked = [...new Set([...current.links.map((link) => link.target), ...current.linkedFrom])]
      .filter((entry) => entry !== current);
    connected.innerHTML = linked.length
      ? `<h2>Connected maps</h2><ul>${linked.map((entry) => mapLink(entry,
        entry.game === game ? '' : entry.game.short)).join('')}</ul>`
      : '';
  }

  root.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-key]');
    if (link && isPlainClick(event)) {
      event.preventDefault();
      navigate(link.dataset.key, getLayers());
      if (NARROW_SCREEN.matches) {
        setOpen(false, false);
      }
    }
  });
  toggle.addEventListener('click', () => setOpen(root.classList.contains('collapsed')));
  gameButtons.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-game]');
    if (button) {
      listGame = manifest.findGame(button.dataset.game);
      search.value = '';
      renderList();
    }
  });
  search.addEventListener('input', renderList);

  setOpen(NARROW_SCREEN.matches ? false : readStoredOpen() ?? true, false);

  return {
    setMap(entry) {
      current = entry;
      listGame = entry.game;
      search.value = '';
      renderCurrent();
      renderList();
      list.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' });
    },
  };
}
