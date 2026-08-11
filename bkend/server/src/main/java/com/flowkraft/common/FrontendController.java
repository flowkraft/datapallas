package com.flowkraft.common;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Hands the root URL to the Angular application.
 *
 * <p>A resource handler alone cannot do this: asked for {@code /} it resolves an empty path against
 * the directory and finds nothing, which is why the root answered an error while every hashed asset
 * beside it served correctly. Forwarding names the file explicitly and lets the same handler serve
 * it.
 *
 * <p>Nothing else needs a fallback. The app routes with a hash, so a deep link such as
 * {@code /#/configuration-crud/reports} still arrives here as a plain request for {@code /}.
 */
@Controller
public class FrontendController {

	@GetMapping("/")
	public String index() {
		return "forward:/index.html";
	}
}
