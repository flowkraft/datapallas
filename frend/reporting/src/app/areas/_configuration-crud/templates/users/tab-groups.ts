export const tabGroupsTemplate = `
<div class="p-2">

  <div class="flex items-center gap-2 mb-3">
    <button id="btnNewGroup" type="button" class="btn btn-outline btn-primary btn-sm"
            (click)="openNewGroup()">
      New Group
    </button>
    <span class="text-sm opacity-70">{{ groups.length }} group(s)</span>
  </div>

  @if (groupsLoadError) {
    <div id="groupsLoadError" role="alert" class="alert alert-error mb-3">
      <span>{{ groupsLoadError }}</span>
    </div>
  }

  <table id="tableGroups" class="table table-zebra w-full">
    <thead>
      <tr>
        <th>Name</th>
        <th>Limits</th>
        <th>Members</th>
        <th class="text-right">Actions</th>
      </tr>
    </thead>
    <tbody>
      @for (group of groups; track group.id) {
        <tr [id]="'group-' + group.id">
          <td class="font-medium">{{ group.name }}</td>
          <td class="text-sm">{{ describeLimits(group) }}</td>
          <td class="text-sm">{{ group.members.length }}</td>
          <td class="text-right">
            <button [id]="'btnEditGroup-' + group.id" type="button"
                    class="btn btn-ghost btn-xs" (click)="openEditGroup(group)">
              Edit
            </button>
            <button [id]="'btnDeleteGroup-' + group.id" type="button"
                    class="btn btn-ghost btn-xs text-error" (click)="deleteGroup(group)">
              Delete
            </button>
          </td>
        </tr>
      } @empty {
        <tr>
          <td colspan="4" class="text-center opacity-60">No groups yet.</td>
        </tr>
      }
    </tbody>
  </table>

  <!-- The one sentence that stops an administrator reading groups as permissions. -->
  <div class="mt-3 text-xs opacity-70">
    A member gets everything any of their groups allows. Anyone in no limiting group is not
    limited, and administrators never are. A report whose datasource needs a connection the member
    may not use is not listed to them and does not run for them — except a dashboard this group
    grants below, which opens whatever it reads.
  </div>

</div>

<!-- New / Edit group -->
<dp-dialog id="groupDialog" [header]="groupDialogHeader" [(visible)]="groupVisible"
           [style]="{ width: '560px' }">

  @if (groupError) {
    <div id="groupErrorMessage" role="alert" class="alert alert-error mb-3">
      <span>{{ groupError }}</span>
    </div>
  }

  <label class="form-control w-full mb-2">
    <div class="label"><span class="label-text">Name</span></div>
    <input id="groupName" class="input input-bordered w-full" [(ngModel)]="groupForm.name" />
  </label>

  <label class="label cursor-pointer justify-start gap-2">
    <input id="groupLimitsEnabled" type="checkbox" class="checkbox checkbox-sm"
           [(ngModel)]="groupForm.limitsEnabled" />
    <span class="label-text">Limit the members of this group</span>
  </label>

  @if (groupForm.limitsEnabled) {
    <div class="ml-6 mt-2">

      <div class="label"><span class="label-text">Connections</span></div>

      <label class="label cursor-pointer justify-start gap-2 py-1">
        <input id="groupConnectionsAll" type="radio" class="radio radio-sm"
               [checked]="!groupForm.onlyTheseConnections"
               (change)="groupForm.onlyTheseConnections = false" />
        <span class="label-text">All connections</span>
      </label>

      <label class="label cursor-pointer justify-start gap-2 py-1">
        <input id="groupConnectionsSome" type="radio" class="radio radio-sm"
               [checked]="groupForm.onlyTheseConnections"
               (change)="groupForm.onlyTheseConnections = true" />
        <span class="label-text">Only these</span>
      </label>

      @if (groupForm.onlyTheseConnections) {
        <div class="ml-6 max-h-40 overflow-y-auto border border-base-300 rounded p-2">
          @for (connection of groupConnectionChoices; track connection.code) {
            <label class="label cursor-pointer justify-start gap-2 py-1">
              <input [id]="'groupConnection-' + connection.code" type="checkbox"
                     class="checkbox checkbox-sm"
                     [checked]="groupForm.connections.includes(connection.code)"
                     (change)="toggleGroupConnection(connection.code)" />
              <span class="label-text">{{ connection.name }}</span>
              <!-- A connection that was deleted after the group was saved. Shown rather than
                   dropped, so unticking it is a decision and not a side effect of opening the
                   dialog. -->
              @if (connection.missing) {
                <span class="text-xs text-warning">(missing)</span>
              }
            </label>
          } @empty {
            <div class="text-xs opacity-60">No database connections yet.</div>
          }
        </div>
      }

      <label class="label cursor-pointer justify-start gap-2 mt-2">
        <input id="groupScripts" type="checkbox" class="checkbox checkbox-sm"
               [(ngModel)]="groupForm.scripts" />
        <span class="label-text">May run scripts (Groovy, Jasper templates, script-mode widgets)</span>
      </label>

      <!-- Said here, where the choice is made: a connection list is not a boundary while the same
           author can reach any database from a script. -->
      @if (groupForm.onlyTheseConnections && groupForm.scripts) {
        <div id="groupScriptsNote" class="text-xs text-warning mt-1">
          Connection limits only hold when 'May run scripts' is off. A user who can run scripts can
          reach any database through them.
        </div>
      }

    </div>
  }

  <!-- Reports: what the members of this group may see and run. Outside the limits block above
       because it is a different question — that one is "which databases", this one is "which
       reports" — and because it applies to every member, not only to the roles that author SQL. -->
  <div class="mt-3">
    <div class="label"><span class="label-text">Reports this group can see</span></div>

    <div class="max-h-40 overflow-y-auto border border-base-300 rounded p-2">
      @for (report of groupReportChoices; track report.id) {
        <label class="label cursor-pointer justify-start gap-2 py-1">
          <input [id]="'groupReport-' + report.id" type="checkbox" class="checkbox checkbox-sm"
                 [checked]="isGroupReportGranted(report.id)"
                 (change)="toggleGroupReport(report.id)" />
          <span class="label-text">{{ report.name }}</span>
          <!-- A report deleted after the group was saved: the grant is kept until it is unticked
               here, and grants nothing in the meantime. -->
          @if (report.missing) {
            <span class="text-xs text-warning">(missing)</span>
          }
        </label>
      } @empty {
        <div class="text-xs opacity-60">No reports yet.</div>
      }
    </div>

    <div id="groupReportsNote" class="text-xs opacity-70 mt-1">
      Tick nothing to leave the members of this group with every report. Ticking any report limits
      them to what their groups tick — and a report whose database connection they may not use stays
      out of reach either way.
    </div>
  </div>

  <!-- Dashboards: what the dashboard viewers of this group may open in the AI Hub. A granted
       dashboard is also the one carve-out from the limits above — it opens whatever connection it
       reads, because an administrator ticked it by hand — so it sits outside that block and is
       offered whether or not the group limits anybody. -->
  <div class="mt-3">
    <div class="flex items-center justify-between">
      <div class="label"><span class="label-text">Dashboards this group can see</span></div>
      <div class="label"><span class="label-text text-xs opacity-70">Default</span></div>
    </div>

    <div class="max-h-40 overflow-y-auto border border-base-300 rounded p-2">
      @for (dashboard of groupDashboardChoices; track dashboard.id) {
        <div class="flex items-center justify-between py-1">
          <label class="label cursor-pointer justify-start gap-2 py-0">
            <input [id]="'groupDashboard-' + dashboard.id" type="checkbox" class="checkbox checkbox-sm"
                   [checked]="isGroupDashboardGranted(dashboard.id)"
                   (change)="toggleGroupDashboard(dashboard.id)" />
            <span class="label-text">{{ dashboard.name }}</span>
            <!-- A dashboard that was deleted after the group was saved: the grant is kept until it
                 is unticked here, and ignored everywhere else. -->
            @if (dashboard.missing) {
              <span class="text-xs text-warning">(missing)</span>
            }
          </label>
          <input [id]="'groupDefaultDashboard-' + dashboard.id" type="radio" class="radio radio-sm"
                 name="groupDefaultDashboard"
                 [checked]="groupForm.defaultDashboard === dashboard.id"
                 (change)="setGroupDefaultDashboard(dashboard.id)" />
        </div>
      } @empty {
        <div class="text-xs opacity-60">No dashboards have been published yet.</div>
      }
    </div>

    <div id="groupDashboardsNote" class="text-xs opacity-70 mt-1">
      Dashboard viewers in this group open these, and land on the default. Other roles are
      unaffected.
    </div>
  </div>

  <div class="mt-3">
    <div class="label"><span class="label-text">Members</span></div>
    <!-- Read-only on purpose: membership is edited on the user, in one place only. -->
    <div id="groupMembers" class="text-sm opacity-70">
      {{ groupMembers.length ? groupMembers.join(', ') : 'No members yet' }}
      <span class="text-xs opacity-60">(edited on each user, in the Users tab)</span>
    </div>
  </div>

  <div ngProjectAs="[footer]">
    <button id="btnSaveGroup" type="button" class="btn btn-outline btn-primary"
            [disabled]="!groupForm.name" (click)="saveGroup()">
      Save
    </button>
    <button id="btnCancelGroup" type="button" class="btn btn-outline" (click)="groupVisible = false">
      Cancel
    </button>
  </div>
</dp-dialog>
`;
