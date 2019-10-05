const { ipcRenderer } = require('electron')
const _ = require('lodash')
const delay = require('delay')
const fs = require('fs')
const url = require('url')
const EventEmitter = require('events')

let default_refresh_every = 100
let default_block_timeout = 60 * 1000
let delay_before_start = 2000
let tracker_first_time_run_least_delay = 5000

let $qs = document.querySelector.bind(document)
let $qsa = document.querySelectorAll.bind(document)

document.addEventListener('DOMContentLoaded', (evt) => {
  ipcRenderer.send('pre-ready')
}, false)

ipcRenderer.on('pre-init', (event, params) => {
  init(params)
    .catch(fatalError)
})

async function init (params) {
  let { login, password, rememberLogin, timezone,
        instrumentsPath, instrumentsTargetFiles } = params
  log('instruments: ', instrumentsPath)
  log('location: ' + location)
  await untilLoadingFinish()
  await delay(500) // wait for the engine to load stuff up
  // login if needed
  if (shouldLogin()) {
    log('should-login')
    await doLogin(login, password, rememberLogin)
    log('did-login')
  }
  await delay(delay_before_start)
  // wait for charts to load
  while (Array.from($qsa('.a-N-Ph-v-ab')).filter((a) => a.style.display!='none').length > 0) {
    log('waiting')
    await delay(2000)
  }
  // remove wiki dialog
  let wikidds = $qs('.dds-wiki-whats-new')
  if (wikidds) {
    let closebtn = wikidds.querySelector('.d-wiki-buttons .x-btn')
    if (closebtn) {
      closebtn.click()
    }
  }
  // clear all existing instruments, etc
  log('cleanup')
  cleanup()
  await delay(2000)
  // track all incoming chart data
  let trackers = startTracking(instrumentsPath.map((a) => a[a.length-1]))
  for (let tracker of trackers) {
    tracker.on('block', onBlockFound)
  }
  // make charts ready
  await delay(100) // some delay between cleanup and add instruments
  log('add-instruments')
  for (let instrumentPath of instrumentsPath) {
    await addInstrument(instrumentPath)
  }
  // status check
  let calledDidConnectOnce = false
  let connected = !!$qs('.d-status-connection.d-connected-active,.d-status-connection.d-connected')
  let mouseX = Math.random() * 500
  let mouseY = Math.random() * 500
  document.body.dispatchEvent(new MouseEvent('mouseover', {
    screenX: Math.floor(mouseX),
    screenY: Math.floor(mouseY),
    clientX: Math.floor(mouseX),
    clientY: Math.floor(mouseY),
    bubbles: true
  }))
  setInterval(() => {
    try {
      let new_connected = !!$qs('.d-status-connection.d-connected-active,.d-status-connection.d-connected')
      if (connected != new_connected) {
        connected = new_connected
        log('Connect status did change: ' + (connected ? 'true' : 'false'))
      }
      checkAndHandleMessageBox()
      setTimeout(() => {
        try {
          mouseX += Math.min(800, Math.max(0, (Math.random() - 0.5) * 5))
          mouseY += Math.min(600, Math.max(0, (Math.random() - 0.5) * 5))
          document.body.dispatchEvent(new MouseEvent('mousemove', {
            screenX: Math.floor(mouseX),
            screenY: Math.floor(mouseY),
            clientX: Math.floor(mouseX),
            clientY: Math.floor(mouseY),
            bubbles: true
          }))
        } catch (err) {
          logError(err)
        }
      }, Math.floor(Math.random() * 300))
    } catch (err) {
      logError(err)
    }
  }, 2000)
  function onBlockFound (data, tracker, ticks) {
    try {
      let targetfn = instrumentsTargetFiles[tracker.instrument]
      if (targetfn) {
        let idata = data.biddata
        let time = new Date(new Date(data.timestamp).toLocaleString("en-US", {timeZone: timezone}))
        let dtstr = zerofill2(time.getDay()) + '.' + zerofill2(time.getMonth()) + '.' + time.getFullYear() + ' ' + zerofill2(time.getHours()) + ':' + zerofill2(time.getMinutes()) + ':' + zerofill2(time.getSeconds()) + '.' + zerofill(time.getTime()%1000, 3)
        let row = [ dtstr, idata.open, idata.high, idata.low,
                    idata.close, idata.volume / 1000000 ]
        if (!fs.existsSync(targetfn)) {
          fs.writeFileSync(targetfn, 'Time,Open,High,Low,Close,Volume\r\n')
        }
        log('newdata', tracker.instrument, row)
        fs.appendFileSync(targetfn, row.join(',') + '\r\n');
      }
    } catch (err) {
      logError(err)
    }
  }
}

