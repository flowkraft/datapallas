export const terminalTemplate = `
<!-- <ng-template #terminalTemplate> -->
<dp-drawer
  [(visible)]="availableCommandsVisible"
  position="right"
  [style]="{width:'30em'}"
>
  <br /><br /><br /><br /><br />
  <strong
    >{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.MAIN-COMMANDS' |
    translate }}</strong
  >
  <br /><br />
  <ol>
    <li>
      <span
        [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.INNER-HTML.FIND-JAVA-VERSION' | translate"
      ></span
      >: <code class="italic">java --version</code>
      <button type="button" class="btn btn-ghost btn-xs align-middle" title="Copy to clipboard" aria-label="Copy to clipboard" (click)="copyCommand('java --version')"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg></button>
    </li>

    <li>
    <span
      [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.INNER-HTML.INSTALL-JAVA17' | translate"
    ></span
    >: <code class="italic">choco install temurin17 --yes</code>
    <button type="button" class="btn btn-ghost btn-xs align-middle" title="Copy to clipboard" aria-label="Copy to clipboard" (click)="copyCommand('choco install temurin17 --yes')"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg></button>
  </li>
  <li>
    <span
      [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.INNER-HTML.UNINSTALL-JAVA17' | translate"
    ></span
    >: <code class="italic">choco uninstall temurin17 --yes</code>
    <button type="button" class="btn btn-ghost btn-xs align-middle" title="Copy to clipboard" aria-label="Copy to clipboard" (click)="copyCommand('choco uninstall temurin17 --yes')"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg></button>
  </li>

  </ol>
  <br />
  <strong
    >{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.OTHER-COMMANDS' |
    translate }}</strong
  >
  <br /><br />
  <ol>

  <li>
  <span
    [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.INNER-HTML.FIND-CHOCOLATEY-VERSION' | translate"
  ></span
  >: <code class="italic">choco --version</code>
  <button type="button" class="btn btn-ghost btn-xs align-middle" title="Copy to clipboard" aria-label="Copy to clipboard" (click)="copyCommand('choco --version')"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg></button>
</li>
<li>
  <span
    [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.INNER-HTML.INSTALL-CHOCOLATEY' | translate"
  ></span
  >: <code class="italic">install chocolatey</code>
  <button type="button" class="btn btn-ghost btn-xs align-middle" title="Copy to clipboard" aria-label="Copy to clipboard" (click)="copyCommand('install chocolatey')"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg></button>
</li>
<li>
  <span
    [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.INNER-HTML.UNINSTALL-CHOCOLATEY' | translate"
  ></span
  >: <code class="italic">uninstall chocolatey</code>
  <button type="button" class="btn btn-ghost btn-xs align-middle" title="Copy to clipboard" aria-label="Copy to clipboard" (click)="copyCommand('uninstall chocolatey')"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg></button>
</li>
<li>
  <span
    [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.INNER-HTML.INSTALL-JAVA' | translate"
  ></span
  >: <code class="italic">choco install temurin --yes</code>
  <button type="button" class="btn btn-ghost btn-xs align-middle" title="Copy to clipboard" aria-label="Copy to clipboard" (click)="copyCommand('choco install temurin --yes')"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg></button>
</li>
<li>
  <span
    [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.INNER-HTML.UNINSTALL-JAVA' | translate"
  ></span
  >: <code class="italic">choco uninstall temurin --yes</code>
  <button type="button" class="btn btn-ghost btn-xs align-middle" title="Copy to clipboard" aria-label="Copy to clipboard" (click)="copyCommand('choco uninstall temurin --yes')"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg></button>
</li>

  </ol>
</dp-drawer>

<div class="card card-border bg-base-100 shadow-sm" (keydown)="honourReadOnly()">
  <div class="card-body">
    <h5 class="font-semibold mb-2">{{headerLevel}}</h5>
    <dp-terminal #dpTerminal id="p-terminal" prompt="dp> "
      (commandEntered)="onTerminalCommand($event)"
    ></dp-terminal>
  </div>
</div>

<button
  id="btnToggleReadOnly"
  type="button"
  [ngClass]="{'btn': true, 'btn-md': true, 'btn-primary': !readOnly,'btn-ghost': readOnly}"
  (click)="toggleReadOnly()"
>
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3m6.75 7.5h.008v.008H9.75v-.008zm3.75 0h.008v.008H13.5v-.008zm3.75 0h.008v.008h-.008v-.008zm-11.25 3h.008v.008H6v-.008zm3.75 0h.008v.008H9.75v-.008zm3.75 0h.008v.008H13.5v-.008zm3.75 0h.008v.008H17.25v-.008z"/></svg>&nbsp;<em
    >@if (readOnly) {
      <span
        >{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.LET-ME' | translate
        }}</span
      >
    }
    @if (!readOnly) {
      <span
        >{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.IM-DONE' | translate
        }}</span
      >
    }</em
  >
</button>

@if (readOnly) {
  <span
    >&nbsp;&nbsp;(<strong
      >{{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.I-KNOW' | translate
      }}</strong
    >)</span
  >
}
@if (!readOnly) {
  <button
    type="button"
    class="btn btn-link"
    (click)="availableCommandsVisible = true"
  >
    {{'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.VIEW-AVAILABLE-COMMANDS' |
    translate }}
  </button>
}

<!--  </ng-template>-->
`;
