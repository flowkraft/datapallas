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
      >: <code>java --version</code>
    </li>

    <li>
    <span
      [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.INNER-HTML.INSTALL-JAVA17' | translate"
    ></span
    >: <code>choco install temurin17 --yes</code>
  </li>
  <li>
    <span
      [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.INNER-HTML.UNINSTALL-JAVA17' | translate"
    ></span
    >: <code>choco uninstall temurin11 --yes</code>
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
  >: <code>choco --version</code>
</li>
<li>
  <span
    [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.INNER-HTML.INSTALL-CHOCOLATEY' | translate"
  ></span
  >: <code>install chocolatey</code>
</li>
<li>
  <span
    [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.INNER-HTML.UNINSTALL-CHOCOLATEY' | translate"
  ></span
  >: <code>uninstall chocolatey</code>
</li>
<li>
  <span
    [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.INNER-HTML.INSTALL-JAVA' | translate"
  ></span
  >: <code>choco install temurin --yes</code>
</li>
<li>
  <span
    [innerHTML]="'AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.TERMINAL.INNER-HTML.UNINSTALL-JAVA' | translate"
  ></span
  >: <code>choco uninstall temurin --yes</code>
</li>

  </ol>
</dp-drawer>

<div class="card card-bordered bg-base-100 shadow-sm" (keydown)="honourReadOnly()">
  <div class="card-body">
    <h5 class="font-semibold mb-2">{{headerLevel}}</h5>
    <dp-terminal #dpTerminal id="p-terminal" prompt="rb> "
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
