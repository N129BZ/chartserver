const sqlite3 = require("sqlite3");
const express = require('express');
const Math = require("math");
const fs = require("fs");
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const convert = require('xml-js');

const settings = readSettingsFile();
var airportJson;
loadAirportsJson(settings.startupzoom);

function readSettingsFile() {
    let rawdata = fs.readFileSync(`${__dirname}/settings.json`);
    return JSON.parse(rawdata);
}

function loadAirportsJson(zoomlevel) {
    let airportdb = new sqlite3.Database(settings.airportdb, sqlite3.OPEN_READONLY, (err) => {
        let sql = `SELECT ident, type, elevation_ft, longitude_deg, latitude_deg FROM airports WHERE iso_country = 'US' AND gps_code LIKE 'K%';`;
        airportdb.all(sql, (err, rows) => {
            if (err === null) {
                airportJson = `{ "airports": [ `;
                rows.forEach(row => {
                    airportJson += `{ "ident": "${row.ident}",` +
                                   `  "type": "${row.type}",` +
                                   `  "elevation": ${row.elevation_ft},` +
                                   `  "lonlat": [${row.longitude_deg}, ${row.latitude_deg}]` + 
                                   `},`;
                });
                // trim final comma and add closing braces
                airportJson = airportJson.substring(0, airportJson.length - 1) + "] }";
            }
        });
    });
}

let mapdb = new sqlite3.Database(settings.tiledb, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.log(`Failed to load: ${settings.tiledb}`);
        throw err;
    }
});

let histdb = new sqlite3.Database(settings.historydb, sqlite3.OPEN_READWRITE, (err) => {
    if (err){
        console.log(`Failed to load: ${settings.historydb}`);
    }
});

// express web server  
let app = express();
try {
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json({}));
    app.use('/img', express.static(`${__dirname}/public/img`));

    app.listen(settings.httpport, () => {
        console.log(`Webserver listening at port ${settings.httpport}`);
    }); 

    var options = {
        dotfiles: 'ignore',
        etag: false,
        extensions: ['html'],
        index: false,
        redirect: false,
        setHeaders: function (res, path, stat) {
            res.set('x-timestamp', Date.now());
        }
    };

    app.use(express.static(`${__dirname}/public`, options));
    
    app.get('/',(req, res) => {
        res.sendFile(`${__dirname}/public/index.html`);
    });
    
    app.get("/getsettings", (req, res) => {
        getSettings(res);
    });
    
    app.get("/tiles/tilesets", (req,res) => {
        handleTilesets(req, res);
    });    

    app.get("/tiles/singletile/*", (req, res) => {
        handleTile(req, res)
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
        res.writeHead(200);
        res.write(airportJson); 
        res.end();
    });

    app.get("/getmetars/:airportlist", (req, res) => {
        var data = getMetars(req.params.airportlist);
        res.writeHead(200);
        res.write(data); 
        res.end();
    });
}
catch (error) {
    console.log(error);
}

function getMetars(airportlist) {
    var retval = "";
    var xhr = new XMLHttpRequest();
    var baseurl = "https://www.aviationweather.gov/adds/dataserver_current/httpparam?dataSource=metars&requestType=retrieve&format=xml&hoursBeforeNow=1.5&mostRecentForEachStation=true&stationString=";
    let url = `${baseurl}${airportlist}`;
    xhr.open('GET', url, false);
    xhr.responseType = 'xml';
    xhr.onload = () => {
        let status = xhr.status;
        if (status == 200) {
            retval = xhr.responseText;
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
    let sql = `INSERT INTO position_history (datetime, longitude, latitude, heading, gpsaltitude) 
               VALUES ('${datetime}', ${data.longitude}, ${data.latitude}, ${data.heading}, ${data.altitude})`;
    console.log(sql); 
        
    histdb.run(sql, function(err) {
        if (err != null) {
            console.log(err);
        }
    });
}

function getSettings(response) {
    let json = readSettingsFile();
    response.writeHead(200);
    response.write(JSON.stringify(json));
    response.end();
}

function handleTile(request, response) {
	
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
    loadTile(z, x, y, response); 
}

function loadTile(z, x, y, response) {

    let sql = `SELECT tile_data FROM tiles WHERE zoom_level=${z} AND tile_column=${x} AND tile_row=${y}`;

    console.log(sql);

    mapdb.get(sql, (err, row) => {
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
    let sql = "SELECT name, value FROM metadata" +
            " UNION SELECT 'minzoom', min(zoom_level) FROM tiles WHERE NOT EXISTS (SELECT * FROM metadata WHERE name='minzoom')" +
            " UNION SELECT 'maxzoom', max(zoom_level) FROM tiles WHERE NOT EXISTS (SELECT * FROM metadata WHERE name='maxzoom')";
    console.log(sql);
    let found = false;
    let meta = {};
    meta["bounds"] = "";

    mapdb.all(sql, [], (err, rows) => {
        rows.forEach(row => {
            if (row.value != null) {
                meta[row.name] = `${row.value}`;
            }
            if (row.name === "maxzoom" && row.value != null && !found) {
                let maxZoomInt = parseInt(row.value); 
                sql = "SELECT min(tile_column) as xmin, min(tile_row) as ymin, " + 
                             "max(tile_column) as xmax, max(tile_row) as ymax FROM tiles WHERE zoom_level=?"
                mapdb.get(sql, [maxZoomInt], (err, row) => {
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

