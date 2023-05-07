const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const fs = require('fs');

require('./server.js');

let appWindow = null;
let settings = loadSettings();

const createWindow = () => {
    appWindow = new BrowserWindow({
        width: 1280,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
            sandbox: true
        },
        title: "Aviation and Weather Maps",
        icon: `${__dirname}/images/favicon.ico`,
        frame: true
    });
    appWindow.loadURL(`http://localhost:${settings.httpport}/`);
    if (settings.debug) {
        appWindow.webContents.openDevTools();
    }
    appWindow.maximize();
    appWindow.focus();
    const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
    Menu.setApplicationMenu(mainMenu);

    appWindow.on('close', event => {
        appWindow = null
    })
}

app.whenReady().then(() => {
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

const mainMenuTemplate = [
    {
        label: 'File',
        submenu: [
            { 
                label: 'Quit', 
                accelerator: process.platform !== 'darwin' ? 'Ctrl+Q' : 'Command+Q',
                click() {
                    app.quit();
                }
            }
        ],
    },
    {
        label: 'Options',
        submenu: [
            {
                label: 'Developer Tools',
                accelerator: process.platform !== 'darwin' ? 'Ctrl+R' : 'Command+R',
                click() {
                    appWindow.webContents.openDevTools()
                }
            }
        ]
    },
    {
        label: 'Reload',
        click (item, focusedWindow) {
            if (focusedWindow) focusedWindow.reload()
        }
    }
];

ipcMain.on('variable-request', (event) => {
    event.sender.send('variable-reply', settings);
});


if (process.platform == 'darwin') {
    mainMenuTemplate.unshift({});
}

function loadSettings() {
    let rawdata = fs.readFileSync(`${__dirname}/settings.json`);
    return JSON.parse(rawdata);
}

