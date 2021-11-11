'use strict';

// application constants
let URL_HOST_BASE           = window.location.hostname + (window.location.port ? ':' + window.location.port : '');
let URL_HOST_PROTOCOL       = window.location.protocol + "//";
let URL_SERVER              = `${URL_HOST_PROTOCOL}${URL_HOST_BASE}`;
let URL_GET_TILESETS        = `${URL_SERVER}/tiles/tilesets`;
let URL_GET_TILE            = `${URL_SERVER}/tiles/singletile/{z}/{x}/{-y}.png`;
let URL_GET_HISTORY         = `${URL_SERVER}/gethistory`;
let URL_GET_SETTINGS        = `${URL_SERVER}/getsettings`;
let URL_PUT_HISTORY         = `${URL_SERVER}/puthistory`;
let URL_GET_AIRPORTS        = `${URL_SERVER}/getairports`;
let URL_GET_METARS          = `${URL_SERVER}/getmetars`;
let URL_GET_TAF             = `${URL_SERVER}/gettaf`;
let URL_GET_PIREPS          = `${URL_SERVER}/getpireps`;

let settings;
let airports;
let last_longitude = -97;
let last_latitude = 38;
let last_heading = 0;

const container = document.getElementById('popup');
const content = document.getElementById('popup-content');
const closer = document.getElementById('popup-closer');
const overlay = new ol.Overlay({
    element: container,
    autoPan: true,
    autoPanAnimation: {
      duration: 250,
    },
});

closer.onclick = function () {
    overlay.setPosition(undefined);
    closer.blur();
    return false;
};

let airplaneElement = document.getElementById('airplane');
airplaneElement.style.transform = "rotate(" + last_heading + "deg)";

$.ajax({
    async: false,
    type: "GET",
    url: URL_GET_SETTINGS,
    success: function(data) {
        try {
            settings = JSON.parse(data);
        }
        catch(err) {
            console.log(err);
        }
    }
});

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
    overlays: [overlay]
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

const myairplane = new ol.Overlay({
    element: airplaneElement
});

myairplane.setOffset(offset);
myairplane.setPosition(pos);
map.addOverlay(myairplane);

let currZoom = map.getView().getZoom();
let apfeatures = [];
let vectorSource;
let airportLayer;
let vfrsecLayer;
let osmLayer;

function placeAirports(airportdata) {
    airports = airportdata.airports;
    airports.forEach(airport => {
        let ident = airport.ident;
        let aptype = airport.type;
        let lon = airport.lonlat[0];
        let lat = airport.lonlat[1];
        let marker = new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
            name: ident,
            type: aptype,
            elevation: airport.elevation
        });
        if (airport.type === 'large_airport' || airport.type === 'medium_airport') {
            marker.setStyle(vfrStyle);
        }
        marker.setId(ident);
        apfeatures.push(marker);
    });
    
    vectorSource = new ol.source.Vector({
        features: apfeatures
    });

    airportLayer = new ol.layer.Vector({
        source: vectorSource,
        zIndex: 11
    });
    map.addLayer(airportLayer); 
}

let wsweather = new WebSocket(settings.weatherurl);
wsweather.onopen = function(evt) {
    console.log(evt);
};
wsweather.onmessage = function(evt) {
    let data = JSON.parse(evt.data);
    console.log(data);
    try {
        let feature = vectorSource.getFeatureById(data.Location);
        if (feature !== null && data.Type === 'METAR') {
            feature.set('metar', data.Data);
            console.log(`metar set for ${data.Location}`);
        }
    }
    finally{}
};

map.on('moveend', function(e) {
    try {
        let zoom = map.getView().getZoom();
        let rawnum = .045 * zoom;
        let rsz = rawnum.toFixed(3)
        resizeDots(rsz);
        currZoom = zoom;
        getMetarsForCurrentView();
    }
    finally {}
});

map.on('pointermove', function (evt) {
    let hasfeature = false;
    map.forEachFeatureAtPixel(evt.pixel, function (feature) {
        if (feature) {
            hasfeature = true;
            let fmetar = feature.get('metar');
            let fcat = feature.get('fltcat');
            if (fmetar !== undefined) {
                let coordinate = evt.coordinate;
                content.innerHTML = `<p><code>${fcat}</code></p><p><code>${fmetar}</code></p>`;
                overlay.setPosition(coordinate);
            }
        }
        
    });
    if (!hasfeature) {
        closer.onclick();
    }
});

function getMetarsForCurrentView() {
    let metarlist = "";
    let extent = map.getView().calculateExtent(map.getSize());
    try { 
        vectorSource.forEachFeatureInExtent(extent, function(feature){
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
            let feature = vectorSource.getFeatureById(id);
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

$.ajax({
    async: true,
    type: "GET",
    url: URL_GET_AIRPORTS,
    success: function(data) {
        try {
            let airportdata = JSON.parse(data);
            console.log(airportdata);
            placeAirports(airportdata);
        }
        catch(err) {
            console.log(err);
        }
    }
});

// VFR Sectional MBTiles layer
$.get(URL_GET_TILESETS, function(data) {
    let meta = JSON.parse(data);
    let layertype = meta["type"] == "baselayer" ? "base" : "overlay"; 
    let minzoom = parseInt(meta["minzoom"]);
    let maxzoom = parseInt(meta["maxzoom"]);
    let name = meta["name"];

    if (meta.bounds) {
        ext = meta["bounds"].split(',').map(Number);
    }

    ext = ol.proj.transformExtent(ext, 'EPSG:4326', 'EPSG:3857')

    vfrsecLayer = new ol.layer.Tile({
        title: name,
        type: layertype,
        source: new ol.source.XYZ({
            url: URL_GET_TILE,
            maxZoom: maxzoom,
            minZoom: minzoom
        }),
        extent: ext,
        zIndex: 10
    });
    
    osmLayer = new ol.layer.Tile({
        source: new ol.source.OSM(),
        extent: ext,
        zIndex: 10
    });

    if (settings.useOSMonlinemap) {
        map.addLayer(osmLayer);
    }
    else {
        map.addLayer(vfrsecLayer);
    }
});

//setInterval(getGpsData, settings.gpsintervalmsec);
//setInterval(putPositionHistory, settings.histintervalmsec);
setInterval(redrawMetars, settings.metarintervalmsec);

function redrawMetars() {
    console.log("Timed METAR retrieval in progress");
    getMetarsForCurrentView();
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
//  "GPSLastValidNMEAMessage":"$PUBX,00,000122.90,0000.00000,N,00000.00000,E,0.000,NF,5303302,3750001,0.000,0.00,0.000,,99.99,99.99,99.99,0,0,0*20",
//  "GPSPositionSampleRate":0,"BaroTemperaturehttps://www.aviationweather.gov/adds/dataserver_current/httpparam?dataSource=metars&requestType=retrieve&format=xml&hoursBeforeNow=1.5&mostRecentForEachStation=true&stationString=3276.7,"AHRSSlipSkid":-0.6697750324029778,"AHRSTurnRate":3276.7,
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
