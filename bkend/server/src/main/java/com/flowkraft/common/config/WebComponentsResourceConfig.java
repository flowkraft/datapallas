package com.flowkraft.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.flowkraft.common.AppPaths;
import com.sourcekraft.documentburster.utils.Utils;

/**
 * Static resource configuration for serving web components.
 * 
 * This allows external applications (Grails, WordPress, custom HTML pages, etc.)
 * to include the web components directly from the DataPallas server:
 * 
 * <script src="http://DataPallas-server:9090/rb-webcomponents/rb-webcomponents.umd.js"></script>
 * 
 * The files are served from {PORTABLE_EXECUTABLE_DIR}/tools/rb-webcomponents/
 * 
 * Benefits:
 * - No API endpoint needed (just static file serving)
 * - No authentication required (static resources bypass security)
 * - Eliminates need to stage web components to Grails, WordPress, etc.
 * - Single source of truth for web components
 */
@Configuration
public class WebComponentsResourceConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Serve web components from tools/rb-webcomponents folder
        // URL: /rb-webcomponents/** -> file:{PORTABLE_EXECUTABLE_DIR}/tools/rb-webcomponents/
        String webComponentsPath = Utils.resolvePathAgainstPortableDir("tools/rb-webcomponents/");

        registry.addResourceHandler("/rb-webcomponents/**")
                .addResourceLocations("file:" + webComponentsPath)
                .setCachePeriod(3600); // Cache for 1 hour

        // Serve geojson assets (countries.geojson etc.) consumed by rb-map.
        // The files live in the AI Hub Next.js app's public folder so they can
        // be served identically on port 8440 (canvas editor) and port 9090
        // (published /dashboard/{reportId} pages).
        String geojsonPath = Utils.resolvePathAgainstPortableDir(
                "_apps/flowkraft/_ai-hub/ui-startpage/public/geojson/");

        registry.addResourceHandler("/geojson/**")
                .addResourceLocations("file:" + geojsonPath)
                .setCachePeriod(3600);

        // The Angular application itself, from lib/frend.
        //
        // DataPallas Server is reached with a browser, and its desktop window is a browser too — both
        // load the app from here, which is what puts the UI on the same origin as the API. That is not
        // a convenience: the session and CSRF cookies only exist for callers on this origin, so an app
        // served from anywhere else cannot sign anyone in.
        //
        // No SPA fallback is needed. The app routes with a hash, so every deep link is still a request
        // for "/" as far as this server is concerned.
        // A pattern's location is resolved against whatever follows the pattern, so each folder needs
        // its own registration: under "/assets/**" the request "/assets/i18n/en.json" resolves the
        // path "i18n/en.json", which only lands on the right file when the location is the assets
        // folder itself.
        String frontendPath = Utils.resolvePathAgainstPortableDir("lib/frend/");

        registry.addResourceHandler("/index.html", "/*.js", "/*.css", "/*.ico", "/*.txt", "/*.json")
                .addResourceLocations("file:" + frontendPath)
                .setCachePeriod(0);

        // Each folder is resolved in full rather than appended to frontendPath: the resolver returns a
        // path with no trailing separator, so concatenating would silently produce "lib/frendassets".
        registry.addResourceHandler("/assets/**")
                .addResourceLocations("file:" + Utils.resolvePathAgainstPortableDir("lib/frend/assets/"))
                .setCachePeriod(0);

        registry.addResourceHandler("/media/**")
                .addResourceLocations("file:" + Utils.resolvePathAgainstPortableDir("lib/frend/media/"))
                .setCachePeriod(0);
    }
}
