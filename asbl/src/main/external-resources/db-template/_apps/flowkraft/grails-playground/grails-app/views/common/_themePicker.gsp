<%-- Shared 35-theme daisyUI picker. Include with: <g:render template="/common/themePicker"/> --%>
<div class="dropdown dropdown-end" id="daisyThemePicker">
  <button id="btnChangeSkin" tabindex="0" type="button" class="btn btn-square btn-ghost" aria-label="Theme">
    <div id="themeSwatchTrigger"
         style="display:inline-grid;grid-template-columns:4px 4px;grid-template-rows:4px 4px;gap:2px;padding:2px;border-radius:3px;border:1px solid rgba(128,128,128,0.2);background-color:var(--color-base-100);flex-shrink:0">
      <div style="background-color:var(--color-base-content);border-radius:50%"></div>
      <div style="background-color:var(--color-primary);border-radius:50%"></div>
      <div style="background-color:var(--color-secondary);border-radius:50%"></div>
      <div style="background-color:var(--color-accent);border-radius:50%"></div>
    </div>
  </button>
  <ul tabindex="0" id="daisyThemePickerList"
      class="dropdown-content menu bg-base-300 rounded-box max-h-96 overflow-y-auto w-52 p-2 shadow z-[1031]">
    <g:each in="${['light','dark','cupcake','bumblebee','emerald','corporate','synthwave','retro','cyberpunk','valentine','halloween','garden','forest','aqua','lofi','pastel','fantasy','wireframe','black','luxury','dracula','cmyk','autumn','business','acid','lemonade','night','coffee','winter','dim','nord','sunset','caramellatte','abyss','silk']}" var="t">
    <li>
      <button type="button" id="theme-${t}" onclick="setTheme('${t}')" class="gap-3 px-2 cursor-pointer flex items-center w-full">
        <div data-theme="${t}"
             style="display:inline-grid;grid-template-columns:4px 4px;grid-template-rows:4px 4px;gap:2px;padding:2px;border-radius:3px;border:1px solid rgba(128,128,128,0.2);background-color:var(--color-base-100);flex-shrink:0;vertical-align:middle">
          <div style="background-color:var(--color-base-content);border-radius:50%"></div>
          <div style="background-color:var(--color-primary);border-radius:50%"></div>
          <div style="background-color:var(--color-secondary);border-radius:50%"></div>
          <div style="background-color:var(--color-accent);border-radius:50%"></div>
        </div>
        <div class="w-32 truncate capitalize">${t}</div>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
             class="h-3 w-3 shrink-0 theme-checkmark" data-theme-name="${t}">
          <path d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z"/>
        </svg>
      </button>
    </li>
    </g:each>
  </ul>
</div>
