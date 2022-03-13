'use strict';

const express = require('express');
const favicon = require('serve-favicon');
const cors = require('cors');
const url = require('url');
const sqlite3 = require("sqlite3");
const Math = require("math");
const fs = require("fs");
const WebSocket = require('ws');
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const { XMLParser } = require('fast-xml-parser');

/**
 * These objects are used by the XMLParser to convert XML to JSON.
 * The alwaysArray object makes the parser translate sky_condition 
 * XML attributes as an array of values... which is good.
 */
const alwaysArray = [
    "response.data.METAR.sky_condition",
    "response.data.PIREP.sky_condition"
];
const xmlParseOptions = {
    ignoreAttributes : false,
    attributeNamePrefix : "",
    allowBooleanAttributes: true,
    ignoreDeclaration: true,
    isArray: (name, jpath, isLeafNode, isAttribute) => { 
        if( alwaysArray.indexOf(jpath) !== -1) return true;
    }
};
/**
 * now the actual parser object is instantiated with the above options
 */
const xmlparser = new XMLParser(xmlParseOptions);


/**
 * Global variables
 */
let settings = {};
let airports = {};
let MessageTypes = {}; 

let wss;
let connections = new Map();
let metadataTables = new Map();
let DB_PATH        = `${__dirname}/public/data`;
let DB_HISTORY     = `${__dirname}/positionhistory.db`;
let dbmap = new Map();

let XML_FILEPATH = `${__dirname}/xmldata`;

/*
 * First things first... load settings.json and airports.json 
 * for immediate sending to client later upon winsock connection
 */
(() => {
    let rawdata = fs.readFileSync(`${__dirname}/settings.json`);
    settings       = JSON.parse(rawdata);
    MessageTypes   = settings.messagetypes;

    if (!fs.existsSync(XML_FILEPATH)) {
        fs.mkdirSync(XML_FILEPATH);
    }

    runDownloads();

    let dbfiles = fs.readdirSync(DB_PATH);
    dbfiles.forEach((dbfile) => { 
        let dbname = `${DB_PATH}/${dbfile}`;
        let dbkey = dbfile.slice(0, dbfile.indexOf("."));
        let db = new sqlite3.Database(dbname, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                console.log(`Failed to load: ${dbname}: ${err}`);
                throw err;
            }
        });
        dbmap.set(dbkey, db);
    });

    buildDatabaseMetadataMap();

    rawdata = fs.readFileSync(`${__dirname}/airports.json`);
    airports = JSON.parse(rawdata);

    wss = new WebSocket.Server({ port: settings.wsport });
    try {
        wss.on('connection', (ws) => {
            const id = Date.now();
            connections.set(ws, id);
            console.log(`Websocket connected, id: ${id}`);

            setTimeout(() => {
                let msg = {
                    type: "airports",
                    payload: JSON.stringify(airports)
                };
                ws.send(JSON.stringify(msg));
            }, 200);

            ws.on('close', function() {
                connections.delete(ws);
                console.log("connection closed");
            });

            ws.on('message', (data) => { });
        });
    }
    catch (err) {
        console.log(err);
    }
})();

const histdb = new sqlite3.Database(DB_HISTORY, sqlite3.OPEN_READWRITE, (err) => {
    if (err){
        console.log(`Failed to load: ${DB_HISTORY}: ${err}`);
    }
});

/**
 * Start the express web server
 */
let app = express();
try {
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json({}));
    app.use(cors());
    app.use(favicon(`${__dirname }/images/favicon.png`));
    app.use(express.static('public'))
    app.listen(settings.httpport); 

    let appOptions = {
        dotfiles: 'ignore',
        etag: false,
        extensions: ['html'],
        index: false,
        redirect: false,
        setHeaders: function (res, path, stat) {
            res.set('x-timestamp', Date.now());
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader('Access-Control-Allow-Methods', '*');
            res.setHeader("Access-Control-Allow-Headers", "*");
        }
    };

    app.use(express.static(`${__dirname}/public`, appOptions));
    
    app.get('/', (req, res) => {
        res.sendFile(`${__dirname}/public/index.html`);
    });
    
    app.get("/getsettings", (req, res) => {
        let rawdata = fs.readFileSync(`${__dirname}/settings.json`);
        res.writeHead(200);
        res.write(rawdata);
        res.end();
    });

    app.get("/tiles/tilesets", (req,res) => {
        handleTilesets(req, res);
    });    

    app.get("/tiles/tile/*", (req, res) => {
        handleTile(req, res);
    });

    app.get("/gethistory", (req,res) => {
        getPositionHistory(res);
    });

    app.get("/getdatafiles", (req,res) => {
        uploadDataFiles();
        res.writeHead(200);
        res.end();
    });

    app.post("/savehistory", (req, res) => {
        savePositionHistory(req.body);
        res.writeHead(200);
        res.end();
    });
}
catch (err) {
    console.log(err);
}

