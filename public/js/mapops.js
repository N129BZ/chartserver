'use strict';

// application constants
let URL_HOST_BASE           = window.location.hostname + (window.location.port ? ':' + window.location.port : '');
let URL_HOST_PROTOCOL       = window.location.protocol + "//";
let URL_SERVER              = `${URL_HOST_PROTOCOL}${URL_HOST_BASE}`;
let URL_GET_TILESETS        = `${URL_SERVER}/tiles/tilesets`;
let URL_GET_VFRSEC_TILE     = `${URL_SERVER}/tiles/vfrsectile/{z}/{x}/{-y}.png`;
let URL_GET_TERM_TILE       = `${URL_SERVER}/tiles/termtile/{z}/{x}/{-y}.png`;
let URL_GET_HELI_TILE       = `${URL_SERVER}/tiles/helitile/{z}/{x}/{-y}.png`;
let URL_GET_CARIB_TILE      = `${URL_SERVER}/tiles/caribtile/{z}/{x}/{-y}.png`;
let URL_GET_GCAO_TILE       = `${URL_SERVER}/tiles/gcaotile/{z}/{x}/{-y}.png`;
let URL_GET_GCGA_TILE       = `${URL_SERVER}/tiles/gcgatile/{z}/{x}/{-y}.png`;
let URL_GET_HISTORY         = `${URL_SERVER}/gethistory`;
let URL_GET_SETTINGS        = `${URL_SERVER}/getsettings`;
let URL_PUT_HISTORY         = `${URL_SERVER}/puthistory`;
let URL_GET_AIRPORTS        = `${URL_SERVER}/getairports`;
let URL_GET_METARS          = `${URL_SERVER}/getmetars`;
let URL_GET_TAF             = `${URL_SERVER}/gettaf`;
let URL_GET_PIREPS          = `${URL_SERVER}/getpireps`;

let settings = {};
let getmetars = false;
let airportJson = {};
let last_longitude = -97;
let last_latitude = 38;
let last_heading = 0;
let apfeatures = [];
let airportLayer;
let airportVectorSource;
let vfrsecLayer;
let termLayer;
let heliLayer;
let caribLayer;
let gcaoLayer;
let gcgaLayer;
let osmLayer;
let tiledebug;

$.ajax({
    async: false,
    type: "GET",
    url: URL_GET_SETTINGS,
    success: (data) => {
        try {
            settings = JSON.parse(data);
            getmetars = settings.getmetars;
        }
        catch(err) {
            console.log(err);
        }
    }
});

const metarpopup = document.getElementById('popup');
const metarcontent = document.getElementById('popup-content');
const metarcloser = document.getElementById('popup-closer');

const metaroverlay = new ol.Overlay({
    element: metarpopup,
    autoPan: true,
    autoPanAnimation: {
      duration: 250,
    },
});

const loadingpopup = document.getElementById('loadingpopup');
const loadingcontent = document.getElementById('loadingpopup-content');
const loadingcloser = document.getElementById('loadingpopup-closer');

const loadingoverlay = new ol.Overlay({
    element: loadingpopup,
    autoPan: true,
    autoPanAnimation: {
      duration: 250,
    },
});
loadingoverlay.setPosition(undefined);

metarcloser.onclick = function () {
    metaroverlay.setPosition(undefined);
    metarcloser.blur();
    return false;
};

let airplaneElement = document.getElementById('airplane');
airplaneElement.style.transform = "rotate(" + last_heading + "deg)";
airplaneElement.src = `${URL_SERVER}/img/${settings.ownshipimage}`;

$.ajax({
    async: false,
    type: "GET",
    url: URL_GET_HISTORY,
    success: function (data) {
        try {
            let histobj = JSON.parse(data);
            last_longitude = histobj.longitude;
            last_latitude = histobj.latitude;
            last_heading = histobj.heading;
        }
        catch(err) {
            console.log(err);
        }
    }
});

function getAirportMetars(airportlist) {
    let retval = "";
    $.ajax({
        async: false,
        type: "GET",
        url: `${URL_GET_METARS}/${airportlist}`,
        success: function(data) {
            retval = data;
        }
    });
    return retval;
}

function getTaf(airport) {
    let retval = "";
    $.ajax({
        async: false,
        type: "GET",
        url: `${URL_GET_TAF}/${airport}`,
        success: function(data) {
            retval = data;
        }
    });
    return retval;
}

function getPireps() {
    let retval = "";
    $.ajax({
        async: false,
        type: "GET",
        url: URL_GET_PIREPS,
        success: function(data) {
            retval = data;
        }
    });
    return retval;
}

let pos = ol.proj.fromLonLat([last_longitude, last_latitude]);
let ext = [-180, -85, 180, 85];
let offset = [-18, -18];

