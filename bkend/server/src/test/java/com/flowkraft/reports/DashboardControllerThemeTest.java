package com.flowkraft.reports;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * A published dashboard opens in the theme the application is on.
 *
 * <p>The owner met the defect as two screenshots of the same product: the application in its dark
 * theme, and the dashboard it had just published in light colours (D10). What the page needs for
 * that not to happen again is one thing - the theme name the application stored, on {@code <html>},
 * where every palette on the page is written against it - so that is what this test holds: the
 * setting is the attribute, for every theme the application offers.
 *
 * <p>The other half is that nothing else can arrive by that route. The value comes from a file on
 * disk, which someone may have edited by hand, and it is written into the page's own markup: a
 * quote and an event handler in it would be markup too. So an odd value is not repaired and not
 * passed on - the page wears the default instead, and no test here needs to reason about what the
 * escaping of a half-broken theme name would produce.
 */
class DashboardControllerThemeTest {

	/** The themes the application offers, as {@code top-menu-header.component.ts} lists them. */
	private static final List<String> ALL_THEMES = List.of(
			"light", "dark", "cupcake", "bumblebee", "emerald", "corporate", "synthwave", "retro",
			"cyberpunk", "valentine", "halloween", "garden", "forest", "aqua", "lofi", "pastel",
			"fantasy", "wireframe", "black", "luxury", "dracula", "cmyk", "autumn", "business",
			"acid", "lemonade", "night", "coffee", "winter", "dim", "nord", "sunset",
			"caramellatte", "abyss", "silk");

	/** The theme the settings hold is the theme the page asks for. Nothing translates, nothing maps. */
	@Test
	void thePageWearsTheThemeTheApplicationStored() {
		for (String theme : ALL_THEMES) {
			assertEquals("<html lang=\"en\" data-theme=\"" + theme + "\">",
					DashboardController.htmlOpenTag(theme),
					"a dashboard published by an application on " + theme + " opens on " + theme);
		}
	}

	/** With nothing stored, the page opens on the same theme the application itself starts on. */
	@Test
	void nothingStoredMeansTheApplicationsOwnDefault() {
		assertEquals("dark", DashboardController.DEFAULT_THEME,
				"DP_DEFAULT_THEME in theme-defaults.ts is what the two sides agree on");
		for (String stored : List.of("", "   ")) {
			assertEquals("<html lang=\"en\" data-theme=\"dark\">", DashboardController.htmlOpenTag(stored),
					"an empty setting is not a theme");
		}
		assertEquals("<html lang=\"en\" data-theme=\"dark\">", DashboardController.htmlOpenTag(null),
				"and neither is a missing one");
	}

	/** A value that is not a theme name never reaches the page. */
	@Test
	void aValueThatIsNotAThemeNameIsRefusedRatherThanWritten() {
		List<String> notThemes = List.of(
				"dark\" onload=\"alert(1)",
				"dark\"><script>alert(1)</script>",
				"dark' onmouseover='x",
				"../../etc/passwd",
				"Dark",
				"dark dim",
				"dark;",
				"a-very-long-name-that-no-theme-of-ours-has-ever-been-called");
		for (String stored : notThemes) {
			String tag = DashboardController.htmlOpenTag(stored);
			assertEquals("<html lang=\"en\" data-theme=\"dark\">", tag,
					"'" + stored + "' is not a theme, so the page wears the default");
			assertFalse(tag.contains("onload"), "and nothing of it is on the page");
			assertFalse(tag.contains("<script"), "and nothing of it is on the page");
		}
	}

	/** The one shape that is allowed is daisyUI's own, dashes and digits included. */
	@Test
	void aThemeNameIsLowerCaseLettersDigitsAndDashes() {
		assertEquals("caramellatte", DashboardController.themeName(" caramellatte "),
				"a setting written with spaces around it is still that theme");
		assertEquals("my-house-theme-2", DashboardController.themeName("my-house-theme-2"),
				"a theme somebody added themselves is a theme too");
		assertTrue(DashboardController.htmlOpenTag("nord").endsWith("data-theme=\"nord\">"),
				"the attribute is the last thing on the tag, so a reader sees it at once");
	}
}
