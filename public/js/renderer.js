'use strict';

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
let URL_GET_ALL_AIRPORTS    = `${URL_SERVER}/getallairports`;
let URL_GET_METARS          = `${URL_SERVER}/getmetars`;
let URL_GET_TAF             = `${URL_SERVER}/gettaf`;
let URL_GET_PIREPS          = `${URL_SERVER}/getpireps`

let settings = {};
let getmetars = false;
let showingmetar = false;
let processingmetars = false;
let firstmetarload = false;
let airportJson = {};
let last_longitude = 0;
let last_latitude = 0;
let last_heading = 0;

let apfeatures = new ol.Collection();
let allapfeatures = new ol.Collection();

let airportLayer;
let airportVectorSource;
let allAirportsLayer;
let allAirportsVectorSource;

let regionmap = new Map();
let vfrsecLayer;
let termLayer;
let heliLayer;
let caribLayer;
let gcaoLayer;
let gcgaLayer;
let osmLayer;
let wxLayer;
let wxSource;
let tiledebug;  
let startDate = threeHoursAgo();
let frameRate = 1.0; // frames per second
let animationId = null;
let websock;
let wsOpen = false;
let MessageTypes = {};

class Metar {
    constructor() {
        this.id = "";
        this.cat = "";
        this.time = "";
        this.temp = "";
        this.dewp = "";
        this.windir = "";
        this.winspd = "";
        this.wingst = "";
        this.altim = "",
        this.vis = "";
        this.sky = [];
    }
};

const animatecontrol = document.getElementById('wxbuttons');
const regioncontrol = document.getElementById('isoregion');
const regionselect = document.getElementById("regionselect");


// Icon Markers
let mvfrMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/mvfr.png`,
    size: [45, 45],
    offset: [0, 0],
    opacity: 1,
    scale: .25
});

let vfrMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/vfr.png`,
    size: [45, 45],
    offset: [0, 0],
    opacity: 1,
    scale: .25
});

let ifrMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/ifr.png`,
    size: [45, 45],
    offset: [0, 0],
    opacity: 1,
    scale: .25
});

let lifrMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/lifr.png`,
    size: [45, 45],
    offset: [0, 0],
    opacity: 1,
    scale: .25
});

let circleMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/dot.png`,
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

const circleStyle = new ol.style.Style({
    image: circleMarker
});

$.get({
    async: false,
    type: "GET",
    url: URL_GET_SETTINGS,
    success: (data) => {
        try {
            settings = JSON.parse(data);
            MessageTypes = settings.messagetypes;
        }
        catch(err) {
            console.log(err);
        }
    },
    error: function (request, status, err) {
        console.error(`ERROR PARSING SETTINGS: ${err}`);
    }
});

$.get({
    async: true,
    type: "GET",
    url: URL_GET_AIRPORTS,
    error: function (request, status, err) {
        console.error(`ERROR GETTING AIRPORTS: ${err}`);
    }
});

$.get({
    async: true,
    type: "GET",
    url: URL_GET_ALL_AIRPORTS,
    error: function (request, status, err) {
        console.error(`ERROR GETTING ALL AIRPORTS: ${err}`);
    }
});

function loadAirportsArray(jsonobj) {
    try {
        for (let i=0; i< jsonobj.airports.length; i++) {
            let airport = jsonobj.airports[i];
            let lon = airport.lon;
            let lat = airport.lat;
            let marker = new ol.Feature({
                ident: airport.ident,
                type: airport.type,
                name: airport.name,
                elevation: airport.elev,
                geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
            });
            marker.setId(airport.ident);
            marker.setStyle(vfrStyle);
            apfeatures.push(marker);
        };
    }
    catch(err){
        console.error(err);
    }
}

function loadAllAirportsArray(jsonobj) {
    try {
        for (let i=0; i< jsonobj.airports.length; i++) {
            let airport = jsonobj.airports[i];
            let lon = airport.lon;
            let lat = airport.lat;
            let isoregion = airport.isoregion.replace("US-", "");
            
            let marker = new ol.Feature({
                ident: airport.ident,
                type: airport.type,
                name: airport.name,
                isoregion: isoregion,
                geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
            });
            marker.setId(airport.ident);
            marker.setStyle(circleStyle);
            allapfeatures.push(marker);
            regionmap.set(isoregion, isoregion);
        }

        regionmap[Symbol.iterator] = function* () {
            yield* [...this.entries()].sort((a, b) => a[1] - b[1]);
        }
        regionmap.forEach((region) => { 
            let option = document.createElement("option");
            option.value = region;
            option.text = region;
            regionselect.appendChild(option);
        });
    }
    catch(err){
        console.error(err);
    }
}

regionselect.addEventListener('change', (event) => {
    let region = event.target.value;
    selectStateFeatures(region);
});

function selectStateFeatures(region = "allregions") {
    allapfeatures.forEach((feature) => {
        let isoregion = feature.get("isoregion");
        if (isoregion !== region && region !== "allregions") {
            feature.setStyle(new ol.style.Style(undefined));
        }
        else {
            feature.setStyle(circleStyle);
        }
    });
}

// immediately initialize the websocket connection
$(() => { 
    try {
        let wsurl = `ws://${window.location.hostname}:${settings.wsport}`;
        console.log(`OPENING: ${wsurl}`);
        websock = new WebSocket(wsurl);
        websock.onmessage = function(evt) {
            let message = JSON.parse(evt.data);
            let payload = JSON.parse(message.payload);
            switch (message.type) {
                case MessageTypes.airports.type:
                loadAirportsArray(payload);
                break;
            case MessageTypes.allairports.type:
                loadAllAirportsArray(payload);
                break;
            case MessageTypes.metars.type:
                processMetars(payload);
                console.log(payload);
                break;
            case MessageTypes.tafs.type:
                console.log(message.payload);
                break;
            case MessageTypes.pireps.type:
                console.log(message.payload);
                break;
            }
        }

        websock.onerror = function(evt){
            console.log("Websocket ERROR: " + evt.data);
        }
        
        websock.onopen = function(evt) {
            console.log("Websocket CONNECTED.");
            wsOpen = true;
        }
        
        websock.onclose = function(evt) {
            console.log("Websocket CLOSED.");
            wsOpen = false;
        }
    }
    catch (error) {
        console.log(error);
    }
});

