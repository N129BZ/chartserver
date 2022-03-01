'use strict';

/**
 * Construct all of the application urls 
 */
 let URL_LOCATION            =  location.hostname;
 let URL_PROTOCOL            =  location.protocol;
 let URL_PORT                =  location.port;          
 let URL_HOST_BASE           =  URL_LOCATION;
 if (parseInt(URL_PORT) > 0) {
     URL_HOST_BASE += `:${URL_PORT}`;
 }
 let URL_HOST_PROTOCOL       = `${URL_PROTOCOL}//`;
 let URL_SERVER              = `${URL_HOST_PROTOCOL}${URL_HOST_BASE}`;
 let URL_WINSOCK             = `ws://${URL_LOCATION}:`;
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
 let URL_GET_HELIPORTS       = `${URL_SERVER}/getheliports`;

//Metar Object
class METAR {
    /**
     * Extracted Metar data in a human readable format.
     * @param metarString raw metar string if provided station and time will be ignored and replaced with the content in the raw METAR
     * @param station staion name for instance creation
     * @param time time for instance creation
     */
    constructor (metarString, station, time) {
        //Wind speed, direction and unit
        this.wind;// = new Wind();
        //List of weather conditions reported
        this.weather = new Array();
        //List of Cloud observations
        this.clouds = new Array();
        this.station = station !== null && station !== void 0 ? station : "----";
        this.time = time !== null && time !== void 0 ? time : new Date();
        this.flightCategory = "";
        if (metarString != null) {
            parseMetar(metarString, this);
        }
    }
}

class Wind {
    direction = 0;
    speed = 0;
    unit = "";
    constructor() {}
};

class Variation {
    constructor() {
    }
};

class Cloud {
    constructor() {
    }

};

/**
 * global properties
 */
let settings = {};
let last_longitude = 0;
let last_latitude = 0;
let last_heading = 0;
let currentZoom = 9;
let lastcriteria = "allregions";

let airportNameKeymap = new Map();
let tafFieldKeymap = new Map();
let metarFieldKeymap = new Map();
let weatherAcronymKeymap = new Map();
let icingCodeKeymap = new Map();
let turbulenceCodeKeymap = new Map();
let skyConditionKeymap = new Map();

loadTafFieldKeymap();
loadMetarFieldKeymap();
loadWeatherAcronymKeymap();
loadTurbulenceCodeKeymap();
loadIcingCodeKeymap();
loadSkyConditionmKeymap();

/**
 * ol.Collections hold features like
 * metars, tafs, airport info, etc.
 */
let metarFeatures = new ol.Collection();
let airportFeatures = new ol.Collection();
let tafFeatures = new ol.Collection();
let pirepFeatures = new ol.Collection();

/**
 * Vector sources
 */
let metarVectorSource;
let airportVectorSource;
let tafVectorSource;
let pirepVectorSource;
let ownshipVectorSource;
let animatedWxTileSource;

/**
 * Vector layers
 */
let airportVectorLayer;
let metarVectorLayer;
let tafVectorLayer;
let pirepVectorLayer;

/**
 * Tile layers
 */
let osmTileLayer;
let sectionalTileLayer;
let terminalTileLayer;
let helicopterTileLayer;
let caribbeanTileLayer;
let grandcanyonAoTileLayer;
let grandcanyonGaTileLayer;
let animatedWxTileLayer;
let debugTileLayer;  

/**
 * Websocket object, flag, and message definition
 * JSON object that is filled by returned settingsws://${window.location.hostname}
 */
let websock;
let wsOpen = false;
let MessageTypes = {};
let DistanceUnits = {};
let distanceunit = "";

/**
 * Animation variables 
 */
let animationId = null;
let startDate = getTimeThreeHoursAgo();
let frameRate = 1.0; // frames per second
const animatecontrol = document.getElementById('wxbuttons');

/**
 * Controls for dropdown select when viewing all airports
 */
const regioncontrol = document.getElementById('isoregion');
const regionselect = document.getElementById("regionselect");
let regionmap = new Map();

/** 
 * Request settings JSON object from serverself
 */
 $.get({
    async: false,
    type: "GET",
    url: URL_GET_SETTINGS,
    success: (data) => {
        try {
            settings = JSON.parse(data);
            MessageTypes = settings.messagetypes;
            DistanceUnits = settings.distanceunits;
            distanceunit = settings.distanceunit;
            currentZoom = settings.startupzoom;
        }
        catch(err) {
            console.log(err);
        }
    },
    error: (xhr, ajaxOptions, thrownError) => {
        console.error(xhr.status, thrownError);
    }
});

/**
 * Request Initial ownship position latitude & longitude.
 * Data is stored in the sqlite positionhistory.db file.
 * This will also center the viewport on that position.
 */
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
    error: (xhr, ajaxOptions, thrownError) => {
        console.error(xhr.status, thrownError);
    }
});

/**
 * JQuery method to immediately initialize the websocket connection
 */
 $(() => { 
    try {
        let wsurl = `${URL_WINSOCK}${settings.wsport}`;
        console.log(`OPENING: ${wsurl}`);
        websock = new WebSocket(wsurl);
        websock.onmessage = (evt) => {
            let message = JSON.parse(evt.data);
            let payload = JSON.parse(message.payload); 
            switch (message.type) {
                case MessageTypes.airports.type:
                    processAirports(payload);
                    break;
                case MessageTypes.metars.type:
                    processMetars(payload);
                    break;
                case MessageTypes.tafs.type:
                    processTafs(payload);
                    break;
                case MessageTypes.pireps.type:
                    processPireps(payload);
                    break;
            }
        }

        websock.onerror = function(evt){
            console.log("Websocket ERROR: " + evt.data);
        }
        
        websock.onopen = function(evt) {
            console.log("Websocket CONNECTED.");
            wsOpen = true;
            keepAlive();
        }
        
        websock.onclose = function(evt) {
            cancelKeepAlive();
            wsOpen = false;
            console.log("Websocket CLOSED.");
        }
    }
    catch (error) {
        console.log(error);
    }
});

/**
 * Icon markers for different METAR categories 
 */
 let ifrMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/ifr.png`,
    size: [55, 55],
    offset: [0, 0],
    opacity: 1,
    scale: .30
});
/*--------------------------------------*/
let lifrMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/lifr.png`,
    size: [55, 55],
    offset: [0, 0],
    opacity: 1,
    scale: .30
});
/*--------------------------------------*/
let mvfrMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/mvfr.png`,
    size: [55, 55],
    offset: [0, 0],
    opacity: 1,
    scale: .30
});
/*--------------------------------------*/
let vfrMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/vfr.png`,
    size: [55, 55],
    offset: [0, 0],
    opacity: 1,
    scale: .30
});

/**
 * Icon markers for different PIREP weather categories
 */
let ifrPirep = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/ifrpirep.png`,
    size: [85, 85],
    offset: [0, 0],
    opacity: 1,
    scale: .50
});
/*--------------------------------------*/
let lifrPirep = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/lifrpirep.png`,
    size: [85, 85],
    offset: [0, 0],
    opacity: 1,
    scale: .50
});
/*--------------------------------------*/
let mvfrPirep = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/mvfrpirep.png`,
    size: [85, 85],
    offset: [0, 0],
    opacity: 1,
    scale: .50
});
/*--------------------------------------*/
let vfrPirep = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/vfrpirep.png`,
    size: [85, 85],
    offset: [0, 0],
    opacity: 1,
    scale: .50
});

/**
 * Icon markers for airports, TAFs, heliports, etc.
 */
let tafMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/taf.png`,
    size: [85, 85],
    offset: [0, 0],
    opacity: 1,
    scale: .50
});
/*--------------------------------------*/
let airportMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/dot.png`,
    size: [55, 55],
    offset: [0, 0],
    opacity: 1,
    scale: .30
});
/*--------------------------------------*/
let heliportMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/helipad.png`,
    size: [55, 55],
    offset: [0, 0],
    opacity: 1,
    scale: .50
});
/*--------------------------------------*/
let pirepMarker = new ol.style.Icon({
    crossOrigin: 'anonymous',
    src: `${URL_SERVER}/img/pirep.png`,
    size:[85, 85],
    offset: [0,0],
    opacity: 1,
    scale: .50
});

/**
 * ol.Style objects 
 */
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
const tafStyle = new ol.style.Style({
    image: tafMarker
})
const airportStyle = new ol.style.Style({
    image: airportMarker
});
const heliportStyle = new ol.style.Style({
    image: heliportMarker
});
const pirepStyle = new ol.style.Style({
    image: pirepMarker
});

/**
 * Load airports into their feature collection 
 * @param {jsonobj} airport JSON object 
 */
function processAirports(jsonobj) {
    let usastates = new Map();
    let isoregions = new Map();
    try {
        for (let i=0; i< jsonobj.airports.length; i++) {
            let airport = jsonobj.airports[i];
            let lon = airport.lon;
            let lat = airport.lat;
            let isoregion = airport.isoregion;
            let country = airport.country;
            if (isoregion.search("US-") > -1) { 
                usastates.set(country, country);
            } 
            else {
                isoregions.set(country, country);
            }
            let airportmarker = new ol.Feature({
                ident: airport.ident,
                type: airport.type,
                isoregion: isoregion,
                country: country,
                geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat]))
            });
            airportmarker.setId(airport.ident);
            if (airport.type === "heliport") {
                airportmarker.setStyle(heliportStyle);
            }
            else {
                airportmarker.setStyle(airportStyle);
            }
            airportFeatures.push(airportmarker);
            airportNameKeymap.set(airport.ident, airport.name);
        }

        /**
         * This is for the region select dropdown list
         * Map sort all region airports in alpha order by US state 
         * we want US states to be at the top of the list followed
         * by the rest of the isoregions 
         */
        usastates[Symbol.iterator] = function* () {
            yield* [...this.entries()].sort((a, b) => a[1] - b[1]);
        }
        usastates.forEach((country, isoregion) => {
            let option = document.createElement("option");
            option.value = isoregion;
            option.text = country;
            regionselect.appendChild(option);
        });
        
        regionmap[Symbol.iterator] = function* () {
            yield* [...this.entries()].sort((a, b) => a[1] - b[1]);
        }
        isoregions.forEach((country, isoregion) => { 
            let option = document.createElement("option");
            option.value = isoregion;
            option.text = country;
            regionselect.appendChild(option);
        });
    }
    catch(err){
        console.error(err);
    }
}

/**
 * Region dropdown select event
 */
regionselect.addEventListener('change', (event) => {
    lastcriteria = event.target.value;
    selectFeaturesByCriteria();
});

/**
 * Called by select event to manipulate features
 * @param {*} criteria: string
 */
function selectFeaturesByCriteria() {
    airportFeatures.forEach((feature) => {
        let type = feature.get("type");
        let country = feature.get("country");
        if (type === "heliport") {
            feature.setStyle(heliportStyle);
        }
        else {
            feature.setStyle(airportStyle);
        }
        if (lastcriteria === "small_airport" || lastcriteria === "medium_airport" || 
            lastcriteria === "large_airport" || lastcriteria === "heliport") {
            if (type !== lastcriteria) {
                feature.setStyle(new ol.style.Style(undefined));
            }
        }
        else if (country !== lastcriteria && lastcriteria !== "allregions") {
            feature.setStyle(new ol.style.Style(undefined));        
        }
    });
}

/**
 * Heartbeat routine to keep websocket "hot"
 */
let timerId = 0;
const kamessage = {
    type: MessageTypes.keepalive.type,
    payload: MessageTypes.keepalive.token
}
function keepAlive() { 
    var timeout = settings.keepaliveintervalmsec;  
    if (wsOpen) {  
        websock.send(JSON.stringify(kamessage));  
    }  
    timerId = setTimeout(keepAlive, timeout);  
}  
function cancelKeepAlive() {  
    if (timerId) {  
        clearTimeout(timerId);  
    }  
}

/**
 * Metar popup object
 */
const popup = document.getElementById('popup');
const popupcontent = document.getElementById('popup-content');
const popupoverlay = new ol.Overlay({
    element: popup,
    autoPan: true,
    autoPanAnimation: {
      duration: 500,
    },
});

/**
 * popup close event handler
 * @returns false!!
 */
function closePopup() {
    popupoverlay.setPosition(undefined);
    return false;
}

/**
 * Ownship image 
 */
let airplaneElement = document.getElementById('airplane');
airplaneElement.style.transform = "rotate(" + last_heading + "deg)";
airplaneElement.src = `img/${settings.ownshipimage}`;
airplaneElement.addEventListener("mouseover", (event) => {
    console.log("MY AIRPLANE!!")
});

/**
 * set the global view position from last saved history 
 */
let viewposition = ol.proj.fromLonLat([last_longitude, last_latitude]);

/**
 * Viewport extent for setting up map view
 */
let viewextent = [-180, -85, 180, 85];
let offset = [-18, -18];

/**
 * The scale of miles shown on lower left corner of map
 */
const scaleLine = new ol.control.ScaleLine({
    units: 'imperial',
    bar: true,
    steps: 4,
    minWidth: 140
});

/**
 * The map object that gets put in index.html <div> element
 */
const map = new ol.Map({
    target: 'map',
    view: new ol.View({
        center: viewposition,        
        zoom: settings.startupzoom,
        enableRotation: false
    }),
    controls: ol.control.defaults().extend([scaleLine]),
    overlays: [popupoverlay]
});

/**
 * The actual positioning of the ownship image feature
 */
const myairplane = new ol.Overlay({
    element: airplaneElement
});
myairplane.setOffset(offset);
myairplane.setPosition(viewposition);
map.addOverlay(myairplane);

/**
 * Event to handle scaling of feature images
 */
map.on('pointermove', (evt) => {
    //let hasfeature = false;
    let someZoom = map.getView().getZoom();
    let inAnimation = false;
    if (currentZoom !== someZoom) {
        currentZoom = someZoom;
        if (animationId !== null) {
            inAnimation = true;
            stopWeatherRadar();
        }
        resizeDots();
        closePopup();
        if (inAnimation) {
            playWeatherRadar();
        }
    }
});

/**
 * Event to view Metar/TAF popup & closure
 */
map.on('click', (evt) => {
    let hasfeature = false;
    currentZoom = map.getView().getZoom();
    resizeDots();
    map.forEachFeatureAtPixel(evt.pixel, (feature) => {
        if (feature) {
            hasfeature = true;
            let datatype = feature.get("datatype");
            if (datatype === "metar") {
                displayMetarPopup(feature);
            }
            else if (datatype === "taf"){
                displayTafPopup(feature);
            }
            else if (datatype === "pirep") {
                displayPirepPopup(feature);
            }
            else { // simple airport marker
                displayAirportPopup(feature);
            }
            let coordinate = evt.coordinate;
            popupoverlay.setPosition(coordinate);
        }
    });
    if (!hasfeature) {
        closePopup();
    }
});

/**
 * Create the html for a METAR popup element
 * @param {feature} ol.Feature: the metar feature the user clicked on 
 */
 function displayMetarPopup(feature) {
    let metar = feature.get("metar");
    let rawmetar = metar["raw_text"];
    let ident = metar.station_id;
    let svg = feature.get("svgimage");
    let cat = metar.flight_category;
    if (cat == undefined || cat == "undefined"){
        cat = "VFR";
    }
    let time = metar.observation_time;
    if (settings.uselocaltime) {
        time = getLocalTime(time);
    }
    let tempC = metar.temp_c;
    let dewpC = metar.dewpoint_c;
    let temp = convertCtoF(metar.temp_c);
    let dewp = convertCtoF(metar.dewpoint_c);
    let windir = metar.wind_dir_degrees;
    let winspd = metar.wind_speed_kt + "";
    let wingst = metar.wind_gust_kt + ""; 
    let altim = getAltimeterSetting(metar.altim_in_hg);
    let vis = getDistanceUnits(metar.visibility_statute_mi);
    let wxcode = metar.wx_string !== undefined ? decodeWxDescriptions(metar.wx_string) : "";
    let taflabelcssClass = "taflabel"
    let skycondition = metar.sky_condition;
    let skyconditions;
    let icingconditions;
    if (skycondition !== undefined) {
        skyconditions = decodeSkyCondition(skycondition, taflabelcssClass);
    }
    let icingcondition = metar.icing_condition;
    if (icingcondition !== undefined) {
        icingconditions = decodeIcingOrTurbulenceCondition(icingcondition, taflabelCssClass);
    }
    
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
        let name = getFormattedAirportName(ident);
        let html = `<div id="#featurepopup"><pre><code><p>`
        html +=    `${css}${name}\n${ident} - ${cat}</label><p></p>`;
        html +=   (time != "" && time != "undefined") ? `Time:&nbsp<b>${time}</b><br/>` : "";
        html +=   (temp != "" && temp != "undefined") ? `Temp:&nbsp<b>${tempC} °C</b> (${temp})<br/>` : "";
        html +=   (dewp != "" && dewp != "undefined") ?`Dewpoint:&nbsp<b>${dewpC} °C</b> (${dewp})<br/>` : "";
        html += (windir != "" && windir != "undefined") ? `Wind Direction:&nbsp<b>${windir}°</b><br/>` : "";
        html += (winspd != "" && winspd != "undefined") ? `Wind Speed:&nbsp<b>${winspd}&nbspkt</b><br/>` : "";
        html += (wingst != "" && wingst != "undefined") ? `Wind Gust:&nbsp<b>${wingst}&nbspkt</b><br/>` : "";
        html +=  (altim != "" && altim != "undefined") ? `Altimeter:&nbsp<b>${altim}&nbsphg</b><br/>` : "";
        html +=    (vis != "" && vis != "undefined") ? `Horizontal Visibility:&nbsp<b>${vis}</b><br/>` : "";
        html += (wxcode != "" && wxcode != "undefined") ? `Weather:&nbsp<b>${wxcode}</b><br/>`: "";
        html += (skyconditions != undefined && skyconditions != "") ? `${skyconditions}` : "";
        html += (icingconditions != undefined && icingconditions != "") ? `${icingconditions}` : "";
        html += `</p></code></pre><span class="windsvg">${svg}</span>`;
        html += `<textarea class="rawdata">${rawmetar}</textarea><br />`; 
        html += `<p><button class="ol-popup-closer" onclick="closePopup()">close</button></p></div>`;
        popupcontent.innerHTML = html;  
    }
}

/**
 * Create the html for a TAF popup element
 * @param {feature} ol.Feature: the taf feature the user clicked on
 */
function displayTafPopup(feature) {
    let taf = feature.get("taf");
    let rawtaf = taf["raw_text"];
    let forecast = taf.forecast;
    let outerhtml = `<div class="taftitle">` + 
                        `<label class="taftitlelabel">Terminal Area Forecast - ${feature.get("ident")}</label>` +
                    `</div>` +
                    `<div class="taf">` + 
                        `<pre><code>` +
                        `<table class="tafmessage" id="taftable">` +
                            `<tr class="tafbody">` + 
                                `<td id="tafdata">###</td>` +
                            `</tr>` +
                        `</table>` +
                        `</code></pre>` +                 
                    `</div>` + 
                    `<br /><br />`;

    let html = "<div>";
    
    for (const item in forecast) {
        let value = forecast[item];
        if (typeof(value) === 'object') {
            for (const subitem in value) {
                let subvalue = value[subitem];
                html += parseForecastField(subitem, subvalue);
            }
            html += "</p><hr>";
        } 
        else {
            html += parseForecastField(item, value);
        }
    }
    
    console.log(html);
    html += `</p></div><textarea class="rawdata">${rawtaf}</textarea><br />`;
    html += `<p><button class="ol-popup-closer" onclick="closePopup()">close</button></p></div>`;
    let innerhtml = outerhtml.replace("###", html);
    popupcontent.innerHTML = innerhtml;
}

