export const modalVariablesTemplate = `<dp-dialog id="modalSelectVariable" header="{{
  'COMPONENTS.BUTTON-VARIABLES.SELECT-VARIABLE' | translate }}" [(visible)]="isModalVariablesVisible"
>

  <div style="max-height: 549px; overflow: auto; cursor: pointer">

    <table class="table table-xs">
      <thead>
        <tr>
          <th>{{
              'COMPONENTS.BUTTON-VARIABLES.NAME' | translate }}</th>
          <th>{{
              'COMPONENTS.BUTTON-VARIABLES.TYPE' | translate }}</th>
        </tr>
      </thead>
      <tbody>
        @for (variable of variables; track $index) {
          <tr (dblclick)="onModalOK()" (click)="onVariableClick(variable)"
            [ngClass]="{ 'info': variable.active }">
            <td id='{{variable.name}}'>{{variable.name}}</td>
            <td>{{variable.type}}</td>
          </tr>
        }
      </tbody>
    </table>
  </div>
  <div class="checkbox">
    <label id='btnShowMoreVariables'>
      &nbsp;&nbsp;
      <input type="checkbox" [(ngModel)]="showMoreCheckBoxValue" (ngModelChange)='onShowMore()'>Show
      More
    </label>
  </div>

  <div ngProjectAs="[footer]">
    <button id="btnOKConfirmation" class="btn btn-primary dburst-button-question-confirm" type="button" (click)="onModalOK()"
      [disabled]="!getSelectedVariable()">{{
      'BUTTONS.OK' | translate }}</button>

    <button id="btnClose" class="btn" type="button" (click)="onModalClose()">{{
      'BUTTONS.CANCEL' | translate }}</button>
  </div>

</dp-dialog>
`;
