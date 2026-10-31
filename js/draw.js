/* Measuring tools (lines, circles, points). Drawings belong to the map
 * they were made on and are cleared when the map changes. */

function getLinearDistance(pointA, pointB) {
  return Math.round(Math.hypot(pointB[0] - pointA[0], pointB[1] - pointA[1]));
}

function getPopupContent(layer, projection) {
  if (!projection) {
    return null; // map without a calib: no game units to measure in
  }
  if (layer instanceof L.Marker || layer instanceof L.CircleMarker && !(layer instanceof L.Circle)) {
    return 'X,Y: ' + projection.toGame(layer.getLatLng()).join(',');
  }
  if (layer instanceof L.Circle) {
    return 'Center: ' + projection.toGame(layer.getLatLng()).join(', ') + '<br />' +
      'Radius: ' + Math.round(projection.toGameLength(layer.getRadius())) + ' units';
  }
  if (layer instanceof L.Polyline) {
    const latlngs = layer.getLatLngs();
    if (latlngs.length < 2) {
      return 'Distance: N/A';
    }
    const distances = [];
    for (let i = 0; i < latlngs.length - 1; i++) {
      distances.push(getLinearDistance(projection.toGame(latlngs[i]), projection.toGame(latlngs[i + 1])));
    }
    const total = distances.reduce((sum, distance) => sum + distance, 0);
    if (distances.length == 1) {
      return "<ul class='distance'><li>Distance: " + total + ' units</li></ul>';
    }
    return "<ul class='distance'><li>Total Distance: " + total + ' units</li>' +
      distances.map((distance, index) => '<li>Segment ' + (index + 1) + ': ' + distance + ' units</li>').join('') +
      '</ul>';
  }
  return null;
}

/* getProjection() returns the projection of the map currently shown, or
 * null when it has no calib. */
export function setupDrawing(map, getProjection) {
  const drawnItems = new L.FeatureGroup().addTo(map);

  map.addControl(new L.Control.Draw({
    position: 'topleft',
    draw: {
      polyline: {
        showLength: false,
        zIndexOffset: 5555,
        metric: true,
        shapeOptions: { color: 'rgb(10, 110, 220)', weight: 5, opacity: 1 },
      },
      polygon: false,
      rectangle: false,
      circle: {
        showLength: false,
        zIndexOffset: -50,
        metric: true,
        shapeOptions: { color: 'rgb(210, 110, 20)', fill: false, weight: 3, opacity: 1 },
      },
      circlemarker: false,
    },
    edit: { featureGroup: drawnItems },
  }));

  map.on(L.Draw.Event.CREATED, (event) => {
    const content = getPopupContent(event.layer, getProjection());
    if (content !== null) {
      event.layer.bindPopup(content);
    }
    drawnItems.addLayer(event.layer);
  });

  map.on(L.Draw.Event.EDITED, (event) => {
    event.layers.eachLayer((layer) => {
      const content = getPopupContent(layer, getProjection());
      if (content !== null) {
        layer.setPopupContent(content);
      }
    });
  });

  return {
    setColor(color) {
      drawnItems.eachLayer((layer) => layer.setStyle?.({ color }));
    },
    clear() {
      drawnItems.clearLayers();
    },
  };
}