const metarpopup = document.getElementById('popup');
const metarcontent = document.getElementById('popup-content');
const metarcloser = document.getElementById('popup-closer');
const metaroverlay = new ol.Overlay({
    element: metarpopup,
    autoPan: true,
    autoPanAnimation: {
      duration: 500,
    },
});

metarcloser.onclick = () => {
    metaroverlay.setPosition(undefined);
    metarcloser.blur();
    return false;
};

let airplaneElement = document.getElementById('airplane');
airplaneElement.style.transform = "rotate(" + last_heading + "deg)";
airplaneElement.src = `img/${settings.ownshipimage}`;
airplaneElement.addEventListener("mouseover", (event) => {
    console.log("MY AIRPLANE!!")
});

$.get({
    async: false,
    type: "GET",
    url: URL_GET_HISTORY,
    success: (data) => {
        try {
            let histobj = JSON.parse(data);
            last_longitude = histobj.longitude;
            last_latitude = histobj.latitude;
            last_heading = histobj.heading;
        }
        catch (err) {
            console.log(err);
        }
    },
    error: function (xhr, ajaxOptions, thrownError) {
        console.error(xhr.status, thrownError);
    }
});

function getMetars(airportlist) {
    if (airportlist.length === 0) {
        return;
    }

    let str = "";
    airportlist.forEach((key) => {
        str += `${key},`;
    });
    let fmtstr = str.slice(0, -1)
    $.get({
        async: true,
        type: "GET",
        url: `${URL_GET_METARS}/${fmtstr}`,
        error: function (xhr) {
            console.log(xhr.status);
        }
    });
}

function getTaf(airport) {
    $.get({
        async: true,
        type: "GET",
        url: `${URL_GET_TAF}/${airport}`,
        error: function (xhr) {
            console.log(xhr.status);
        }
    });
}

function getPireps() {
    $.get({
        async: true,
        type: "GET",
        url: URL_GET_PIREPS,
        error: function (xhr) {
            console.log(xhr.status);
        }
    });
}

let pos = ol.proj.fromLonLat([last_longitude, last_latitude]);
let ext = [-180, -85, 180, 85];
let offset = [-18, -18];

const scaleLine = new ol.control.ScaleLine({
    units: 'imperial',
    bar: true,
    steps: 4,
    minWidth: 140
});

const map = new ol.Map({
    target: 'map',
    view: new ol.View({
        center: pos,        
        zoom: settings.startupzoom,
        enableRotation: false
    }),
    controls: ol.control.defaults().extend([scaleLine]),
    overlays: [metaroverlay]
});

const myairplane = new ol.Overlay({
    element: airplaneElement
});
myairplane.setOffset(offset);
myairplane.setPosition(pos);
map.addOverlay(myairplane);

let currZoom = map.getView().getZoom();

