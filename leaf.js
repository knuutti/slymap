/* allow x,y coordinates to be used with leaflet */
const yx = L.latLng;
const xy = function(x, y) {
  if (Array.isArray(x)) { // When doing xy([x, y]);
    return yx(x[1], x[0]);
  }
  return yx(y, x); // When doing xy(x, y);
};

function sf_remap(coords, stage_name, mouse = false) {
  /* map images are 4096x4096 pixels while
   * in-game island size varies.
   * this function remaps in-game coordinates to
   * pixels
   * coords is [x, y] array
   * returns latlng object
   * * * * * * * * * * * * * * * * * * * * * * * */
  const origins = {
    paris: {
      origin: [1973, 2130],
      scale_factor: 0.1406
    },
    canada1: {
      origin: [2197, 1912],
      scale_factor: 0.1418
    },
	blimp: {
      origin: [2038, 2067],
      scale_factor: 0.136
    },
	cairo: {
      origin: [2177, 1887],
      scale_factor: 0.0603
    },
	india1: {
      origin: [1973, 2568],
      scale_factor: 0.1269
    },
	india2: {
      origin: [2283, 1898],
      scale_factor: 0.146
    },
	prague1: {
      origin: [2675, 1967],
      scale_factor: 0.151
    },
	prague2: {
      origin: [1972, 2354],
      scale_factor: 0.136
    },
	canada2: {
		origin: [2132, 1784],
		scale_factor: 0.131
	},
	venice: {
		origin: [1487, 2052],
		scale_factor: 0.144
	},
	outback: {
		origin: [2159, 2303],
		scale_factor: 0.162
	},
	holland: {
		origin: [2309, 2371],
		scale_factor: 0.156
	},
	china: {
		origin: [1924, 2281],
		scale_factor: 0.1447
	},
	pirates: {
		origin: [1630, 1750],
		scale_factor: 0.123
	},
	sailing: {
		origin: [1889, 2146],
		scale_factor: 0.00413
	},
	kaine: {
		origin: [2093, 2261],
		scale_factor: 0.0663
	}
  };
  const origin = origins[stage_name].origin;
  const scale_factor = origins[stage_name].scale_factor;
	if(!Array.isArray(coords)) {
		return coords / scale_factor;
	}
  if (mouse) {
    const new_x = Math.round((coords[0] - origin[0]) / scale_factor);
    const new_y = Math.round((-coords[1] + origin[1]) / scale_factor);
    return [new_x, new_y];
  } else {
    return xy((scale_factor * coords[0]) + origin[0], (scale_factor * coords[1]) + origin[1]);
  }
}

const MapNames = {
	cairo: 'cairo',
	paris: 'paris',
	india1: 'india1',
	india2: 'india2',
	prague1: 'prague1',
	prague2: 'prague2',
	canada1: 'canada1',
	canada2: 'canada2',
	blimp: 'blimp',
	venice: 'venice',
	outback: 'outback',
	holland: 'holland',
	china: 'china',
	pirates: 'pirates',
	sailing: 'sailing',
	kaine: 'kaine'
};

var mapsPlaceholder = [];
L.Map.addInitHook(function() {
  mapsPlaceholder.push(this); // Use whatever global scope variable you like.
});

	function sf_multi_remap(points, stage_name) {
		let remappedPoints = [];
		points.forEach((point) => {

			if(!isNaN(point[0]) && !isNaN(point[1])) {
			remappedPoint = sf_remap([point[0], point[1]], stage_name);
			remappedPoints.push(remappedPoint);
			}
		});
			return remappedPoints;
	}

 let drawnItems = new L.FeatureGroup();


