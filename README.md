## Aviation and Weather Maps displays FAA charts, OpenStreetMaps, animated weather, METARS, TAFS, and much more, using electron, node, and express with the OpenLayers map API.  

### Offline FAA charts include Sectional, Terminal, Helicopter, Caribbean, and both versions of Grand Canyon charts served from mbtiles databases. It can also poll Stratux GPS/AHRS data to plot ownship position and heading over the map, giving basic "moving map" functionality. It can also save position data in a separate history database at user-defined intervals.   

**See https://github.com/N129BZ/chartmaker for an automated FAA chart mbtiles processor**

**Instructions:** Requires node.js. Clone this project, open a terminal in the folder you cloned it to, and enter "npm install". You can then either run the application directly from Visual Studio Code, or enter "npm start" in the terminal. 

###
**User-editable values in settings.json:**
```
{
    "putpositionhistory": false,
    "histintervalmsec": 15000,
    "getgpsfromstratux": false,
    "gpsintervalmsec": 1000,
    "gettimedmetars": false,
    "metarintervalmsec": 300000,
    "httpport": 5000,
    "wsport": 5050,
    "startupzoom": 10,
    "useOSMonlinemap": true,
    "debug": true,
    "sectionalDb": "Sectional.mbtiles",
    "terminalDb": "Terminal.mbtiles",
    "helicopterDb": "Helicopter.mbtiles",
    "caribbeanDb": "Caribbean.mbtiles",
    "gcanyonAoDb": "Grand_Canyon_AO.mbtiles",
    "gcanyonGaDb": "Grand_Canyon_GA.mbtiles",
    "historyDb": "positionhistory.db",
    "airportsDb": "airports.db",
    "stratuxurl": "http://192.168.10.1/getSituation",
    "animatedwxurl": "https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r-t.cgi",
    "addswxurl": "https://www.aviationweather.gov/adds/dataserver_current/httpparam?dataSource=@SOURCE&requestType=retrieve&format=xml&hoursBeforeNow=1.5&mostRecentForEachStation=true&stationString=",
    "addspirepsurl": "https://www.aviationweather.gov/adds/dataserver_current/httpparam?datasource=pireps&requesttype=retrieve&format=xml&hoursBeforeNow=.5",
    "lockownshiptocenter": true,
    "ownshipimage": "blueplane.png",
    "messagetypes": {
        "metars": {
            "self": "metars",
            "type": "METARS",
            "token": "@SOURCE"
        },
        "tafs": {
            "self": "tafs",
            "type": "TAFS",
            "token": "@SOURCE"
        },
        "pireps": {
            "self": "pireps",
            "type": "PIREPS",
            "token": ""
        },
        "airports": {
            "self": "airports",
            "type": "AIRPORTS",
            "token": ""
        },
        "allairports": {
            "self": "allairports",
            "type": "ALLAIRPORTS",
            "token": ""
        }
    }
}
```
**NOTE**: As the position history database is empty at first run of the app, the setting ***"lockownshiptocenter"*** has been set to ***true*** by default. This will allow the application to generate and save some position data so that there will be "last known" longitude and latitude coordinates saved in the database. Once there is at least one position history record, you can change that setting to false so that you can pan around the map without it automatically re-centering ownship to the center. You could also use a sqlite database tool to enter a position history record with your preferred latitude and longitude to be used as a center point when the maps are loaded.      

###
**References:**

https://github.com/cyoung/stratux/    
https://openlayers.org/     

###
**Animated weather radar layer over the Sectional chart, ownship image displayed via Stratux integration**
![ANIMWX](./images/SectWithWx.png)
**OpenStreetMap with airport status colored markers and METAR popup**
![OSMWMETAR](./images/OsmWithMetars.png)
**Multiple layers, layer switcher has OSM, Grand Canyon GA, Helicopter, and animated weather selected**
![MULTI](./images/MultiLayer.png)
**Caribbean chart with color-coded airport features, showing a METAR when hovering mouse over an airport**
![CARIBMETAR](./images/CaribbeanWithMetars.png)
**Sectional chart zoomed in**  
![SECTCLOSE](./images/SectionalCloseup.png)
