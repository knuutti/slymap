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

    let url3 = "./geojson/locations.json";
    let res3 = await fetch(url3)
    data["locations"] = await res3.json();

    initMap(data)
}

const initMap = (data) => {
    let map = L.map('map', {
        minZoom: 8,
        maxZoom: 11,
        crs: L.CRS.Simple
    })

    // Setting the bounds of the map (some arbitary x-offset is needed in this case)
    const xOffset = .073865179437439379243452958292919
    let sw = map.unproject(L.point(-1.5809893307468477206595538312318,-1.4917555771096023278370514064+xOffset));
    let ne = map.unproject(L.point(1.3288069835111542192046556741028,1.418040737148399612027158098933+xOffset));

    // Base map
    let ep6 = L.imageOverlay("./maps/map.png", [[sw.lat,sw.lng], [ne.lat,ne.lng]]).addTo(map)

    // Bottle icons
    let bottle_icon = getIcon("../../assets/bottle.png", [20, 32], [7, 28], [0, -28])
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
    }).addTo(map)

    let treasures = L.geoJSON(data["treasures"], {
        pointToLayer: function(feature,latlng) {
            return L.marker(latlng,{icon: treasure_icon})
            
        },
        onEachFeature: getFeature,
        weight: 2
    }).addTo(map)

    let locations = L.geoJSON(data["locations"], {
        pointToLayer: function(feature,latlng) {
            if (feature.properties.type == "job") {
                const character = feature.properties.character;
                if (character == "sly") {
                    return L.marker(latlng,{icon: sly_icon})
                } else if (character == "bentley") {
                    return L.marker(latlng,{icon: bentley_icon})
                } else {
                    return L.marker(latlng,{icon: murray_icon})
                }
            } else if (feature.properties.type == "safehouse") {
                return L.marker(latlng,{icon: safehouse_icon})
            }
            
            
            
        },
        onEachFeature: getFeature,
        weight: 2
    }).addTo(map)

    let layerControl = L.control.layers().addTo(map);

    layerControl.addOverlay(bottles, "Bottles");
    layerControl.addOverlay(treasures, "Treasures");
    layerControl.addOverlay(locations, "Locations");
    
    // Map on screen
    map.fitBounds(ep6.getBounds())

}

fetchData();