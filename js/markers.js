/* Builds one Leaflet layer group per object type from a map's data files. */

const ICON_SIZE = 30;
const ICON_HIGHLIGHT = '#ffff88';

/* Unlisted types still get the same colour on every map and every visit. */
function colorFromName(name) {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return '#' + (hash & 0xffffff).toString(16).padStart(6, '0');
}

export function getTypeStyle(markerTypes, type) {
  const style = markerTypes[type] ?? {};
  return {
    ...style,
    label: style.label ?? type,
    color: style.color ?? colorFromName(type),
  };
}

function getIconUrl(item, style) {
  if (style.iconBy) {
    return style.icons?.[item.parameters?.[style.iconBy]] ?? null;
  }
  return style.icon ?? null;
}

function getMarker(item, style, projection) {
  const coords = projection.toLatLng([item.position[0], item.position[1]]);
  const iconUrl = getIconUrl(item, style);
  if (iconUrl) {
    return L.canvasMarker(coords, {
      img: { url: './' + iconUrl, size: [ICON_SIZE, ICON_SIZE] },
    });
  }
  return L.circleMarker(coords, {
    radius: 8,
    color: '#000000',
    weight: 1,
    opacity: 0.8,
    fillOpacity: 0.7,
    fillColor: style.color,
  });
}

/* Corners of a box rotated around the vertical axis, in game [x, z]. */
function rotatedBoxCorners(position, dimensions, quaternion) {
  let axis = [quaternion[0], quaternion[1], quaternion[2]];
  const magnitude = 2 * Math.acos(quaternion[3]);
  if (1 - quaternion[3] ** 2 >= 0.000001) {
    const s = Math.sqrt(1 - quaternion[3] ** 2);
    axis = axis.map((value) => value / s);
  }
  const angle = axis[1] * magnitude;

  const x = position[0];
  const z = -position[2];
  const halfWidth = dimensions[0] * 0.5;
  const halfHeight = dimensions[2] * 0.5;

  const left = [x - halfWidth * Math.cos(angle), z - halfWidth * Math.sin(angle)];
  const right = [x + halfWidth * Math.cos(angle), z + halfWidth * Math.sin(angle)];
  const heightX = halfHeight * Math.sin(angle);
  const heightZ = halfHeight * Math.cos(angle);

  return [
    [left[0] + heightX, left[1] - heightZ],
    [left[0] - heightX, left[1] + heightZ],
    [right[0] - heightX, right[1] + heightZ],
    [right[0] + heightX, right[1] - heightZ],
  ].map(([cornerX, cornerZ]) => [cornerX, -cornerZ]);
}

/* Areas and lines; these objects use position[2] as the second map axis. */
function getShape(item, style, projection) {
  const params = item.parameters ?? {};
  const color = style.color;

  if (Array.isArray(params.vertices)) {
    const vertices = params.vertices.map((vertex) =>
      projection.toLatLng([item.position[0] + vertex[0], item.position[2] + vertex[1]]));
    return L.polygon(vertices, { color, weight: 1 });
  }
  if (Array.isArray(params.points)) {
    const points = params.points.map((point) =>
      projection.toLatLng([item.position[0] + point[0], item.position[2] + point[1]]));
    return L.polyline(points, { color, weight: 3 });
  }

  const size = params.size ?? params.extents;
  if (!Array.isArray(size) || size.length != 3) {
    return null;
  }
  if (params.shape == 'Capsule') {
    return L.circle(projection.toLatLng([item.position[0], item.position[2]]), {
      color,
      radius: projection.toMapLength(params.radius),
    });
  }
  const corners = rotatedBoxCorners(item.position, size, item.rotation ?? [0, 0, 0, 0]);
  return L.polygon(corners.map((corner) => projection.toLatLng(corner)), { color, weight: 1 });
}

function getPopup(item, label, filename) {
  const params = item.parameters ?? {};
  const model = params.name ? '<p><span class="emphasize">model: </span>' + params.name + '</p>' : '';
  const dimensions = Array.isArray(params.size)
    ? '<p><span class="emphasize">dimensions: </span>' + params.size.join(', ') + '</p>'
    : '';
  return (
    '<h1>' + (item.name ?? params.jobName ?? label) + '</h1>' +
    '<p><span class="emphasize">position:</span> ' + item.position.map(Math.round).join(', ') + '</p>' +
    '<p><span class="emphasize">file:</span> ' + filename + '</p>' +
    model +
    dimensions +
    '<pre>' + JSON.stringify(item, null, 2) + '</pre>'
  );
}

async function fetchObjects(file) {
  try {
    const response = await fetch('./' + file);
    if (!response.ok) {
      throw new Error(response.status);
    }
    return (await response.json())?.objects ?? [];
  } catch (error) {
    console.warn(`Could not load ${file}`, error);
    return [];
  }
}

/* Returns { [type]: { group, label, highlight } } */
export async function loadMapLayers(mapDef, projection, markerTypes) {
  const layers = {};
  const files = await Promise.all(mapDef.data.map(async (file) => [file, await fetchObjects(file)]));

  files.forEach(([file, objects]) => {
    const filename = file.split('/').pop().replace(/\.[^.]+$/, '');
    objects.forEach((item) => {
      if (!Array.isArray(item.position)) {
        return;
      }
      const type = item.parameters?.type ? `${item.type} ${item.parameters.type}` : item.type;
      const style = getTypeStyle(markerTypes, type);
      const marker = getMarker(item, style, projection);
      const shape = getShape(item, style, projection);
      const layer = shape && !marker.options.img ? shape : marker;

      layers[type] ??= { group: L.layerGroup(), label: style.label, highlight: ICON_HIGHLIGHT };
      if (!layer.options.img) {
        layers[type].highlight = style.color;
      }
      layer.bindPopup(getPopup(item, style.label, filename), { maxWidth: 550 })
        .addTo(layers[type].group);
    });
  });

  return layers;
}
