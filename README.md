# Aviation navigation charts using OpenLayers mapping via GPS coordinates from Stratux

**Off-line Web-based VFR Chart map application built with node.js express and openlayers, uses ol.Map, vfrsec.mbtiles database and polls Stratux GPS/AHRS data to plot ownship position and heading over US VFR sectional charts (*or the mbtiles database of your choice.)*  Basic "moving map" functionality. Also saves position data in a separate history database at user-defined intervals.**   

###
Requires vfrsec.mbtiles database to be placed in the ./public/data/ folder

**Instructions:** This is a node app, so you will need node.js installed. Clone this project, open a terminal in the folder you cloned it to, and enter "npm install". You can then either run the application directly from vs code, or enter "node index.js" in the terminal. 

**Download the vfrsec.mbtiles database (5 gb) :** https://drive.google.com/file/d/134feGg9nUAHmozji1AtMEUsjtuRnMefl/view

###
**User-settable values in settings.json:**
```
{
    "histintervalmsec": 15000,
    "gpsintervalmsec": 1000,
    "httpport": 8080,
    "startupzoom": 10.5,
    "tiledb": "vfrsec.mbtiles",
    "historydb": "positionhistory.db",
    "stratuxurl": "http://192.168.10.1/getSituation"
}
```
###
**References:**

https://github.com/cyoung/stratux/    
https://openlayers.org/     
