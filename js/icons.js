const getIcon = (url, size, anchor, popup) => {
    return L.icon({
        iconUrl: url,
        iconSize:     size, 
        shadowSize:   [0, 0],
        iconAnchor:   anchor,
        shadowAnchor: [0, 0],
        popupAnchor:  popup
    })
}

const bottle_icon = getIcon("../../assets/bottle.png", [20, 32], [7, 28], [0, -28])
const treasure_icon = getIcon("../../assets/treasure.png", [20, 32], [7, 28], [0, -28])
const sly_icon = getIcon("../../assets/sly.png", [30, 30], [15, 15], [0, -28])
const bentley_icon = getIcon("../../assets/bentley.png", [30, 30], [15, 15], [0, -28])
const murray_icon = getIcon("../../assets/murray.png", [30, 30], [15, 15], [0, -28])
const safehouse_icon = getIcon("../../assets/safehouse.png", [30, 30], [15, 15], [0, -28])
const satellite_icon = getIcon("../../assets/satellite.png", [30, 30], [15, 15], [0, -28])
const alarm_icon = getIcon("../../assets/alarm.png", [30, 30], [15, 15], [0, -28])
const lightning_rod_icon = getIcon("../../assets/lightning_rod.png", [30, 30], [15, 15], [0, -28])
const security_icon = getIcon("../../assets/camera.png", [30, 30], [15, 15], [0, -28])
const terminal_icon = getIcon("../../assets/computer.png", [30, 30], [15, 15], [0, -28])

// feature type in GeoJSON -> corresponding icon
const icons = {
    "bottle": bottle_icon,
    "treasure": treasure_icon,
    "sly_job": sly_icon,
    "bentley_job": bentley_icon,
    "murray_job": murray_icon,
    "safehouse": safehouse_icon,
    "satellite": satellite_icon,
    "alarm": alarm_icon,
    "rod": lightning_rod_icon,
    "terminal": terminal_icon,
    "security": security_icon
}