/**
 * Called by client via /getdatafiles route, this will
 * send metars, tafs, and pireps back via websocket
 */
async function uploadDataFiles() {
    let files = fs.readdirSync(XML_FILEPATH);
    files.forEach((xmlfile) => {
        let fileparts = xmlfile.split(".");
        let xml = fs.readFileSync(`${XML_FILEPATH}/${xmlfile}`);
        let messageJSON = xmlparser.parse(xml);
        let payload = JSON.stringify(messageJSON);
        let message = {
            type: fileparts[0],
            payload: payload
        };
        const json = JSON.stringify(message);
        sendMessageToClients(json);
    });
}

/**
 * Get the last recorded ownship position from the position history database
 * @param {response} http response 
 */
function getPositionHistory(response) {
    let sql = "SELECT * FROM position_history WHERE id IN ( SELECT max( id ) FROM position_history )";
    histdb.get(sql, (err, row) => {
        if (!err) {
            if (row != undefined) {
                let obj = {};
                obj["longitude"] = row.longitude;
                obj["latitude"] = row.latitude;
                obj["heading"] = row.heading;
                response.writeHead(200);
                response.write(JSON.stringify(obj));
                response.end();
            }
        }
        else
        {
            console.log(err);
            response.writeHead(500);
            response.end();
        }
    });
}

/**
 * Update the position history database with current position data
 * @param {json object} data, contains date, longitude, latitude, heading, and altitude 
 */
function savePositionHistory(data) {
    let datetime = new Date().toISOString();
    let sql = `INSERT INTO position_history (datetime, longitude, latitude, heading, gpsaltitude) ` +
              `VALUES ('${datetime}', ${data.longitude}, ${data.latitude}, ${data.heading}, ${data.altitude})`;
        
    histdb.run(sql, function(err) {
        if (err) {
            console.log(err);
        }
    });
}

/**
 * Parse the z,x,y integers, validate, and pass along to loadTile
 * @param {request} http request 
 * @param {response} http response 
 * @param {db} database 
 * @returns the results of calling loadTile
 */
function handleTile(request, response) {
    let x = 0;
    let y = 0;
    let z = 0;
    let idx = -1;

    let parts = request.url.split("/"); 
	if (parts.length < 5) {
		return
	}
    let db = dbmap.get(parts[3]);
	try {
        idx = parts.length - 1;
        let yparts = parts[idx].split(".");
        y = parseInt(yparts[0])

    } 
    catch(err) {
        res.writeHead(500, "Failed to parse y");
        response.end();
        return;
    }
    
    idx--
    x = parseInt(parts[idx]);
    idx--
    z = parseInt(parts[idx]);
    idx--
    loadTile(z, x, y, response, db); 
}

/**
 * Get all tiles from the passed database that match the supplied 
 * z,x,y indices and then send them back to the requesting client   
 * @param {integer} z 
 * @param {integer} x 
 * @param {integer} y 
 * @param {http response} http response object 
 * @param {database} sqlite database
 */
function loadTile(z, x, y, response, db) {
    let sql = `SELECT tile_data FROM tiles WHERE zoom_level=${z} AND tile_column=${x} AND tile_row=${y}`;
    db.get(sql, (err, row) => {
        if (!err) {
            if (row == undefined) {
                response.writeHead(200);
                response.end();
            }
            else {
                if (row.tile_data != undefined) {
                    let png = row.tile_data;
                    response.writeHead(200);
                    response.write(png);
                    response.end();
                }
            }
        }
        else {
            console.log(err);
            response.writeHead(500, err.message);
            response.end();
        } 
    });
}

/**
 * Get Z,X,Y tiles for the desired map from the associated mbtiles database
 * @param {object} request 
 * @param {object} response 
 */
