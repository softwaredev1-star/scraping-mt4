const { spawn } = require('child_process')
const path = require('path')

spawn('xvfb-run', [
  '--server-args=-screen 0, 1024x768x16',
  path.join(__dirname, 'node_modules/.bin/electron'),
  process.env.NODE_ENV == 'development' ? '--remote-debugging-port=3050' : null,
  'main.js', '--no-sandbox'
].filter((a) => !!a), { stdio: 'inherit', })

