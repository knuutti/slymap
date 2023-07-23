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
    let map = L.map('map', {
        minZoom: map_min_zoom,
        maxZoom: map_max_zoom,
        zoomSnap: 0.25,
        crs: L.CRS.Simple
    })

    // Map parametres for each map are defined in details.js
    let sw = map.unproject(L.point(map_sw_y,map_sw_x));
    let ne = map.unproject(L.point(map_ne_y,map_ne_x));

    // Colorized base map is shown by default
    let base_map = L.imageOverlay("./maps/map.png", [[sw.lat,sw.lng], [ne.lat,ne.lng]]).addTo(map)
    let base_map_gray = L.imageOverlay("./maps/map_bw.png", [[sw.lat,sw.lng], [ne.lat,ne.lng]])

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
    layerControl.addBaseLayer(base_map_gray, "Background Map (Gray)")

    // Adding each feature to the layer control panel
    Object.entries(features).forEach(feature => {
        layerControl.addOverlay(feature[1], feature[0])
    })

    // Adding each image layer to the layer control panel
    Object.entries(map_layers).forEach(layer => {
        layerControl.addOverlay(L.imageOverlay(layer[1], [[sw.lat,sw.lng], [ne.lat,ne.lng]]), layer[0])
    })
    
    // Map on screen
    map.fitBounds(base_map.getBounds())

}

fetchData();