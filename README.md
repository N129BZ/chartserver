# Aviation navigation charts using OpenLayers.Map and Stratux
Web-based VFR Chart map application built with node.js express and openlayers, uses ol.Map, **vfrsec.mbtiles** database and polls Stratux GPS/AHRS data to plot ownship position and heading over US VFR sectional charts.  Basic "moving map" functionality. Polls GPS coordinates and heading data from Stratux for display, and also saves position data in a separate history database at user-defined intervals.   

###
Requires vfrsec.mbtiles database to be placed in the ./public/data/ folder

Download the vfrsec.mbtiles database (5 gb) : https://drive.google.com/file/d/134feGg9nUAHmozji1AtMEUsjtuRnMefl/view

####
User-definable values in settings.json:
```
{
    "histintervalmsec": 15000,
    "gpsintervalmsec": 1000,
    "httpport": 8080,
    "tiledb": "vfrsec.mbtiles",
    "startupzoom": 10.5,
    "historydb": "positionhistory.db",
    "stratuxurl": "http://192.168.1.188/getSituation"
}
```
####
References:

https://github.com/cyoung/stratux/ 

https://openlayers.org/en/latest/apidoc/ 
