const express = require('express');
const favicon = require('serve-favicon');
const cors = require('cors');
const url = require('url');
const sqlite3 = require("sqlite3");
const Math = require("math");
const fs = require("fs");
const http = require('http');
const WebSocketServer = require('websocket').server;
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const { XMLParser } = require('fast-xml-parser');

// const MessageTypes = {
//     metars: {
//         self: "metars",
//         type: "METARS",
//         token: "@SOURCE"
//     },
//     tafs: {
//         self: "tafs",
//         type: "TAFS",
//         token: "@SOURCE"
//     },
//     pireps: {
//         self: "pireps",
//         type: "PIREPS",
//         token: ""
//     },
//     airports: {
//         self: "airports",
//         type: "AIRPORTS",
//         token: ""
//     },
//     allairports: {
//         self: "allairports",
//         type: "ALLAIRPORTS",
//         token: ""
//     }
// }

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
const parser = new XMLParser(xmlParseOptions);

const settings = readSettingsFile();

function readSettingsFile() {
    let rawdata = fs.readFileSync(`${__dirname}/settings.json`);
    return JSON.parse(rawdata);
}

const DB_PATH        = `${__dirname}/public/data`;
const DB_SECTIONAL   = `${DB_PATH}/${settings.sectionalDb}`;
const DB_TERMINAL    = `${DB_PATH}/${settings.terminalDb}`;
const DB_HELICOPTER  = `${DB_PATH}/${settings.helicopterDb}`;
const DB_CARIBBEAN   = `${DB_PATH}/${settings.caribbeanDb}`;
const DB_GCANYONAO   = `${DB_PATH}/${settings.gcanyonAoDb}`;
const DB_GCANYONGA   = `${DB_PATH}/${settings.gcanyonGaDb}`;
const DB_HISTORY     = `${DB_PATH}/${settings.historyDb}`;
const DB_AIRPORTS    = `${DB_PATH}/${settings.airportsDb}`;
const URL_GET_ADDSWX = `${settings.addswxurl}`;
const URL_GET_PIREPS = `${settings.pirepsurl}`;
const MessageTypes   = settings.messagetypes;

let airportJson = "";
let wss;
let connection;
startWebsocketServer();

function startWebsocketServer() {
    // http websocket server to forward serial data to browser client
    let server = http.createServer(function (request, response) { });
    try {
        server.listen(settings.wsport, function () { });
        // create the server
        wss = new WebSocketServer({ httpServer: server });
        console.log(`Data forwarding server enabled at port ${settings.wsport}`); 
    }
    catch (error) {
        console.log(error);
    }

    try {
        wss.on('request', function (request) {
            connection = request.accept(null, request.origin);
            console.log("new connection");
            
            connection.on('close', function () {
                console.log("connection closed");
            });
        });
    }
    catch (error) {
        console.log(error);
    }
}

const airpdb = new sqlite3.Database(DB_AIRPORTS, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.log(`Failed to load: ${DB_AIRPORTS}`);
        throw err;
    }
});   

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