const map = new ol.Map({
    target: 'map',
    view: new ol.View({
        center: pos,        
        zoom: settings.startupzoom,
        enableRotation: false
    }),
    overlays: [metaroverlay, loadingoverlay]
});

// Icon Markers
const mvfrMarker = new ol.style.Icon({
    src: './img/mvfr.png',
    size: [45, 45],
    offset: [0, 0],
    opacity: 1,
    scale: .25
});

const vfrMarker = new ol.style.Icon({
    src: './img/vfr.png',
    size: [45, 45],
    offset: [0, 0],
    opacity: 1,
    scale: .25
});

const ifrMarker = new ol.style.Icon({
    src: './img/ifr.png',
    size: [45, 45],
    offset: [0, 0],
    opacity: 1,
    scale: .25
});

const lifrMarker = new ol.style.Icon({
    src: './img/lifr.png',
    size: [45, 45],
    offset: [0, 0],
    opacity: 1,
    scale: .25
});

const vfrStyle = new ol.style.Style({
    image: vfrMarker
});

const mvfrStyle = new ol.style.Style({
    image: mvfrMarker
});

const ifrStyle = new ol.style.Style({
    image: ifrMarker
});

const lifrStyle = new ol.style.Style({
    image: lifrMarker
});

const circleStyle = new ol.style.Circle({
    radius: 5,
    fill: null,
    stroke: new ol.style.Stroke({color: 'red', width: 1}),
});

const myairplane = new ol.Overlay({
    element: airplaneElement
});

myairplane.setOffset(offset);
myairplane.setPosition(pos);
map.addOverlay(myairplane);

let currZoom = map.getView().getZoom();

function loadAirportsArray(jsonobj) {
    jsonobj.airports.forEach(airport => {
        let ident = airport.ident;
        let aptype = airport.type;
        let lon = airport.lonlat[0];
        let lat = airport.lonlat[1];
        if (airport.type === 'large_airport' || airport.type === 'medium_airport') {
            let marker = new ol.Feature({
                geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
                name: ident,
                type: aptype,
                elevation: airport.elevation
            });
            marker.setStyle(vfrStyle);
            marker.setId(ident);
            apfeatures.push(marker);
        }
    });

    airportVectorSource = new ol.source.Vector({
        features: apfeatures
    });
}

let chkmetars = document.createElement('input');
chkmetars.type = "checkbox";
chkmetars.id = "chkmetars";
chkmetars.checked = false;
chkmetars.addEventListener('change', () => {
    let checked = chkmetars.checked;
    if (!getmetars && checked) {
        getMetarsForCurrentView(true);
    }
    getmetars = checked;
});

let chkdiv = document.createElement('div');
chkdiv.className = 'ol-control-panel ol-unselectable ol-control';
chkdiv.innerHTML="<b>Get Airport Metars</b>&nbsp;";
chkdiv.appendChild(chkmetars);
chkdiv.style.position = "fixed";
chkdiv.style.top = "30px";
chkdiv.style.left = "83%"
chkdiv.style.visibility = "hidden";
chkdiv.style.fontFamily = "Arial, Helvetica, sans-serif";
let metarPanel = new ol.control.Control({
    element: chkdiv
});
map.addControl(metarPanel);

/*
let wsweather = new WebSocket(settings.weatherurl);
wsweather.onopen = function(evt) {
    console.log(evt);
};
wsweather.onmessage = function(evt) {
    let data = JSON.parse(evt.data);
    console.log(data);
    try {
        let feature = airportVectorSource.getFeatureById(data.Location);
        if (feature !== null && data.Type === 'METAR') {
            feature.set('metar', data.Data);
            console.log(`metar set for ${data.Location}`);
        }
    }
    finally{}
};
*/

map.on('moveend', function(e) {
    try {
        let zoom = map.getView().getZoom();
        let rawnum = .045 * zoom;
        let rsz = rawnum.toFixed(3)
        resizeDots(rsz);
        currZoom = zoom;
        if (getmetars) {
            getMetarsForCurrentView(false);
        }
    }
    finally {}
});

map.on('pointermove', (evt) => {
    if (getmetars) {
        let hasfeature = false;
        map.forEachFeatureAtPixel(evt.pixel, function (feature) {
            if (feature) {
                hasfeature = true;
                let fmetar = feature.get('metar');
                let fcat = feature.get('fltcat');
                if (fmetar !== undefined) {
                    let coordinate = evt.coordinate;
                    metarcontent.innerHTML = `<p><code>${fcat}</code></p><p><code>${fmetar}</code></p>`;
                    metaroverlay.setPosition(coordinate);
                }
            }
        });
        if (!hasfeature) {
            metarcloser.onclick();
        }
    }
});

const closeLoadingPopup = () => {
    loadingoverlay.setPosition(undefined)
    loadingcloser.blur();
}