function parseForecastField(rawfieldname, fieldvalue) {
    let fieldname = tafFieldKeymap.get(rawfieldname);
    let html = "";
    let formattedvalue = "";
    switch (rawfieldname) {
        case "fcst_time_from":
            let thistime = fieldvalue;
            if (settings.uselocaltime) {
                thistime = getLocalTime(fieldvalue);
            }
            html = `<label class="fcstlabel"><b>From: ${thistime}</b></label></b><br />`;
            break;
        case "fcst_time_to": // I'm going to ignore this field to save space on the popup
            //html = `&nbspto&nbsp<b>${fieldvalue}</b></label><br />`
            //html = `<label class="fcstlabel">${formattedvalue}</label><br />`;
            break;
        case "change_indicator":
        case "time_becoming":
        case "probability":
        case "wind_dir_degrees":
        case "wind_speed_kt":
        case "wind_gust_kt":
        case "wind_shear_hgt_ft_agl":
        case "wind_shear_dir_degrees":
        case "wind_shear_speed_kt":
        case "altim_in_hg":
        case "vert_vis_ft":
        case "wx_string":
            if (fieldname === "wx_string") {
                formattedvalue = decodeWxDescriptions(fieldvalue);
                html = `<label class="tafwxlabel">${fieldname}: <b>${formattedvalue}</b></label><br />`;
            }
            else {
                html = `<label class="taflabel">${fieldname}: <b>${fieldvalue}</b></label><br />`;
            }
            break;
        case "sky_condition":
            formattedvalue = decodeSkyCondition(fieldvalue);
            html = `<label class="tafskyheader">${fieldname}</label><br />${formattedvalue}`;
            break;
        case "turbulence_condition":
        case "icing_condition":
            formattedvalue = decodeIcingCondition(fieldvalue);
            html = `<label class="tafskyheader">${fieldname}</label><br />${formattedvalue}`;
            break;
        case "temperature":
            break;

    }
    return html;
}

/**
 * Create the html for a PIREP popup element
 * @param {object} feature: the pirep the user clicked on
 */
 function displayPirepPopup(feature) {
    let pirep = feature.get("pirep");
    let rawpirep = pirep["raw_text"];
    let outerhtml = `<div class="taftitle">` + 
                        `<label class="taftitlelabel">${pirep.pirep_type} FROM AIRCRAFT: ${pirep.aircraft_ref}</label><p></p>` +
                    `</div>` +
                    `<div class="taf">` + 
                        `<pre><code>` +
                        `<table class="tafmessage" id="taftable">` +
                            `<tr class="tafbody">` + 
                                `<td id="tafdata">###</td>` +
                            `</tr>` +
                        `</table>` +
                        `</code></pre>` +                 
                    `</div>` + 
                    `<br /><br />`;

    let html = "<div>";
    let pireplabel = `<label class="pirepitem">`
    let thistime = "";
    for (const pirepkey in pirep) {
        let pirepvalue = pirep[pirepkey];
        let fieldname = getFieldDescription(pirepkey);
        switch (pirepkey) {
            case "receipt_time":
                thistime = pirepvalue;
                if (settings.uselocaltime) {
                    thistime = getLocalTime(pirepvalue);
                }
                html += `${pireplabel}${fieldname}: <b>${thistime}</b></label><br />`;
                break;
            case "observation_time":
                thistime = pirepvalue;
                if (settings.uselocaltime) {
                    thistime = getLocalTime(pirepvalue);
                }
                html += `${pireplabel}${fieldname}: <b>${thistime}</b></label><br />`;
                break;
            case "latitude":
            case "longitude":
            case "altitude_ft_msl":
            case "temp_c":
            case "dewpoint_c":
            case "time_becoming":
            case "probability":
            case "wind_speed_kt":
            case "wind_gust_kt":
            case "wind_shear_hgt_ft_agl":
            case "wind_shear_speed_kt":
            case "vert_vis_ft":
            case "visibility_statute_mi":
                html += `<label class="pirepitem">${fieldname}: <b>${pirepvalue}</b></label><br />`;
                break;
            case "wind_shear_dir_degrees":
            case "wind_dir_degrees":
                html += `${pireplabel}${fieldname}: <b>${pirepvalue}°</b></label><br />`;
                break;
            case "sky_condition":
                html += `<label class="pirepskyheader">${fieldname}</label><br />`;
                html += decodeSkyCondition(pirepvalue, "pirepitem");
                html += "<hr>";
                break;
            case "turbulence_condition":
            case "icing_condition":
                html += `<label class="pirepskyheader">${fieldname}</label><br />`;
                html += decodeIcingOrTurbulenceCondition(pirepvalue, "pirepitem");
                html += "<hr>";
                break;
            case "temperature":
                html += `<label class="pirepskyheader">Weather</label><br />`;
                break;
            case "altim_in_hg":
                let altimvalue = getInchesOfMercury(pirepvalue);
                html += `<label class="pirepitem">${fieldname}: <b>${altimvalue}</b></label><br />`;
                break;
            case "wx_string":
                let lineval = decodeWxDescriptions(pirepvalue);
                html += `<label class="pirepitem">${fieldname}: <b>${lineval}</b></label><br />`;
                break;
            case "change_indicator":
                let change = getSkyConditionDescription(pirepvalue);
                html += `<label class="pirepitem">${fieldname}: <b>${change}</b></label><br />`;
                break;
            case "pirep_type":
            case "aircraft_ref":
                break;
            default:
                console.log(`${pirepkey} NOT FOUND!`);
                break;
        }
    }
    html += `</p></div><textarea class="rawdata">${rawpirep}</textarea>`;
    html += `<p><button class="ol-popup-closer" onclick="closePopup()">close</button></p></div>`;
    let innerhtml = outerhtml.replace("###", html);
    popupcontent.innerHTML = innerhtml;
}

/**
 * Decode sky conditions
 * @param {object} json object skyconditions 
 * @param {string} css class to use 
 * @returns html string 
 */
 function decodeSkyCondition(skycondition, labelclassCss) {
    let html = "";
    if (skycondition !== undefined) {
        try {
            let values = Object.values(skycondition);
            for (const x in skycondition) {
                let condition = skycondition[x];
                let fieldname = "";
                let fieldvalue = "";
                if (typeof(condition) !== "string") {
                    for (const index in condition) {
                        fieldname = getFieldDescription(index);
                        fieldvalue = condition[index];
                        html += `<label class="${labelclassCss}">${fieldname}: <b>${fieldvalue}</b></label><br />`;
                    }
                }
                else {
                    fieldname = getFieldDescription(x);
                    fieldvalue = getSkyConditionDescription(condition);
                    html += `<label class="${labelclassCss}">${fieldname}: <b>${fieldvalue}</b></label><br />`;
                }
            }
        }
        catch (error) {
            console.log(error.message);
        }
    }
    return html;
}

/**
 * Get inches of mercury fixed at 2 decimal places
 * @param {float} altimeter 
 * @returns 
 */
function getInchesOfMercury(altimeter) {
    let inhg = parseFloat(altimeter);
    return inhg.toFixed(2);
}

/**
 * Decode icing or turbulence condition
 * @param {object} condition json object 
 * @returns html string
 */
function decodeIcingOrTurbulenceCondition(condition) {
    let html = "";
    for (const item in condition) {
        let value = condition[item];
        if (typeof(value) === 'object') {
            html += "<p>";
            for (const subitem in value) {
                let subvalue = value[subitem];
                html += parseConditionField(subitem, subvalue);
            }
            html += "</p><hr>";
        } 
        else {
            html += parseConditionField(item, value);
        }
    }        
    return html;        
}

/**
 * Parse an icing or turbulence condition field value, 
 * which could be an object or a string and return html
 * @param {string} rawfieldname 
 * @param {object} fieldvalue 
 * @returns html string
 */
function parseConditionField(rawfieldname, fieldvalue) {
    let fieldname = getFieldDescription(rawfieldname);
    let image = "";
    let html = "";
    switch (rawfieldname) {
        case "turbulence_type":
        case "icing_type":
            html += `<label class="pirepitem">${fieldname}: <b>${fieldvalue}</b></label><br />`;
            break; 
        case "turbulence_intensity":
        case "icing_intensity":
            image = getConditionImage(rawfieldname, fieldvalue);
            html += `<label class="pirepitem">${fieldname}</label>`;
            html += `<div class="conditionimage"><image src="${URL_SERVER}/img/${image}"><div><br />`;
            break;
        case "turbulence_base_ft_msl":
        case "icing_base_ft_msl":
            html += `<label class="pirepitem">${fieldname}: <b>${fieldvalue}</b></label><br />`;
            break;
        case "turbulence_top_ft_msl":
        case "icing_top_ft_msl":
            html += `<label class="pirepitem">${fieldname}: <b>${fieldvalue}</b></label></br />`;
            break;
        default:
            break;
    }
    return html;
}

/**
 * Get the image that corresponds to icing or turbulence condition
 * @param {string} conditiontype 
 * @param {string} conditionvalue 
 * @returns html image string
 */
function getConditionImage(conditiontype, conditionvalue) {
    let image = "";
    if (conditiontype === "icing_intensity") {
        switch (conditionvalue) {
            case "NEGclr":
            case "NEG":
                image = "Nil.png";
                break;
            case "RIME":
            case "TRC":
                image = "IceTrace.png";
                break;
            case "TRC-LGT":
                image = "IceTraceLight.png"
            case "LGT":
                image = "IceLight.png";
                break;
            case "LGT-MOD":
                image = "IceLightMod.png";
                break;
            case "MOD":
                image = "IceMod.png";
                break;
            case "MOD-SEV":
                image = "IceLight.png";
                break;
            case "SEV":
                image = "IceSevere.png";
                break;
        }
    }   
    else if (conditiontype === "turbulence_intensity") { 
        switch (conditionvalue) {
            case "NEG":
            case "NEGclr": 
                image = "Nil.png";
                break;
            case "SMTH-LGT":
            case "LGT":
                image = "TurbSmoothLight.png";
            case "LGT-CHOP":
                image = "TurbLight.png";    
                break;
            case "CHOP":
            case "LGT-MOD":
                image = "TurbLightMod.png";
                break;
            case "MOD":
            case "MOD-CHOP":
                image = "TurbMod.png";
                break;
            case "MOD-SEV":
                image = "TurbModSevere.png";
                break;
            case "SEV":
                image = "TurbSevere.png";
                break;
        }
    }
    else {
        image = "";
    }
    
    return image;
}

/**
 * Build the html for an airport feature
 * @param {*} feature: the airport the user clicked on 
 */
function displayAirportPopup(feature) {
    let ident = feature.get("ident");
    let name = getFormattedAirportName(ident)
    let html = `<div id="#featurepopup"><pre><code><p>`;
        html += `<label class="airportpopuplabel">${name} - ${ident}</label><p></p>`;
        html += `</p></code></pre></div>`;
        html += `<p><button class="ol-airport-closer" onclick="closePopup()">close</button></p>`;
    popupcontent.innerHTML = html; 
}

/**
 * 
 * @param {object} metarsobject: JSON object with LOTS of metars
 */
