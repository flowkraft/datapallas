export const modalVariablesTemplate = `<dp-dialog id="modalSelectVariable" header="{{
  'COMPONENTS.BUTTON-VARIABLES.SELECT-VARIABLE' | translate }}" [(visible)]="isModalVariablesVisible"
  [style]="{'width': '600px', 'max-width': '600px'}"
>

  <div style="height: 400px; overflow-y: auto; cursor: pointer">

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
            [ngClass]="{'bg-primary/10': variable.active}">
            <td id='{{variable.name}}'>{{variable.name}}</td>
            <td>{{variable.type}}</td>
          </tr>
        }
      </tbody>
    </table>
  </div>
  <label id="btnShowMoreVariables" class="label cursor-pointer mt-2">
    <input type="checkbox" class="checkbox checkbox-sm"
      [(ngModel)]="showMoreCheckBoxValue" (ngModelChange)="onShowMore()" />
    <span>Show More</span>
  </label>

  <div ngProjectAs="[footer]">
    <button id="btnOKConfirmation" class="btn btn-outline btn-primary dburst-button-question-confirm" type="button" (click)="onModalOK()"
      [disabled]="!getSelectedVariable()">{{
      'BUTTONS.OK' | translate }}</button>

    <button id="btnClose" class="btn" type="button" (click)="onModalClose()">{{
      'BUTTONS.CANCEL' | translate }}</button>
  </div>

</dp-dialog>
`;