function getMetarsForCurrentView(isFirstTime) {
    if (isFirstTime) {
        loadingcontent.innerHTML = `<p><code>Loading METARS for airports in the current viewport...</code></p>`;
        loadingoverlay.setPosition(map.getView().getCenter());
        setTimeout(closeLoadingPopup, 2500); 
    }

    let metarlist = "";
    let extent = map.getView().calculateExtent(map.getSize());
    try { 
        airportVectorSource.forEachFeatureInExtent(extent, (feature) => {
            let name = feature.get('name');
            if (name.startsWith("K")) {
                let aptype = feature.get('type');
                if (currZoom < 7.5) {
                    if (aptype === 'large_airport') {
                        metarlist += `${name},`;
                    }
                }
                else if (aptype === 'large_airport' || aptype === 'medium_airport') {
                    metarlist += `${name},`;
                }
            }
        }); 
    }
    finally {
        metarlist = metarlist.substring(0, metarlist.length - 1);
        console.log(metarlist);
        let metars = getAirportMetars(metarlist);
        let xml = $.parseXML(metars);
        $(xml).find('METAR').each(function() {
            let id = $(this).find('station_id').text();
            let cat = $(this).find('flight_category').text();
            let metar = $(this).find('raw_text').text()
            let feature = airportVectorSource.getFeatureById(id);
            if (feature !== null) {
                console.log(`${cat}: ${metar}`);
                feature.set('metar', metar);
                feature.set('fltcat', cat);
                try {
                    switch (cat) {
                        case 'MVFR':
                            feature.setStyle(mvfrStyle);
                            break;
                        case 'LIFR':
                            feature.setStyle(lifrStyle);
                            break;
                        case 'IFR':
                            feature.setStyle(ifrStyle)
                            break;
                        case 'VFR':
                        default:
                            feature.setStyle(vfrStyle);
                            break;
                    }
                }
                finally{}
            }
        });
    }
}

function resizeDots(newscale) {
    console.log(`Resizing dots, new scale: ${newscale}`);
    vfrMarker.setScale(newscale);
    mvfrMarker.setScale(newscale);
    lifrMarker.setScale(newscale);
    ifrMarker.setScale(newscale);
}

$.get({
    async: true,
    type: "GET",
    url: URL_GET_AIRPORTS,
    success: (data) => {
        try {
            loadAirportsArray(JSON.parse(data));
        }
        catch(err) {
            console.log(err);
        }
    }
});

$.get(`${URL_GET_TILESETS}`, (data) => {
    ext = ol.proj.transformExtent(ext, 'EPSG:4326', 'EPSG:3857')
    let minzoom = 8;
    let maxzoom = 12;
    
    vfrsecLayer = new ol.layer.Tile({
        title: "VFR Sectional Chart",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_VFRSEC_TILE,
            maxZoom: maxzoom,
            minZoom: minzoom
        }),
        visible: true,
        extent: ext,
        zIndex: 10
    });
    
    termLayer = new ol.layer.Tile({
        title: "Terminal Area Charts",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_TERM_TILE,
            maxZoom: maxzoom,
            minZoom: minzoom
        }),
        visible: false,
        extent: ext,
        zIndex: 10
    });

    heliLayer = new ol.layer.Tile({
        title: "Helicopter Charts",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_HELI_TILE,
            maxZoom: maxzoom,
            minZoom: minzoom
        }),
        visible: false,
        extent: ext,
        zIndex: 10
    });

    caribLayer = new ol.layer.Tile({
        title: "Caribbean Charts",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_CARIB_TILE,
            maxZoom: maxzoom,
            minZoom: minzoom
        }),
        visible: false,
        extent: ext,
        zIndex: 10
    });

    gcaoLayer = new ol.layer.Tile({
        title: "Grand Canyon Air Operators",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_GCAO_TILE,
            maxZoom: maxzoom,
            minZoom: minzoom
        }),
        visible: false,
        extent: ext,
        zIndex: 10
    });

    gcgaLayer = new ol.layer.Tile({
        title: "Grand Canyon GA",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_GCGA_TILE,  
            maxZoom: maxzoom,
            minZoom: minzoom
        }),
        visible: false,
        extent: ext,
        zIndex: 10
    });

    if (settings.useOSMonlinemap) {
        osmLayer = new ol.layer.Tile({
            title: "OSM",
            type: "overlay",
            source: new ol.source.OSM(),
            visible: false,
            extent: ext,
            zIndex: 9
        });
    }

    tiledebug = new ol.layer.Tile({
        title: "Debug",
        type: "overlay",
        source: new ol.source.TileDebug(),
        visible: false,
        extent: ext,
        zIndex: 12
    });

    airportLayer = new ol.layer.Vector({
        title: "Airports",
        type: "overlay",
        source: airportVectorSource,
        visible: false,
        zIndex: 11
    }); 
    
    map.addLayer(tiledebug);
    map.addLayer(airportLayer); 
    map.addLayer(caribLayer);
    map.addLayer(gcaoLayer);
    map.addLayer(gcgaLayer);
    map.addLayer(heliLayer);
    map.addLayer(termLayer);
    map.addLayer(vfrsecLayer);
    if (settings.useOSMonlinemap) {
        map.addLayer(osmLayer);
    }

    let layerSwitcher = new ol.control.LayerSwitcher({
        tipLabel: 'Layers', 
        groupSelectStyle: 'children'
    });
    map.addControl(layerSwitcher);

    airportLayer.on('change:visible', () => {
        let visible = airportLayer.get('visible');
        chkdiv.style.visibility = visible ? "visible" : "hidden";
    });
});

