export const modalWellKnownTemplate = `<dp-dialog id="modalWellKnownEmailProviders" header="{{
  'COMPONENTS.BUTTON-WELL-KNOWN.WELL-KNOWN-PROVIDERS' | translate }}" [(visible)]="isModalWellKnownVisible"
>

  <div style="max-height: 450px; width: 375px; overflow: auto; cursor: pointer">
    <table class="table table-xs">
      <tbody>
        @for (provider of providers; track $index) {
          <tr (dblclick)="onModalOK()" (click)="onProviderClick(provider)"
            [ngClass]="{'bg-primary/10': provider.active}">
            <td id='{{provider.name}}'>{{provider.name}}
              @if (provider.active) {
                <span>
                  <br>{{provider.settings | json}}</span>
              }
            </td>
          </tr>
        }
      </tbody>
    </table>
  </div>

  <div class="checkbox">
    <label id='btnShowMoreProviders'>
      &nbsp;&nbsp;
      <input type="checkbox" [(ngModel)]="showMoreCheckBoxValue" (ngModelChange)='onShowMore()'>Show
      More
    </label>
  </div>


  <div ngProjectAs="[footer]">
    <button id="btnOKConfirmation" class="btn btn-outline btn-primary" type="button" (click)="onModalOK()"
      [disabled]="!getSelectedProvider()">{{
      'COMPONENTS.BUTTON-WELL-KNOWN.LOAD-SMTP-SETTINGS' | translate }}</button>

    <button id="btnClose" class="btn btn-ghost" type="button" (click)="onModalClose()">{{
      'BUTTONS.CANCEL' | translate }}</button>
  </div>

</dp-dialog>
`;