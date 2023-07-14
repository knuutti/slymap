const getFeature = async (feature, layer) => {
    const type = feature.properties.type;
    if (type == "bottle") {
        const coords = feature.properties.location;
        layer.bindPopup(
            `Coordinates: ${coords.x}, ${coords.y}, ${coords.z}`
        )
    } else if (type == "treasure") {
        const coords = feature.properties.location;
        const name = feature.properties.name;
        const time = feature.properties.time;
        const value = feature.properties.value;
        if (time) {
            layer.bindPopup(
                `<strong>${name}</strong><br>Value: ${value}<br>Time limit: ${time}s<br>Coordinates: ${coords.x}, ${coords.y}, ${coords.z}`
            )
        } else {
            layer.bindPopup(
                `<strong>${name}</strong><br>Value: ${value}<br>Coordinates: ${coords.x}, ${coords.y}, ${coords.z}`
            )
        }
        
    } else {
        const coords = feature.properties.location;
        const name = feature.properties.name;
        layer.bindPopup(
            `<strong>${name}</strong><br>Coordinates: ${coords.x}, ${coords.y}, ${coords.z}`
        )
    }

};

const getIcon = (url, size, anchor, popup) => {
    const icon = L.icon({
        iconUrl: url,
        iconSize:     size, // size of the icon
        shadowSize:   [0, 0], // size of the shadow
        iconAnchor:   anchor, // point of the icon which will correspond to marker's location
        shadowAnchor: [0, 0],  // the same for the shadow
        popupAnchor:  popup // point from which the popup should open relative to the iconAnchor
    })
    return icon
}

const fetchData = async () => {
    let data = {};
    let url1 = "./geojson/bottles.json";
    let res1 = await fetch(url1)
    data["bottles"] = await res1.json();

    let url2 = "./geojson/treasures.json";
    let res2 = await fetch(url2)
    data["treasures"] = await res2.json();

    let url3 = "./geojson/jobs.json";
    let res3 = await fetch(url3)
    data["jobs"] = await res3.json();

    let url4 = "./geojson/safehouse.json";
    let res4 = await fetch(url4)
    data["safehouse"] = await res4.json();

    initMap(data)
}

const initMap = (data) => {
    let map = L.map('map', {
        minZoom: 8,
        maxZoom: 11,
        zoomSnap: 0.25,
        crs: L.CRS.Simple
    })

    // Setting the bounds of the map (some arbitary x-offset is needed in this case)
    const xOffset = .89
    let sw = map.unproject(L.point(-1.2749273959341,-1.65246853823814133+xOffset));
    let ne = map.unproject(L.point(1.14520813165537,0.7676669893514036786+xOffset));

    // Base map
    let base_map = L.imageOverlay("./maps/map.png", [[sw.lat,sw.lng], [ne.lat,ne.lng]]).addTo(map)
    let base_map_bw = L.imageOverlay("./maps/map_bw.png", [[sw.lat,sw.lng], [ne.lat,ne.lng]])

    let tunnel = L.imageOverlay("./maps/tunnel.png", [[sw.lat,sw.lng], [ne.lat,ne.lng]])

    // Bottle icons
    let bottle_icon = getIcon("../../assets/bottle.png", [20, 32], [10, 16], [0, -28])
    let treasure_icon = getIcon("../../assets/treasure.png", [20, 32], [7, 28], [0, -28])
    let sly_icon = getIcon("../../assets/sly.png", [30, 30], [15, 15], [0, -28])
    let bentley_icon = getIcon("../../assets/bentley.png", [30, 30], [15, 15], [0, -28])
    let murray_icon = getIcon("../../assets/murray.png", [30, 30], [15, 15], [0, -28])
    let safehouse_icon = getIcon("../../assets/safehouse.png", [30, 30], [15, 15], [0, -28])

    // Bottles on the map from GeoJSON data
    let bottles = L.geoJSON(data["bottles"], {
        pointToLayer: function(feature,latlng) {
            return L.marker(latlng,{icon: bottle_icon})
            
        },
        onEachFeature: getFeature,
        weight: 2
    })

    let treasures = L.geoJSON(data["treasures"], {
        pointToLayer: function(feature,latlng) {
            return L.marker(latlng,{icon: treasure_icon})
            
        },
        onEachFeature: getFeature,
        weight: 2
    })

    let safehouse = L.geoJSON(data["safehouse"], {
        pointToLayer: function(feature,latlng) {
            return L.marker(latlng,{icon: safehouse_icon})
            
        },
        onEachFeature: getFeature,
        weight: 2
    })

    let jobs = L.geoJSON(data["jobs"], {
        pointToLayer: function(feature,latlng) {
            const character = feature.properties.character;
            if (character == "sly") {
                return L.marker(latlng,{icon: sly_icon})
            } else if (character == "bentley") {
                return L.marker(latlng,{icon: bentley_icon})
            } else {
                return L.marker(latlng,{icon: murray_icon})
            }
        },
        onEachFeature: getFeature,
        weight: 2
    }).addTo(map)

    let layerControl = L.control.layers().addTo(map);

    layerControl.addBaseLayer(base_map, "Prague Hub")
    layerControl.addBaseLayer(base_map_bw, "Prague Hub (Gray)")

    layerControl.addOverlay(tunnel, "Tunnel");
    layerControl.addOverlay(bottles, "Bottles");
    layerControl.addOverlay(treasures, "Treasures");
    layerControl.addOverlay(jobs, "Jobs");
    layerControl.addOverlay(safehouse, "Safe House");

    
    // Map on screen
    map.fitBounds(base_map.getBounds())

}

fetchData();