function checkAndHandleMessageBox () {
  let messagebox = $qs('.x-message-box')
  if (!!messagebox && !messagebox.__didlog) {
    messagebox.__didlog = true
    let msg = messagebox.textContent.trim()
    fatalError('Unexpected message box: ' + msg)
  }
}

function zerofill2 (s) {
  return zerofill(s, 2)
}
function zerofill (s, n) {
  s = s+''
  return '0'.repeat(Math.max(n - s.length, 0)) + s
}

class InstrumentTracker extends EventEmitter {
  constructor (instrument) {
    super()
    this.instrument = instrument
    this.onTicksUpdateFirstRun = true
    this.ticks = []
    this.failed = false
    this.lastUpdatedTimestamp = 0
  }
  onData (ticksData) {
    if (this.failed) {
      return // died
    }
    for (let data of ticksData) {
      if (data[0] <= this.lastUpdatedTimestamp) {
        continue
      }
      this.ticks.push({
        timestamp: data[0],
        ask: data[2],
        bid: data[1],
        askvolume: data[4],
        bidvolume: data[3],
      })
    }
    if (this.ticks.length > 0) {
      this.lastUpdatedTimestamp = this.ticks[this.ticks.length-1].timestamp
      this.onTicksUpdate()
    }
  }
  onTicksUpdate () {
    /* Processing starts
       1. at-first-run remove un-wanted ticks (only use current minute ticks)
       2. split ticks into minute blocks if needed
       3. after split process and dispatch the finished block
     */
    // start processing only after few seconds
    // detect and process blocks
    while (this.ticks.length > 0) {
      let blocksize = 60000
      let blocktime
      // step one
      if (this.onTicksUpdateFirstRun) {
        this.onTicksUpdateFirstRun = false
        let ltick = this.ticks[this.ticks.length-1]
        blocktime = ltick.timestamp + blocksize - (ltick.timestamp % blocksize)
        // only insert after blocktime
        this.lastUpdatedTimestamp = blocktime
        this.ticks = []
      } else {
        blocktime = this.ticks[0].timestamp - (this.ticks[0].timestamp % blocksize)
        this.ticks = this.ticks.filter((a) => a.timestamp >= blocktime)
      }
      // one minute block
      let nextblockindex = this.ticks.findIndex((a) => a.timestamp - blocktime > blocksize)
      if (nextblockindex == -1) {
        break // no more block to process
      }
      if (nextblockindex == 0) {
        // should never happen
        this.failed = true
        logError(`Tracker failed [${this.instrument}], nextblockindex is an unexpected  value!`)
      }
      // remove from this.ticks and let blockticks to be ticks of found block
      let blockticks = this.ticks.splice(0, nextblockindex)
      this.processTicksBlock(blocktime, blockticks)
    }
  }
  processTicksBlock (timestamp, ticks) {
    /* Output contains the following
       { timestamp, askdata, biddata }
       data for ask/bid contains { open, close, high, low, volume }
    */
    let codedata1 = [
      {
        name: 'askdata',
        amount: 'ask',
        volume: 'askvolume',
      },
      {
        name: 'biddata',
        amount: 'bid',
        volume: 'bidvolume',
      }
    ]
    let output = { timestamp }
    for (let paramnames of codedata1) {
      let open = ticks[0][paramnames.amount]
      let close = ticks[ticks.length - 1][paramnames.amount]
      let high = _.max(ticks.map((a) => a[paramnames.amount]))
      let low = _.min(ticks.map((a) => a[paramnames.amount]))
      let volume = _.sum(ticks.map((a) => a[paramnames.volume]))
      output[paramnames.name] = { open, close, high, low, volume }
    }
    this.emit('block', output, this, ticks)
  }
}

