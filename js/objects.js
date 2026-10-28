/* Finds which maps have objects of a type ("treasure" -> Treasures on
 * Contessa's Jail (3), ...). Each map's object files are fetched the first
 * time a search needs them and the counts are kept for later searches. */

import { fetchObjects, getTypeStyle, objectType } from './markers.js';

const countsByMap = new Map(); // map key -> Promise<{ [type]: count }>

function countObjects(entry) {
  if (!countsByMap.has(entry.key)) {
    countsByMap.set(entry.key, Promise.all(entry.data.map(fetchObjects)).then((files) => {
      const counts = {};
      files.flat().forEach((item) => {
        if (Array.isArray(item.position)) {
          const type = objectType(item);
          counts[type] = (counts[type] ?? 0) + 1;
        }
      });
      return counts;
    }));
  }
  return countsByMap.get(entry.key);
}

/* Returns [{ type, label, total, maps: [{ entry, count }] }], most found first. */
export async function findObjects(entries, markerTypes, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const perMap = await Promise.all(entries.map(async (entry) => [entry, await countObjects(entry)]));

  const results = new Map();
  perMap.forEach(([entry, counts]) => {
    Object.entries(counts).forEach(([type, count]) => {
      const label = getTypeStyle(markerTypes, type).label;
      const text = `${type} ${label}`.toLowerCase();
      if (!words.every((word) => text.includes(word))) {
        return;
      }
      if (!results.has(type)) {
        results.set(type, { type, label, total: 0, maps: [] });
      }
      const result = results.get(type);
      result.total += count;
      result.maps.push({ entry, count });
    });
  });
  return [...results.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}
