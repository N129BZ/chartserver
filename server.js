const express = require('express');
const favicon = require('serve-favicon');
const cors = require('cors');
const url = require('url');
const sqlite3 = require("sqlite3");
const Math = require("math");
const fs = require("fs");
const http = require('http');
const { WebSocketServer } = require('ws');
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const { XMLParser } = require('fast-xml-parser');

const alwaysArray = [
    "response.data.METAR.sky_condition"
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
const xmlparser = new XMLParser(xmlParseOptions);

let settings = {};
let wss;
let connection;

(() => {
    let rawdata = fs.readFileSync(`${__dirname}/settings.json`);
    settings = JSON.parse(rawdata);
})();

const DB_PATH        = `${__dirname}/public/data`;
const DB_SECTIONAL   = `${DB_PATH}/${settings.sectionalDb}`;
const DB_TERMINAL    = `${DB_PATH}/${settings.terminalDb}`;
const DB_HELICOPTER  = `${DB_PATH}/${settings.helicopterDb}`;
const DB_CARIBBEAN   = `${DB_PATH}/${settings.caribbeanDb}`;
const DB_GCANYONAO   = `${DB_PATH}/${settings.gcanyonAoDb}`;
const DB_GCANYONGA   = `${DB_PATH}/${settings.gcanyonGaDb}`;
const DB_HISTORY     = `${DB_PATH}/${settings.historyDb}`;
const DB_AIRPORTS    = `${DB_PATH}/${settings.airportsDb}`;
const MessageTypes   = settings.messagetypes;


/**
 * 
 */
(() => {
    // http websocket server to forward weather data to page
    let server = http.createServer(function (request, response) { });
    try {
        server.listen(settings.wsport, function () { });
        wss = new WebSocketServer({ server });
        console.log(`Data forwarding server enabled at port ${settings.wsport}`); 
    }
    catch (error) {
        console.log(error);
    }

    try {
        wss.on('connection', function connect(ws) {
            connection = ws;
            console.log("new connection");

            runDownloads();
            
            connection.on('close', function() {
                console.log("connection closed");
            });

            connection.on('message', function(data) {
                let message = JSON.parse(data);
                if (message.type === MessageTypes.keepalive.type) {
                    console.log(message.payload);
                }
            });

        });
    }
    catch (error) {
        console.log(error);
    }
})();

const vfrdb = new sqlite3.Database(DB_SECTIONAL, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.log(`Failed to load: ${DB_SECTIONAL}`);
        throw err;
    }
});

const termdb = new sqlite3.Database(DB_TERMINAL, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.log(`Failed to load: ${DB_TERMINAL}`);
        throw err;
    }
});

const helidb = new sqlite3.Database(DB_HELICOPTER, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.log(`Failed to load: ${DB_HELICOPTER}`);
        throw err;
    }
});

const caribdb = new sqlite3.Database(DB_CARIBBEAN, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.log(`Failed to load: ${DB_CARIBBEAN}`);
        throw err;
    }
});

const gcaodb = new sqlite3.Database(DB_GCANYONAO, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.log(`Failed to load: ${DB_GCANYONAO}`);
        throw err;
    }
});

const gcgadb = new sqlite3.Database(DB_GCANYONGA, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.log(`Failed to load: ${DB_GCANYONGA}`);
        throw err;
    }
});

const histdb = new sqlite3.Database(DB_HISTORY, sqlite3.OPEN_READWRITE, (err) => {
    if (err){
        console.log(`Failed to load: ${DB_HISTORY}`);
    }
});

