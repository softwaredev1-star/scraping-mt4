```
// lodash
window._ = {
  fromPairs (a) {
    let dict = {}
    for (let i of a) {
      dict[i[0]] = i[1]
    }
    return dict
  }
}

/* only when page is loading the following elements do exists
    `.p-mask`
    `.p-mask-msg`
*/


/* to detect if logged in or to add new instrument the following selector is used, It is expected that it should only be one of this add box
   `.x-box-add-new`
*/

// to collapse all left panels
document.querySelectorAll('.x-tool-collapse-top').forEach((a)=>a.click())

// get all menus
// // .filter((a)=>!a.classList.contains('d-search-instrument'))
// Array.from(document.querySelectorAll('.x-panel.x-menu')).map((a) => [a,a.querySelector('.x-menu-item-text')]).filter((a)=>!!a[1]).map((a)=>[a[1].textContent.match(/[^\(]+/)[0].trim(),a[0]])
_.fromPairs(
  Array.prototype.concat.apply([],
     Array.from(document.querySelectorAll('.x-panel.x-menu'))
          .map((a)=>Array.from(a.querySelectorAll('.x-menu-item-link'))))
  .map((a) => [a,a.querySelector('.x-menu-item-text')])
  .filter((a)=>!!a[1])
  .map((a)=>[a[1].textContent.match(/[^\(]+/)[0].trim(),a[0]])
)

// https://freeserv.dukascopy.com/2.0/index.php?path=chart/json&instrument=USD/JPY&offer_side=B&interval=TICK&last_update=1569902781894&splits=true&jsonp=_callbacks____ik17bl8cr
//_callbacks____ik17bl8cr([[1569902787401,108.256000,108.258000,3070000.00,1000000.00],[1569902787503,108.255000,108.256000,1000000.00,1250000.00],[1569902787651,108.252000,108.256000,4450000.00,4410000.00],[1569902787752,108.253000,108.256000,1250000.00,3260000.00],[1569902789827,108.253000,108.255000,1250000.00,1000000.00],[1569902791082,108.253000,108.256000,2440000.00,3260000.00]]);
/*
  chart values may relate to the following structure
  e[c] = nS(this, b[0]); // timestamp
  e.Ask = b[2];
  e.Bid = b[1];
  e.AskVolume = b[4];
  e.BidVolume = b[3];
*/


// _callbacks____2nk171bvtn([[1569885555989,1.228770,1.228900,2500000.00,2620000.00],[1569885556040,1.228770,1.228890,1750000.00,1250000.00],[1569885556143,1.228770,1.228900,2500000.00,2620000.00],[1569885558585,1.228770,1.228900,1250000.00,2870000.00]]);





/*WEBSOCKET*/

// collect websockets
let sockets = []
let origSend = WebSocket.prototype.send
WebSocket.prototype.send = function (data) {
  if (sockets.indexOf(this) == -1) {
    sockets.push(this)
    on_socket_detected(this)
    
  }
  return origSend.apply(this, arguments)
}
function on_socket_detected (socket) {
  socket.addEventListener('message', (event) => {
    console.log('recv', socket.url, event.data)
  })
}


// recv wss://d-ja-gva-101-135-154.dukascopy.com/high_websocket {"@t":"CM","t":1569906211935,"i":false,"s":"CHF","p":"CAD","ap":[0.75424,0.75425,0.75432,0.75435,0.75445,0.75455,0.75465,0.77,0.88],"aa":[1E+6,3E+6,3.26E+6,3.37E+6,3.17E+6,3.55E+6,1.232E+7,2E+5,2E+5],"bp":[0.75406,0.754,0.75396,0.75386,0.75376,0.75366,0.72394],"ba":[3.75E+6,1.57E+6,2.77E+6,3.37E+6,4.3E+6,1.455E+7,1.5E+5]}

// recv wss://d-ja-gva-101-135-154.dukascopy.com/high_websocket {"@t":"CM","t":1569906347469,"i":false,"s":"USD","p":"EUR","ap":[1.08916,1.08917,1.08918,1.08919,1.0892,1.08921,1.08926,1.08927,1.08928,1.08935],"aa":[2.44E+6,4.57E+6,3.75E+6,1.405E+7,1.405E+7,1.592E+7,5.05E+6,3.75E+6,3.75E+6,3.285E+7],"bp":[1.08913,1.08912,1.08911,1.0891,1.08909,1.08908,1.08907,1.08906,1.08905,1.08904],"ba":[7.5E+5,7.5E+5,9.4E+5,6.75E+6,1.5E+7,1.312E+7,6.55E+6,1.312E+7,4.67E+6,2.427E+7]}



document.addEventListener('loadstart', (evt) => {
  let src = evt.target.src+''
  let match = src.match(/jsonp=(_callbacks____.*)$/)
  if (match) {
    let callbackname = match[1]
    console.log('callback found', callbackname)
    let origcallback = window[callbackname] || function () { }
    let callback = (...args) => {
      console.log(callbackname, args)
      return origcallback(...args)
    }
    window[callbackname] = callback
  }
}, true)

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
            console.log('callback found', callbackname, !!window[callbackname])
            let callback = (...args) => {
              console.log(callbackname, args)
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
```