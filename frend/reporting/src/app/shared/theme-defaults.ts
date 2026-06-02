// ════════════════════════════════════════════════════════════════════════════
// SINGLE SOURCE OF TRUTH for the app's default daisyUI theme.
//
// Change DP_DEFAULT_THEME below to change the app-wide default for users who have
// NOT picked a theme. This is the ONLY place the default lives (in code).
//
// A user's own selection always wins and is persisted two ways:
//   • localStorage 'dp-theme'                       → per-browser
//   • backend XML setting documentburster.settings.theme → cross-device
// The default is applied ONLY when neither holds a choice.
// ════════════════════════════════════════════════════════════════════════════

/** localStorage key holding the user's chosen daisyUI theme. */
export const DP_THEME_KEY = 'dp-theme';

/** Default daisyUI theme applied when the user has made no choice. */
export const DP_DEFAULT_THEME = 'dark';