function processMetars(metarsobject) {
    let newmetars = metarsobject.response.data.METAR;
    if (newmetars !== undefined) {
        metarFeatures.clear();
        try {
            /**
             * Add this metar feature to the metars feature collection
             */
            newmetars.forEach((metar) => {  
                let svg = "";
                try { 
                    svg = rawMetarToSVG(metar.raw_text, 150, 150, settings.usemetricunits);
                }
                catch { }
                let feature = new ol.Feature({
                    metar: metar,
                    datatype: "metar",
                    geometry: new ol.geom.Point(ol.proj.fromLonLat([metar.longitude, metar.latitude])),
                    svgimage: svg
                });
                feature.setId(metar.station_id);
                try {
                    switch (metar.flight_category) {
                        case 'IFR':
                            feature.setStyle(ifrStyle)
                            break;
                        case 'LIFR':
                            feature.setStyle(lifrStyle);
                            break;
                        case 'MVFR':
                            feature.setStyle(mvfrStyle);
                            break;
                        case 'VFR':
                        default:
                            feature.setStyle(vfrStyle);
                            break;
                    }
                    metarFeatures.push(feature);
                }
                catch(error){
                   console.log(error.message); 
                }
            });
        }
        catch(error) {
            console.log(error.message);
        }
    }
}

/**
 * 
 * @param {object} tafsobject: JSON object with LOTS of tafs 
 */
function processTafs(tafsobject) {
    let newtafs = tafsobject.response.data.TAF;
    if (newtafs !== undefined) {
        tafFeatures.clear();
        try {
            newtafs.forEach((taf) => {
                /**
                 * Add this taf to the fafs feature collection
                 */
                let taffeature = new ol.Feature({
                    ident: taf.station_id,
                    taf: taf,
                    datatype: "taf",
                    geometry: new ol.geom.Point(ol.proj.fromLonLat([taf.longitude, taf.latitude]))
                });
                taffeature.setId(taf.station_id);
                taffeature.setStyle(tafStyle);
                tafFeatures.push(taffeature);
            });
        }
        catch (error){
            console.log(error.message);
        }
    }
}

/**
 * 
 * @param {object} pirepsobject: JSON object with LOTS of pireps 
 */
 function processPireps(pirepsobject) {
    let newpireps = pirepsobject.response.data.PIREP;
    if (newpireps !== undefined) {
        pirepFeatures.clear();
        try {
            newpireps.forEach((pirep) => {
                let pseudoheading = Math.random()*Math.PI*2;
                
                /**
                 * Add this pirep to the pireps feature collection
                 */
                let pirepfeature = new ol.Feature({
                    ident: pirep.aircraft_ref,
                    pirep: pirep,
                    datatype: "pirep",
                    geometry: new ol.geom.Point(ol.proj.fromLonLat([pirep.longitude, pirep.latitude])),
                });
                
                pirepfeature.setId(pirep.aircraft_ref);
                pirepfeature.setStyle(new ol.style.Style({
                                        image: new ol.style.Icon({
                                            crossOrigin: 'anonymous',
                                            src: `${URL_SERVER}/img/pirep.png`,
                                            size:[85, 85],
                                            offset: [0,0],
                                            opacity: 1,
                                            scale: .50,
                                            rotation: pseudoheading
                                        })
                                    })
                );
                pirepFeatures.push(pirepfeature);
            });
        }
        catch (error){
            console.log(error.message);
        }
    }
}

/**
 * This routine adjusts feature "dot" image 
 * sizes, depending on current zoom level
 */
function resizeDots() {
    let rawnum = .045 * currentZoom;
    let newscale = rawnum.toFixed(3)
    vfrMarker.setScale(newscale);
    mvfrMarker.setScale(newscale);
    lifrMarker.setScale(newscale);
    ifrMarker.setScale(newscale);
    tafMarker.setScale(newscale);
    airportMarker.setScale(newscale);
    heliportMarker.setScale(newscale);
}

/**
 * Tile source for animated weather
 */
animatedWxTileSource = new ol.source.TileWMS({
    attributions: ['Iowa State University'],
    url: settings.animatedwxurl,
    params: {'LAYERS': 'nexrad-n0r-wmst'},
});


/**
 * jQuery $get all layer tile data
 */