function loadAirportsJson() {
    const db = new sqlite3.Database(DB_AIRPORTS, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            console.log(`Failed to load: ${DB_AIRPORTS}`);
            throw err;
        }
    });
    let msgtype = MessageTypes.airports.type;
        
    sql = `SELECT ident, type, name, elevation_ft, longitude_deg, latitude_deg, iso_region, countryname ` + 
            `FROM airports ` +
            `WHERE type NOT IN ('closed') ` +
            `ORDER BY iso_region ASC, name ASC;`;

    let jsonout = {
        "airports": []
    };
    
    db.all(sql, (err, rows) => {
        if (err == null) {
            rows.forEach(row => {
                let thisrecord = {
                    "ident": row.ident,
                    "type": row.type,
                    "name": row.name,
                    "elev": row.elevation_ft,
                    "lon": row.longitude_deg,
                    "lat": row.latitude_deg,
                    "isoregion": row.iso_region,
                    "country": row.countryname
                }
                jsonout.airports.push(thisrecord);
            });
        }
        else {
            console.log(err);
        }
        let payload = JSON.stringify(jsonout);
        let message = {
            type: msgtype,
            payload: payload
        };
        try {
            let outstr = JSON.stringify(message);
            connection.send(outstr);
        }
        catch(error) {
            console.log(error.message);
        }
    });
    db.close();
}

