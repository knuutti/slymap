const getFeature = async (feature, layer) => {
    let popup_html = "";
    if (feature.properties.name) {popup_html += `<strong>${feature.properties.name}</strong></br>`;}
    if (feature.properties.value) {popup_html += `Value: ${feature.properties.value}<br>`;}
    if (feature.properties.time) {popup_html += `Time limit: ${feature.properties.time}s<br>`}
    popup_html += `Coordinates: ${feature.properties.location.x}, ${feature.properties.location.y}, ${feature.properties.location.z}`
    layer.bindPopup(popup_html);
};

const getMarker = (latlng, feature) => {
    return L.marker(latlng, {icon: icons[feature.properties.type]})
}

const fetchData = async () => {
    let url = "./geodata.json";
    let res = await fetch(url)
    let data = await res.json();
    initMap(data)
}

const initMap = (data) => {
    let map = L.map('map', {
        minZoom: map_min_zoom,
        maxZoom: map_max_zoom,
        zoomSnap: 0.25,
        crs: L.CRS.Simple
    })

    let sw, ne, bounds;
    
    if (typeof map_image_width_pixels !== 'undefined' && typeof map_image_height_pixels !== 'undefined') {
        const imageAspectRatio = map_image_width_pixels / map_image_height_pixels;
        const baseSize = 2.0;
        let coordWidth, coordHeight;
        
        if (imageAspectRatio >= 1) {
            coordHeight = baseSize;
            coordWidth = baseSize * imageAspectRatio;
        } else {
            coordWidth = baseSize;
            coordHeight = baseSize / imageAspectRatio;
        }
        
        const halfWidth = coordWidth / 2;
        const halfHeight = coordHeight / 2;
        
        sw = L.latLng(-halfHeight, -halfWidth);
        ne = L.latLng(halfHeight, halfWidth);
        bounds = L.latLngBounds([sw, ne]);
    } else {
        sw = map.unproject(L.point(map_sw_y,map_sw_x));
        ne = map.unproject(L.point(map_ne_y,map_ne_x));
        bounds = L.latLngBounds([sw, ne]);
    }

    map.setMaxBounds(bounds);
    map.options.maxBoundsViscosity = 1.0;

    let base_map = L.imageOverlay("./maps/map.png", [[sw.lat,sw.lng], [ne.lat,ne.lng]]).addTo(map)

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

    let layerControl = L.control.layers().addTo(map);
    layerControl.addBaseLayer(base_map, "Background Map")

    Object.entries(features).forEach(feature => {
        layerControl.addOverlay(feature[1], feature[0])
    })

    Object.entries(map_layers).forEach(layer => {
        layerControl.addOverlay(L.imageOverlay(layer[1], [[sw.lat,sw.lng], [ne.lat,ne.lng]]), layer[0])
    })
    
    map.fitBounds(base_map.getBounds());
    
    if (typeof map_image_width_pixels !== 'undefined' && typeof map_image_height_pixels !== 'undefined') {
        const mapContainer = document.getElementById('map');
        const containerWidth = mapContainer.offsetWidth;
        const containerHeight = mapContainer.offsetHeight;
        
        const scaleX = containerWidth / map_image_width_pixels;
        const scaleY = containerHeight / map_image_height_pixels;
        const minScale = Math.min(scaleX, scaleY);
        
        const imageBounds = base_map.getBounds();
        const coordWidth = imageBounds.getEast() - imageBounds.getWest();
        const coordHeight = imageBounds.getNorth() - imageBounds.getSouth();
        
        const coordToPixelScaleX = containerWidth / coordWidth;
        const coordToPixelScaleY = containerHeight / coordHeight;
        const coordToPixelScale = Math.min(coordToPixelScaleX, coordToPixelScaleY);
        
        const calculatedMinZoom = Math.log2(coordToPixelScale);
        
        map.setMinZoom(calculatedMinZoom);
        
        setTimeout(() => {
            map.setZoom(calculatedMinZoom);
        }, 50);
        
    } else {
        let currentZoom = map.getZoom();
        map.setMinZoom(currentZoom);
        
        setTimeout(() => {
            map.setZoom(currentZoom);
        }, 50);
    }

    let coordDisplay = L.control({position: 'bottomright'});
    coordDisplay.onAdd = function(map) {
        this._div = L.DomUtil.create('div', 'coordinate-display');
        this._div.innerHTML = '(0, 0)';
        return this._div;
    };
    coordDisplay.addTo(map);

    map.on('mousemove', function(e) {
        if (typeof game_units_per_pixel !== 'undefined' && 
            typeof game_top_left_x !== 'undefined' && 
            typeof game_top_left_y !== 'undefined' &&
            typeof map_image_width_pixels !== 'undefined' &&
            typeof map_image_height_pixels !== 'undefined') {
            
            let imageBounds = base_map.getBounds();
            let topLeft = imageBounds.getNorthWest();
            let bottomRight = imageBounds.getSouthEast();
            
            let relativeX = (e.latlng.lng - topLeft.lng) / (bottomRight.lng - topLeft.lng);
            let relativeY = (e.latlng.lat - topLeft.lat) / (bottomRight.lat - topLeft.lat);
            
            relativeX = Math.max(0, Math.min(1, relativeX));
            relativeY = Math.max(0, Math.min(1, relativeY));
            
            // Game X increases downward, Y increases rightward
            let pixelX = relativeY * map_image_height_pixels;
            let pixelY = relativeX * map_image_width_pixels;
            
            let gameX = Math.round(game_top_left_x + (pixelX * game_units_per_pixel));
            let gameY = Math.round(game_top_left_y + (pixelY * game_units_per_pixel));
            
            coordDisplay._div.innerHTML = `(${gameX}, ${gameY})`;
        } else if (typeof game_units_per_pixel !== 'undefined' && 
                   typeof game_top_left_x !== 'undefined' && 
                   typeof game_top_left_y !== 'undefined') {
            
            let coords = map.project(e.latlng, 0);
            let imageBounds = base_map.getBounds();
            let topLeft = map.project(imageBounds.getNorthWest(), 0);
            
            let pixelX = coords.y - topLeft.y;
            let pixelY = coords.x - topLeft.x;
            
            let gameX = Math.round(game_top_left_x + (pixelX * game_units_per_pixel));
            let gameY = Math.round(game_top_left_y + (pixelY * game_units_per_pixel));
            coordDisplay._div.innerHTML = `(${gameX}, ${gameY})`;
        } else if (typeof game_units_per_pixel !== 'undefined') {
            let coords = map.project(e.latlng, 0);
            let gameX = Math.round(coords.y * game_units_per_pixel);
            let gameY = Math.round(coords.x * game_units_per_pixel);
            coordDisplay._div.innerHTML = `(${gameX}, ${gameY})`;
        } else {
            let coords = map.project(e.latlng, 0);
            let gameX = Math.round(coords.y);
            let gameY = Math.round(coords.x);
            coordDisplay._div.innerHTML = `(${gameX}, ${gameY})`;
        }
    });

}

fetchData();