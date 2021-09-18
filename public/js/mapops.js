'use strict';


// application constants
let URL_HOST_BASE           = window.location.hostname + (window.location.port ? ':' + window.location.port : '');
let URL_HOST_PROTOCOL       = window.location.protocol + "//";
let URL_GET_TILESETS        = URL_HOST_PROTOCOL + URL_HOST_BASE + "/tiles/tilesets";
let URL_GET_TILE            = URL_HOST_PROTOCOL + URL_HOST_BASE + "/tile/vfrsec/{z}/{x}/{-y}.png";
let URL_GET_HISTORY         = URL_HOST_PROTOCOL + URL_HOST_BASE + "/history";
let URL_GET_SETTINGS        = URL_HOST_PROTOCOL + URL_HOST_BASE + "/settings";
let URL_PUT_HISTORY         = URL_HOST_PROTOCOL + URL_HOST_BASE + "/updateposition";

var settings;
// default values
let histinterval = 15000;
let ahrsinterval = 1000;

$.ajax({
    async: false,
    type: "GET",
    url: URL_GET_SETTINGS,
    success: function (response) {
        settings = JSON.parse(response);
        histinterval = settings.histintervalmsec;
        ahrsinterval = settings.ahrsintervalmsec;
    }
});

let URL_GET_SITUATION       = settings.stratuxurl + "/getSituation";
let currentZoom = 11;
let format = "png";
let file = "vfrsec.mbtiles"; 

let last_longitude = -98.256202;
let last_latitude = 30.714128;
let last_heading = 327;

let airplaneElement = document.getElementById('airplane');


airplaneElement.style.transform = "rotate(" + last_heading + "deg)";

let pos = ol.proj.fromLonLat([last_longitude, last_latitude]);
let ext = [-180, -85, 180, 85];
let offset = [-18, -18];

const map = new ol.Map({
    target: 'map',
    view: new ol.View({
        center: pos,        
        zoom: currentZoom,
        enableRotation: false
    })
});

const popup = new ol.Overlay({
    element: airplaneElement
});
popup.setOffset(offset);
popup.setPosition(pos);
map.addOverlay(popup);

$.ajax({
    async: false,
    type: "GET",
    url: URL_GET_HISTORY,
    success: function (response) {
        let histobj = JSON.parse(response);
        last_longitude = histobj.longitude;
        last_latitude = histobj.latitude;
        last_heading = histobj.heading;
    }
});

// Dynamic MBTiles layers
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

    let vfrseclayer = new ol.layer.Tile({
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
    vfrseclayer.visible = true;
    map.addLayer(vfrseclayer);
});

setInterval(getAhrsMessage, ahrsinterval);
setInterval(putPositionHistory, histinterval);

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
//  "GPSPositionSampleRate":0,"BaroTemperature":22.1,"BaroPressureAltitude":262.4665,"BaroVerticalSpeed":-0.6568238,
//  "BaroLastMeasurementTime":"0001-01-01T00:01:33.52Z","AHRSPitch":-1.7250436907060585,"AHRSRoll":1.086912223392926,
//  "AHRSGyroHeading":3276.7,"AHRSMagHeading":3276.7,"AHRSSlipSkid":-0.6697750324029778,"AHRSTurnRate":3276.7,
//  "AHRSGLoad":0.9825397416431592,"AHRSGLoadMin":0.9799488522426687,"AHRSGLoadMax":0.9828301105039375,
//  "AHRSLastAttitudeTime":"0001-01-01T00:01:33.55Z","AHRSStatus":6}
//
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
let deg = 0;
let alt = 0;
let lng = 0;
let lat = 0;

function getAhrsMessage() {
    $.get(URL_GET_SITUATION, function(data) {
        pos = ol.proj.fromLonLat([data.GPSLongitude, data.GPSLatitude]);
        if (data.GPSLongitude != 0 && data.GPSLatitude != 0) {
            popup.setOffset(offset);
            popup.setPosition(pos);
            lng = data.GPSLongitude;
            lat = data.GPSLatitude;
            alt = data.GPSAltitudeMSL;
            deg = parseInt(data.AHRSMagHeading / 10);
            airplaneElement.style.transform = "rotate(" + deg + "deg)";
        }
    });
}

function putPositionHistory() {
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
