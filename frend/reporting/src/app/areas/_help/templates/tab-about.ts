export const tabAboutTemplate = `<ng-template #tabAboutTemplate>
  <div class="bg-base-200 rounded-box p-4">

    <strong>{{
      'AREAS.HELP.TAB-ABOUT.VERSION' | translate }}</strong>
    <br>
    <br>
    <span class="badge badge-ghost">
      <em>{{settingsService.product}}</em>&nbsp;{{settingsService.version}}
    </span>

    <hr>
    <div [innerHTML]="'AREAS.HELP.TAB-ABOUT.INNER-HTML.LICENSE-2-OPTIONS' | translate"></div>

    <br>
    <br>
    <ol>
      <li>{{
        'AREAS.HELP.TAB-ABOUT.PURCHASE-COMMERCIAL-LICENSE' | translate }}&nbsp;
        <a href="https://www.datapallas.com/store" target="_blank">
          <button class="btn btn-outline btn-primary btn-xs" type="button">{{
            'AREAS.HELP.TAB-ABOUT.BUY-NOW' | translate }}</button>
        </a>
      </li>
      <li>
        Server Side Public License (SSPL) v1.0 Open Source License
      </li>
    </ol>

    <hr>

    <strong id='checkPointHelpAbout'>{{
      'AREAS.HELP.TAB-ABOUT.COPYRIGHT' | translate }}</strong>
    <br>
    <br>
    <a href="https://datapallas.com/contact.html" target="_blank">&#9400; {{
      'AREAS.HELP.TAB-ABOUT.COPYRIGHT-YEARS' | translate }}</a>

    <hr>

    <strong>Third-Party Libraries</strong>
    <br><br>
    <span>
      This software uses <a href="https://github.com/Jaspersoft/jasperreports" target="_blank">JasperReports Library</a>,
      &copy; Cloud Software Group, Inc., licensed under the
      <a href="https://www.gnu.org/licenses/lgpl-3.0.html" target="_blank">GNU Lesser General Public License v3.0 (LGPLv3)</a>.
    </span>

  </div>
</ng-template>
`;