function loadMap(stage_name) {

    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set('map', Object.keys(MapNames).find(key => MapNames[key] === stage_name));
    var newRelativePathQuery = window.location.pathname + '?' + searchParams.toString();
    history.pushState(null, '', newRelativePathQuery);

  var container = mapsPlaceholder.pop();
  if (container != null) {
    container.off();
    container.remove();
  }
  map = L.map('map', {
    crs: L.CRS.Simple,
    preferCanvas: true,
    attributionControl: false,
    zoomSnap: 0.25,
    minZoom: -3,
    maxZoom: 2,
  }).setView([1975, 2203], -1.5);

     map.addLayer(drawnItems);
     var drawControl = new L.Control.Draw({
		 position: 'topleft',
		 draw: {
			 polyline: {
				 showLength: false,
				 zIndexOffset: 5555,
				 metric: true,
				 shapeOptions: {
					 color: 'rgb(10, 110, 220)',
					 weight: 5,
					 opacity: 1,
				 }

				
			 },
			 polygon: false,
			 rectangle: false,
			 circle: {
				 showLength: false,
				 zIndexOffset: -50,
				 metric: true,
				 shapeOptions: {
					 color: 'rgb(210, 110, 20)',
					 fill: false,
					 weight: 3,
					 opacity: 1,
				 }
			 },

			 circlemarker: false,
		 },
         edit: {
             featureGroup: drawnItems
         }
     });
	map.on(L.Draw.Event.CREATED, function (event) {


  var layer = event.layer;
  drawnItems.addLayer(layer);
});
	map.addLayer(drawnItems);

  const bounds = [
    [0, 0],
    [4096, 4096]
  ];

$(document).ready(function() {
	let poly_color = $("input[type=color]").val();
	let loaded_paths = new L.FeatureGroup();
	let path_markers = new L.FeatureGroup();
	loaded_paths.addTo(map);
	path_markers.addTo(map);

		let latlngs = [];
		let line_tooltips = [];

	$('div#coordinates>div').on("click", function() {
		if($("#coordinates form").css('display') == 'none') {
			$('div#coordinates form').css('display', 'flex');
			$('div#coordinates').css('width', 250);
			$(this).text( "Hide Inputs");
		}
		else {
			$('div#coordinates form').css('display', 'none');
			$('div#coordinates').css('width', 80);
			$(this).text( "Load CSV");

		}
	});
	$('input[type=color]').on("input", function() {
		poly_color = $(this).val();
		drawnItems.eachLayer((layer)=> {
				layer.setStyle({ color: poly_color });
		});
		loaded_paths.eachLayer((layer)=> {
				layer.setStyle({ color: poly_color });
		});
	});

	function getMinMax(array, property) {
		// return min and max value for property in array 
		let min = array[0][property];
		let max = array[0][property];

		array.forEach((item) => {
			const val = item[property];
			min = val < min ? val : min;
			max = val > max ? val : max;
		});
		return {min: min, max: max};
	}

	$("#coordinates form").on("submit", function(event) {
		event.preventDefault();

		const coordinates_array = $("#coordinates textarea").val()?.split('\n');

		coordinates_array.forEach((row) => {
			const values = row.split(',');
			if(Array.isArray(values) && values.length >= 3) {
			// const remapped_coordinates = sf_remap([values[0], values[2]], stage_name);
			latlngs.push([values[0], -values[2]]);

			line_tooltips.push({x: values[0], y: parseInt(values[1]), z: values[2], timestamp: values[3] ?? null});
			}
		});

		latlngs = sf_multi_remap(latlngs, stage_name);
		new L.polyline(latlngs, {color: poly_color}).addTo(loaded_paths);
		const {min, max} = getMinMax(line_tooltips, 'y');

		latlngs.forEach((latlng, index) => {
			const {x,y,z, timestamp} = line_tooltips[index];
			const color_intensity = Math.min(120, ((y - min) / 800 * 120))+ 240;
			if (timestamp) {
				timestamp_text = "<p><span class='emphasize'>Timestamp: </span> " + timestamp / 1000 + "</p>";
			}
			const tooltip = "<p><span class='emphasize'>X, Y, Z:</span> " + [x,y,z].join(', ') + "</p>" + ( timestamp? timestamp_text : '');
			L.circleMarker(latlng, {
				radius: 2,
				weight: 1,

				color: 'hsl('+color_intensity+',100%,50%)',
				zIndex: 1200,
			}).bindPopup(tooltip).addTo(path_markers);


		});
	});
	$("#coordinates div>button").on("click", function() {
		loaded_paths.eachLayer((layer)=> {
			layer.remove();
		});
		path_markers.eachLayer((layer)=> {
			layer.remove();
		});
		latlngs = [];
		line_tooltips = [];
	});
	$("#coordinates button#toggle_path_markers").on("click", function() {
		if(map.hasLayer(path_markers)) {
			path_markers.remove();
		}
		else {
			path_markers.addTo(map);
		}
	});

});

let colorPicker = L.Control.extend({

    _container: null,
    options: {
      position: 'topleft'
    },

    onAdd: function() {
      var menu = L.DomUtil.create('div', 'colors');
      menu.innerHTML = '<input type="color" value="#8adeff" >';
		return menu;
	},});


let MapSwitcher = L.Control.extend({
    _container: null,
    options: {
      position: 'bottomleft'
    },

    onAdd: function() {
      var menu = L.DomUtil.create('div', 'menu');
      
      const maps = [
        { id: 'cairo', name: 'Cairo' },
        { id: 'paris', name: 'Paris' },
        { id: 'india1', name: 'Rajan\'s Palace' },
        { id: 'india2', name: 'Spice Temple' },
        { id: 'prague1', name: 'Contessa\'s Jail' },
        { id: 'prague2', name: 'Contessa\'s Castle' },
        { id: 'canada1', name: 'Nunavut Bay' },
        { id: 'canada2', name: 'Lumber Camp' },
        { id: 'blimp', name: 'Arpeggio\'s Blimp' },
        { id: 'venice', name: 'Venice' },
        { id: 'outback', name: 'Outback' },
        { id: 'holland', name: 'Holland' },
        { id: 'china', name: 'China' },
		{ id: 'pirates', name: 'Blood-Bath Bay' },
		{ id: 'sailing', name: 'Sailing Map' },
		{ id: 'kaine', name: 'Kaine Island' },
      ];
      
      let selectHTML = '<div class="map-selector-container">' +
        '<label for="map-selector">Select Map:</label>' +
        '<select id="map-selector" onchange="loadMap(this.value)">';
      
      maps.forEach(map => {
        const selected = stage_name === map.id ? ' selected' : '';
        selectHTML += `<option value="${map.id}"${selected}>${map.name}</option>`;
      });
      
      selectHTML += '</select></div>';
      menu.innerHTML = selectHTML;
      
      return menu;
    },

  });

  let position = L.Control.extend({
    _container: null,
    options: {
      position: 'bottomleft'
    },

    onAdd: function() {
      var latlng = L.DomUtil.create('div', 'mouseposition');
      this._latlng = latlng;
      this._latlng.innerHTML = "X: 0 ; Y: 0";
      return latlng;
    },

    updateHTML: function(lat, lng) {
      const [y, x] = sf_remap([lng, lat], stage_name, true);
      var latlng = "X: " + x + " ; Y: " + y;
      this._latlng.innerHTML = latlng;
    }
  });
  this.position = new position();
  map.addControl(this.position);

  this.mapswitcher = new MapSwitcher();
  this.mapswitcher.addTo(map);

  this.colorPicker = new colorPicker();
  this.colorPicker.addTo(map);

  map.addEventListener('mousemove', (event) => {
    let lat = Math.round(event.latlng.lat);
    let lng = Math.round(event.latlng.lng);
    this.position.updateHTML(lat, lng);
  });

// L.Control.textbox = L.Control.extend({
// 		onAdd: function() {
			
// 		var text = L.DomUtil.create('div');
// 		text.id = "title";
// 		text.innerHTML = "<h1>SlyMap</h1>";
// 		text.innerHTML += "<p style='text-align: center;'>Maps rendered by Knuutti. Webpage layout by SoniMap.</p>";
// 		return text;
// 		},

// 	});
// 	L.control.textbox = function(opts) { return new L.Control.textbox(opts);};
// 	L.control.textbox({ position: 'topleft'}).addTo(map);

     map.addControl(drawControl);

  var img = L.imageOverlay('./base_img/' + stage_name + '.png', bounds);
  img.addTo(map);

  get_marker_data(map, stage_name);


        // Truncate value based on number of decimals
        var _round = function(num, len) {
            return Math.round(num*(Math.pow(10, len)))/(Math.pow(10, len));
        };
        // Helper method to format LatLng object (x.xxxxxx, y.yyyyyy)
        var strLatLng = function(latlng) {
            return "("+_round(latlng.lat, 6)+", "+_round(latlng.lng, 6)+")";
        };

function getLinearDistance(pointA, pointB) {
	const distance = Math.sqrt( ((pointB[0] - pointA[0]) ** 2) + ((pointB[1] - pointA[1]) ** 2));
	return Math.round(distance, 0);
}

        var getPopupContent = function(layer) {
            // Marker - add lat/long
            if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
				const currentLatlng = layer.getLatLng();
				return 'X,Y: ' + sf_remap([currentLatlng.lng, currentLatlng.lat], stage_name, true).reverse().toString();

            // Circle - lat/long, radius
            } else if (layer instanceof L.Circle) {
                var center = layer.getLatLng(),
                    radius = layer.getRadius();
                return "Center: "+strLatLng(center)+"<br />" +"Radius: "+_round(radius, 2)+" m";
            // Rectangle/Polygon - area
            } else if (layer instanceof L.Polygon) {
                let latlngs = layer._defaultShape ? layer._defaultShape() : layer.getLatLngs(),
                    area = L.GeometryUtil.geodesicArea(latlngs);
                return "Area: "+L.GeometryUtil.readableArea(area, true);
            // Polyline - distance
            } else if (layer instanceof L.Polyline) {
                let latlngs = layer._defaultShape ? layer._defaultShape() : layer.getLatLngs(),
                    distance = 0;
                if (latlngs.length < 2) {
                    return "Distance: N/A";
                } else {
					let distances = [];
                    for (var i = 0; i < latlngs.length-1; i++) {
						const currentLatlng = sf_remap([latlngs[i].lng, latlngs[i].lat], stage_name, true);
						const nextLatlng = sf_remap([latlngs[i+1].lng, latlngs[i+1].lat], stage_name, true);
						const currentDistance = getLinearDistance(currentLatlng, nextLatlng);
						distances.push(currentDistance);
						distance += currentDistance;
                    }
					if (distances.length == 1) {
                    return "<ul class='distance'><li>Distance: "+ distance +" units</li></ul>";
					}
					else {
                    return "<ul class='distance'><li>Total Distance: "+ distance +" units</li>"+ 
						distances.map(function(item, index) { return "<li>Segment " + (parseInt(index)+1) + ": " + item + " units</li>"; }).join('') + '</ul>';
					}
                }

            }
            return null;
        };

        // Object created - bind popup to layer, add to feature group
        map.on(L.Draw.Event.CREATED, function(event) {
            var layer = event.layer;
            var content = getPopupContent(layer);
            if (content !== null) {
                layer.bindPopup(content);
            }
            drawnItems.addLayer(layer);
        });

        // Object(s) edited - update popups
        map.on(L.Draw.Event.EDITED, function(event) {
            var layers = event.layers,
                content = null;
            layers.eachLayer(function(layer) {
                content = getPopupContent(layer);
                if (content !== null) {
                    layer.setPopupContent(content);
                }
            });
        });


}