// express web server  
let app = express();
try {
        app.use(express.urlencoded({ extended: true }));
        app.use(express.json({}));
        app.use(cors());
        app.use(favicon(`${__dirname }/images/favicon.png`));
        app.use(express.static('public'))
        app.listen(settings.httpport, () => {
        console.log(`Webserver listening at port ${settings.httpport}`);
    }); 

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
    
    app.get('/',(req, res) => {
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

    app.get("/tiles/vfrsectile/*", (req, res) => {
        handleTile(req, res, vfrdb);
    });

    app.get("/tiles/termtile/*", (req, res) => {
        handleTile(req, res, termdb);
    });

    app.get("/tiles/helitile/*", (req, res) => {
        handleTile(req, res, helidb);
    });

    app.get("/tiles/caribtile/*", (req, res) => {
        handleTile(req, res, caribdb);
    });

    app.get("/tiles/gcaotile/*", (req, res) => {
        handleTile(req, res, gcaodb);
    });

    app.get("/tiles/gcgatile/*", (req, res) => {
        handleTile(req, res, gcgadb);
    });

    app.get("/gethistory", (req,res) => {
        getPositionHistory(res);
    });

    app.post("/puthistory", (req, res) => {
        putPositionHistory(req.body);
        res.writeHead(200);
        res.end();
    });
}
catch (error) {
    console.log(error);
}

function getPositionHistory(response) {
    let sql = "SELECT * FROM position_history WHERE id IN ( SELECT max( id ) FROM position_history )";
    histdb.get(sql, (err, row) => {
        if (err == null) {
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
            response.writeHead(500);
            response.end();
        }
    });
}

function putPositionHistory(data) {
    let datetime = new Date().toISOString();
    let sql = `INSERT INTO position_history (datetime, longitude, latitude, heading, gpsaltitude) ` +
              `VALUES ('${datetime}', ${data.longitude}, ${data.latitude}, ${data.heading}, ${data.altitude})`;
    console.log(sql); 
        
    histdb.run(sql, function(err) {
        if (err != null) {
            console.log(err);
        }
    });
}

function handleTile(request, response, db) {
    let x = 0;
    let y = 0;
    let z = 0;
    let idx = -1;

    let parts = request.url.split("/"); 
	if (parts.length < 4) {
		return
	}

	try {
        idx = parts.length - 1;
        let yparts = parts[idx].split(".");
        y = parseInt(yparts[0])

    } catch(err) {
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

function loadTile(z, x, y, response, db) {

    let sql = `SELECT tile_data FROM tiles WHERE zoom_level=${z} AND tile_column=${x} AND tile_row=${y}`;
    db.get(sql, (err, row) => {
        if (err == null) {
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
            response.writeHead(500, err.message);
            response.end();
        } 
    });
}

function handleTilesets(request, response) {
    let sql = `SELECT name, value FROM metadata UNION SELECT 'minzoom', min(zoom_level) FROM tiles ` + 
              `WHERE NOT EXISTS (SELECT * FROM metadata WHERE name='minzoom') UNION SELECT 'maxzoom', max(zoom_level) FROM tiles ` +
              `WHERE NOT EXISTS (SELECT * FROM metadata WHERE name='maxzoom')`;
    let found = false;
    let meta = {};
    let db;
    meta["bounds"] = "";

    let parms = url.parse(request.url,true).query
    switch (parms.layer) {
        case "term":
            db = termdb;
            break;
        case "heli":
            db = helidb;
            break;
        case "carib":
            db = caribdb;
            break;
        case "gcao":
            db = gcaodb;
            break;
        case "gcga":
            db = gcgadb;
            break;
        case "vfr":
        default:
            db = vfrdb;
            break;
    }

    db.all(sql, [], (err, rows) => {
        rows.forEach((row) => {
            if (row.value != null) {
                meta[row.name] = row.value;
            }
            if (row.name === "maxzoom" && row.value != null && !found) {
                let maxZoomInt = parseInt(row.value); 
                sql = `SELECT min(tile_column) as xmin, min(tile_row) as ymin, ` + 
                             `max(tile_column) as xmax, max(tile_row) as ymax ` +
                      `FROM tiles WHERE zoom_level=?`;
                db.get(sql, [maxZoomInt], (err, row) => {
                    let xmin = row.xmin;
                    let ymin = row.ymin; 
                    let xmax = row.xmax; 
                    let ymax = row.ymax;  
                    
                    llmin = tileToDegree(maxZoomInt, xmin, ymin);
                    llmax = tileToDegree(maxZoomInt, xmax+1, ymax+1);
                    
                    retarray = `${llmin[0]}, ${llmin[1]}, ${llmax[0]}, ${llmax[1]}`;
                    meta["bounds"] = retarray;
                    let output = JSON.stringify(meta);
                    found = true;
                    response.writeHead(200);
                    response.write(output);
                    response.end();
                    return;
                });
            }
        });
    });
}

function tileToDegree(z, x, y) {
	y = (1 << z) - y - 1
    let n = Math.PI - 2.0*Math.PI*y/Math.pow(2, z);
    lat = 180.0 / Math.PI * Math.atan(0.5*(Math.exp(n)-Math.exp(-n)));
    lon = x/Math.pow(2, z)*360.0 - 180.0;
    return [lon, lat]
}

async function runDownloads() {
    setTimeout(() => {
        loadAirportsJson();
    }, 200);

    setTimeout(() => { 
        downloadXmlFile(settings.messagetypes.metars); 
    }, 400);

    setTimeout(() => { 
        downloadXmlFile(settings.messagetypes.tafs); 
    }, 800);

    setTimeout(() => { 
        downloadXmlFile(settings.messagetypes.pireps); 
    }, 1200);
}

async function downloadXmlFile(source) {
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
            //fs.writeFileSync(`${DB_PATH}/${source.type}.xml`, response);
            let messageJSON = xmlparser.parse(response);
            switch(source.type) {
                case "tafs":
                    processTafJsonObjects(messageJSON);
                    break;
                case "metars":
                    processMetarJsonObjects(messageJSON);
                    break;
                case "pireps":
                    processPirepJsonObjects(messageJSON);
                    break;
            }
        }
    };
    try { 
        xhr.send();
    }
    catch (error) {
        console.log(`Error getting message type ${xmlmessage.type}: ${error}`);
    }
}

async function processTafJsonObjects(tafs) {
    let payload = JSON.stringify(tafs); 
    let message = {
        type: MessageTypes.tafs.type,
        payload: payload
    };
    const json = JSON.stringify(message);
    connection.send(json);
}

async function processMetarJsonObjects(metars) {
    let payload = JSON.stringify(metars);
    let message = {
        type: MessageTypes.metars.type,
        payload: payload
    };
    const json = JSON.stringify(message);
    connection.send(json);
}

async function processPirepJsonObjects(pireps) {
    let payload = JSON.stringify(pireps);
    let message = {
        type: MessageTypes.pireps.type,
        payload: payload
    }
    const json = JSON.stringify(message);
    connection.send(json);
}