if (settings.getmetars) {
    setInterval(redrawMetars, settings.metarintervalmsec);
}

if (settings.putpositionhistory) {
    setInterval(putPositionHistory, settings.histintervalmsec);
}

if (settings.getgpsfromstratux) {
    setInterval(getGpsData, settings.gpsintervalmsec);
}

function redrawMetars() {
    console.log("Timed METAR retrieval in progress");
    getMetarsForCurrentView(false);
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
//      JSON output returned by websocket connected Stratux at ws://[ipaddress]/situation (AHRS data)
//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// {"GPSLastFixSinceMidnightUTC":0,"GPSLatitude":0,"GPSLongitude":0,"GPSFixQuality":0,"GPSHeightAboveEllipsoid":0,"GPSGeoidSep":0,
//  "GPSSatellites":0,"GPSSatellitesTracked":0,"GPSSatellitesSeen":2,"GPSHorizontalAccuracy":999999,"GPSNACp":0,"GPSAltitudeMSL":0,
//  "GPSVerticalAccuracy":999999,"GPSVerticalSpeed":0,"GPSLastFixLocalTime":"0001-01-01T00:00:00Z","GPSTrueCourse":0,"GPSTurnRate":0,
//  "GPSGroundSpeed":0,"GPSLastGroundTrackTime":"0001-01-01T00:00:00Z","GPSTime":"0001-01-01T00:00:00Z",
//  "GPSLastGPSTimeStratuxTime":"0001-01-01T00:00:00Z","GPSLastValidNMEAMessageTime":"0001-01-01T00:01:33.5Z",
//  "GPSLastValidNMEAMessage":"$PUBX,00,000122.90,0000.00000,N,00000.00000,E,0.000,NF,5303302,3750001,0.000,0.redrawMetars00,0.000,,99.99,99.99,99.99,0,0,0*20",
//  "GPSPositionSampleRate":0,"BaroTemperature":22.1,"BaroPressureAltitude":262.4665,"BaroVerticalSpeed":-0.6568238,
//  "BaroLastMeasurementTime":"0001-01-01T00:01:33.52Z","AHRSPitch":-1.7250436907060false585,"AHRSRoll":1.086912223392926,
//  "AHRSGyroHeading":3276.7,"AHRSMagHeading":3276.7,"AHRSSlipSkid":-0.6697750324029778,"AHRSTurnRate":3276.7,
//  "AHRSGLoad":0.9825397416431592,"AHRSGLoadMin":0.9799488522426687,"AHRSGLoadMax":0.9828301105039375,
//  "AHRSLastAttitudeTime":"0001-01-01T00:01:33.55Z","AHRSStatus":6}
//
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
let deg = 0;
let alt = 0;
let lng = 0;
let lat = 0;

function getGpsData() {
    $.get(settings.stratuxurl, function(data) {
        pos = ol.proj.fromLonLat([data.GPSLongitude, data.GPSLatitude]);
        if (data.GPSLongitude !== 0 && data.GPSLatitude !== 0) {
            myairplane.setOffset(offset);
            myairplane.setPosition(pos);m
            lng = data.GPSLongitude;
            lat = data.GPSLatitude;
            alt = data.GPSAltitudeMSL;
            deg = parseInt(data.AHRSMagHeading / 10);
            airplaneElement.style.transform = "rotate(" + deg + "deg)";
        }
    });
}

function putPositionHistory() {
    if (last_longitude !== lng || last_latitude !== lat) {
        if (lng + lat + deg + alt > 0) {
            let postage = { longitude: lng, 
                latitude: lat, 
                heading: deg,
                altitude: Math.round(alt) };

            var xhr = new XMLHttpRequest();
            xhr.open("POST", URL_PUT_HISTORY);

            xhr.setRequestHeader("Content-Type", "application/json");
            try {    
                xhr.send(JSON.stringify(postage));
            }
            finally {}
        }
    }
}