map.on('moveend', function(e) {
    if (!showingmetar) {
        try {
            let zoom = map.getView().getZoom();
            currZoom = zoom;
            if (getmetars) {
                resizeDots(zoom);
                getMetarsForCurrentView();
            }
        }
        finally {}
    }
});

map.on('pointermove', (evt) => {
    if (getmetars) {
        let hasfeature = false;
        map.forEachFeatureAtPixel(evt.pixel, function (feature) {
            if (feature) {
                hasfeature = true;
                let name = feature.get("name");
                if (feature.get("hasmetar")) {
                    let thismetar = feature.get("metar");
                    let ident = thismetar.id;
                    let cat = thismetar.cat;
                    if (cat == undefined || cat == "undefined"){
                        cat = "VFR";
                    }
                    let time = getLocalTimeZone(thismetar.time);
                    let temp = thismetar.temp;
                    let dewp = thismetar.dewp;
                    let windir = thismetar.windir;
                    let winspd = thismetar.winspd;
                    let wingst = thismetar.wingst;
                    let altim = getAltimeterSetting(thismetar.altim);
                    let vis = thismetar.vis;
                    let skyconditions = "";
                    thismetar.sky.forEach((level) => {
                        let str = replaceAll(level[0], "_", " ");
                        str = str.charAt(0).toUpperCase() + str.substring(1);
                        skyconditions += `<b>${str}:</b> ${level[1]}<br />`;
                    });
                    let label = `<label class="#class">`;
                    let css;
                    switch(cat) {
                        case "IFR":
                            css = label.replace("#class", "metarifr");
                            break;
                        case "LIFR":
                            css = label.replace("#class", "metarlifr");
                            break;
                        case "MVFR":
                            css = label.replace("#class", "metarmvfr");
                            break;
                        case "VFR":
                            css = label.replace("#class", "metarvfr");
                            break;
                    }
                    if (ident != "undefined") {
                        let coordinate = evt.coordinate;
                        let html = `<div id="#mymetar"><pre><code><p>`
                        html +=   (name != "" && name != "undefined") ? `${css}&nbsp&nbsp${name} - ${cat}&nbsp&nbsp</label><p></p>` : ""
                        html +=  (ident != "" && ident != "undefined") ? `<b>Station:</b> ${ident}<br/>` : "";
                        html +=   (time != "" && time != "undefined") ? `<b>Time:</b> ${time}<br/>` : "";
                        html +=   (temp != "" && temp != "undefined") ? `<b>Temp:</b> ${temp}<br/>` : "";
                        html +=   (dewp != "" && dewp != "undefined") ?`<b>Dewpoint:</b> ${dewp}<br/>` : "";
                        html += (windir != "" && windir != "undefined") ? `<b>Wind Dir:</b> ${windir}<br/>` : "";
                        html += (winspd != "" && winspd != "undefined") ? `<b>Wind Speed:</b> ${winspd} kt<br/>` : "";
                        html += (wingst != "" && wingst != "undefined") ? `<b>Wind Gust:</b> ${wingst} kt<br/>` : "";
                        html +=  (altim != "" && altim != "undefined") ? `<b>Altimeter:</b> ${altim} hg<br/>` : "";
                        html +=    (vis != "" && vis != "undefined") ? `<b>Visibility:</b> ${vis} statute miles<br/>` : "";
                        html += (skyconditions != "" && skyconditions != "undefined") ? `${skyconditions}` : "";
                        html += `</p></code></pre></div>`;
                        metarcontent.innerHTML = html; 
                        showingmetar = true;
                        metaroverlay.setPosition(coordinate);

                        getTaf(ident);
                    }
                    thismetar = null;
                }
            }
        });
        if (!hasfeature) {
            showingmetar = false
            metarcloser.onclick();
        }
    }
});

function getMetarsForCurrentView() {
    if (!getmetars) {
        return;
    }
    let metarlist = [];
    let extent = map.getView().calculateExtent(map.getSize());
    try { 
        airportVectorSource.forEachFeatureInExtent(extent, (feature) => {
            if (!feature.get("hasmetar")) {
                let id = feature.get("ident");
                if (id.startsWith("K")) {
                    metarlist.push(id);
                }
            }
        }); 
    }
    finally {
        console.log(metarlist);
        resizeDots(currZoom);
        getMetars(metarlist);
    }
}

function processMetars(metars) {
    if (processingmetars) {
        return;
    }
    processingmetars = true;
    
    let newmetars = metars.response.data;
    
    if (newmetars === undefined) {
        processingmetars = false;
        return;
    }

    try {
        let count = parseInt(newmetars.num_results);
        if (count === 1) {
            processMetar(newmetars.METAR);
        }
        else {
            newmetars.METAR.forEach((metar) => {    
                processMetar(metar);
            });
        }
    }
    catch(err) {
        console.error(err);
    }
    finally {
        processingmetars = false;
    }
}

