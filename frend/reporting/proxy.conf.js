module.exports = {
  "/api": {
    target: "http://localhost:9090",
    secure: false,
    changeOrigin: true,
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
