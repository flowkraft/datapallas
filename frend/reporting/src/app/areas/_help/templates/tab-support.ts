export const tabSupportTemplate = `<ng-template #tabSupportTemplate>
  <div class="space-y-4">

    <strong><em>DataPallas</em> {{'AREAS.HELP.TAB-SUPPORT.DB-SUPPORT' | translate }}</strong>
    <br>
    <a href="mailto:support&#64;datapallas.com" target="_blank">
      <h3>support&#64;datapallas.com</h3>
    </a>

    <br>
    <strong style="text-decoration: underline;">
      {{'AREAS.HELP.TAB-SUPPORT.SEND-LOG-FILES-SHORT' | translate }}
    </strong>

    <br>
    <br><span [innerHTML]="'AREAS.HELP.TAB-SUPPORT.INNER-HTML.SEND-LOG-FILES-LONG' | translate"></span>
    <br>
    <br>
    <!--
        
    <dburst-button-native-system-dialog value="{{
      'COMPONENTS.LOG-FILES-VIEWER-ALL-TOGETHER.VIEW-LOG-FILES' | translate }}" dialogType="file">
    </dburst-button-native-system-dialog>
    -->
    <br>
    <h3>{{'AREAS.HELP.TAB-SUPPORT.HOW-IT-WORKS' | translate }}</h3>
    <br>
    <em>"I also had a great help from the Support Team of DocumentBurster, who stayed with me the entire installation
      and
      Test
      process."
    </em>
    <br>
    <br>
    <strong>Marylou G. - Chief Financial Officer</strong>
    <br>
    <a id='checkPointHelpSupport' href="http://parktrent.com.au" target="_blank">ParkTrent Properties Group,
      Australia</a>

  </div>
</ng-template>
`;
