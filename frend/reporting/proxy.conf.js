module.exports = {
  "/api": {
    target: "http://localhost:9090",
    secure: false,
    changeOrigin: true,
    // The live job and log updates reach the browser over /api/ws (SockJS + STOMP). Without ws: true the dev
    // server does not forward the WebSocket upgrade, SockJS falls back to HTTP polling, and its POSTs
    // (xhr_send, which carry the STOMP SUBSCRIBE) cannot carry the CSRF header, so they get 403 and the
    // browser never receives a message. Every other way of running DataPallas reaches the server directly
    // and keeps the real WebSocket; this makes the dev server do the same.
    ws: true,
    logLevel: "debug",
  },
  "/rb-webcomponents": {
    target: "http://localhost:9090",
    secure: false,
    changeOrigin: true,
    logLevel: "debug",
  },
  // Published dashboards are pages the server renders at /dashboard/<reportCode> (DashboardController).
  // The trailing slash is on purpose: keys match as path prefixes, so a bare "/dashboard" would also
  // catch any dev-server file whose name starts with "dashboard".
  "/dashboard/": {
    target: "http://localhost:9090",
    secure: false,
    changeOrigin: true,
    logLevel: "debug",
    // A visitor without a session is sent to the sign-in page with an absolute Location built from the
    // Host the server saw - localhost:9090 behind this proxy. Make it path-relative so the browser stays
    // on the address it came from; any other Location is left as it is.
    configure: (proxy) => {
      proxy.on("proxyRes", (proxyRes) => {
        const location = proxyRes.headers["location"];
        if (location) {
          proxyRes.headers["location"] =
            location.replace(/^https?:\/\/(localhost|127\.0\.0\.1):9090(?=\/|\?|#|$)/, "") || "/";
        }
      });
    },
  },
};