async function get_marker_data(map, stage_name) {

  function checkImage(src, bad) {
    var icon = new Image();
    icon.src = src;
    icon.onerror = bad;
  }

	function getMarker(item, file) {

  const iconList = {
    "Bottle": { iconUrl: './icons/bottle.png'},
	"Job Triggers": { iconUrl: './icons/sly_sq.png' },
  };


		if (!item.position) {
			return;
		}
	const coords = sf_remap([item?.position[0], -item?.position[1]], stage_name);
		let valid_image = true;
		let iconUrl = null;
		
		if (item.type == "Job Triggers") {
			switch(item.parameters.jobType) {
				case "sly":
					iconUrl = './icons/sly_sq.png';
					break;
				case "murray":
					iconUrl = './icons/murray_sq.png';
					break;
				case "bentley":
					iconUrl = './icons/bentley_sq.png';
					break;
			}
		}
		else if (iconList[item.type]) {
			iconUrl = iconList[item.type].iconUrl;
		}

		if (!iconUrl) {
			// circle marker path
			var radius = 8;
			let color = colorList[item.type];
			if (item.type == 'AirFloor') {
				return;
			}

			return (
              L.circleMarker(coords, {
				  radius: radius,
				  color: '#000000',
				  weight: 1,
				  opacity: 0.8,
				  fillOpacity: 0.7,
				  fillColor: color,
				  riseOnHover: true,
                })
              );
		}
		else {
              checkImage(iconUrl, function() {
				  valid_image = false;
              });


		if ( !valid_image ) {
			console.log('no img');
		}
			var size = 30;
			if (item.type == 'PortalBit' && file.includes('boss')) {
				size = 20;
			}
			
		return (
              L.canvasMarker(coords, {
                img: {
                  url: iconUrl,
                  size: [size, size],
                }
              })
		);
		}
 	
	}
	function rotatePolygon(position, dimensions, quaternion) {
		let axis = [0,0,0];
		const magnitude = 2 * Math.acos(quaternion[3]);

		if (1 - (quaternion[3] ** 2) < 0.000001) {
			axis[0] = quaternion[0];
			axis[1] = quaternion[1];
			axis[2] = quaternion[2];
		}
		else {
			const s = Math.sqrt(1 - (quaternion[3] ** 2));
			axis[0] = quaternion[0] / s;
			axis[1] = quaternion[1] / s;
			axis[2] = quaternion[2] / s;

		}

		const angle = axis[1] * magnitude;

		const x = position[0];
		const z = -position[2];
		const halfWidth = dimensions[0] * 0.5;
		const halfHeight = dimensions[2] * 0.5;

		const leftOrigin = [x - (halfWidth * Math.cos(angle)), z - (halfWidth * Math.sin(angle))];
		const rightOrigin = [x + (halfWidth * Math.cos(angle)), z + (halfWidth * Math.sin(angle))];

		const heightX = halfHeight *  Math.sin(angle);
		const heightZ = halfHeight *  Math.cos(angle);

		const bottomLeftVertex = [leftOrigin[0] + heightX, leftOrigin[1] -heightZ] ;
		const topLeftVertex = [leftOrigin[0] - heightX, leftOrigin[1] +heightZ] ;
		const bottomRightVertex = [rightOrigin[0] +heightX, rightOrigin[1] -heightZ] ;
		const topRightVertex = [rightOrigin[0] -heightX,  rightOrigin[1] +heightZ] ;

		if(isNaN(bottomLeftVertex)) {
		}
		return [bottomLeftVertex, topLeftVertex, topRightVertex, bottomRightVertex];
	}
	function getRectangle(item, color) {
		// Handle custom polygons with vertices
		if (item.parameters?.vertices && Array.isArray(item.parameters.vertices)) {
			const vertices = item.parameters.vertices.map(vertex => {
				const worldX = item.position[0] + vertex[0];
				const worldZ = item.position[2] + vertex[1];
				return sf_remap([worldX, -worldZ], stage_name);
			});
			const tooltip = "Custom Polygon: " + item.type;
			return new L.polygon(vertices, {color: color, weight: 1}).bindPopup(tooltip);
		}
		
		// Handle lines/polylines with points
		if (item.parameters?.points && Array.isArray(item.parameters.points)) {
			const points = item.parameters.points.map(point => {
				const worldX = item.position[0] + point[0];
				const worldZ = item.position[2] + point[1];
				return sf_remap([worldX, -worldZ], stage_name);
			});
			const tooltip = "Line: " + item.type;
			return new L.polyline(points, {color: color, weight: 3}).bindPopup(tooltip);
		}
		
		if (!item.parameters.extents && (!item.parameters.size ||  !Array.isArray(item.parameters.size) || item.parameters.size.length != 3)){
			if (item.type != 'AirFloor') {
			return;
			}
		}

		const quaternion = item.rotation ? item.rotation : [0,0,0,0];
		let size = item.parameters.size ?? item.parameters.extents;
		if (item.type == 'AirFloor') {
			switch(item.parameters.size) {
				case "LARGE":
					size = [20,0,20];
					break;
				case "MIDDLE":
					size = [10,0,10];
					break;
				case "SMALL":
					size = [5,0,5];
					break;
			}

		}
		const originalCoords = rotatePolygon(item.position, size, quaternion);
		if(isNaN(originalCoords[0][0])) {
			console.log(item);
		}
		const bounds = sf_multi_remap(originalCoords, stage_name);
		const formattedCoords = originalCoords.map((value) => {
			return [Math.round(value[0]), Math.round(-value[1])];
		});
		const tooltip = "Corners: <ul class='rectangle_tooltip'><li> " + formattedCoords.join("</li><li>") + "</li></ul>";

//		const rect = new L.polygon(bounds, {color: color, weight: 1}).bindPopup(tooltip);
 const rect = item.parameters.shape == 'Capsule' ? new L.circle(sf_remap([item.position[0], -item.position[2]], stage_name), {radius: sf_remap(item.parameters.radius, stage_name)}) : new L.polygon(bounds, {color: color, weight: 1}).bindPopup(tooltip);
		if (item.parameters.shape == 'Capsule') {
		}
		return rect;
}

function getPopup(item, filename) {
	var model = item.parameters.name ? '<p><span class="emphasize">model: </span>' + item.parameters.name + '</p>' : '';
	var contents = item.parameters?.dropItemParam?.dropItem ? '<p><span class="emphasize">contents: </span>' + item.parameters.dropItemParam.dropItem + '</p>' : '';
	var dimensions = Array.isArray(item.parameters?.size) ? '<p><span class="emphasize">dimensions: </span>' + item.parameters.size.join(', ') + '</p>' : '';

	var quantity = '';
	if (item?.parameters.dropItemParam?.dropItem == 'RING') {
		quantity = '<p><span class="emphasize">quantity: </span>' + 
						(parseInt(item.parameters.dropItemParam.dropNum) + item.parameters.dropItemParam.dropSuperRingNum*10) + ' rings (' + item.parameters.dropItemParam.dropSuperRingNum + ' big, ' + item.parameters.dropItemParam.dropNum + ' small)</p>';
	}
	else if (item.type == 'QuestBox') {
			quantity = '<p><span class="emphasize">quantity: </span>' + item.parameters.heightBoxNum * item.parameters.SideBoxNum * item.parameters.depthBoxNum * item.parameters.dropItemParam.dropNum;
	}
	else if (item?.parameters.dropItemParam?.dropItem == 'SKILL_PIECE') {
			quantity = item.parameters?.dropItemParam?.dropNum ? '<p><span class="emphasize">quantity: </span>' + 
							item.parameters.dropItemParam.dropNum * 200 + '</p>' : '';
		}

return (
                '<h1>' + item.name + '</h1>' +
                '<p><span class="emphasize">position:</span> ' +
                Math.round(item.position[0]) + ", " + Math.round(item.position[1]) + ", " +
                Math.round(item.position[2]) + '</p>' +
                '<p><span class="emphasize">file:</span> ' + filename + "</p>" +

				contents +
				quantity +
				dimensions + '<pre>'+ JSON.stringify(item, null, 2) + '</pre>'

);
}
  const layerList = {};
  const colorList = {};
  var fetches = [];
	fetch('./hson/file_list.txt').then((response) => response.text())
    .then((json_files) => {
      json_files.split("\n").filter(Boolean).filter(x => x.includes(stage_name)).forEach(file => {
        fetches.push(
          fetch('./hson/' + file)
          .then((response) => response.json())
          .then((json) => {
			  	if(!json?.objects) { 
				  	return ''; }
            json.objects.forEach((item) => {
				if(!item.position) {
					return;
				}

				if (item.parameters?.type) {
					item.type += " " + item.parameters.type;
				}

				if (!layerList.hasOwnProperty(item.type)) {
					layerList[item.type] = L.layerGroup();
					const randomColor = Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
					colorList[item.type] = '#' + randomColor;
				}

				const filename = file.replace('.hson','');
				const marker = getMarker(item, filename, colorList[item.type]);
				const popup = getPopup(item, filename);

				const box = getRectangle(item, colorList[item.type]);
				if (box && !marker?.options?.img?.url) {
					if(box.radius) {
					}
					box.bindPopup(popup, {maxWidth: 550}).addTo(layerList[item.type]);
				}
				else if (marker) {
					marker.bindPopup(popup, {maxWidth:550}).addTo(layerList[item.type]);
				}
            });
          }));
      });
    }).then(() => {
      Promise.all(fetches).then(function() {
        addControl(map, layerList);

		  $('section.leaflet-control-layers-list').css('height', 'calc(100vh - 100px)');

		const searchParams = new URLSearchParams(window.location.search);
		selectedMarkers = searchParams.getAll('markers').map((layerName) => decodeURI(layerName)) ?? 'StartPosition';
		  selectedMarkers.forEach((marker) => {
			  if(layerList.hasOwnProperty(marker)) {
				  layerList[marker].addTo(map);
			  }
		  });
				$("label").filter(function() { return (selectedMarkers.includes($(this).text().trim()));}).each(function() {
					const layerName = $(this).text().trim();
					const markerType = getMarkerType(layerList[layerName]._layers);
					const bgColor = (markerType === 'circle') ? colorList[layerName] : '#ffff88';
					$(this).css('background-color', bgColor + '88');
				});
		  addLayerInfoControl(map, layerList, selectedMarkers, colorList);
		  $('div.leaflet-control-layers.leaflet-control').prepend('<input autocomplete="off" id="objectFilter" type="search"></input>');
		  $('div.leaflet-control-layers.leaflet-control').prepend('<h2>Object Filters</h2>');
		  $("#objectFilter").on('input', function(e) {
			  let searchValue = e.target.value.toLowerCase();
			 $('.leaflet-control-layers-overlays>label').each(function() {
				 if ( $(this).text().toLowerCase().indexOf(searchValue)>= 0) {
					 $(this).show();
				 }
				 else {
					 $(this).hide();
				 }
			 });
		  });


	map.on({
	overlayadd: function(e) {
		const layerName = e.name;
		const markerType = getMarkerType(e.layer._layers);
		const bgColor = (markerType === 'circle') ? colorList[layerName] : '#ffff88';
		$("label").filter(function() { return ($(this).text() === ' '+layerName);}).css('background-color', bgColor + '88');

    const searchParams = new URLSearchParams(window.location.search);
    searchParams.append('markers', encodeURIComponent(layerName));
    var newRelativePathQuery = window.location.pathname + '?' + searchParams.toString();
    history.pushState(null, '', newRelativePathQuery);
		let selectedMarkers = searchParams.getAll('markers').map(layerName => decodeURI(layerName)) ?? 'StartPosition';

		  addLayerInfoControl(map, layerList, selectedMarkers, colorList);
	},
	overlayremove: function(e) {
		const layerName = e.name;
		$("label").filter(function() { return ($(this).text() === ' '+layerName);}).css('background-color', 'white');
		const searchParams = new URLSearchParams(window.location.search);
		const markerArray = searchParams.getAll('markers');
		searchParams.delete('markers');
		markerArray.forEach(function(marker) {
			if (decodeURIComponent(marker) != layerName) {
				searchParams.append('markers', marker);
			}
		});
		
		let selectedMarkers = searchParams.getAll('markers').map(layerName => decodeURIComponent(layerName));
		addLayerInfoControl(map, layerList, selectedMarkers, colorList);

		if (markerArray.length == 1) {
			$('#layerinfo').remove();
		}
		var newRelativePathQuery = window.location.pathname + '?' + searchParams.toString();
		history.pushState(null, '', newRelativePathQuery);
	},
});
}).catch((error) => {
		  console.warn(error);
		console.log('oh no 1');
		  return '';
	  });
    }).catch(() => {
		console.log('oh no 2');
		return '';
	});

}

