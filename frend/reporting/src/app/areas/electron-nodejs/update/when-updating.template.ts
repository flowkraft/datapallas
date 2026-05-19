export const whenUpdatingTemplate = `<div style="display:grid;grid-template-columns:repeat(12,1fr);gap:1rem">
  <div style="grid-column:span 9">
    <h5>
      <strong
        >{{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.WHEN-UPDATING" |
        translate }}</strong
      >
    </h5>
    <br />
    <input
      type="checkbox"
      id="btnCopyLicensingInformation"
      [(ngModel)]="updateInfo().updateOptions.copylicensinginformation"
    />
    <label for="btnCopyLicensingInformation" class="checkboxlabel"
      >{{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.FOLLOWING8" |
      translate }}@if (ctx() != 'updatenow' && updateInfo().updateOptions.copylicensinginformation) {
        <span
          >&nbsp;(<strong
            >{{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.SURE" |
            translate }}</strong
          >)</span
        >
      }
    </label>
    <br />
    <input
      type="checkbox"
      id="btnCopyOutputFiles"
      [(ngModel)]="updateInfo().updateOptions.copyoutputfiles"
    />
    <label for="btnCopyOutputFiles" class="checkboxlabel"
      >{{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.FOLLOWING9" |
      translate }}
    </label>
    <br />
    <input
      type="checkbox"
      id="btnCopyLogFiles"
      [(ngModel)]="updateInfo().updateOptions.copylogfiles"
    />
    <label for="btnCopyLogFiles" class="checkboxlabel"
      >{{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.FOLLOWING10" |
      translate }}
    </label>
    <br />
    <input
      type="checkbox"
      id="btnCopyQuarantineFiles"
      [(ngModel)]="updateInfo().updateOptions.copyquarantinefiles"
    />
    <label for="btnCopyQuarantineFiles" class="checkboxlabel"
      >{{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.FOLLOWING11" |
      translate }}
    </label>
    <br />
    <input
      type="checkbox"
      id="btnCopyBackupFiles"
      [(ngModel)]="updateInfo().updateOptions.copybackupfiles"
    />
    <label for="btnCopyBackupFiles" class="checkboxlabel"
      >{{ "AREAS.INSTALL-SETUP-UPGRADE.COMPONENTS.UPDATE-NOW.FOLLOWING12" |
      translate }}
    </label>
  </div>
</div>
`;
