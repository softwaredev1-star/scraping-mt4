const { app, BrowserWindow, ipcMain, session } = require('electron')
const path = require('path')
const _ = require('lodash')

let isDevelopment = process.env.NODE_ENV != 'production'
let runHeadless = !('RUN_HEADLESS' in process.env) ? !isDevelopment :
    !!process.env.RUN_HEADLESS && process.env.RUN_HEADLESS != "0"
let persistSession = !!process.env.PERSIST_SESSION && process.env.PERSIST_SESSION != "0"
let timezone = process.env.TIMEZONE || 'UTC'
let winURL = process.env.FOREX_DUKA_URL ||
    (isDevelopment ? 'https://demo-login.dukascopy.com/web-platform/' :
     'https://live-login.dukascopy.com/web-platform/')
let preloadScript = path.join(__dirname, 'preload.js')
let instrumentsPath = (process.env.INSTRUMENTS_PATH||'USD -> USD/CAD').split(',')
    .map((a) => a.split(/[\=\-]\>/g).map((b)=>b.trim()))
let datadir = process.env.DATA_DIR || path.join(__dirname, 'data')
let instrumentsTargetFiles = _.fromPairs(
  instrumentsPath.map((a) => a[a.length-1])
    .map((a) => (
      [ a, process.env[a.replace(/\//g, '_')+'_FILE'] ||
        path.join(datadir, a.replace(/\//g, '_') + '.csv')
      ]))
)
if (!process.env.LOGIN || !process.env.PASSWORD) {
  throw new Error('define LOGIN and PASSWORD in the environment variables')
}
let login = process.env.LOGIN
let password = process.env.PASSWORD
let mainWindow

function createWindow () {
  /**
   * Initial window options
   */
  let mainWindow = new BrowserWindow({
    useContentSize: true,
    width: 1024,
    height: 768,
    webPreferences: {
      devTools: !runHeadless && isDevelopment,
      webviewTag: false,
      nodeIntegration: false,
      enableBlinkFeatures: null,
      preload: preloadScript,
      partition: persistSession ? 'persist:forex' : 'temp',
    },
    show: !runHeadless,
  })
  if (!runHeadless && isDevelopment) {
    mainWindow.webContents.openDevTools()
  }
  mainWindow.loadURL(winURL)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

ipcMain.on('pre-ready', (event) => {
  // init the preload
  event.reply('pre-init', {
    login, password,
    rememberLogin: persistSession,
    timezone,
    instrumentsPath,
    instrumentsTargetFiles,
  })
})

ipcMain.on('pre-log', (event, ...args) => {
  console.log('PRE-LOG', ...args)
})

ipcMain.on('pre-log-error', (event, ...args) => {
  console.error('PRE-ERROR', ...args)
})

ipcMain.on('pre-fatal-error', (event, msg) => {
  console.error('PRE-FATAL: ' + msg)
  process.exit(-1)
})

app.on('ready', createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
