import { Component, EventEmitter, Input, Output } from '@angular/core';

import { CommonModule } from '@angular/common';

import { IamGroup, describeGroupLimits } from '../../providers/iam.service';

/**
 * The group checkboxes, used by both the Edit User dialog and the New User dialog.
 *
 * <p>A component rather than a shared template string: the two dialogs pick groups for the same
 * reason and must keep saying the same thing about them, and the Angular compiler evaluates a
 * component's inline template statically, so a template string that took the id prefix as an
 * argument would not compile.
 *
 * <p>`idPrefix` is what the two dialogs disagree on and nothing else: the checkboxes are
 * `userGroup-<id>` when a user is edited and `newUserGroup-<id>` when one is created.
 */
@Component({
  selector: 'dburst-group-picker',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="label"><span class="label-text">Groups</span></div>

    @if (groups.length === 0) {
      <div class="text-xs opacity-60 mb-2">No groups yet. Create them in the Groups tab.</div>
    } @else {
      <div class="max-h-40 overflow-y-auto border border-base-300 rounded p-2 mb-2">
        @for (group of groups; track group.id) {
          <label class="label cursor-pointer justify-start gap-2 py-1">
            <input
              [id]="idPrefix + '-' + group.id"
              type="checkbox"
              class="checkbox checkbox-sm"
              [checked]="selected.includes(group.id)"
              (change)="toggle(group.id)" />
            <span class="label-text">{{ group.name }}</span>
            <span class="text-xs opacity-60">{{ describeLimits(group) }}</span>
          </label>
        }
      </div>
    }
  `,
})
export class GroupPickerComponent {
  @Input() groups: IamGroup[] = [];

  /** The chosen group ids. Replaced, never mutated, so the parent's change detection sees it. */
  @Input() selected: number[] = [];

  @Input() idPrefix = 'userGroup';

  @Output() selectedChange = new EventEmitter<number[]>();

  /** The same sentence the Groups tab shows in its Limits column — one implementation, two places. */
  describeLimits = describeGroupLimits;

  toggle(groupId: number): void {
    this.selectedChange.emit(
      this.selected.includes(groupId)
        ? this.selected.filter((id) => id !== groupId)
        : [...this.selected, groupId],
    );
  }
}