function getMarkerType(layers) {
	const id = Object.keys(layers)[0];
	if (layers[id].options.hasOwnProperty('color')) {
		return 'circle';
	}
	else {
		return 'image';
	}
}


async function addControl(map, markers) {
  L.control.layers(null, markers, {
    collapsed: false,
    sortLayers: true,
  }).addTo(map);
}

function resetMarkers(map, layers, selectedLayerNames) {
		$('div.leaflet-control-layers-overlays input:checkbox').removeAttr('checked');
		$('div.leaflet-control-layers-overlays input').prop('checked', false);
		$('div.leaflet-control-layers-overlays label').css('background-color', 'white');
	$('#layerinfo').remove();
		const searchParams = new URLSearchParams(window.location.search);
		searchParams.delete('markers');
    var newRelativePathQuery = window.location.pathname + '?' + searchParams.toString();
    history.pushState(null, '', newRelativePathQuery);

	selectedLayerNames.forEach(function(layerName) {
		map.removeLayer(layers[layerName]);

	});
	$("#objectFilter").trigger('input');

}
function addLayerInfoControl(map, layers, selectedLayerNames, colorList=null) {

	if (selectedLayerNames.length == 0) {
		return;
	}
	$('#layerinfo').remove();

	L.Control.textbox = L.Control.extend({
		onAdd: function() {
			
		var text = L.DomUtil.create('div');
		text.id = "layerinfo";
		let html = "<ul>";
			html += "<li id='clear_markers'>Clear All</li>";
		selectedLayerNames.forEach( (layerName) => {
			if(layers.hasOwnProperty(layerName)) {
				let color = 'none';
				if (colorList && getMarkerType(layers[layerName]._layers) == 'circle') {
					color = colorList[layerName] + '88';
				}

			html += "<li style='background-color:" + color + "' >" + layerName + 
				" (" + Object.keys(layers[layerName]._layers).length + ")</li>";
			}
		});
		html += "</ul>";
		text.innerHTML = html;
		return text;
		},

	});
	L.control.textbox = function(opts) { return new L.Control.textbox(opts);};
	L.control.textbox({ position: 'topright'}).addTo(map);

	$('#clear_markers').on('click', function() {
		resetMarkers(map, layers, selectedLayerNames);
	});

}

const searchParams = new URLSearchParams(window.location.search);
const stage_name = MapNames[searchParams.get('map')] ?? 'paris';

loadMap(stage_name);


