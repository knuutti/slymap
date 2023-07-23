const map_min_zoom = 8;
const map_max_zoom = 11;

const x_offset = 0.32;
const y_offset = 0;

const map_sw_x = -1.4872611464968 + x_offset;
const map_sw_y = -0.93736730360934 + y_offset;
const map_ne_x = 1.16666666666 + x_offset;
const map_ne_y = 1.7165605095541 + y_offset;

// This includes all the additional image layers and their paths
const map_layers = {
    "Cave": "./maps/cave_color.png",
    "Palace Tunnel": "./maps/palace_tunnel_color.png",
    "Small Tunnel": "./maps/small_tunnel_color.png",
    "Vines": "./maps/vines_color.png",
    "Poles": "./maps/poles_color.png"
}