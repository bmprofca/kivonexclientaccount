// Development only (npm start): calls to the Kivonex Cloud API go to the API server, so the panel and the API share an
// address as they do in production. KIVONEX_API points it elsewhere (the browser test uses a throwaway API).
const { createProxyMiddleware } = require('http-proxy-middleware')

const api = process.env.KIVONEX_API || 'http://127.0.0.1:8790'

module.exports = function proxy(app) {
  app.use(createProxyMiddleware(['/v1', '/healthz'], { target: api, changeOrigin: false }))
}
