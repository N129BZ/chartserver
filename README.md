## Aviation Chart Server displays FAA charts and OpenStreetMaps with animated weather, geo-referenced METARS, TAFS, Pireps, and much more - using node express web server with the OpenLayers map API.   

### See *https://github.com/n129bz/chartmaker* for a chart database processing utility that produces FAA charts including Sectional, Terminal, Helicopter, Caribbean, Grand Canyon, IFR Enroute-High, and IFR Enroute-Low mbtiles databases. Chartserver can display any mbtiles databases that are dropped into the /public/data folder.   
### Chartserver menu options control the display of all geo-referenced markers, including all airports globally by US state or international country.   
### Chartserver can poll Stratux GPS/AHRS data to plot ownship position and heading over a map, giving basic "moving map" functionality and can also optionally save ownship position data to a separate position history database at user-defined intervals.   

### Docker image: ***docker pull n129bz/chartserver:v1.22***

**Installation: See wiki at https://github.com/n129bz/chartserver/wiki** 

###
**User-editable values in settings.json:**
```
{
    "savepositionhistory": true,
    "histintervalmsec": 15000,
    "gpsintervalmsec": 1000,
    "wxupdateintervalmsec": 480000,
    "keepaliveintervalmsec": 30000,
    "httpport": 8500,
    "wsport": 8550,
    "startupzoom": 8,
    "useOSMonlinemap": true,
    "debug": false,
    "historyDb": "positionhistory.db",
    "uselocaltime": true,
    "distanceunit": "sm", 
    "usestratux": false,
    "stratuxip": "192.168.10.1",
    "stratuxsituationws": "ws://[stratuxip]/situation",
    "stratuxtrafficws": "ws://[stratuxip]/traffic",
    "animatedwxurl": "https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r-t.cgi",
    "addswxurl": "https://aviationweather.gov/adds/dataserver_current/httpparam?dataSource=###&requestType=retrieve&format=xml&hoursBeforeNow=1.5&mostRecentForEachStation=true&stationString=",
    "addsurrentxmlurl": "https://aviationweather.gov/adds/dataserver_current/current/###.cache.xml",
    "showattribution": true,
    "lockownshiptocenter": true,
    "ownshipimage": "airplane.png",
    "trafficimage": "red-yellow-traffic.png",
    "usemetricunits": false,
    "distanceunits": {
        "kilometers": "km",
        "nauticalmiles": "nm",
        "statutemiles": "sm"
    },
    "messagetypes": {
        "metars": {
            "type": "metars",
            "token": "###"
        },
        "tafs": {
            "type": "tafs",
            "token": "###"
        },
        "pireps": {
            "type": "pireps",
            "token": "###"
        },
        "airports": {
            "type": "airports",
            "token": ""
        },
        "keepalive": {
            "type": "keepalive",
            "token": "((💜))"
        }
    }
}
```
**NOTE for Stratux integration**: The server requests position data via winsock connection to the Stratux API. Because the position history database is empty at first run of the app, the setting ***lockownshiptocenter*** is ***true*** by default. This will allow the application to generate and save some position data so that there will be "last known" longitude and latitude coordinates saved in the database. Once there is at least one position history record, change ***lockownshiptocenter*** to ***false*** so that you can pan around the map without it re-centering ownship to the center. This will give you basic real-time position of your aircraft on the map.      

###
**References:**   
     
https://github.com/n129bz/chartmaker   
https://github.com/b3nn0/stratux   
https://openlayers.org/     

###
**Animated weather radar layer over the Sectional chart, ownship image displayed via Stratux integration**
![ANIMWX](./images/SectWithWx.png)
**OpenStreetMap with airport status colored markers and METAR popup**   
![OSMWMETAR](./images/OsmWithMetars.png)
**Enroute High IFR chart**   
![enroutehigh](https://github.com/user-attachments/assets/caf0df83-44b2-47bb-9f9c-bab816fa5acc)
**Multiple layers, layer switcher has OSM, Grand Canyon GA, Helicopter, and animated weather selected**
![MULTI](./images/MultiLayer.png)
**Caribbean chart with color-coded airport features, showing a METAR when hovering mouse over an airport**
![CARIBMETAR](./images/CaribbeanWithMetars.png)
**Sectional chart zoomed in**  
![SECTCLOSE](./images/SectionalCloseup.png)