function startTracking (instruments) {
  let trackers = instruments.map((a) => new InstrumentTracker(a))
  function onData (src, args) {
    let urlobj = url.parse(src, true)
    if (urlobj.query && urlobj.query.path == 'chart/json' &&
        urlobj.query.interval == 'TICK' &&
        instruments.indexOf(urlobj.query.instrument) != -1 &&
        args[0] && args[0].length > 0) {
      let tracker = trackers.find((a) => a.instrument == urlobj.query.instrument)
      if (tracker) {
        tracker.onData(args[0])
      }
    }
  }
  insertTrackerHook(onData, logError)
  return trackers
}

function insertTrackerHook (onData, onError) {
  function mutationCallback (mutationList, observer) {
    for (let mutation of mutationList) {
      if (mutation.type == 'childList') {
        for (let addedNode of mutation.addedNodes) {
          if (addedNode.nodeName == 'SCRIPT') {
            let src = addedNode.src
            let match = src.match(/jsonp=(_callbacks____.*)$/)
            if (match) {
              let callbackname = match[1]
              let origcallback = window[callbackname] || function () { }
              let callback = (...args) => {
                try {
                  onData(src, args)
                } catch (err) {
                  try {
                    onError(err)
                  } catch (err2) {
                    // pass
                  }
                }
                return origcallback(...args)
              }
              window[callbackname] = callback
            }
          }
        }
      }
    }
  }
  const observer = new MutationObserver(mutationCallback)
  observer.observe(document, { childList: true, subtree: true })
}

