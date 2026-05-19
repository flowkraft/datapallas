export const tabTerminalTemplate = `<ng-template #tabTerminalTemplate>

  <div class="well" style="height: 600px; overflow-y: scroll;">
    <dburst-terminal></dburst-terminal>
    <div id='bashServiceLog' class="card-body"
      style="color:grey; height:370px; overflow-y: scroll; overflow-x: auto; -webkit-user-select: all; user-select: all;">
      <dburst-log-file-viewer logFileName='bash.service.log'></dburst-log-file-viewer>
    </div>

  </div>

</ng-template>`;