function processMetar(metar) {
    let newmetar = new Metar();
    newmetar.id = metar.station_id;
    newmetar.cat = metar.flight_category;
    newmetar.time = metar.observation_time;
    
    let tF = convertCtoF(metar.temp_c);
    newmetar.temp = `${metar.temp_c}°C  (${tF}°F)`;
    
    let dF = convertCtoF(metar.dewpoint_c)
    newmetar.dewp = `${metar.dewpoint_c}°C  (${dF}°F)`;

    newmetar.windir = metar.wind_dir_degrees;
    newmetar.winspd = metar.wind_speed_kt + "";
    newmetar.wingst = metar.wind_gust_kt + "";
    newmetar.altim = metar.altim_in_hg;
    newmetar.vis = metar.visibility_statute_mi;
    try {
        if (metar.sky_condition !== undefined) {    
            metar.sky_condition.forEach((condition) => {
                let map = Object.entries(condition);
                map.forEach((item) => {
                    newmetar.sky.push(item);  
                });
            });
        }
    }
    catch(err){
        console.error(err);
    }

    let feature = airportVectorSource.getFeatureById(newmetar.id);
    if (feature !== null) {
        feature.set('hasmetar', true);
        feature.set('metar', newmetar);
        try {
            switch (newmetar.cat) {
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
            feature.changed();
        }
        catch(err){
            console.error(err);
        }
        finally{
            
        }
    }
}

function resizeDots(zoom) {
    let rawnum = .044 * zoom;
    let newscale = rawnum.toFixed(3)
    vfrMarker.setScale(newscale);
    mvfrMarker.setScale(newscale);
    lifrMarker.setScale(newscale);
    ifrMarker.setScale(newscale);
    circleMarker.setScale(newscale);
}

wxSource = new ol.source.TileWMS({
    attributions: ['Iowa State University'],
    url: settings.animatedwxurl,
    params: {'LAYERS': 'nexrad-n0r-wmst'},
});

$.get(`${URL_GET_TILESETS}`, (data) => {
    let extent = ol.proj.transformExtent(ext, 'EPSG:4326', 'EPSG:3857')
    
    vfrsecLayer = new ol.layer.Tile({
        title: "VFR Sectional Chart",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_VFRSEC_TILE,
            maxZoom: 11,
            minZoom: 5
        }),
        visible: false,
        extent: extent,
        zIndex: 10
    });
    
    termLayer = new ol.layer.Tile({
        title: "Terminal Area Charts",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_TERM_TILE,
            maxZoom: 12,
            minZoom: 8
        }),
        visible: false,
        extent: extent,
        zIndex: 10
    });
    
    heliLayer = new ol.layer.Tile({
        title: "Helicopter Charts",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_HELI_TILE,
            maxZoom: 13,
            minZoom: 8
        }),
        visible: false,
        extent: extent,
        zIndex: 10
    });

    caribLayer = new ol.layer.Tile({
        title: "Caribbean Charts",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_CARIB_TILE,
            maxZoom: 11,
            minZoom: 5
        }),
        visible: false,
        extent: extent,
        zIndex: 10
    });

    gcaoLayer = new ol.layer.Tile({
        title: "Grand Canyon Air Ops",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_GCAO_TILE,
            maxZoom: 12,
            minZoom: 8
        }),
        visible: false,
        extent: extent,
        zIndex: 10
    });

    gcgaLayer = new ol.layer.Tile({
        title: "Grand Canyon GA",
        type: "overlay", 
        source: new ol.source.XYZ({
            url: URL_GET_GCGA_TILE,  
            maxZoom: 12,
            minZoom: 8
        }),
        visible: false,
        extent: extent,
        zIndex: 10
    });

    if (settings.useOSMonlinemap) {
        osmLayer = new ol.layer.Tile({
            title: "Open Street Maps",
            type: "overlay",
            source: new ol.source.OSM(),
            visible: true,
            extent: extent,
            zIndex: 9
        });
    }

    tiledebug = new ol.layer.Tile({
        title: "Debug",
        type: "overlay",
        source: new ol.source.TileDebug(),
        visible: false,
        extent: extent,
        zIndex: 12
    });

    airportVectorSource = new ol.source.Vector({
        features: apfeatures
    });
    airportLayer = new ol.layer.Vector({
        title: "Get Metars",
        source: airportVectorSource,
        visible: false,
        extent: extent,
        zIndex: 11
    }); 

    allAirportsVectorSource = new ol.source.Vector({
        features: allapfeatures
    });
    allAirportsLayer = new ol.layer.Vector({
        title: "All US Airports",
        source: allAirportsVectorSource,
        visible: false,
        extent: extent,
        zIndex: 11
    }); 
    
    wxLayer = new ol.layer.Tile({
        title: "Animated Weather",
        extent: extent,
        source: wxSource,
        visible: false,
        zIndex: 11
    });

    map.addLayer(tiledebug);
    map.addLayer(allAirportsLayer);
    map.addLayer(airportLayer); 
    map.addLayer(wxLayer);
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
        getmetars = airportLayer.get('visible');
        if (getmetars) {
            firstmetarload = true;
            getMetarsForCurrentView();
        }
    });

    allAirportsLayer.on('change:visible', () => {
        let visible = allAirportsLayer.get('visible');
        regioncontrol.style.visibility = visible ? 'visible' : 'hidden';
        if (visible) {
            regionselect.options[0].selected = true;
            regionselect.value = "allregions"; 
            selectStateFeatures()
        }
    });

    wxLayer.on('change:visible', () => {
        let visible = wxLayer.get('visible');
        animatecontrol.style.visibility = visible ? 'visible' : 'hidden';
        visible ? playWeatherRadar() : stopWeatherRadar()
    });
});

