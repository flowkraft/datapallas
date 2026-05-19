import {
  Component,
  input,
  output,
  TemplateRef,
  HostBinding,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { TreeNode } from './tree.component';
import { iconSvg } from '../../shared/icon-svgs';

@Component({
  selector: 'dburst-tree-node',
  standalone: true,
  imports: [CommonModule], // Import itself for recursion if needed, but handled by parent loop here
  template: `
    <div
      class="p-treenode-content {{ node().styleClass || '' }}"
      [style.padding-left]="level() * indentation() + 'rem'"
      [ngClass]="{
        'p-treenode-selectable': selectable() && node().selectable !== false,
        'p-treenode-selected': isSelected() && checkboxMode(),
        'p-highlight': isSelected() && !checkboxMode(),
      }"
      (click)="onNodeClick($event)"
      >
      <!-- Toggler -->
      @if (!isNodeLeaf()) {
        <button
          type="button"
          class="p-tree-node-toggle-button p-link"
          (click)="toggle($event)"
          >
          <span
            class="p-tree-node-toggle-icon pi"
            [ngClass]="node().expanded ? 'pi-chevron-down' : 'pi-chevron-right'"
            >
          </span>
        </button>
      }
      <!-- Placeholder for leaf nodes to maintain alignment -->
      @if (isNodeLeaf()) {
        <span
          class="p-tree-node-toggle-button p-link"
          style="visibility: hidden;"
          >
          <span class="p-tree-node-toggle-icon pi"></span>
        </span>
      }

      <!-- Checkbox -->
      @if (checkboxMode()) {
        <div
          class="p-checkbox p-component"
          (click)="onCheckboxClick($event)"
          >
          <!-- Stop propagation on checkbox click -->
          <div
            class="p-checkbox-box"
            [title]="getCheckboxTooltip()"
          [ngClass]="{
            'p-highlight': isSelected(),
            'p-indeterminate': node().partialSelected,
            'p-weak-highlight': !isSelected() && !node().partialSelected && node().styleClass?.includes('p-weak-selected'),
          }"
            >
            <span
              class="p-checkbox-icon pi"
            [ngClass]="{
              'pi-check': isSelected() || (!node().partialSelected && node().styleClass?.includes('p-weak-selected')),
              'pi-minus': node().partialSelected,
            }"
              >
            </span>
          </div>
        </div>
      }

      <!-- Icon -->
      @if (node().icon || node().expandedIcon || node().collapsedIcon || !isNodeLeaf()) {
        <span
          class="p-treenode-icon"
          [innerHTML]="getIconSvg()"
        ></span>
      }

      <!-- Label -->
      <span class="p-treenode-label">
        @if (!nodeTemplate()) {
          <span>{{ node().label }}</span>
        }
        @if (nodeTemplate()) {
          <ng-container
            [ngTemplateOutlet]="nodeTemplate()"
            [ngTemplateOutletContext]="{ $implicit: node() }"
            >
          </ng-container>
        }
      </span>
    </div>

    <!-- Children -->
    @if (node().expanded && node().children && node().children.length) {
      <ul
        class="p-treenode-children"
        role="group"
        >
        <!-- Use ng-container to avoid adding extra elements -->
        @for (childNode of node().children; track trackByChild($index, childNode)) {
          @if (childNode.visible !== false) {
            <li
              class="p-treenode"
              [ngClass]="{ 'p-treenode-leaf': isChildNodeLeaf(childNode) }"
              role="treeitem"
              >
              <!-- Render child only if visible (for filtering) -->
              <dburst-tree-node
                [node]="childNode"
                [level]="level() + 1"
                [indentation]="indentation()"
                [selectable]="selectable()"
                [checkboxMode]="checkboxMode()"
                [isSelected]="isNodeSelected(childNode)"
                [selection]="selection()"
                [nodeTemplate]="nodeTemplate()"
                [treeId]="treeId()"
                [showTooltips]="showTooltips()"
                (nodeSelect)="onChildNodeSelect($event)"
                (nodeUnselect)="onChildNodeUnselect($event)"
                (nodeToggle)="onChildNodeToggle($event)"
                (nodeWeakClick)="onChildNodeWeakClick($event)"
                >
              </dburst-tree-node>
            </li>
          }
        }
      </ul>
    }
    `,
  styles: [
    `
      :host {
        display: block; /* Ensure the component takes block space */
      }
      /* Node Structure */
      .p-treenode {
        padding: 0;
        outline: 0 none;
        list-style-type: none; /* Remove default list styling */
        margin: 0;
      }
      .p-treenode-children {
        display: flex;
        list-style-type: none;
        flex-direction: column;
        margin: 0;
        padding: 0;
        gap: 0px; /* dt('tree.gap') */
        padding-block-start: 0px; /* dt('tree.gap') */
        /* Indentation is handled by padding-left on content now */
      }

      /* Node Content Area */
      .p-treenode-content {
        border-radius: 4px; /* dt('tree.node.border.radius') */
        padding: 0.25rem 0.5rem; /* dt('tree.node.padding') - Adjusted for tighter fit */
        display: flex;
        align-items: center;
        outline-color: transparent;
        color: #4b5563; /* dt('tree.node.color') */
        gap: 0.5rem; /* dt('tree.node.gap') */
        transition:
          background 0.2s,
          color 0.2s,
          box-shadow 0.2s; /* dt('tree.transition.duration') */
        cursor: default; /* Default cursor */
      }
      .p-treenode-selectable {
        cursor: pointer; /* Pointer cursor only for selectable nodes */
      }
      .p-treenode-content:focus-visible {
        /* Use focus-visible for keyboard nav */
        box-shadow: 0 0 0 0.2rem rgba(16, 185, 129, 0.5); /* dt('tree.node.focus.ring.shadow') - Example focus */
        outline: 0 none; /* dt('tree.node.focus.ring.width') etc. */
      }
      .p-treenode-selectable:not(.p-highlight):not(.p-treenode-selected):hover {
        background: #f3f4f6; /* dt('tree.node.hover.background') */
        color: #374151; /* dt('tree.node.hover.color') */
      }
      /* Selection Highlight (non-checkbox) */
      .p-treenode-content.p-highlight {
        background: #d1fae5; /* dt('tree.node.selected.background') - Lighter green */
        color: #065f46; /* dt('tree.node.selected.color') - Darker green */
      }

      /* Toggler Button */
      .p-tree-node-toggle-button {
        cursor: pointer;
        user-select: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        position: relative;
        flex-shrink: 0;
        width: 1.5rem; /* dt('tree.node.toggle.button.size') */
        height: 1.5rem;
        color: #6b7280; /* dt('tree.node.toggle.button.color') */
        border: 0 none;
        background: transparent;
        border-radius: 50%; /* dt('tree.node.toggle.button.border.radius') */
        transition:
          background 0.2s,
          color 0.2s,
          box-shadow 0.2s;
        outline-color: transparent;
        padding: 0;
      }
      .p-tree-node-toggle-button:enabled:hover {
        background: #e5e7eb; /* dt('tree.node.toggle.button.hover.background') */
        color: #4b5563; /* dt('tree.node.toggle.button.hover.color') */
      }
      .p-treenode-content.p-highlight .p-tree-node-toggle-button:hover {
        background: rgba(
          6,
          95,
          70,
          0.1
        ); /* dt('tree.node.toggle.button.selected.hover.background') */
        color: #065f46; /* dt('tree.node.toggle.button.selected.hover.color') */
      }
      .p-tree-node-toggle-icon {
        font-size: 0.875rem; /* Adjust icon size */
      }

      /* Checkbox */
      .p-checkbox {
        display: inline-flex;
        cursor: pointer;
        user-select: none;
        vertical-align: bottom;
        position: relative;
        width: 1.25rem; /* Checkbox size */
        height: 1.25rem;
        margin-right: 0.5rem; /* Spacing */
      }
      .p-checkbox-box {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 1.25rem;
        height: 1.25rem;
        border: 1px solid #ced4da; /* Checkbox border */
        border-radius: 4px;
        background: #ffffff;
        transition:
          background-color 0.2s,
          border-color 0.2s,
          box-shadow 0.2s;
      }
      .p-checkbox-box.p-highlight {
        border-color: var(--primary-color, #10b981);
        background: var(--primary-color, #10b981);
      }
      .p-checkbox-box.p-indeterminate {
        border-color: var(--primary-color, #10b981);
        background: var(--primary-color, #10b981);
      }
      .p-checkbox-box.p-weak-highlight {
        border-color: #93c5fd;
        background: #bfdbfe;
      }
      .p-checkbox-icon {
        font-size: 0.875rem; /* Icon size */
        color: #ffffff; /* Icon color when selected */
        transition-duration: 0.2s;
        line-height: normal; /* Ensure icon aligns well */
      }
      .p-checkbox-box:not(.p-highlight):not(.p-indeterminate):hover {
        border-color: var(--primary-color, #10b981); /* Hover border */
      }

      /* Node Icon */
      .p-treenode-icon {
        color: #6b7280; /* dt('tree.node.icon.color') */
        margin-right: 0.5rem; /* Spacing */
        transition: color 0.2s;
      }
      .p-treenode-selectable:not(.p-highlight):not(.p-treenode-selected):hover
        .p-treenode-icon {
        color: #4b5563; /* dt('tree.node.icon.hover.color') */
      }
      .p-treenode-content.p-highlight .p-treenode-icon {
        color: #065f46; /* dt('tree.node.icon.selected.color') */
      }

      /* Node Label */
      .p-treenode-label {
        flex-grow: 1; /* Allow label to take remaining space */
        overflow: hidden; /* Prevent long labels from breaking layout */
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush, // Use OnPush for performance with immutable data
})
export class TreeNodeComponent {
  node = input.required<TreeNode>();
  level = input<number>(0);
  indentation = input<number>(1.5);
  selectable = input<boolean>(false);
  checkboxMode = input<boolean>(false);
  isSelected = input<boolean>(false);
  nodeTemplate = input<TemplateRef<any> | undefined>(undefined);
  treeId = input<string>('');
  // When false, suppresses ALL checkbox tooltips. Used by the picklist to
  // disable tooltips on the source tree (only the target tree shows the
  // name-only hint).
  showTooltips = input<boolean>(true);

  nodeSelect = output<{
    originalEvent: Event;
    node: TreeNode;
  }>();
  nodeUnselect = output<{
    originalEvent: Event;
    node: TreeNode;
  }>(); // Keep for consistency, handled by parent
  nodeToggle = output<{
    originalEvent: Event;
    node: TreeNode;
    expanded: boolean;
  }>();
  // Emitted when the user clicks the checkbox of a node currently in the
  // "weak-highlight" (light blue) state — meaning the picklist had marked it
  // as name-only-selected via the `p-weak-selected` style class. The picklist
  // listens for this and fully removes the table from target. We do NOT also
  // emit nodeSelect for this click, so the regular toggle path (which would
  // flip the table back to green) is bypassed entirely. The result is a clean
  // 3-state cycle: green → light blue → empty → green.
  nodeWeakClick = output<{
    originalEvent: Event;
    node: TreeNode;
  }>();

  @HostBinding('attr.id') get nodeId() {
    return this.node()?.key ? `treeNode${this.node().key.toLowerCase()}${this.treeId()}` : null;
  }

  // Bind leaf class to host for potential external styling
  @HostBinding('class.p-treenode-leaf') get isLeafClass() {
    return this.isNodeLeaf();
  }

  // Basic trackBy for children loop
  trackByChild = (index: number, node: TreeNode) => node.key || node;

  onNodeClick(event: MouseEvent) {
    // Prevent selection logic when clicking on toggler or checkbox directly
    const target = event.target as HTMLElement;
    if (
      target.closest('.p-tree-node-toggle-button') ||
      target.closest('.p-checkbox')
    ) {
      return;
    }

    // Emit select/unselect event to the parent tree component
    if (this.selectable() && this.node().selectable !== false) {
      // Parent component handles the actual selection logic based on mode
      this.nodeSelect.emit({ originalEvent: event, node: this.node() });
    }
  }

  onCheckboxClick(event: MouseEvent) {
    event.stopPropagation(); // Prevent node click when clicking checkbox
    if (!(this.selectable() && this.node().selectable !== false)) return;

    // Special case: clicking a checkbox that is currently in the
    // "weak-highlight" (name-only) state. Bypass the regular nodeSelect
    // path so we don't flip the table back to green; instead emit a
    // dedicated nodeWeakClick event which the picklist handles by fully
    // removing the table from target (= empty).
    const isCurrentlyWeak =
      !this.isSelected() &&
      !this.node().partialSelected &&
      !!this.node().styleClass?.includes('p-weak-selected');
    if (isCurrentlyWeak) {
      this.nodeWeakClick.emit({ originalEvent: event, node: this.node() });
      return;
    }

    // Default path — emit the regular nodeSelect event.
    this.nodeSelect.emit({ originalEvent: event, node: this.node() });
  }

  toggle(event: Event) {
    event.stopPropagation(); // Prevent node click event
    this.node().expanded = !this.node().expanded;
    this.nodeToggle.emit({
      originalEvent: event,
      node: this.node(),
      expanded: this.node().expanded,
    });
  }

  // Returns the tooltip text for the checkbox box. Tooltips are only shown
  // when the parent tree opted in (`showTooltips=true`). Currently the
  // picklist only enables tooltips on the target tree, and only for the
  // "weak-highlight" (light blue / name-only) state — to surface the
  // existence of the name-only feature without cluttering every checkbox
  // with explanatory text.
  getCheckboxTooltip(): string {
    if (!this.showTooltips()) return '';
    const isWeak =
      !this.isSelected() &&
      !this.node()?.partialSelected &&
      !!this.node()?.styleClass?.includes('p-weak-selected');
    return isWeak ? 'Send to AI only the table name' : '';
  }

  isNodeLeaf(): boolean {
    return this.node().leaf === false
      ? false
      : !(this.node().children && this.node().children.length > 0);
  }

  isChildNodeLeaf(node: TreeNode): boolean {
    return node.leaf === false
      ? false
      : !(node.children && node.children.length > 0);
  }

  getIconSvg(): string {
    if (this.node().icon) return iconSvg(this.node().icon!);
    if (this.node().expanded && !this.isNodeLeaf()) {
      return this.node().expandedIcon ? iconSvg(this.node().expandedIcon!) : iconSvg('folder-open');
    }
    return this.node().collapsedIcon ? iconSvg(this.node().collapsedIcon!) : iconSvg('folder');
  }

  selection = input<TreeNode[]>([]);

  isNodeSelected(node: TreeNode): boolean {
    if (!this.selection() || this.selection().length === 0) return false;
    return this.selection().some((n) => n.key === node.key);
  }

  // --- Event Bubbling ---
  // Re-emit events from child nodes up to the main tree component

  onChildNodeSelect(event: { originalEvent: Event; node: TreeNode }) {
    this.nodeSelect.emit(event);
  }

  onChildNodeUnselect(event: { originalEvent: Event; node: TreeNode }) {
    this.nodeUnselect.emit(event);
  }

  onChildNodeToggle(event: {
    originalEvent: Event;
    node: TreeNode;
    expanded: boolean;
  }) {
    this.nodeToggle.emit(event);
  }

  onChildNodeWeakClick(event: { originalEvent: Event; node: TreeNode }) {
    this.nodeWeakClick.emit(event);
  }
}