function loadAirportsJson(useAllAirports = false) {
    let msgtype = "";
    if (useAllAirports) {
        msgtype = MessageTypes.allairports.type;
        sql = `SELECT ident, type, name, elevation_ft, longitude_deg, latitude_deg, iso_region ` + 
              `FROM airports ` +
              `WHERE iso_region LIKE 'US%' ` +
              `ORDER BY iso_region ASC;`;
    }
    else {
        msgtype = MessageTypes.airports.type;
        sql = `SELECT ident, type, name, elevation_ft, longitude_deg, latitude_deg ` + 
              `FROM airports ` +
              `WHERE (type = 'large_airport' OR type = 'medium_airport') ` + 
              `AND iso_country = 'US';`;
    }
    
    let jsonout = {
        "airports": []
    };
    
    airpdb.all(sql, (err, rows) => {
        if (err == null) {
            rows.forEach(row => {
                let thisrecord = {
                    "ident": row.ident,
                    "type": row.type,
                    "name": row.name,
                    "elev": row.elevation_ft,
                    "lon": row.longitude_deg,
                    "lat": row.latitude_deg,
                    "isoregion": row.iso_region
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
        let outstr = JSON.stringify(message);
        connection.send(outstr);
    });
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

    app.get("/getairports", (req, res) => {
        setTimeout(() => {
            loadAirportsJson(false)
        }, 200);
        res.writeHead(200);
        res.end();
    });
    
    app.get("/getallairports", (req, res) => {
        setTimeout(() => {
            loadAirportsJson(true)
        }, 200);
        res.writeHead(200);
        res.end();
    });

    app.get("/getmetars/:airportlist", (req, res) => {
        let airportlist = req.params.airportlist;
        setTimeout(() => {
            getMetars(airportlist)
        }, 200);
        res.writeHead(200);
        res.end();
    });

    app.get("/gettaf/:airport", (req, res) => {
        getTaf(req.params.airport);
        res.writeHead(200);
        res.end();
    });

    app.get("/getpireps", (req, res) => {
        getPireps();
        res.writeHead(200);
        res.end();
    });
}
catch (error) {
    console.log(error);
}

async function getMetars(airportlist) {
    let xhr = new XMLHttpRequest();
    let metars = MessageTypes.metars;
    let url = URL_GET_ADDSWX.replace(metars.token, metars.self) + airportlist;
    xhr.open('GET', url, true);
    xhr.setRequestHeader("Access-Control-Allow-Origin", "*");
    xhr.setRequestHeader('Access-Control-Allow-Methods', '*');
    xhr.setRequestHeader("Access-Control-Allow-Headers", "*");
    xhr.responseType = 'xml';
    xhr.onload = () => {
        if (xhr.readyState == 4 && xhr.status == 200) {

            let msgfield = parser.parse(xhr.responseText);
            let payload = JSON.stringify(msgfield);
            let message = {
                type: metars.type,
                payload: payload
            };
            const json = JSON.stringify(message);
            console.log(message);
            connection.send(json);
        }
    };
    xhr.send();
}

async function getTaf(airport) {
    let xhr = new XMLHttpRequest();
    let tafs = MessageTypes.tafs;
    let url = URL_GET_ADDSWX.replace(tafs.token, tafs.self) + airport;
    xhr.open('GET', url, true);
    xhr.setRequestHeader("Access-Control-Allow-Origin", "*");
    xhr.setRequestHeader('Access-Control-Allow-Methods', '*');
    xhr.setRequestHeader("Access-Control-Allow-Headers", "*");
    xhr.responseType = 'xml';
    xhr.onload = () => {
        if (xhr.readyState == 4 && xhr.status == 200) {

            let msgfield = parser.parse(xhr.responseText);
            let payload = JSON.stringify(msgfield);
            let message = {
                type: tafs.type,
                payload: payload
            };
            const json = JSON.stringify(message);
            console.log(message);
            connection.send(json);
        }
    };
    xhr.send();
}

async function getPireps() {
    let xhr = new XMLHttpRequest();
    let pireps = MessageTypes.pireps;
    xhr.open('GET', URL_GET_PIREPS, true);
    xhr.setRequestHeader("Access-Control-Allow-Origin", "*");
    xhr.setRequestHeader('Access-Control-Allow-Methods', '*');
    xhr.setRequestHeader("Access-Control-Allow-Headers", "*");
    xhr.responseType = 'xml';
    xhr.onload = () => {
        if (xhr.readyState == 4 && xhr.status == 200) {
            let msgfield = parser.parse(xhr.responseText);
            let payload = JSON.stringify(msgfield);
            let message = {
                type: pireps.type,
                payload: payload
            }
            const json = JSON.stringify(message);
            console.log(message);
            connection.send(json);
        }
    };
    xhr.send();
    return retval;
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
    meta["bounds"] = "";
    let db = vfrdb;
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
        default:
            break;
    }

    db.all(sql, [], (err, rows) => {
        rows.forEach(row => {
            if (row.value != null) {
                meta[row.name] = `${row.value}`;
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