if (settings.gettimedmetars) {
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
    getmetars = true;
    getMetarsForCurrentView();
    getmetars = false;
}

// animation stuff
function threeHoursAgo() {
    return new Date(Math.round(Date.now() / 3600000) * 3600000 - 3600000 * 3);
}

function updateInfo() {
    const el = document.getElementById('info');
    el.innerHTML = getLocalTimeZone(startDate.toString());
}
  
function setTime() {
    startDate.setMinutes(startDate.getMinutes() + 15);
    if (startDate > Date.now()) {
      startDate = threeHoursAgo();
    }
    wxSource.updateParams({'TIME': startDate.toISOString()});
    updateInfo();
}
setTime();
  
const stopWeatherRadar = function () {
    if (animationId !== null) {
      window.clearInterval(animationId);
      animationId = null;
    }
};
  
const playWeatherRadar = function () {
    stop();
    animationId = window.setInterval(setTime, 1000 / frameRate);
};
  
const startButton = document.getElementById('play');
startButton.addEventListener('click', playWeatherRadar, false);
  
const stopButton = document.getElementById('pause');
stopButton.addEventListener('click', stopWeatherRadar, false);

updateInfo();

const convertCtoF = ((temp) => {
    let num = (temp * 9/5 + 32);
    return num.toFixed(1);
});

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

function replaceAll(string, search, replace) {
    return string.split(search).join(replace);
}

function getLocalTimeZone(zuludate) {
    let date = new Date(zuludate);
    let time = date.toString();
    let retval = time;
    if (time.search("Eastern Standard") > -1) {
        retval = time.replace("Eastern Standard Time", "EST");
        return retval;
    }
    if (time.search("Eastern Daylignt") > -1) {
        retval = time.replace("Eastern Standard Time", "EDT");
        return retval;
    }
    if (time.search("Central Standard") > -1) {
        retval = time.replace("Central Standard Time", "CST");
        return retval;
    }
    if (time.search("Central Daylight") > -1) {
        retval = time.replace("Eastern Standard Time", "CDT");
        return retval;
    }
    if (time.search("Mountain Standard") > -1) {
        retval = time.replace("Mountain Standard Time", "MST");
        return retval;
    }
    if (time.search("Mountain Daylight") > -1) {
        retval = time.replace("Eastern Standard Time", "MDT");
        return retval;
    }
    if (time.search("Pacific Standard") > -1) {
        retval = time.replace("Pacific Standard Time", "PST");
        return retval;
    }
    if (time.search("Pacific Daylight") > -1) {
        retval = time.replace("Pacific Daylight Time", "PDT");
        return retval;
    }
    if (time.search("Alaska Standard") > -1) {
        retval = time.replace("Alaska Standard Time", "AKST");
        return retval;
    }
    if (time.search("Alaska Daylight") > -1) {
        retval = time.replace("Alaska Daylight Time", "AKDT");
        return retval;
    }
    if (time.search("Atlantic Standard") > -1) {
        retval = time.replace("Atlantic Standard Time", "AST");
        return retval;
    }
    if (time.search("Atlantic Daylight") > -1) {
        retval = time.replace("Atlantic Daylight Time", "ADT");
        return retval;
    }
    return retval;
}

function getAltimeterSetting(altimeter) {
    let dbl = parseFloat(altimeter);
    return dbl.toFixed(2).toString();
}


