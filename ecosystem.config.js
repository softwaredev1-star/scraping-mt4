module.exports = {
  apps : [{
    name: 'forex-trading-scrapper',
    script: 'server-run.js',
    instances: 1,
    // Options reference: https://pm2.io/doc/en/runtime/reference/ecosystem-file/
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      LOGIN: '',
      PASSWORD: '',
      INSTRUMENTS_PATH: 'EUR -> EUR/GBP , USD -> USD/CAD, EUR -> EUR/USD',
      RUN_HEADLESS: '1',
      FOREX_DUKA_URL: 'https://demo-login.dukascopy.com/web-platform/',
      DATA_DIR: '/var/www/html/forexdata',
      TIMEZONE: 'UTC',
    }
  }]
}
