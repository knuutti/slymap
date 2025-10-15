// Binds a proper popup to each marker
const getFeature = async (feature, layer) => {
    let popup_html = "";
    if (feature.properties.name) {popup_html += `<strong>${feature.properties.name}</strong></br>`;}
    if (feature.properties.value) {popup_html += `Value: ${feature.properties.value}<br>`;}
    if (feature.properties.time) {popup_html += `Time limit: ${feature.properties.time}s<br>`}
    popup_html += `Coordinates: ${feature.properties.location.x}, ${feature.properties.location.y}, ${feature.properties.location.z}`
    layer.bindPopup(popup_html);

};

// Returns a correct marker for each feature
const getMarker = (latlng, feature) => {
    // Icons for the markers are defined in icons.js
    return L.marker(latlng, {icon: icons[feature.properties.type]})
}

// Fetching the map data from GeoJSON objects
const fetchData = async () => {
    let url = "./geodata.json";
    let res = await fetch(url)
    let data = await res.json();
    initMap(data)
}

const initMap = (data) => {
    // Create the map first
    let map = L.map('map', {
        minZoom: map_min_zoom,
        maxZoom: map_max_zoom,
        zoomSnap: 0.25,
        crs: L.CRS.Simple
    })

    // Map parametres for each map are defined in details.js
    let sw = map.unproject(L.point(map_sw_y,map_sw_x));
    let ne = map.unproject(L.point(map_ne_y,map_ne_x));
    let bounds = L.latLngBounds([sw, ne]);

    // Set the bounds after map creation
    map.setMaxBounds(bounds);
    map.options.maxBoundsViscosity = 1.0;

    // Colorized base map is shown by default
    let base_map = L.imageOverlay("./maps/map.png", [[sw.lat,sw.lng], [ne.lat,ne.lng]]).addTo(map)
    //let base_map_gray = L.imageOverlay("./maps/map_bw.png", [[sw.lat,sw.lng], [ne.lat,ne.lng]])

    // Getting the GeoJSON layers from the fetched data
    let features = {}
    for (let i = 0; i < data.data.length; i++) {
        features[data.data[i].name] = L.geoJSON(data.data[i], {
            pointToLayer: function(feature,latlng) {
                return getMarker(latlng, feature, data.data[i])
            },
            onEachFeature: getFeature,
            weight: 2
        })
    }

    // Defining the layer control
    let layerControl = L.control.layers().addTo(map);
    layerControl.addBaseLayer(base_map, "Background Map")
    //layerControl.addBaseLayer(base_map_gray, "Background Map (Gray)")

    // Adding each feature to the layer control panel
    Object.entries(features).forEach(feature => {
        layerControl.addOverlay(feature[1], feature[0])
    })

    // Adding each image layer to the layer control panel
    Object.entries(map_layers).forEach(layer => {
        layerControl.addOverlay(L.imageOverlay(layer[1], [[sw.lat,sw.lng], [ne.lat,ne.lng]]), layer[0])
    })
    
    // Map on screen - fit bounds first to get the proper zoom level
    map.fitBounds(base_map.getBounds())
    
    // Set minimum zoom to current zoom level so user can't zoom out past seeing entire map
    let currentZoom = map.getZoom();
    map.setMinZoom(currentZoom);

    // Add coordinate display in bottom right corner
    let coordDisplay = L.control({position: 'bottomright'});
    coordDisplay.onAdd = function(map) {
        this._div = L.DomUtil.create('div', 'coordinate-display');
        this._div.innerHTML = '(0, 0)';
        return this._div;
    };
    coordDisplay.addTo(map);

    // Update coordinates on mouse move
    map.on('mousemove', function(e) {
        // Check if game coordinate parameters are available
        if (typeof game_units_per_pixel !== 'undefined' && 
            typeof game_top_left_x !== 'undefined' && 
            typeof game_top_left_y !== 'undefined' &&
            typeof map_image_width_pixels !== 'undefined' &&
            typeof map_image_height_pixels !== 'undefined') {
            
            // Get the bounds of the base map image
            let imageBounds = base_map.getBounds();
            let topLeft = imageBounds.getNorthWest();
            let bottomRight = imageBounds.getSouthEast();
            
            // Calculate the relative position within the image bounds (0 to 1 scale)
            let relativeX = (e.latlng.lng - topLeft.lng) / (bottomRight.lng - topLeft.lng);
            let relativeY = (e.latlng.lat - topLeft.lat) / (bottomRight.lat - topLeft.lat);
            
            // Clamp to image bounds
            relativeX = Math.max(0, Math.min(1, relativeX));
            relativeY = Math.max(0, Math.min(1, relativeY));
            
            // Convert relative position to pixel coordinates
            // In Leaflet with Simple CRS, lat increases northward (up) but game X increases downward
            // So relativeY=0 is at top (north), relativeY=1 is at bottom (south)
            // For game coordinates: X increases downward, Y increases rightward
            let pixelX = relativeY * map_image_height_pixels; // Vertical pixels from top (NOT inverted - game X increases downward)
            let pixelY = relativeX * map_image_width_pixels; // Horizontal pixels from left
            
            // Convert pixel coordinates to game coordinates
            let gameX = Math.round(game_top_left_x + (pixelX * game_units_per_pixel));
            let gameY = Math.round(game_top_left_y + (pixelY * game_units_per_pixel));
            
            coordDisplay._div.innerHTML = `(${gameX}, ${gameY})`;
        } else if (typeof game_units_per_pixel !== 'undefined' && 
                   typeof game_top_left_x !== 'undefined' && 
                   typeof game_top_left_y !== 'undefined') {
            
            // Fallback without explicit pixel dimensions - use projection method
            let coords = map.project(e.latlng, 0);
            let imageBounds = base_map.getBounds();
            let topLeft = map.project(imageBounds.getNorthWest(), 0);
            
            // Calculate pixel offset from image's top-left corner
            let pixelX = coords.y - topLeft.y; // Vertical pixels from top
            let pixelY = coords.x - topLeft.x; // Horizontal pixels from left
            
            // Convert to game coordinates
            let gameX = Math.round(game_top_left_x + (pixelX * game_units_per_pixel));
            let gameY = Math.round(game_top_left_y + (pixelY * game_units_per_pixel));
            coordDisplay._div.innerHTML = `(${gameX}, ${gameY})`;
        } else if (typeof game_units_per_pixel !== 'undefined') {
            // Scale coordinates by game units per pixel (fallback without origin)
            let coords = map.project(e.latlng, 0);
            let gameX = Math.round(coords.y * game_units_per_pixel); // Vertical axis
            let gameY = Math.round(coords.x * game_units_per_pixel); // Horizontal axis
            coordDisplay._div.innerHTML = `(${gameX}, ${gameY})`;
        } else {
            // Fallback to pixel coordinates for maps without game scaling
            let coords = map.project(e.latlng, 0);
            let gameX = Math.round(coords.y); // Vertical axis (increasing downward)
            let gameY = Math.round(coords.x); // Horizontal axis (increasing rightward)
            coordDisplay._div.innerHTML = `(${gameX}, ${gameY})`;
        }
    });

}

fetchData();