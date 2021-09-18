# Aviation navigation charts using OpenLayers mapping via GPS coordinates from Stratux

**Web-based application can use either offline VFR Charts or online OSM maps. Application built with node.js express and OpenLayers. Offline VFR charts use vfrsec.mbtiles database. Application polls Stratux GPS/AHRS data to plot ownship position and heading over the map, giving basic "moving map" functionality. Also saves position data in a separate history database at user-defined intervals.**   

###
Offline use requires vfrsec.mbtiles database (or a mbtiles database of your own choosing) to be placed in the ./public/data/ folder.

**Instructions:** This is a node app, so you will need node.js installed. Clone this project, open a terminal in the folder you cloned it to, and enter "npm install". You can then either run the application directly from Visual Studio Code, or enter "node index.js" in the terminal. 

**Download the vfrsec.mbtiles database (5 gb):** https://drive.google.com/file/d/134feGg9nUAHmozji1AtMEUsjtuRnMefl/view

###
**User-settable values in settings.json:**
```
{
    "histintervalmsec": 15000,
    "gpsintervalmsec": 1000,
    "httpport": 8080,
    "startupzoom": 10.5,
    "useOSMonlinemap": false,
    "tiledb": "vfrsec.mbtiles",
    "historydb": "positionhistory.db",
    "stratuxurl": "http://192.168.10.1/getSituation"
}
```
###
**References:**

https://github.com/cyoung/stratux/    
https://openlayers.org/     

###
**vfrsec.mbtiles rendering (offline)**  
![VFRCHART](./images/VFRCHT.png)  
**OpenStreetMaps rendering (online only)**  
![OSM](./images/OSM.png)