$.get(`${URL_GET_TILESETS}`, (data) => {
    let extent = ol.proj.transformExtent(viewextent, 'EPSG:4326', 'EPSG:3857')
    
    sectionalTileLayer = new ol.layer.Tile({
        title: "VFR Sectional Chart",
        type: "overlay", 
        source: new ol.source.XYZ({
            attributions: ["© <a href='https://www.openflightmaps.org'>openflightmaps.org</a>"],
            url: URL_GET_VFRSEC_TILE,
            maxZoom: 11,
            minZoom: 5,
            attributionsCollapsible: false
        }),
        visible: false,
        extent: extent,
        zIndex: 10
    });
    
    terminalTileLayer = new ol.layer.Tile({
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
    
    helicopterTileLayer = new ol.layer.Tile({
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

    caribbeanTileLayer = new ol.layer.Tile({
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

    grandcanyonAoTileLayer = new ol.layer.Tile({
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

    grandcanyonGaTileLayer = new ol.layer.Tile({
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

    debugTileLayer = new ol.layer.Tile({
        title: "Debug",
        type: "overlay",
        source: new ol.source.TileDebug(),
        visible: false,
        extent: extent,
        zIndex: 12
    });

    animatedWxTileLayer = new ol.layer.Tile({
        title: "Animated Weather",
        extent: extent,
        source: animatedWxTileSource,
        visible: false,
        zIndex: 11
    });

    if (settings.useOSMonlinemap) {
        osmTileLayer = new ol.layer.Tile({
            title: "Open Street Maps",
            type: "overlay",
            source: new ol.source.OSM(),
            visible: true,
            extent: extent,
            zIndex: 9
        });
    }

    metarVectorSource = new ol.source.Vector({
        features: metarFeatures
    });
    metarVectorLayer = new ol.layer.Vector({
        title: "Metars",
        source: metarVectorSource,
        visible: false,
        extent: extent,
        zIndex: 12
    }); 

    airportVectorSource = new ol.source.Vector({
        features: airportFeatures
    });
    airportVectorLayer = new ol.layer.Vector({
        title: "All Airports",
        source: airportVectorSource,
        visible: false,
        extent: extent,
        zIndex: 11
    }); 
    
    tafVectorSource = new ol.source.Vector({
        features: tafFeatures
    });
    tafVectorLayer = new ol.layer.Vector({
        title: "TAFs",
        source: tafVectorSource,
        visible: false,
        extent: extent,
        zIndex: 13
    });
    
    pirepVectorSource = new ol.source.Vector({
        features: pirepFeatures
    });
    pirepVectorLayer = new ol.layer.Vector({
        title: "Pireps",
        source: pirepVectorSource,
        visible: false,
        extent: extent, zIndex: 14
    });

    map.addLayer(debugTileLayer);
    map.addLayer(airportVectorLayer);
    map.addLayer(metarVectorLayer); 
    map.addLayer(tafVectorLayer);
    map.addLayer(pirepVectorLayer);
    map.addLayer(animatedWxTileLayer);
    map.addLayer(caribbeanTileLayer);
    map.addLayer(grandcanyonAoTileLayer);
    map.addLayer(grandcanyonGaTileLayer);
    map.addLayer(helicopterTileLayer);
    map.addLayer(terminalTileLayer);
    map.addLayer(sectionalTileLayer);

    if (settings.useOSMonlinemap) {
        map.addLayer(osmTileLayer);
    }

    let layerSwitcher = new ol.control.LayerSwitcher({
        tipLabel: 'Layers', 
        groupSelectStyle: 'children'
    });
    map.addControl(layerSwitcher);

    airportVectorLayer.on('change:visible', () => {
        let visible = airportVectorLayer.get('visible');
        regioncontrol.style.visibility = visible ? 'visible' : 'hidden';
        if (visible) {
            regionselect.options[0].selected = true;
            regionselect.value = lastcriteria; 
            selectFeaturesByCriteria()
            closePopup();
        }
    });

    animatedWxTileLayer.on('change:visible', () => {
        let visible = animatedWxTileLayer.get('visible');
        animatecontrol.style.visibility = visible ? 'visible' : 'hidden';
        visible ? playWeatherRadar() : stopWeatherRadar()
    });
});

/**
 * This allows a clicked feature to raise an event
 */
let select = null;
function selectStyle(feature) {
    console.log(`FEATURE: ${feature}`);
    return selected;
}

/**
 * If saving position history is enabled,  
 * save it at a specified time interval
 */
if (settings.putpositionhistory) {
    setInterval(putPositionHistory, settings.histintervalmsec);
}

/**
 * If using Stratux as a gps position source, 
 * get the data at a specified time interval
 */
if (settings.getgpsfromstratux) {
    setInterval(getGpsData, settings.gpsintervalmsec);
}

/**
 * For weather animation, gets the time 3 hours ago
 * @returns Date
 */
function getTimeThreeHoursAgo() {
    return new Date(Math.round(Date.now() / 3600000) * 3600000 - 3600000 * 3);
}

/**
 * For displaying the animation time clock
 */
function updateInfo() {
    const el = document.getElementById('info');
    el.innerHTML = getLocalTime(startDate.toString());
}

/**
 * Update the time clock  
 */
function setTime() {
    startDate.setMinutes(startDate.getMinutes() + 15);
    if (startDate > Date.now()) {
      startDate = getTimeThreeHoursAgo();
    }
    animatedWxTileSource.updateParams({'TIME': startDate.toISOString()});
    updateInfo();
}
setTime();

/**
 * Stop the weather radar animation
 */
const stopWeatherRadar = function () {
    if (animationId !== null) {
      window.clearInterval(animationId);
      animationId = null;
    }
};

/**
 * Start the weather radar animation
 */
const playWeatherRadar = function () {
    stop();
    animationId = window.setInterval(setTime, 1000 / frameRate);
};

/**
 * Animation start button element and event listener
 */
const startButton = document.getElementById('play');
startButton.addEventListener('click', playWeatherRadar, false);

/**
 * Animation stop button element and event listener
 */
const stopButton = document.getElementById('pause');
stopButton.addEventListener('click', stopWeatherRadar, false);

/**    fieldvalues.set(key, `<td>${subobj}</td>`);
            
 * Sets an initial time in the timeclock element
 */
updateInfo();

/**
 * Convert statute miles to desired unit 
 * @param {*} miles: statute miles
 * @returns statute miles, kilometers or nautical miles   
 */
 function getDistanceUnits(miles) {
    let num = parseFloat(miles);
    let label = "mi";
    switch (distanceunit) {
        case DistanceUnits.kilometers: 
            num = miles * 1.609344;
            label = "km"
            break;
        case DistanceUnits.nauticalmiles:
            num = miles * 0.8689762419;
            label = "nm";
            break;
    }
    return `${num.toFixed(1)} ${label}`;
}

/**
 * 
 * @param {*} temp: Temperature in Centigrade 
 * @returns Farenheit temperature fixed to 2 decimal places
 */
const convertCtoF = ((temp) => {
    if (temp == undefined) return "";
    let num = (temp * 9/5 + 32);
    if (num === NaN || num === undefined) return "";
    else return `${num.toFixed(1)} F°`;
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

/**
 * Get gps data from Stratux, updates current position
 * @returns statute miles, kilometers or nautical miles   
 * and orients the rotation of the ownship image
 */
function getGpsData() {
    $.get(settings.stratuxurl, function(data) {
        viewposition = ol.proj.fromLonLat([data.GPSLongitude, data.GPSLatitude]);
        if (data.GPSLongitude !== 0 && data.GPSLatitude !== 0) {
            myairplane.setOffset(offset);
            myairplane.setPosition(viewposition);
            lng = data.GPSLongitude;
            lat = data.GPSLatitude;
            alt = data.GPSAltitudeMSL;
            deg = parseInt(data.AHRSMagHeading / 10);
            airplaneElement.style.transform = "rotate(" + deg + "deg)";
        }
    });
}

/**
 * Save the position history in positionhistory.db
 */
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

/**
 * Utility function to replace all instances of a  
 * specified string with another specified string
 * @param {*} string: string to search 
 * @param {*} search: string to search FOR 
 * @param {*} replace: string to replace any found search 
 * @returns sring: the new string with replacements
 */
function replaceAll(string, search, replace) {
    return string.split(search).join(replace);
}

/**
 * This just makes a zulu date look nicer...
 * @param {*} zuludate 
 * @returns string: cleaned zulu date
 */
function formatZuluDate(zuludate) {
    let workstring = zuludate.split("T");
    let zstring = workstring[1].slice(0, -1);
    return  `${workstring[0]} ${zstring} Z`;
}

/**
 * Get the local machine dae/time from the supplied ZULU date
 * @param {*} zuludate: the ZULU date to be translated 
 * @returns string: the translated date in standard or daylight time
 */
 function getLocalTime(zuludate) {
    let date = new Date(zuludate);
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let ampm = hours >= 12 ? 'PM' : 'AM';
    let month = date.getMonth() + 1;
    let day = date.getDate();
    let year = date.getFullYear();
    let tzone = "";

    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    minutes = minutes < 10 ? '0'+minutes : minutes;

    let timex = date.toString().split("GMT");
    let time = timex[1];

    if (time.search("Eastern Standard") > -1) {
        tzone = "(EST)"; //time.replace("Eastern Standard Time", "EST");
    }
    if (time.search("Eastern Daylignt") > -1) {
        tzone = "(EDT)"; //time.replace("Eastern Standard Time", "EDT");
    }
    if (time.search("Central Standard") > -1) {
        tzone = "(CST)"; //time.replace("Central Standard Time", "CST");
    }
    if (time.search("Central Daylight") > -1) {
        tzone = "(CDT)"; //time.replace("Eastern Standard Time", "CDT");
    }
    if (time.search("Mountain Standard") > -1) {
        tzone = "(MST)"; //time.replace("Mountain Standard Time", "MST");
    }
    if (time.search("Mountain Daylight") > -1) {
        tzone = "(MDT)"; //time.replace("Eastern Standard Time", "MDT");
    }
    if (time.search("Pacific Standard") > -1) {
        tzone = "(PST)"; //time.replace("Pacific Standard Time", "PST");
    }
    if (time.search("Pacific Daylight") > -1) {
        tzone = "(PDT)"; //time.replace("Pacific Daylight Time", "PDT");
    }
    if (time.search("Alaska Standard") > -1) {
        tzone = "(AKST)"; //time.replace("Alaska Standard Time", "AKST");
    }
    if (time.search("Alaska Daylight") > -1) {
        tzone = "(AKDT)"; //time.replace("Alaska Daylight Time", "AKDT");
    }
    if (time.search("Atlantic Standard") > -1) {
        tzone = "(AST)"; //time.replace("Atlantic Standard Time", "AST");
    }
    if (time.search("Atlantic Daylight") > -1) {
        tzone = "(ADT)"; //time.replace("Atlantic Daylight Time", "ADT");
    }
    return `${month}-${day}-${year} ${hours}:${minutes} ${ampm} ${tzone}`;
}

/**
 * Utility function to trim and round Metar or TAF  
 * altimeter value to a standard fixed(2) number
 * @param {*} altimeter 
 * @returns 
 */
function getAltimeterSetting(altimeter) {
    let dbl = parseFloat(altimeter);
    return dbl.toFixed(2).toString();
}

/**
 * Get the formatted name of an airport
 * @param {string} ident, the airport identifier 
 * @returns string, formatted name of the airport
 */
 function getFormattedAirportName(ident) {
    let retvalue = airportNameKeymap.get(ident);
    if (retvalue === undefined || 
        retvalue === "undefined" ||
        retvalue === "") {
        retvalue = "";
    } 
    else {
        retvalue = retvalue.replace("/", "\n");
        retvalue = retvalue.replace(",", "\n");
    }
    return retvalue;
}

/**
 * Get the description for a TAF fieldname abbreviation
 * @param {string} fieldname 
 * @returns string, readable description of fieldname 
 */
 function getFieldDescription(fieldname) {
    let retvalue = fieldname;
    if (!Number.isInteger(fieldname)) {
        retvalue = tafFieldKeymap.get(fieldname);
        if (retvalue === undefined) {
            retvalue = fieldname;
        }
    }
    return retvalue;
}

/**
 * Load normalized TAF field names
 */
function loadTafFieldKeymap() {
    tafFieldKeymap.set("temp_c", "Temperature °C");
    tafFieldKeymap.set("icing_type", "Icing type");
    tafFieldKeymap.set("pirep_type", "Pirep type");
    tafFieldKeymap.set("altitude_ft_msl", "Altitude in feet MSL");
    tafFieldKeymap.set("receipt_time", "Receipt time")
    tafFieldKeymap.set("observation_time", "Observation time")
    tafFieldKeymap.set("latitude", "Latitude")
    tafFieldKeymap.set("longitude", "Longitude")
    tafFieldKeymap.set("cloud_type", "Cloud type");
    tafFieldKeymap.set("fcst_time_from", "Time from");
    tafFieldKeymap.set("fcst_time_to", "Time to");
    tafFieldKeymap.set("change_indicator", "Change indicator");
    tafFieldKeymap.set("time_becoming", "Time becoming");
    tafFieldKeymap.set("probability", "Probability");
    tafFieldKeymap.set("wind_dir_degrees", "Wind Direction");
    tafFieldKeymap.set("wind_speed_kt", "Wind Speed knots");
    tafFieldKeymap.set("wind_gust_kt", "Wind Gust knots");
    tafFieldKeymap.set("wind_shear_hgt_ft_agl", "Shear height feet AGL");
    tafFieldKeymap.set("wind_shear_dir_degrees", "Shear direction");
    tafFieldKeymap.set("wind_shear_speed_kt", "Shear speed knots");
    tafFieldKeymap.set("altim_in_hg", "Altimeter (Hg)");
    tafFieldKeymap.set("vert_vis_ft", "Vertical visibility in feet");
    tafFieldKeymap.set("visibility_statute_mi", "Horizontal visibility in statute miles");
    tafFieldKeymap.set("wx_string", "Weather");
    tafFieldKeymap.set("sky_condition", "Sky condition");
    tafFieldKeymap.set("icing_condition", "Icing condition");
    tafFieldKeymap.set("turbulence_condition", "Turbulence condition");
    tafFieldKeymap.set("sky_cover", "Sky cover");
    tafFieldKeymap.set("cloud_base_ft_agl", "Cloud base feet AGL");
    tafFieldKeymap.set("cloud_base_ft_msl", "Cloud base feet MSL");
    tafFieldKeymap.set("cloud_base", "Cloud base");
    // icing fieldnames
    tafFieldKeymap.set("icing_intensity", "Intensity");
    tafFieldKeymap.set("icing_min_alt_ft_agl", "Min altitude feet AGL");
    tafFieldKeymap.set("icing_max_alt_ft_agl", "Max altitude feet AGL");
    tafFieldKeymap.set("icing_min_alt_ft_msl", "Min altitude feet MSL");
    tafFieldKeymap.set("icing_max_alt_ft_agl", "Max altitude feet MSL");
    tafFieldKeymap.set("icing_type", "Type");
    tafFieldKeymap.set("icing_top_ft_msl", "Top in feet MSL");
    tafFieldKeymap.set("icing_base_ft_msl", "Base in feet MSL");
    // turbulence fieldnames
    tafFieldKeymap.set("turbulence_intensity", "Intensity");
    tafFieldKeymap.set("turbulence_min_alt_ft_agl", "Min altitude feet AGL");
    tafFieldKeymap.set("turbulence_max_alt_ft_agl", "Max altitude feet AGL");
    tafFieldKeymap.set("turbulence_freq", "Frequency");
    tafFieldKeymap.set("turbulence_type", "Type");
    tafFieldKeymap.set("turbulence_top_ft_msl", "Top in feet MSL");
    tafFieldKeymap.set("turbulence_base_ft_msl", "Base in feet MSL");
}

/**
 * Get the description for a TAF/Metar fieldname abbreviation
 * @param {string} fieldname 
 * @returns string, readable description of fieldname 
 */
 function getMetarFieldDescription(fieldname) {
    let retvalue = metarFieldKeymap.get(fieldname);
    if (retvalue === undefined || retvalue === "") {
        retvalue = replaceAll(fieldname, "_", " ");
    }
    return retvalue;
}
/**
 * Load normalized metar field names
 */
 function loadMetarFieldKeymap() {
    metarFieldKeymap.set("raw_text", "raw text");
    metarFieldKeymap.set("station_id", "station id"); 
    metarFieldKeymap.set("observation_time", "Observation Time");
    metarFieldKeymap.set("latitude", "latitude");
    metarFieldKeymap.set("longitude", "longitude");
    metarFieldKeymap.set("temp_c", "Temp °C");
    metarFieldKeymap.set("dewpoint_c", "Dewpoint °C");
    metarFieldKeymap.set("wind_dir_degrees", "Wind direction"); 
    metarFieldKeymap.set("wind_speed_kt", "Wind speed knots");
    metarFieldKeymap.set("wind_gust_kt", "Wind gust knots");
    metarFieldKeymap.set("visibility_statute_mi", "Horizontal visibility in statute miles");
    metarFieldKeymap.set("altim_in_hg", "Altimeter in Hg");
    metarFieldKeymap.set("sea_level_pressure_mb", "Sea-level pressure in MB");
    metarFieldKeymap.set("quality_control_flags", "Quality control flags");
    metarFieldKeymap.set("wx_string", "Weather");
    metarFieldKeymap.set("sky_condition", "Sky cover");
    metarFieldKeymap.set("sky_cover", "Sky cover");
    metarFieldKeymap.set("cloud_base_ft_agl", "Cloud base feet AGL");
    metarFieldKeymap.set("cloud_base", "Cloud base");
    metarFieldKeymap.set("flight_category", "Flight category");
    metarFieldKeymap.set("three_hr_pressure_tendency_mb", "Pressure change past 3 hours in MB");
    metarFieldKeymap.set("maxT_c", "Max air temp °C, past 6 hours");
    metarFieldKeymap.set("minT_c", "Min air temp °C, past 6 hours");
    metarFieldKeymap.set("maxT24hr_c", "Max air temp °C, past 24 hours");
    metarFieldKeymap.set("minT24hr_c", "Min air temp °C, past 24 hours");
    metarFieldKeymap.set("precip_in", "Liquid precipitation since last METAR");
    metarFieldKeymap.set("pcp3hr_in", "Liquid precipitation past 3 hours");
    metarFieldKeymap.set("pcp6hr_in", "Liquid precipitation past 6 hours");
    metarFieldKeymap.set("pcp24hr_in", "Liquid precipitation past 24 hours");
    metarFieldKeymap.set("snow_in", "Snow depth in inches");
    metarFieldKeymap.set("vert_vis_ft", "Vertical visibility in feet");
    metarFieldKeymap.set("metar_type", "Metar type");
    metarFieldKeymap.set("elevation_m", "Station elevation in meters");
}

/**
 * Get the description for a TAF/Metar weather acronym
 * @param {string} acronym 
 * @returns string, readable description of acronym 
 */
function getWeatherAcronymDescription(acronym) {
    let retvalue = weatherAcronymKeymap.get(acronym);
    if (retvalue === undefined) retvalue = acronym;
    return retvalue;
}
/**
 * Load the wxkeymap Map object with weather code descriptions
 */
function loadWeatherAcronymKeymap() {
    weatherAcronymKeymap.set("FU", "Smoke");
    weatherAcronymKeymap.set("VA", "Volcanic Ash");
    weatherAcronymKeymap.set("HZ", "Haze");
    weatherAcronymKeymap.set("DU", "Dust");
    weatherAcronymKeymap.set("SA", "Sand");
    weatherAcronymKeymap.set("BLDU", "Blowing dust");
    weatherAcronymKeymap.set("BLSA", "Blowing sand");
    weatherAcronymKeymap.set("PO", "Dust devil");
    weatherAcronymKeymap.set("VCSS", "Vicinity sand storm");
    weatherAcronymKeymap.set("BR", "Mist or light fog");
    weatherAcronymKeymap.set("MIFG", "More or less continuous shallow fog");
    weatherAcronymKeymap.set("VCTS", "Vicinity thunderstorm");
    weatherAcronymKeymap.set("VIRGA", "Virga or precipitation not hitting ground");
    weatherAcronymKeymap.set("VCSH", "Vicinity showers");
    weatherAcronymKeymap.set("TS", "Thunderstorm with or without precipitation");
    weatherAcronymKeymap.set("SQ", "Squalls");
    weatherAcronymKeymap.set("FC", "Funnel cloud or tornado");
    weatherAcronymKeymap.set("SS", "Sand or dust storm");
    weatherAcronymKeymap.set("+SS", "Strong sand or dust storm");
    weatherAcronymKeymap.set("BLSN", "Blowing snow");
    weatherAcronymKeymap.set("DRSN", "Drifting snow");
    weatherAcronymKeymap.set("VCFG", "Vicinity fog");
    weatherAcronymKeymap.set("BCFG", "Patchy fog");
    weatherAcronymKeymap.set("PRFG", "Fog, sky discernable");
    weatherAcronymKeymap.set("FG", "Fog, sky undiscernable");
    weatherAcronymKeymap.set("FZFG", "Freezing fog");
    weatherAcronymKeymap.set("-DZ", "Light drizzle");
    weatherAcronymKeymap.set("DZ", "Moderate drizzle");
    weatherAcronymKeymap.set("+DZ", "Heavy drizzle");
    weatherAcronymKeymap.set("-FZDZ", "Light freezing drizzle");
    weatherAcronymKeymap.set("FZDZ", "Moderate freezing drizzle");
    weatherAcronymKeymap.set("+FZDZ", "Heavy freezing drizzle");
    weatherAcronymKeymap.set("-DZRA", "Light drizzle and rain");
    weatherAcronymKeymap.set("DZRA", "Moderate to heavy drizzle and rain");
    weatherAcronymKeymap.set("-RA", "Light rain");
    weatherAcronymKeymap.set("RA", "Moderate rain");
    weatherAcronymKeymap.set("+RA", "Heavy rain");
    weatherAcronymKeymap.set("-FZRA", "Light freezing rain");
    weatherAcronymKeymap.set("FZRA", "Moderate freezing rain");
    weatherAcronymKeymap.set("+FZRA", "Heavy freezing rain");
    weatherAcronymKeymap.set("-RASN", "Light rain and snow");
    weatherAcronymKeymap.set("RASN", "Moderate rain and snow");
    weatherAcronymKeymap.set("+RASN", "Heavy rain and snow");
    weatherAcronymKeymap.set("-SN", "Light snow");
    weatherAcronymKeymap.set("SN", "Moderate snow");
    weatherAcronymKeymap.set("+SN", "Heavy snow");
    weatherAcronymKeymap.set("SG", "Snow grains");
    weatherAcronymKeymap.set("IC", "Ice crystals");
    weatherAcronymKeymap.set("PE PL", "Ice pellets");
    weatherAcronymKeymap.set("PE", "Ice pellets");
    weatherAcronymKeymap.set("PL", "Ice pellets");
    weatherAcronymKeymap.set("-SHRA", "Light rain showers");
    weatherAcronymKeymap.set("SHRA", "Moderate rain showers");
    weatherAcronymKeymap.set("+SHRA", "Heavy rain showers");
    weatherAcronymKeymap.set("-SHRASN", "Light rain and snow showers");
    weatherAcronymKeymap.set("SHRASN", "Moderate rain and snow showers");
    weatherAcronymKeymap.set("+SHRASN", "Heavy rain and snow showers");
    weatherAcronymKeymap.set("-SHSN", "Light snow showers");
    weatherAcronymKeymap.set("SHSN", "Moderate snow showers");
    weatherAcronymKeymap.set("+SHSN", "Heavy snow showers");
    weatherAcronymKeymap.set("-GR", "Light showers with hail, not with thunder");
    weatherAcronymKeymap.set("GR", "Moderate to heavy showers with hail, not with thunder");
    weatherAcronymKeymap.set("TSRA", "Light to moderate thunderstorm with rain");
    weatherAcronymKeymap.set("TSGR", "Light to moderate thunderstorm with hail");
    weatherAcronymKeymap.set("+TSRA", "Thunderstorm with heavy rain");
    weatherAcronymKeymap.set("UP", "Unknown precipitation");
    weatherAcronymKeymap.set("NSW", "No significant weather");
}

/**
 * Get the description for a sky condition acronym
 * @param {string} acronym 
 * @returns acronym if found, otherwise just returns key
 */
function getSkyConditionDescription(acronym) {
    let retvalue = skyConditionKeymap.get(acronym);
    if (retvalue === undefined) {
        retvalue = acronym;
    }
    return retvalue;
}
/**
 * Map containing standard TAF/Metar acronyms
 */
 function loadSkyConditionmKeymap() {
    skyConditionKeymap.set("BKN", "Broken");
    skyConditionKeymap.set("BECMG", "Becoming");
    skyConditionKeymap.set("CB", "Cumulo-Nimbus");
    skyConditionKeymap.set("IMC", "Instrument meteorological conditions"),
    skyConditionKeymap.set("IMPR", "Improving");
    skyConditionKeymap.set("INC", "In Clouds");
    skyConditionKeymap.set("INS", "Inches");
    skyConditionKeymap.set("INTER", "Intermittent");
    skyConditionKeymap.set("INTSF", "Intensify(ing)");
    skyConditionKeymap.set("INTST", "Intensity");
    skyConditionKeymap.set("JTST", "Jet stream");
    skyConditionKeymap.set("KM", "Kilometers");
    skyConditionKeymap.set("KMH", "Kilometers per hour");
    skyConditionKeymap.set("KT", "Knots");
    skyConditionKeymap.set("L", "Low pressure area");
    skyConditionKeymap.set("LAN", "Land");
    skyConditionKeymap.set("LDA", "Landing distance available");
    skyConditionKeymap.set("LDG", "Landing");
    skyConditionKeymap.set("LGT", "Light");
    skyConditionKeymap.set("LOC", "Locally");
    skyConditionKeymap.set("LSQ", "Line squall");
    skyConditionKeymap.set("LSR", "Loose snow on runway");
    skyConditionKeymap.set("LTG", "Lightning");
    skyConditionKeymap.set("LYR", "Layer");
    skyConditionKeymap.set("M", "Meters");
    skyConditionKeymap.set("M", "Minus or below zero");
    skyConditionKeymap.set("M", "Less than lowest reportable sensor value");
    skyConditionKeymap.set("MAX", "Maximum");
    skyConditionKeymap.set("MB", "Millibars");
    skyConditionKeymap.set("MET", "Meteorological");
    skyConditionKeymap.set("MI", "Shallow");
    skyConditionKeymap.set("MIN", "Minutes");
    skyConditionKeymap.set("MNM", "Minimum");
    skyConditionKeymap.set("MOD", "Moderate");
    skyConditionKeymap.set("MOV", "Move, moving");
    skyConditionKeymap.set("MPS", "Meters per second");
    skyConditionKeymap.set("MS", "Minus");
    skyConditionKeymap.set("MSL", "Mean sea level");
    skyConditionKeymap.set("MTW", "Mountain waves");
    skyConditionKeymap.set("MU", "Runway friction coefficent");
    skyConditionKeymap.set("NC", "No change");
    skyConditionKeymap.set("NIL", "None, nothing");
    skyConditionKeymap.set("NM", "Nautical mile(s)");
    skyConditionKeymap.set("NMRS", "Numerous");
    skyConditionKeymap.set("NO", "Not available");
    skyConditionKeymap.set("NOSIG", "No significant change");
    skyConditionKeymap.set("NS", "Nimbostratus");
    skyConditionKeymap.set("NSC", "No significant clouds");
    skyConditionKeymap.set("NSW", "No Significant Weather");
    skyConditionKeymap.set("OBS", "Observation");
    skyConditionKeymap.set("OBSC", "Obscuring");
    skyConditionKeymap.set("OCNL", "Occasional");
    skyConditionKeymap.set("OKTA", "Eight of sky cover");
    skyConditionKeymap.set("OTP", "On top");
    skyConditionKeymap.set("OTS", "Out of service");
    skyConditionKeymap.set("OVC", "Overcast");
    skyConditionKeymap.set("P", "Greater than highest reportable sensor value");
    skyConditionKeymap.set("P6SM", "Visibility greater than 6 SM");
    skyConditionKeymap.set("PAEW", "Personnel and equipment working");
    skyConditionKeymap.set("PE", "Ice Pellets");
    skyConditionKeymap.set("PJE", "Parachute Jumping Exercise");
    skyConditionKeymap.set("PK WND", "Peak wind");
    skyConditionKeymap.set("PLW", "Plow/plowed");
    skyConditionKeymap.set("PNO", "Precipitation amount not available");
    skyConditionKeymap.set("PO", "Dust/Sand Whirls");
    skyConditionKeymap.set("PPR", "Prior permission required");
    skyConditionKeymap.set("PR", "Partial");
    skyConditionKeymap.set("PRESFR", "Pressure falling rapidly");
    skyConditionKeymap.set("PRESRR", "Pressure rising rapidly");
    skyConditionKeymap.set("PROB", "Probability");
    skyConditionKeymap.set("PROB30", "Probability 30 percent");
    skyConditionKeymap.set("PS", "Plus");
    skyConditionKeymap.set("PSR", "Packed snow on runway");
    skyConditionKeymap.set("PWINO", "Precipitation id sensor not available");
    skyConditionKeymap.set("PY", "Spray");
    skyConditionKeymap.set("R", "Runway (in RVR measurement)");
    skyConditionKeymap.set("RA", "Rain");
    skyConditionKeymap.set("RAB", "Rain Began");
    skyConditionKeymap.set("RADAT", "Radiosonde observation addl data");
    skyConditionKeymap.set("RAE", "Rain Ended");
    skyConditionKeymap.set("RAPID", "Rapid(ly)");
    skyConditionKeymap.set("RASN", "Rain and snow");
    skyConditionKeymap.set("RCAG", "Remote Center Air/Ground Comm Facility");
    skyConditionKeymap.set("RMK", "Remark");
    skyConditionKeymap.set("RVR", "Runway visual range");
    skyConditionKeymap.set("RVRNO", "RVR not available");
    skyConditionKeymap.set("RY/RWY", "Runway");
    skyConditionKeymap.set("SA", "Sand");
    skyConditionKeymap.set("SAND", "Sandstorm");
    skyConditionKeymap.set("SC", "Stratocumulus");
    skyConditionKeymap.set("SCSL", "Stratocumulus standing lenticular cloud");
    skyConditionKeymap.set("SCT", "Scattered cloud coverage");
    skyConditionKeymap.set("SEC", "Seconds");
    skyConditionKeymap.set("SEV", "Severe");
    skyConditionKeymap.set("SFC", "Surface");
    skyConditionKeymap.set("SG", "Snow Grains");
    skyConditionKeymap.set("SH", "Shower");
    skyConditionKeymap.set("SHWR", "Shower");
    skyConditionKeymap.set("SIGMET", "Information from MWO");
    skyConditionKeymap.set("SIR", "Snow and ice on runway");
    skyConditionKeymap.set("SKC", "Sky Clear");
    skyConditionKeymap.set("SLP", "Sea Level Pressure in MB");
    skyConditionKeymap.set("SLPNO", "Sea-level pressure not available");
    skyConditionKeymap.set("SLR", "Slush on runway");
    skyConditionKeymap.set("SLW", "Slow");
    skyConditionKeymap.set("SM", "Statute Miles");
    skyConditionKeymap.set("SMK", "Smoke");
    skyConditionKeymap.set("SMO", "Supplementary meteorological office");
    skyConditionKeymap.set("SN", "Snow");
    skyConditionKeymap.set("SPECI", "Special Report");
    skyConditionKeymap.set("SQ", "Squall");
    skyConditionKeymap.set("SS", "Sandstorm");
    skyConditionKeymap.set("SSR", "Secondary Surveillance Radar");
    skyConditionKeymap.set("T", "Temperature");
    skyConditionKeymap.set("TAF", "Terminal aerodrome forecast in code");
    skyConditionKeymap.set("TAPLEY", "Tapley runway friction coefficient");
    skyConditionKeymap.set("TAR", "Terminal Area Surveillance Radar");
    skyConditionKeymap.set("TAIL", "Tail wind");
    skyConditionKeymap.set("TCH", "Threshold Crossing Height");
    skyConditionKeymap.set("TCU", "Towering Cumulus");
    skyConditionKeymap.set("TDO", "Tornado");
    skyConditionKeymap.set("TDWR", "Terminal Doppler Weather Radar");
    skyConditionKeymap.set("TEMPO", "TEMPO");
    skyConditionKeymap.set("TEND", "Trend or tending to");
    skyConditionKeymap.set("TKOF", "Takeoff");
    skyConditionKeymap.set("TMPA", "Traffic Management Program Alert");
    skyConditionKeymap.set("TODA", "Takeoff distance available");
    skyConditionKeymap.set("TOP", "Cloud top");
    skyConditionKeymap.set("TORA", "Takeoff run available");
    skyConditionKeymap.set("TS", "Thunderstorm");
    skyConditionKeymap.set("TSNO", "Thunderstorm/lightning detector not available");
    skyConditionKeymap.set("TURB", "Turbulence");
    skyConditionKeymap.set("TWY", "Taxiway");
    skyConditionKeymap.set("UFN", "Until further notice");
    skyConditionKeymap.set("UNL", "Unlimited");
    skyConditionKeymap.set("UP", "Unknown Precipitation");
    skyConditionKeymap.set("UTC", "Coordinated Universal Time (=GMT)");
    skyConditionKeymap.set("V", "Variable (wind direction and RVR)");
    skyConditionKeymap.set("VA", "Volcanic Ash");
    skyConditionKeymap.set("VC", "Vicinity");
    skyConditionKeymap.set("VER", "Vertical");
    skyConditionKeymap.set("VFR", "Visual flight rules");
    skyConditionKeymap.set("VGSI", "Visual Glide Slope Indicator");
    skyConditionKeymap.set("VIS", "Visibility");
    skyConditionKeymap.set("VISNO [LOC]", "Visibility Indicator at second location not available");
    skyConditionKeymap.set("VMS", "Visual meteorological conditions");
    skyConditionKeymap.set("VOLMET", "Meteorological information for aircraft in flight");
    skyConditionKeymap.set("VRB", "Variable wind direction");
    skyConditionKeymap.set("VRBL", "Variable");
    skyConditionKeymap.set("VSP", "Vertical speed");
    skyConditionKeymap.set("VV", "Vertical Visibility (indefinite ceiling)");
    skyConditionKeymap.set("WAAS", "Wide Area Augmentation System");
    skyConditionKeymap.set("WDSPR", "Widespread");
    skyConditionKeymap.set("WEF", "With effect from");
    skyConditionKeymap.set("WIE", "With immediate effect");
    skyConditionKeymap.set("WIP", "Work in progress");
    skyConditionKeymap.set("WKN", "Weaken(ing)");
    skyConditionKeymap.set("WR", "Wet runway");
    skyConditionKeymap.set("WS", "Wind shear");
    skyConditionKeymap.set("WSHFT", "Wind shift (in minutes after the hour)");
    skyConditionKeymap.set("WSP", "Weather Systems Processor");
    skyConditionKeymap.set("WSR", "Wet snow on runway");
    skyConditionKeymap.set("WST", "Convective Significant Meteorological Information");
    skyConditionKeymap.set("WTSPT", "Waterspout");
    skyConditionKeymap.set("WW", "Severe Weather Watch Bulletin");
    skyConditionKeymap.set("WX", "Weather");
}

/**
 * Decode weather codes from TAFs or METARS
 * @param {*} codevalue: this could contain multiple space-delimited codes
 * @returns string with any weather description(s)
 */
 function decodeWxDescriptions(codevalue) {
    let outstr = "";
    let vals = codevalue.split(" ");
    
    for (let i = 0; i < vals.length; i++) {
        if (i === 0) {
            outstr = weatherAcronymKeymap.get(vals[i]);
        }
        else {
            outstr += ` / ${weatherAcronymKeymap.get(vals[i])}`;
        }
    }
    return outstr;
}

/**
 * Get the description for an icing code
 * @param {string} code 
 * @returns string, readable description of code 
 */
 function getIcingCodeDescription(code) {
    let retvalue = icingCodeKeymap.get(code);
    if (retvalue === undefined) retvalue = code;
    return retvalue;
}
/**
 * Load readable descriptions for Icing codes
 */
function loadIcingCodeKeymap() {
    icingCodeKeymap.set("0", "None");
    icingCodeKeymap.set("1", "Light");
    icingCodeKeymap.set("2", "Light in clouds")
    icingCodeKeymap.set("3", "Light in precipitation")
    icingCodeKeymap.set("4", "Moderate");   
    icingCodeKeymap.set("5", "Moderate in clouds");
    icingCodeKeymap.set("6", "Moderate in precipitation");
    icingCodeKeymap.set("7", "Severe");
    icingCodeKeymap.set("8", "Severe in clouds");
    icingCodeKeymap.set("9", "Severe in precipitation");     
}

/**
 * Get the description for a turbulence code
 * @param {string} code 
 * @returns string, readable description of code 
 */
function getTurbulenceCodeDescription(code) {
let retvalue = turbulenceCodeKeymap.get(code);
if (retvalue === undefined) retvalue = code;
return retvalue;
}
/**
 * Load readable descriptions for Turbulence codes
 */
function loadTurbulenceCodeKeymap() {
turbulenceCodeKeymap.set("0", "Light");
turbulenceCodeKeymap.set("1", "Light");
turbulenceCodeKeymap.set("2", "Moderate in clean air occasionally")
turbulenceCodeKeymap.set("3", "Moderate in clean air frequent");
turbulenceCodeKeymap.set("4", "Moderate in clouds occasionally");   
turbulenceCodeKeymap.set("5", "Moderate in clouds frequently");
turbulenceCodeKeymap.set("6", "Severe in clean air occasionally");
turbulenceCodeKeymap.set("7", "Severe in clean air frequent");
turbulenceCodeKeymap.set("8", "Severe in clouds occasionally");
turbulenceCodeKeymap.set("9", "Severe in clouds frequently");
turbulenceCodeKeymap.set("X", "Extreme");
turbulenceCodeKeymap.set("x", "Extreme");
}

const CONDITIONS = {
    //Visual Flight Rules
    VFR: "green",
    //Marginal Visual Flight Rules
    MVFR: "blue",
    //Instrument Flight Rules
    IFR: "red",
    //Low Instrument flight Rules
    LIFR: "purple"
};
var size = 25;
var piD = (size / 2) * 3.14 * 2;
//clear square
var CLR_SQUARE = "<g id=\"clr\">\n        <rect width=\"" + size + "\" height=\"" + size + "\" x=\"calc(250 - " + size / 2 + ")\" y=\"calc(250 - " + size / 2 + ")\" class=\"coverage\"/>\n    </g>";
//clear circle
var CLR_CIRCLE = "<g id=\"clr\">\n        <circle cx=\"250\" cy=\"250\" r=\"" + size + "\" fill=\"#00000000\" class=\"coverage\"/>\n    </g>";
// Few clouds 25% coverage
var FEW = "<g id=\"few\">\n        <circle cx=\"250\" cy=\"250\" r=\"" + size + "\" fill=\"#00000000\" class=\"coverage\"/>\n        <circle cx=\"250\" cy=\"250\" r=\"" + size / 2 + "\" fill=\"#00000000\" \n        stroke-dasharray=\"0 calc(75 * " + piD + " / 100) calc(25 * " + piD + " / 100)\"\n        class=\"partial\"/>\n    </g>";
// Scattered clouds 50% coverage
var SCT = "<g id=\"few\">\n    <circle cx=\"250\" cy=\"250\" r=\"" + size + "\" fill=\"#00000000\" class=\"coverage\"/>\n    <circle cx=\"250\" cy=\"250\" r=\"" + size / 2 + "\" fill=\"#00000000\" \n    stroke-dasharray=\"calc(25 * " + piD + " / 100) calc(50 * " + piD + " / 100) calc(25 * " + piD + " / 100)\"\n    class=\"partial\"/>\n</g>";
// Broken clouds 75% coverage
var BRK = "<g id=\"few\">\n    <circle cx=\"250\" cy=\"250\" r=\"" + size + "\" fill=\"#00000000\" class=\"coverage\"/>\n    <circle cx=\"250\" cy=\"250\" r=\"" + size / 2 + "\" fill=\"#00000000\" \n    stroke-dasharray=\"calc(49 * " + piD + " / 100) calc(26 * " + piD + " / 100) calc(25 * " + piD + " / 100)\"\n    class=\"partial\"/>\n</g>";
// Overcast
var OVC = "<g id=\"ovc\">\n    <circle cx=\"250\" cy=\"250\" r=\"" + size + "\" class=\"ovc\"/>\n</g>";
//Cloud abbreviation map
let CLOUDS = {
    NCD: { svg: CLR_CIRCLE, text: "no clouds", rank: 0 },
    SKC: { svg: CLR_CIRCLE, text: "sky clear", rank: 0 },
    CLR: { svg: CLR_CIRCLE, text: "no clouds under 12,000 ft", rank: 0 },
    NSC: { svg: CLR_CIRCLE, text: "no significant", rank: 0 },
    FEW: { svg: FEW, text: "few", rank: 1 },
    SCT: { svg: SCT, text: "scattered", rank: 2 },
    BKN: { svg: BRK, text: "broken", rank: 3 },
    OVC: { svg: OVC, text: "overcast", rank: 4 },
    VV: { svg: OVC, text: "vertical visibility", rank: 5 },
};
/**
 * Generates SVG for cloud coverage
 * @param coverage
 * @param condition
 * @returns
 */
function genCoverage(coverage, condition) {
    if (coverage != null && coverage !== "") {
        return "\n            <style>\n                .coverage{ \n                    stroke-width: 5; \n                    stroke: " + (condition != null ? exports.CONDITIONS[condition] : "black") + ";\n                }\n                .partial{\n                    stroke-width: 25; \n                    stroke: " + (condition != null ? exports.CONDITIONS[condition] : "black") + ";\n                }\n                .ovc{\n                    fill: " + (condition != null ? exports.CONDITIONS[condition] : "black") + ";\n                }\n            </style>\n            " + CLOUDS[coverage].svg;
    }
    else {
        return "";
    }
}

var RVR = /** @class */ (function () {
    function RVR(rvrString) {
        this.re = /(R\d{2})([L|R|C])?(\/)([P|M])?(\d+)(?:([V])([P|M])?(\d+))?([N|U|D])?(FT)?/g;
        var matches;
        while ((matches = this.re.exec(rvrString)) != null) {
            if (matches.index === this.re.lastIndex) {
                this.re.lastIndex++;
            }
            this.runway = matches[1];
            this.direction = matches[2];
            this.seperator = matches[3];
            this.minIndicator = matches[4];
            this.minValue = matches[5];
            this.variableIndicator = matches[6];
            this.maxIndicator = matches[7];
            this.maxValue = matches[8];
            this.trend = matches[9];
            this.unitsOfMeasure = matches[10];
        }
    }
    return RVR;
}());

/**
 * Weather Descriptor
 */
var Weather = /** @class */ (function () {
    function Weather() {
    }
    return Weather;
}());

/**
 * Deprecated - for internal use only please use getWeatherLegend(key: string)
 * @param key weather abbriviation
 * @returns
 */
function getWeatherSVG(key) {
    var weather = WEATHER[key] != null ? WEATHER[key].svg : "";
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"65\" height=\"65\" viewBox=\"0 0 500 500\" x=\"140\" y=\"220\">\n                <style>\n                    .wx_text{ \n                        color: black;\n                        font-size: 400px;\n                        font-family: \"Noto Sans\";\n                        white-space: pre;\n                    }\n                    .snow{ \n                        color: black;\n                        font-size: 300px;\n                        font-family: \"Noto Sans\";\n                        white-space: pre;\n                    }\n                    .wx_graphic {\n                        stroke: black;\n                        fill: none;\n                        stroke-width: 30\n                    }\n                    .wx_graphic_thin {\n                        stroke: black;\n                        fill: none;\n                        stroke-width: 15\n                    }\n                </style>\n                " + weather + "\n            </svg>";
}
/**
 * Returns SVG icon
 * @param key weather abbriviation
 */
function getWeatherLegend(key) {
    var weather = WEATHER[key] != null ? WEATHER[key].svg : "";
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"65\" height=\"65\" viewBox=\"0 0 500 500\">\n                <style>\n                    .wx_text{ \n                        color: black;\n                        font-size: 400px;\n                        font-family: \"Noto Sans\";\n                        white-space: pre;\n                    }\n                    .snow{ \n                        color: black;\n                        font-size: 300px;\n                        font-family: \"Noto Sans\";\n                        white-space: pre;\n                    }\n                    .wx_graphic {\n                        stroke: black;\n                        fill: none;\n                        stroke-width: 30\n                    }\n                    .wx_graphic_thin {\n                        stroke: black;\n                        fill: none;\n                        stroke-width: 15\n                    }\n                </style>\n                " + weather + "\n            </svg>";
}
var BRK_DWN_ARW = "<line class=\"wx_graphic\" x1=\"350\" y1=\"50\" x2=\"175\" y2=\"250\"></line>\n    <line class=\"wx_graphic\" x1=\"170\" y1=\"245\" x2=\"350\" y2=\"415\"></line>\n    <line class=\"wx_graphic\" x1=\"350\" y1=\"415\" x2=\"250\" y2=\"415\"></line>\n    <line class=\"wx_graphic\" x1=\"350\" y1=\"425\" x2=\"350\" y2=\"315\"></line>";
var RIGHT_ARROW = "<line class=\"wx_graphic\" x1=\"120\" y1=\"250\" x2=\"430\" y2=\"250\"></line>\n    <line class=\"wx_graphic\" x1=\"380\" y1=\"250\" x2=\"465\" y2=\"250\" transform=\"rotate(-45, 450, 250)\"></line>\n    <line class=\"wx_graphic\" x1=\"380\" y1=\"250\" x2=\"450\" y2=\"250\" transform=\"rotate(45, 450, 250)\"></line>";
var TRANSFORM = "transform=\"matrix(1.4,0,0,1.2,-102.2,-30.3)\"";
var DWN_TRI = "<polygon style=\"stroke: black\" points=\"150 160 350 160 250 475\"></polygon>";
/*
SVG Icons
*/
//DUST OR SAND
var sine = "<path transform=\"matrix(1.4,0,0,1.6,-84,-118)\" style=\"fill: none; stroke: black; stroke-width: 10\" d=\"M 232.3 217.2 C 231.4 184.3 201 163.6 176.6 180.1 C 165.3 187.8 158.3 201.9 158.3 217.2\"></path>\n    <path transform=\"matrix(1.4,0,0,1.6,-121,-147)\" style=\"fill: none; stroke: black; stroke-width: 10\" d=\"M 337.1 223.5 C 337.1 255.3 304.1 275.2 277.8 259.3 C 265.6 251.9 258 238.2 258 223.5\"></path>    \n";
//Smoke or volcanic ash
var FU_VA = "<g id=\"FU_VA\">\n        <line class=\"wx_graphic\" x1=\"100\" y1=\"150\" x2=\"100\" y2=\"400\"></line>\n        <path class=\"wx_graphic\" d=\"M 100 150 C 115 75 185 75 200 150\"></path>\n        <path class=\"wx_graphic\" d=\"M 200 150 C 215 215 285 215 300 150\"></path>\n        <path class=\"wx_graphic\" d=\"M 300 150 C 315 75 380 75 400 150\"></path>\n    </g>";
//Haze
var HZ = "<g id=\"HZ\">\n        <text class=\"snow\" x=\"100\" y=\"365\">\u267E\uFE0F</text>\n    </g>";
//Dust or Sand
var DU_SA = "<g id=\"DU_SA\">\n        <text class=\"wx_text\" x=\"160\" y=\"360\">S</text>\n    </g>";
//Blowing dust or sand
var BLDU_BLSA = "<g id=\"BLDU_BLSA\">\n        <text class=\"wx_text\" x=\"160\" y=\"360\">$</text>\n    </g>";
//Dust Devil
var PO = "<g id=\"PO\">\n      <text class=\"wx_text\" style=\"font-size: 375px;\" x=\"50\" y=\"360\">(\u25CF)</text>\n    </g>";
//Vicinity sand storm
var VCSS = "<g id=\"VCSS\">\n        <text class=\"wx_text\" x=\"50\" y=\"360\">($)</text>\n        " + RIGHT_ARROW + "\n    </g>";
//FOG OR SPEACIAL WEATHER
//Mist or light fog
var BR = "<g id=\"BR\">\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"200\" x2=\"450\" y2=\"200\"></line>\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"300\" x2=\"450\" y2=\"300\"></line>\n    </g>";
//More or less continuous shallow fog
var MIFG = "<g id=\"MIFG\">\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"200\" x2=\"200\" y2=\"200\"></line>\n        <line class=\"wx_graphic\" x1=\"300\" y1=\"200\" x2=\"450\" y2=\"200\"></line>\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"300\" x2=\"450\" y2=\"300\"></line>\n    </g>\n    ";
//Vicinity thunderstorm
var VCTS = "<g id=\"VCTS\">" + BRK_DWN_ARW + "</g>";
//Virga or precipitation not hitting ground
var VIRGA = "<g id=\"VIGRA\">\n        <text transform=\"matrix(0, -1, 1, 0, 366, 389)\" class=\"wx_text\" style=\"font-size:300px;\" dx=\"-5 -9\" dy=\"-40 0.5\">(\u25CF</text>\n    </g>";
//Vicinity showers
var VCSH = "<g id=\"VCSS\">\n        <text class=\"wx_text\" x=\"50\" y=\"360\">( )</text>\n        <circle style=\"fill: black\" cx=\"230\" cy=\"260\" r=\"50\"></circle>\n    </g>";
//Thunderstorm with or without precipitation
var TS = "<g id=\"TS\">\n        " + BRK_DWN_ARW + "\n        <line class=\"wx_graphic\" x1=\"355\" y1=\"50\" x2=\"50\" y2=\"50\"></line>\n        <line class=\"wx_graphic\" x1=\"60\" y1=\"50\" x2=\"60\" y2=\"440\"></line>\n    </g>\n    ";
//Squalls
var SQ = "<g id=\"SQ\">\n        <line class=\"wx_graphic\" x1=\"250\" y1=\"450\" x2=\"150\" y2=\"50\"></line>\n        <line class=\"wx_graphic\" x1=\"150\" y1=\"50\" x2=\"250\" y2=\"125\"></line>\n        <line class=\"wx_graphic\" x1=\"250\" y1=\"125\" x2=\"350\" y2=\"50\"></line>\n        <line class=\"wx_graphic\" x1=\"350\" y1=\"50\" x2=\"250\" y2=\"450\"></line>\n    </g>";
//Funnel cloud or tornado
var FC = "<g id=\"FC\">\n        <line class=\"wx_graphic\" x1=\"200\" y1=\"100\" x2=\"200\" y2=\"400\"></line>\n        <line class=\"wx_graphic\" x1=\"300\" y1=\"100\" x2=\"300\" y2=\"400\"></line>\n        <line class=\"wx_graphic\" x1=\"300\" y1=\"100\" x2=\"375\" y2=\"50\"></line>\n        <line class=\"wx_graphic\" x1=\"300\" y1=\"400\" x2=\"375\" y2=\"450\"></line>\n        <line class=\"wx_graphic\" x1=\"200\" y1=\"400\" x2=\"125\" y2=\"450\"></line>\n        <line class=\"wx_graphic\" x1=\"200\" y1=\"100\" x2=\"125\" y2=\"50\"></line>\n    </g>\n    ";
//BLOWING WEATHER
//Sand or dust storm
var SS = "<g id=\"SS\">\n        <text class=\"wx_text\" x=\"160\" y=\"360\">S</text>\n        " + RIGHT_ARROW + "\n    </g>";
//Strong sand or dust storm
var PLUS_SS = "<g =\"+SS\">\n        <text class=\"wx_text\" x=\"160\" y=\"360\">S</text>\n    </g>";
//Blowing snow
var BLSN = "<g id=\"BLSN\">\n        <text x=\"0\" y=\"350\" class=\"wx_text\" transform=\"rotate(270, 250, 250)\">\u2192</text>\n        <text x=\"50\" y=\"450\" class=\"wx_text\">\u2192</text>\n    </g>";
//Drifting snow
var DRSN = "<g id=\"DRSN\">\n        <text x=\"110\" y=\"350\" class=\"wx_text\" transform=\"rotate(90, 250, 250)\">\u2192</text>\n        <text x=\"110\" y=\"400\" class=\"wx_text\">\u2192</text>\n    </g>\n    ";
//FOG//////////////////////////////////////////////
//Vicinity fog
var VCFG = "<g id=\"VCFG\">\n        <line class=\"wx_graphic\" x1=\"100\" y1=\"150\" x2=\"400\" y2=\"150\"></line>\n        <line class=\"wx_graphic\" x1=\"100\" y1=\"250\" x2=\"400\" y2=\"250\"></line>\n        <line class=\"wx_graphic\" x1=\"100\" y1=\"350\" x2=\"400\" y2=\"350\"></line>\n        <path class=\"wx_graphic\" d=\"M 60 135 C 15 165 15 335 65 365\"></path>\n        <path class=\"wx_graphic\" d=\"M 435 135 C 485 150 500 345 435 365\"></path>\n    </g>";
//Patchy fog
var BCFG = "<g id=\"BCFG\">\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"150\" x2=\"150\" y2=\"150\"></line>\n        <line class=\"wx_graphic\" x1=\"350\" y1=\"150\" x2=\"450\" y2=\"150\"></line>\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"250\" x2=\"450\" y2=\"250\"></line>\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"350\" x2=\"150\" y2=\"350\"></line>\n        <line class=\"wx_graphic\" x1=\"350\" y1=\"350\" x2=\"450\" y2=\"350\"></line>\n    </g>";
//Fog, sky discernable
var PRFG = "<g id=\"BCFG\">\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"150\" x2=\"150\" y2=\"150\"></line>\n        <line class=\"wx_graphic\" x1=\"350\" y1=\"150\" x2=\"450\" y2=\"150\"></line>\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"250\" x2=\"450\" y2=\"250\"></line>\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"350\" x2=\"450\" y2=\"350\"></line>\n    </g>";
//Fog, sky undiscernable
var FG = "<g id=\"FG\">\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"150\" x2=\"450\" y2=\"150\"></line>\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"250\" x2=\"450\" y2=\"250\"></line>\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"350\" x2=\"450\" y2=\"350\"></line>\n    </g>";
//Freezing fog
var FZFG = "<g id=\"FG\">\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"150\" x2=\"450\" y2=\"150\"></line>\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"250\" x2=\"450\" y2=\"250\"></line>\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"350\" x2=\"450\" y2=\"350\"></line>\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"150\" x2=\"250\" y2=\"350\"></line>\n        <line class=\"wx_graphic\" x1=\"450\" y1=\"150\" x2=\"250\" y2=\"350\"></line>\n    </g>";
//Drizzle
//Light drizzle
var MIN_DZ = "<g id=\"-DZ\">\n        <text class=\"wx_text\" x=\"130\" y=\"240\">,,</text>\n    </g>";
//Moderate drizzle
var DZ = "<g id=\"RA\">\n        <text class=\"wx_text\" x=\"130\" y=\"285\">,,</text>\n        <text class=\"wx_text\" x=\"170\" y=\"175\">,</text>\n    </g>";
//Heavy drizzle
var PLUS_DZ = "<g id=\"RA\">\n        <text class=\"wx_text\" x=\"130\" y=\"240\">,,</text>\n        <text class=\"wx_text\" x=\"170\" y=\"145\">,</text>\n        <text class=\"wx_text\" x=\"170\" y=\"320\">,</text>\n    </g>";
//Light freezing drizzle
var MIN_FZDZ = "<g id=\"-DZ\" " + TRANSFORM + ">\n        <text class=\"wx_text\" x=\"130\" y=\"240\">,</text>\n        " + sine + "\n    </g>";
//Moderate to heavy freezing drizzle
var FZDZ = "<g id=\"-DZ\" " + TRANSFORM + ">\n        <text class=\"wx_text\" x=\"130\" y=\"240\">,,</text>\n        " + sine + "    \n    </g>";
//Light drizzle and rain
var MIN_DZRA = "<g id=\"MIN_DZRA>\n        <text style=\"fill: rgb(51, 51, 51); font-family: Georgia; font-size: 300px; white-space: pre;\" x=\"198.442\" y=\"348.054\" dx=\"0.743\" dy=\"-39.081\">,</text>\n        <text style=\"fill: rgb(51, 51, 51); font-family: &quot;Roboto Slab&quot;; font-size: 100px; white-space: pre;\" x=\"313.598\" y=\"154.93\" dx=\"-105.782\" dy=\"92.343\">\u25CF</text>\n    </g>";
//Moderate to heavy drizzle and rain
var DZRA = "<g id=\"MIN_DZRA>\n        <text x=\"198.442\" y=\"348.054\" style=\"white-space: pre; fill: rgb(51, 51, 51); font-family: &quot;Georgia&quot;; font-size: 300px;\">,</text>\n        <text style=\"fill: rgb(51, 51, 51); font-family: Georgia; font-size: 300px; white-space: pre;\" x=\"200.662\" y=\"301.835\" dx=\"-0.441\" dy=\"-136.772\">,</text>\n        <text style=\"fill: rgb(51, 51, 51); font-family: &quot;Roboto Slab&quot;; font-size: 100px; white-space: pre;\" x=\"313.598\" y=\"154.93\" dx=\"-106.683\" dy=\"133.71\">\u25CF</text>\n    </g>";
//RAIN
//Light rain
var MIN_RA = "<g id=\"-RA\">\n        <text class=\"wx_text\" x=\"130\" y=\"240\">..</text>\n    </g>";
//Moderate rain
var RA = "<g id=\"RA\">\n        <text class=\"wx_text\" x=\"130\" y=\"285\">..</text>\n        <text class=\"wx_text\" x=\"170\" y=\"175\">.</text>\n    </g>";
//Heavy rain
var PLUS_RA = "<g id=\"RA\">\n        <text class=\"wx_text\" x=\"130\" y=\"240\">..</text>\n        <text class=\"wx_text\" x=\"170\" y=\"145\">.</text>\n        <text class=\"wx_text\" x=\"170\" y=\"320\">.</text>\n    </g>";
//Light freezing rain
var MIN_FZRA = "<g id=\"-RA\" transform=\"matrix(1.4,0,0,1.2,-102.2,-30.3)\">\n        <text class=\"wx_text\" x=\"130\" y=\"240\">.</text>\n        " + sine + "\n    </g>";
//Moderate to heavy freezing rain
var FZRA = "<g id=\"-RA\" " + TRANSFORM + ">\n    <text class=\"wx_text\" x=\"130\" y=\"240\">..</text>\n    " + sine + "\n    </g>";
//Light rain and snow
var MIN_RASN = "<g id=\"MIN_RASN\">\n        <text style=\"fill: rgb(51, 51, 51); font-family: Georgia; font-size: 200px; white-space: pre;\" x=\"198.442\" y=\"348.054\" dx=\"-0.648\" dy=\"82.18\">*</text>\n        <text style=\"fill: rgb(51, 51, 51); font-family: &quot;Roboto Slab&quot;; font-size: 200px; white-space: pre;\" x=\"313.598\" y=\"154.93\" dx=\"-129.822\" dy=\"98.015\">\u25CF</text>\n    </g>";
//Moderate to heavy rain and snow
var RASN = "<g id=\"RASN\">\n        <text style=\"fill: rgb(51, 51, 51); font-family: Georgia; font-size: 200px; white-space: pre;\" x=\"198.442\" y=\"348.054\" dx=\"6.111\" dy=\"137.208\">*</text>\n        <text style=\"fill: rgb(51, 51, 51); font-family: &quot;Roboto Slab&quot;; font-size: 200px; white-space: pre;\" x=\"313.598\" y=\"154.93\" dx=\"-124.964\" dy=\"158.382\">\u25CF</text>\n        <text transform=\"matrix(1, 0, 0, 1, 11.82478, 80.656288)\" style=\"fill: rgb(51, 51, 51); font-family: Georgia; font-size: 200px; white-space: pre;\" x=\"198.442\" y=\"348.054\" dx=\"-10.654\" dy=\"-182.434\">*</text>\n    </g>";
//SNOW and MISC FROZEN PERCIP
//Light snow
var MIN_SN = "<g id=\"-SN\">\n        <text class=\"snow\" x=\"50\" y=\"370\">**</text>\n    </g>\n    ";
//Moderate snow
var SN = "<g id=\"SN\">\n        <text class=\"snow\" x=\"50\" y=\"460\">**</text>\n        <text class=\"snow\" x=\"120\" y=\"325\">*</text>\n    </g>";
//Heavy snow
var PLUS_SN = "<g id=\"+SN\">\n        <text class=\"snow\" x=\"50\" y=\"420\">**</text>\n        <text class=\"snow\" x=\"120\" y=\"285\">*</text>\n        <text class=\"snow\" x=\"120\" y=\"540\">*</text>\n    </g>";
//Snow grains
var SG = "<g id=\"SG\">\n        <polygon class=\"wx_graphic\" points=\"250 150 150 300 350 300\"></polygon>\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"230\" x2=\"197\" y2=\"230\"></line>\n        <line class=\"wx_graphic\" x1=\"303\" y1=\"230\" x2=\"450\" y2=\"230\"></line>\n    </g>";
//Ice crystals
var IC = "<g id=\"IC\">\n        <line class=\"wx_graphic\" x1=\"50\" y1=\"250\" x2=\"450\" y2=\"250\"></line>\n        <line class=\"wx_graphic\" x1=\"175\" y1=\"175\" x2=\"325\" y2=\"325\"></line>\n        <line class=\"wx_graphic\" x1=\"325\" y1=\"175\" x2=\"174\" y2=\"325\"></line>  \n    </g>";
//Ice pellets
var PE_PL = "<g id=\"PE_PL\">\n      <polygon class=\"wx_graphic\" points=\"250 150 150 300 350 300\"></polygon>\n      <text style=\"fill: black; font-size: 100px;\" x=\"237.271\" y=\"242.526\" dx=\"-18.412\" dy=\"32.137\">\u25CF</text>\n    </g>";
//SHOWERY PERCIPITATION
//Light rain showers
var MIN_SHRA = "<g id=\"MIN_SHRA\">\n        <polygon class=\"wx_graphic\"  points=\"150 160 350 160 250 475\"></polygon>\n        <text x=\"190\" y=\"140\" style=\"font-size: 200px;\">\u25CF</text>\n    </g>";
//Moderate to heavy rain showers
var SHRA = "";
//Light rain and snow showers
var MIN_SHRASN = "";
//Moderate to heavy rain and snow showers
var SHRASN = "";
//Light snow showers
var MIN_SHSN = "";
//Moderate to heavy snow showers
var SHSN = "";
//Light showers with hail, not with thunder
var MIN_GR = "";
//Moderate to heavy showers with hail, not with thunder
var GR = "";
// THUNDERSTORMS
//Light to moderate thunderstorm with rain
var TSRA = "";
//Light to moderate thunderstorm with hail
var TSGR = "";
//Thunderstorm with heavy rain
var PLUS_TSRA = "";
/**
 * Map of weather abbriviation to SVG data and Full text
 */
let WEATHER = {
    "FU": { svg: FU_VA, text: "Smoke" },
    "VA": { svg: FU_VA, text: "Volcanic Ash" },
    "HZ": { svg: HZ, text: "Haze" },
    "DU": { svg: DU_SA, text: "Dust" },
    "SA": { svg: DU_SA, text: "Sand" },
    "BLDU": { svg: BLDU_BLSA, text: "Blowing Dust" },
    "BLDA": { svg: BLDU_BLSA, text: "Blowing Sand" },
    "PO": { svg: PO, text: "Dust Devil" },
    "VCSS": { svg: VCSS, text: "Vicinity Sand Storm" },
    "BR": { svg: BR, text: "Mist or light fog" },
    "MIFG": { svg: MIFG, text: "Continuous Shallow Fog" },
    "VCTS": { svg: VCTS, text: "Vicinity Thunderstorm" },
    "VIRGA": { svg: VIRGA, text: "Virga" },
    "VCSH": { svg: VCSH, text: "Vicinity showers" },
    "TS": { svg: TS, text: "Thunderstorm" },
    "SQ": { svg: SQ, text: "Squall" },
    "FC": { svg: FC, text: "Funnel Cloud/Tornado" },
    "SS": { svg: SS, text: "Sand/Dust Storm" },
    "+SS": { svg: PLUS_SS, text: "Strong Sand/Dust Storm" },
    "BLSN": { svg: BLSN, text: "Blowing Snow" },
    "DRSN": { svg: DRSN, text: "Drifting Snow" },
    "VCFG": { svg: VCFG, text: "Vicinity Fog" },
    "BCFG": { svg: BCFG, text: "Patchy Fog" },
    "PRFG": { svg: PRFG, text: "Fog, Sky Discernable" },
    "FG": { svg: FG, text: "Fog, Sky Undiscernable" },
    "FZFG": { svg: FZFG, text: "Freezing Fog" },
    "-DZ": { svg: MIN_DZ, text: "Light Drizzle" },
    "DZ": { svg: DZ, text: "Moderate Drizzle" },
    "+DZ": { svg: PLUS_DZ, text: "Heavy Drizzle" },
    "-FZDZ": { svg: MIN_FZDZ, text: "Light Freezing Drizzle" },
    "FZDZ": { svg: FZDZ, text: "Moderate Freezing Drizzle" },
    "+FZDZ": { svg: FZDZ, text: "Heavy Freezing Drizzle" },
    "-DZRA": { svg: MIN_DZRA, text: "Light Drizzle & Rain" },
    "DZRA": { svg: DZRA, text: "Moderate to Heavy Drizzle & Rain" },
    "-RA": { svg: MIN_RA, text: "Light Rain" },
    "RA": { svg: RA, text: "Moderate Rain" },
    "+RA": { svg: PLUS_RA, text: "Heavy Rain" },
    "-FZRA": { svg: MIN_FZRA, text: "Light Freezing Rain" },
    "FZRA": { svg: FZRA, text: "Moderate Freezing Rain" },
    "+FZRA": { svg: FZRA, text: "Heavy Freezing Rain" },
    "-RASN": { svg: MIN_RASN, text: "Light Rain & Snow" },
    "RASN": { svg: RASN, text: "Moderate Rain & Snow" },
    "+RASN": { svg: RASN, text: "Heavy Rain & Snow" },
    "-SN": { svg: MIN_SN, text: "Light Snow" },
    "SN": { svg: SN, text: "Moderate Snow" },
    "+SN": { svg: PLUS_SN, text: "Heavy Snow" },
    "SG": { svg: SG, text: "Snow Grains" },
    "IC": { svg: IC, text: "Ice Crystals" },
    "PE": { svg: PE_PL, text: "Ice Pellets" },
    "PL": { svg: PE_PL, text: "Ice Pellets" }
};
let RECENT_WEATHER = {
    REBLSN: "Moderate/heavy blowing snow (visibility significantly reduced)reduced",
    REDS: "Dust Storm",
    REFC: "Funnel Cloud",
    REFZDZ: "Freezing Drizzle",
    REFZRA: "Freezing Rain",
    REGP: "Moderate/heavy snow pellets",
    REGR: "Moderate/heavy hail",
    REGS: "Moderate/heavy small hail",
    REIC: "Moderate/heavy ice crystals",
    REPL: "Moderate/heavy ice pellets",
    RERA: "Moderate/heavy rain",
    RESG: "Moderate/heavy snow grains",
    RESHGR: "Moderate/heavy hail showers",
    RESHGS: "Moderate/heavy small hail showers",
    // RESHGS: "Moderate/heavy snow pellet showers", // dual meaning?
    RESHPL: "Moderate/heavy ice pellet showers",
    RESHRA: "Moderate/heavy rain showers",
    RESHSN: "Moderate/heavy snow showers",
    RESN: "Moderate/heavy snow",
    RESS: "Sandstorm",
    RETS: "Thunderstorm",
    REUP: "Unidentified precipitation (AUTO obs. only)",
    REVA: "Volcanic Ash",
};

var GUST_WIDTH = 2;
var WS_WIDTH = 4;
/**
 * Creates a windbarb for the metar
 * @param metar
 * @returns
 */
function genWind(metar) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    var WDD = metar.wind_direction ? metar.wind_direction : 0;
    var WSP = metar.wind_speed ? metar.wind_speed : 0;
    var wind = "";
    var gust = "";
    if (WSP === 0) {
        wind =
            "<g id=\"calm\">\n                <ellipse id=\"calm-marker\" stroke=\"#000\" fill=\"#00000000\" cx=\"250\" cy=\"250\" rx=\"35\" ry=\"35\"/>\n            </g>";
    }
    else {
        gust = metar.gust_speed == null ? "" :
            "<g id=\"gustBarb\" transform=\"rotate(" + WDD + ", 250, 250)\">\n                " + genBarb1((_a = metar.gust_speed) !== null && _a !== void 0 ? _a : 0, true) + "\n                " + genBarb2((_b = metar.gust_speed) !== null && _b !== void 0 ? _b : 0, true) + "\n                " + genBarb3((_c = metar.gust_speed) !== null && _c !== void 0 ? _c : 0, true) + "\n                " + genBarb4((_d = metar.gust_speed) !== null && _d !== void 0 ? _d : 0, true) + "\n                " + genBarb5((_e = metar.gust_speed) !== null && _e !== void 0 ? _e : 0, true) + "\n            </g>";
        wind =
            "<g id=\"windBard\" transform=\"rotate(" + WDD + ", 250, 250)\">\n                <line stroke-width=\"3\" y1=\"225\" x1=\"250\" y2=\"50\" x2=\"250\"  stroke=\"#000\" fill=\"none\" />\n                " + genBarb1((_f = metar.wind_speed) !== null && _f !== void 0 ? _f : 0, false) + "\n                " + genBarb2((_g = metar.wind_speed) !== null && _g !== void 0 ? _g : 0, false) + "\n                " + genBarb3((_h = metar.wind_speed) !== null && _h !== void 0 ? _h : 0, false) + "\n                " + genBarb4((_j = metar.wind_speed) !== null && _j !== void 0 ? _j : 0, false) + "\n                " + genBarb5((_k = metar.wind_speed) !== null && _k !== void 0 ? _k : 0, false) + "\n            </g>";
    }
    return gust + wind;
}
/**
 * Generate first barb
 * @param speed wind or gust speed
 * @param gust set to true for gust
 * @returns
 */
function genBarb1(speed, gust) {
    var fill = gust ? 'red' : '#000';
    var tag = gust ? 'gs' : 'ws';
    var width = gust ? GUST_WIDTH : WS_WIDTH;
    var barb = "";
    if (speed >= 10 && speed < 50) {
        barb = "<line id=\"" + tag + "-bard-1-long\" stroke-width=\"" + width + "\" y1=\"50\" x1=\"250\" y2=\"50\" x2=\"300\" stroke=\"" + fill + "\" transform=\"rotate(-35, 250, 50)\"/>";
    }
    else if (speed >= 50) {
        barb = "<polygon id=\"" + tag + "-bard-1-flag\" points=\"248,60 290,30 248,30\" fill=\"" + fill + "\" />";
    }
    return barb;
}
/**
 * Generate second barb
 * @param speed wind or gust speed
 * @param gust set to true for gust
 * @returns
 */
function genBarb2(speed, gust) {
    var fill = gust ? 'red' : '#000';
    var tag = gust ? 'gs' : 'ws';
    var width = gust ? GUST_WIDTH : WS_WIDTH;
    var barb = "";
    if ((speed < 10) || (15 <= speed && speed < 20) || (55 <= speed && speed < 60)) {
        barb = "<line id=\"" + tag + "-bard-2-short\" stroke-width=\"" + width + "\" y1=\"70\" x1=\"250\" y2=\"70\" x2=\"275\" stroke=\"" + fill + "\" transform=\"rotate(-35, 250, 70)\"/>";
    }
    else if ((15 < speed && speed < 50) || (speed >= 60)) {
        barb = "<line id=\"" + tag + "-bard-2-long\" stroke-width=\"" + width + "\" y1=\"70\" x1=\"250\" y2=\"70\" x2=\"300\" stroke=\"" + fill + "\" transform=\"rotate(-35, 250, 70)\"/>";
    }
    return barb;
}
/**
 * Generate third barb
 * @param speed wind or gust speed
 * @param gust set to true for gust
 * @returns
 */
function genBarb3(speed, gust) {
    var fill = gust ? 'red' : '#000';
    var tag = gust ? 'gs' : 'ws';
    var width = gust ? GUST_WIDTH : WS_WIDTH;
    var barb = "";
    if ((25 <= speed && speed < 30) || (65 <= speed && speed < 70)) {
        barb = "<line id=\"" + tag + "-bard-3-short\" stroke-width=\"" + width + "\" y1=\"90\"  x1=\"250\" y2=\"90\" x2=\"275\" stroke=\"" + fill + "\" transform=\"rotate(-35, 250, 90)\"/>";
    }
    else if ((25 < speed && speed < 50) || speed >= 70) {
        barb = "<line id=\"" + tag + "-bard-3-long\" stroke-width=\"" + width + "\" y1=\"90\"  x1=\"250\" y2=\"90\" x2=\"300\" stroke=\"" + fill + "\" transform=\"rotate(-35, 250, 90)\"/>";
    }
    return barb;
}
/**
 * Generate forth barb
 * @param speed wind or gust speed
 * @param gust set to true for gust
 * @returns
 */
function genBarb4(speed, gust) {
    var fill = gust ? 'red' : '#000';
    var tag = gust ? 'gs' : 'ws';
    var width = gust ? GUST_WIDTH : WS_WIDTH;
    var barb = "";
    if ((35 <= speed && speed < 40) || (75 <= speed && speed < 80)) {
        barb = "<line id=\"" + tag + "-bard-4-short\" stroke-width=\"" + width + "\" y1=\"110\" x1=\"250\" y2=\"110\" x2=\"275\"  stroke=\"" + fill + "\" transform=\"rotate(-35, 250, 110)\"/>";
    }
    else if ((35 < speed && speed < 50) || speed >= 80) {
        barb = "<line id=\"" + tag + "-bard-4-long\" stroke-width=\"" + width + "\" y1=\"110\" x1=\"250\" y2=\"110\" x2=\"300\"  stroke=\"" + fill + "\" transform=\"rotate(-35, 250, 110)\"/>";
    }
    return barb;
}
/**
 * Generate fifth barb
 * @param speed wind or gust speed
 * @param gust set to true for gust
 * @returns
 */
function genBarb5(speed, gust) {
    var fill = gust ? 'red' : '#000';
    var tag = gust ? 'gs' : 'ws';
    var width = gust ? GUST_WIDTH : WS_WIDTH;
    var brab = "";
    if ((45 <= speed && speed < 50) || (85 <= speed && speed < 90)) {
        brab = "<line id=\"" + tag + "-bard-5-short\" stroke-width=\"" + width + "\" y1=\"130\" x1=\"250\" y2=\"130\" x2=\"275\"  stroke=\"" + fill + "\" transform=\"rotate(-35, 250, 130)\"/>";
    }
    return brab;
}

//Meassage types
var TYPES = ["METAR", "SPECI"];

/**
 * Parses a raw metar and binds or creates a METAR object
 * @param metarString Raw METAR string
 * @param ref Reference to a METAR object. This objects contents will be shallow replaced with the Raw metars values.
 *  Meaning values will be updated or added but not removed.
 * @returns
 */
function parseMetar(metarString, ref) {
    var station = parseStation(metarString);
    var time = parseDate(metarString);
    if (ref != null) {
        ref.station = station;
        ref.time = time;
    }
    else {
        ref = new METAR(undefined, station, time);
    }
    //Parse Auto
    ref.auto = parseAuto(metarString);
    //Parse Wind
    ref.wind = parseWind(metarString);
    //Parse CAVOK
    ref.cavok = parseCavok(metarString);
    //Parse Visablility
    ref.visibility = parseVisibility(metarString);
    //Parse Runway VIS
    //TODO
    //Parse Weather
    ref.weather = parseWeather(metarString);
    //Parse Clouds
    ref.clouds = parseClouds(metarString);
    //Parse Temp Point Internations 
    var temps_int = parseTempInternation(metarString);
    if (temps_int != null) {
        ref.temperature = temps_int[0];
        ref.dewpoint = temps_int[1];
    }
    //Parse Temp North american Will overwirte international since it is more precise
    var temps_ne = parseTempNA(metarString);
    if (temps_ne != null) {
        ref.temperature = temps_ne[0];
        ref.dewpoint = temps_ne[1];
    }
    //Parse Altimeter
    ref.altimeter = parseAltimeter(metarString);
    return ref;
}

/**
 * Parses the station name form the metar
 * @param metar raw metar
 * @returns
 */
function parseStation(metar) {
    var re = /^(METAR\s)?([A-Z]{1,4})\s/g;
    var matches = re.exec(metar);
    if (matches != null) {
        return matches[2];
    }
    else {
        throw new Error("Station could not be found invalid metar");
    }
}

/**
 * Parse Date object from metar.
 * NOTE: Raw metar data does not contain month or year data. So this function assumes this metar was created in the current month and current year
 * @param metar raw metar
 * @returns
 */
function parseDate(metar) {
    var re = /([\d]{2})([\d]{2})([\d]{2})Z/g;
    var matches = re.exec(metar);
    if (matches != null) {
        var d = new Date();
        d.setUTCDate(parseInt(matches[1]));
        d.setUTCHours(parseInt(matches[2]));
        d.setUTCMinutes(parseInt(matches[3]));
        d.setUTCSeconds(0);
        d.setUTCMilliseconds(0);
        return d;
    }
    else {
        throw new Error("Failed to parse Date");
    }
}

/**
 * Parses for CAVOK (Ceiling and visabiliy OK)
 * @param metar raw metar
 * @returns
 */
function parseCavok(metar) {
    var re = /\sCAVOK\s/g;
    return metar.match(re) != null ? true : false;
}

/**
 * Parses for Automation
 * @param metar raw metar
 * @returns
 */
function parseAuto(metar) {
    var re = /\s(AUTO)?(AO1)?(AO2)?\s/g;
    return metar.match(re) != null ? true : false;
}

/**
 * Parse international temp dewp point format.
 * @param metar raw metar
 * @returns
 */
function parseTempInternation(metar) {
    var re = /\s(M)?(\d{2})\/(M)?(\d{2})\s/g;
    var matches = re.exec(metar);
    if (matches != null) {
        var temp = parseInt(matches[2]) * (matches[1] == null ? 1 : -1);
        var dew_point = parseInt(matches[4]) * (matches[3] == null ? 1 : -1);
        return [temp, dew_point];
    }
}

/**
 * Parse North American temp dew point format
 * @param metar raw metar
 * @returns
 */
function parseTempNA(metar) {
    var re = /(T)(\d{1})(\d{2})(\d{1})(\d{1})(\d{2})(\d{1})/g;
    var matches = re.exec(metar);
    if (matches != null) {
        var temp = parseFloat(matches[3] + "." + matches[4]) * (matches[2] === "0" ? 1 : -1);
        var dew_point = parseFloat(matches[6] + "." + matches[7]) * (matches[5] === "0" ? 1 : -1);
        return [temp, dew_point];
    }
}

/**
 * Parse Weather items
 * @param metar raw metar
 * @returns
 */
function parseWeather(metar) {
    var obs_keys = Object.keys(WEATHER).join('|').replace(/\+/g, "\\+");
    var re = new RegExp("\\s?(" + obs_keys + ")\\s", 'g');
    var matches = metar.match(re);
    if (matches != null) {
        return matches.map(function (match) {
            var key = match.trim();
            return {
                abbreviation: key,
                meaning: WEATHER[key].text
            };
        });
    }
    else {
        return new Array();
    }
}

/**
 * Parse visability
 * @param metar raw metar
 * @returns
 */
function parseVisibility(metar) {
    var re = /\s([0-9]{1,2})?\s?([0-9]{1}\/[0-9]{1})?(SM)\s|\s([0-9]{1,4})\s/g;
    if (metar.match(re)) {
        var vis_parts = re.exec(metar);
        if (vis_parts != null) {
            var meters = vis_parts[4];
            var miles = vis_parts[1];
            var frac_miles = vis_parts[2];
            //Metric case ex: 1000, 9999 
            if (meters != null) {
                return parseInt(meters);
            }
            //whole miles case ex: 1SM 10SM
            else if (frac_miles != null) {
                var total = 0.0;
                if (miles != null) {
                    total += parseFloat(miles);
                }
                total += parseFloat(eval(frac_miles));
                return total * 1609.34;
            }
            //factional miles case "1 1/2SM" "1/4SM"
            else {
                return parseInt(miles) * 1609.34;
            }
        }
    }
    return undefined;
}

/**
 * Parse cloud coverages
 * @param metarString raw metar
 * @returns
 */
function parseClouds(metarString) {
    var _a;
    var re = /(NCD|SKC|CLR|NSC|FEW|SCT|BKN|OVC|VV)(\d{3})/g;
    var clouds = new Array();
    var matches;
    while ((matches = re.exec(metarString)) != null) {
        var cloud = {
            abbreviation: matches[1],
            meaning: (_a = CLOUDS[matches[1]]) === null || _a === void 0 ? void 0 : _a.text,
            altitude: parseInt(matches[2]) * 100
        };
        clouds.push(cloud);
    }
    return clouds;
}

/**
 * Parse wind data
 * @param metar raw metar
 * @returns
 */
function parseWind(metar) {
    var wind = new Wind();
    var re = /\s(\d{3})(\d{2})(G)?(\d{2})?(KT|MPS)\s/g;
    var matches = re.exec(metar);
    if (matches != null) {
        wind.direction = parseInt(matches[1]);
        wind.speed = parseInt(matches[2]);
        wind.unit = matches[5];
    }
    return wind;
}

function parseAltimeter(metar) {
    var re = /(A|Q)(\d{2})(\d{2})/g;
    var matches = re.exec(metar);
    if (matches != null) {
        if (matches[1] === "Q") {
            var pressure = parseFloat(matches[2] + matches[3]);
            return parseFloat((pressure * 0.029529).toFixed(2));
        }
        else {
            return parseFloat(matches[2] + "." + matches[3]);
        }
    }
}

//var Metar_1 = require("./Metar");
//var Cloud_1 = require("./parts/Cloud");
//var Weather_1 = require("./parts/Weather");
//var Wind_1 = require("./parts/Wind");
/**
 * Extracted Metar message
 */
var MetarPlot = /** @class */ (function () {
    function MetarPlot() {
    }
    return MetarPlot;
}());

/**
 * Turns a raw METAR to an SVG image
 * @param rawMetar RAW metar
 * @param width css width of svg
 * @param height css height of svg
 * @param metric true for metric units(m, hPa, mps), false for north american units (miles, inHg, Kts)
 * @returns
 */
function rawMetarToSVG(rawMetar, width, height, metric) {
    var plot = rawMetarToMetarPlot(rawMetar, metric);
    return metarToSVG(plot, width, height);
}

/**
 *
 * @param rawMetar raw metar string
 * @param metric true for metric units(m, hPa, mps), false for north american units (miles, inHg, Kts)
 * @returns
 */
function rawMetarToMetarPlot(rawMetar, metric) {
    var _a;
    var metar = new METAR(rawMetar);
    var wx = metar.weather.map(function (weather) { return weather.abbreviation; }).join("");
    //Metric converion
    var pressure;
    var vis = undefined;
    var temp = metar.temperature;
    var dp = metar.dewpoint;
    if (metric) {
        pressure = (metar.altimeter != null) ? Math.round(metar.altimeter * 33.86) : undefined;
        if (metar.visibility != null) {
            vis = metar.visibility > 9999 ? 9999 : Math.round(metar.visibility);
        }
    }
    else {
        temp = cToF(temp);
        dp = cToF(dp);
        pressure = metar.altimeter;
        vis = milePrettyPrint((_a = metar.visibility) !== null && _a !== void 0 ? _a : -1);
    }
    return {
        metric: metric !== null && metric !== void 0 ? metric : false,
        visablity: vis,
        temp: temp,
        dew_point: dp,
        station: metar.station,
        wind_direction: (typeof metar.wind.direction === "number") ? metar.wind.direction : undefined,
        wind_speed: metar.wind.speed,
        gust_speed: metar.wind.gust,
        wx: wx,
        pressure: pressure,
        coverage: determinCoverage(metar)
    };
}

/**
 * Pretty print Miles in fractions if under 1 mile
 */
function milePrettyPrint(meters) {
    var print = "";
    if (meters === -1) {
        return print;
    }
    var miles = meters * 0.0006213712;
    //round to nearest quarter
    var text = (Math.round(miles * 4) / 4).toFixed(2).toString();
    return text.replace(".00", "");
}
/**
 * Determines the coverage symbol
 * @param metar
 * @returns
 */
function determinCoverage(metar) {
    var _a;
    var prevailingCoverage;
    metar.clouds.forEach(function (cloud) {
        if (prevailingCoverage != null) {
            var curr = prevailingCoverage.abbreviation != null ? CLOUDS[prevailingCoverage.abbreviation].rank : undefined;
            var rank = cloud.abbreviation != null ? CLOUDS[cloud.abbreviation].rank : undefined;
            //console.log("cur: " + curr + ", rank: " + rank);
            if (rank != null) {
                if (rank > curr) {
                    prevailingCoverage = cloud;
                }
            }
        }
        else {
            prevailingCoverage = cloud;
        }
    });
    return (_a = prevailingCoverage === null || prevailingCoverage === void 0 ? void 0 : prevailingCoverage.abbreviation) !== null && _a !== void 0 ? _a : "";
}
/**
 * Turns a Metar plot object to a SVG image
 * @param metar MetarPlot Object
 * @param width css width for svg
 * @param height css height for svg
 * @returns
 */
 function metarToSVG(metar, width, height) {
    var _a, _b, _c, _d, _e, _f;
    var VIS = (_a = metar.visablity) !== null && _a !== void 0 ? _a : "";
    var TMP = (_b = metar.temp) !== null && _b !== void 0 ? _b : "";
    var DEW = (_c = metar.dew_point) !== null && _c !== void 0 ? _c : "";
    var STA = (_d = metar.station) !== null && _d !== void 0 ? _d : "";
    var ALT = (_e = metar.pressure) !== null && _e !== void 0 ? _e : "";
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + width + "\" height=\"" + height + 
           "\" viewBox=\"0 0 500 500\">\n                <style>\n                    .txt{ font-size: 47.5px; font-family: sans-serif; }\n                    .tmp{ fill: red }\n                    .sta{ fill: grey }\n                    .dew{ fill: blue }\n                    .vis{ fill: violet }\n                </style>\n                " + 
           (0, genWind)(metar) + "\n                " + 
           (0, getWeatherSVG)((_f = metar.wx) !== null && _f !== void 0 ? _f : "") + "\n                " + 
           (0, genCoverage)(metar.coverage, metar.condition) + "\n                <g id=\"text\">\n                    <text class=\"vis txt\" fill=\"#000000\" stroke=\"#000\" stroke-width=\"0\" x=\"80\"   y=\"260\" text-anchor=\"middle\" xml:space=\"preserve\">" + 
           VIS + "</text>\n                    <text class=\"tmp txt\" fill=\"#000000\" stroke=\"#000\" stroke-width=\"0\" x=\"160\"  y=\"220\" text-anchor=\"middle\" xml:space=\"preserve\" >" + 
           TMP + "</text>\n                    <text class=\"dew txt\" fill=\"#000000\" stroke=\"#000\" stroke-width=\"0\" x=\"160\"  y=\"315\" text-anchor=\"middle\" xml:space=\"preserve\">" + 
           DEW + "</text>\n                    <text class=\"sta txt\" fill=\"#000000\" stroke=\"#000\" stroke-width=\"0\" x=\"275\"  y=\"315\" text-anchor=\"start\" xml:space=\"preserve\">" + 
           STA + "</text>\n                    <text class=\"sta txt\" fill=\"#000000\" stroke=\"#000\" stroke-width=\"0\" x=\"275\"  y=\"220\"  text-anchor=\"start\" xml:space=\"preserve\">" + 
           ALT + "</text>\n                </g>\n            </svg>";
}

/**
 * Convert ºF to ºF
 * @param celsius
 */
function cToF(celsius) {
    if (celsius != null) {
        return Math.round(celsius * 9 / 5 + 32);
    }
}