function buildDatabaseMetadataMap() {
    let sql = `SELECT name, value FROM metadata ` + 
                `UNION SELECT 'minzoom', min(zoom_level) FROM tiles ` + 
                    `WHERE NOT EXISTS (SELECT * FROM metadata WHERE name='minzoom') ` +
                `UNION SELECT 'maxzoom', max(zoom_level) FROM tiles ` +
                    `WHERE NOT EXISTS (SELECT * FROM metadata WHERE name='maxzoom')`;
    
    for (let [key, value] of dbmap) {
        let db = value;
        let maxfound = false;
        let minfound = false;
        let minzoomint = 0;
        let maxzoomint = 0;
        let llmin = [];
        let llmax = [];
        let xmin = 0;
        let ymin = 0; 
        let xmax = 0; 
        let ymax = 0; 
        
        db.all(sql, [], (err, rows) => {
            let record = {}
            if (!err) {
                rows.forEach((row) => {
                    if (row.name == "minzoom" && row.value != null && !minfound) {
                        minzoomint = parseInt(row.value);
                        record["minzoom"] = minzoomint;
                        minfound = true;
                    }
                    if (row.name == "maxzoom" && row.value != null && !maxfound) {
                        maxzoomint = parseInt(row.value);
                        record["maxzoom"] = maxzoomint;
                        maxfound = true; 
                        let subsql = `SELECT min(tile_column) as xmin, min(tile_row) as ymin, ` + 
                                     `max(tile_column) as xmax, max(tile_row) as ymax ` +
                                     `FROM tiles WHERE zoom_level=?`;
                        db.get(subsql, [maxzoomint], (err, row) => {
                            xmin = row.xmin;
                            ymin = row.ymin; 
                            xmax = row.xmax; 
                            ymax = row.ymax;  
                            
                            llmin = tileToDegree(maxzoomint, xmin, ymin);
                            llmax = tileToDegree(maxzoomint, xmax+1, ymax+1);
                            record["extent"] = [llmin[0], llmin[1], llmax[0], llmax[1]];
                        });
                    }

                    if (minfound && maxfound) {
                        metadataTables.set(key, record);
                    }
                });
            }
            else {
                console.log(err);
            }
        });
    }
}

/**
 * Return tileset metadata
 * @param {object} request 
 * @param {object} response 
 */
function handleTilesets(request, response) {
    let obj = Object.fromEntries(metadataTables);
    let output = JSON.stringify(obj);
    response.writeHead(200);
    response.write(output);
    response.end();
}

/**
 * Get the longitude and latitude for a given pixel position on the map
 * @param {integer} z - the zoom level 
 * @param {integer} x - the horizontal index
 * @param {integer} y - the vertical index
 * @returns 2 element array - [longitude, latitude]
 */
function tileToDegree(z, x, y) {
	y = (1 << z) - y - 1
    let n = Math.PI - 2.0*Math.PI*y/Math.pow(2, z);
    let lat = 180.0 / Math.PI * Math.atan(0.5*(Math.exp(n)-Math.exp(-n)));
    let lon = x/Math.pow(2, z)*360.0 - 180.0;
    return [lon, lat]
}

/**
 * Recursively run the file downloads from the 
 * ADDS server for metars, tafs, & pireps
 */
async function runDownloads() {
    downloadXmlFile(MessageTypes.metars);
    downloadXmlFile(MessageTypes.tafs); 
    downloadXmlFile(MessageTypes.pireps);
    setTimeout(() => {
        runDownloads();
    }, settings.wxupdateintervalmsec);
}

/**
 * Download an ADDS weather service file and save in xmldata folder
 * @param {source} the type of file to download (metar, taf, or pirep)
 */
async function downloadXmlFile(source) {
    let datafile = `${XML_FILEPATH}/${source.type}.xml`; 
    try {
        fs.rmSync(datafile);
    }
    catch {}
    let xhr = new XMLHttpRequest();  
    let url = settings.addsurrentxmlurl.replace(source.token, source.type);
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Content-Type', 'text/csv');
    xhr.setRequestHeader("Access-Control-Allow-Origin", "*");
    xhr.setRequestHeader('Access-Control-Allow-Methods', '*');
    xhr.setRequestHeader("Access-Control-Allow-Headers", "*");
    xhr.responseType = 'document';
    xhr.onload = () => {
        if (xhr.readyState == 4 && xhr.status == 200) {
            let response = xhr.responseText;
            fs.writeFileSync(datafile, response);
        }
    };
    try { 
        xhr.send();
    }
    catch (err) {
        console.log(`Error getting message type ${xmlmessage.type}: ${err}`);
    }
}

/**
 * Iterate through any/all connected clients and send data
 * @param {string} stringified json message 
 */
async function sendMessageToClients(jsonmessage) {
    [...connections.keys()].forEach((client) => {
        client.send(jsonmessage);
    });
}