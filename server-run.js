const { spawn } = require('child_process')
const path = require('path')

spawn('xvfb-run', [ '--server-args=-screen 0, 1024x768x16',
                    path.join(__dirname, 'node_modules/.bin/electron'),
                    'main.js', '--no-sandbox' ],
     { stdio: 'inherit', })