async function addInstrument (instrumentPath) {
  let addnewbtn = $qs('.x-box-add-new')
  addnewbtn.click()
  await delay(50) // have some delay for each click
  let path = [].concat(instrumentPath)
  let currentTarget
  while ((currentTarget = path.shift()) != null) {
    let btns = _.fromPairs(
      Array.prototype.concat.apply([],
         Array.from(document.querySelectorAll('.x-panel.x-menu'))
              .map((a)=>Array.from(a.querySelectorAll('.x-menu-item-link'))))
      .map((a) => [a,a.querySelector('.x-menu-item-text')])
      .filter((a)=>!!a[1])
      .map((a)=>[a[1].textContent.match(/[^\(]+/)[0].trim(),a[0]])
    )
    if (!btns[currentTarget]) {
      throw new Error(`Could not addInstrument: at [${currentTarget}], ${instrumentPath.join(' => ')}`)
    }
    if (path.length == 0) {
      btns[currentTarget].click()
    } else {
      let btn = btns[currentTarget]
      btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      await delay(20)
      btn.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    }
    await delay(500) // have some delay for each action
  }
  await delay(500)
  await removeDisclaimerIfAnyExists()
}

async function removeDisclaimerIfAnyExists () {
  let disclaimerwin = $qs('.dds-platform-disclaimer,.dds-login-disclaimer')
  if (disclaimerwin) {
    let btns = Array.from(disclaimerwin.querySelectorAll('.x-btn')).filter((a) => a.textContent.trim().toLowerCase() == 'i agree')
    if (btns.length > 0) {
      btns[0].click()
      await delay(500)
    } else {
      throw new Error(`Could not accept disclaimer for instrument path: ${instrumentPath.join(' => ')}`)
    }
  }
}

function cleanup () {
  // close all instruments tab
  $qsa('.x-tab-close-btn').forEach((a)=>a.click())
  // to collapse all left panels
  $qsa('.x-tool-collapse-top').forEach((a)=>a.click())
}

function untilLoadingFinish () {
  return blockUntil(default_refresh_every, default_block_timeout,
                    () => !$qs('.p-mask,.p-mask-msg'))
}

function shouldLogin () {
  return !!$qs('input[name=login]') && !!$qs('input[name=password]')
}

async function doLogin (login, password, remember) {
  let logininp = $qs('input[name=login]')
  let passwordinp = $qs('input[name=password]')
  let remembercheckbox = null
  let submitbtn = null
  traverseUntilEnd(passwordinp, (a) => {
    if (a.nodeType == Node.ELEMENT_NODE && a.classList.contains('x-btn')) {
      submitbtn = a
      return true // exit
    }
  })
  if (submitbtn == null) {
    throw new Error('Could not find login button')
  }
  traverseUntilEnd(passwordinp, (a) => {
    if (a.nodeType == Node.ELEMENT_NODE && a.classList.contains('x-form-checkbox')) {
      remembercheckbox = a
      return true // exit
    }
  })
  logininp.value = login
  logininp.dispatchEvent(new CustomEvent('input', { bubbles: true }))
  passwordinp.value = password
  passwordinp.dispatchEvent(new CustomEvent('input', { bubbles: true }))
  if (remember && remembercheckbox) {
    remembercheckbox.click()
    await delay(1000)
    removeDisclaimerIfAnyExists()
  }
  submitbtn.click()
  // wait for a response
  // either chart will up or a message, +Timeout
  await blockUntil(default_refresh_every, default_block_timeout,
                   (a) => !!$qs('.x-message-box .x-message-box-warning') || $qs('.x-box-add-new'))
  if (!!$qs('.x-message-box .x-message-box-warning')) {
    let textelm = $qs('.x-message-box .x-window-text')
    let msg = textelm ? textelm.textContent.trim() : 'Could not get login error message'
    throw new Error(msg)
  }
}

function log (...args) {
  ipcRenderer.send('pre-log', ...args)
}
function logError (...args) {
  args = args.map((a) => isError(a) ? getErrorDetails(a) : a)
  ipcRenderer.send('pre-log-error', ...args)
}
function fatalError (err) {
  ipcRenderer.send('pre-fatal-error', getErrorDetails(err))
}
function isError (error) {
  return typeof error.message == 'string' && typeof error.stack == 'string'
}
function getErrorDetails (error) {
  if (!isError(error)) {
    return JSON.stringify(error, null, 2)
  } else {
    return error.constructor.name  + ": " + error.message + "\n" + error.stack
  }
}
function blockUntil (refresh_every, timeout, cond) {
  let timeout_error = new Error("Timeout!");
  return new Promise((resolve, reject) => {
    let stime = new Date().getTime();
    let interval = setInterval(() => {
      let ctime = new Date().getTime();
      if (ctime - stime > timeout) {
        clearInterval(interval);
        reject(timeout_error);
      } else if (cond()) {
        clearInterval(interval);
        resolve();
      }
    }, refresh_every);
  });
}
function _traverseUntilEndSubrout (node, callable) {
  if (callable(node)) {
    return true // exit
  }
  if (node.childNodes) {
    for (let cnode of node.childNodes) {
      if (_traverseUntilEndSubrout(cnode, callable)) {
        return true // exit
      }
    }
  }
  return false
}
function traverseUntilEnd (node, callable) {
  let tmp = node
  while (tmp) { 
    if (_traverseUntilEndSubrout(tmp, callable)) {
      return true // exit
    }
    tmp = tmp.nextSibling
  }
  if (node.parentNode) {
    let parentNode = node.parentNode
    let nextNode = parentNode.nextSibling
    while (!nextNode) {
      parentNode = parentNode.parentNode
      if (!parentNode) {
        break
      }
      nextNode = parentNode.nextSibling
    }
    if (nextNode) {
      if (traverseUntilEnd(nextNode, callable)) {
        return true // exit
      }
    }
  }
  return false
}
