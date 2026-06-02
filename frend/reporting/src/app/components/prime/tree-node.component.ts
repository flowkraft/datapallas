import {
  Component,
  input,
  output,
  TemplateRef,
  HostBinding,
  ChangeDetectionStrategy,
  signal,
  computed,
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
      <!-- Toggler — inline heroicon SVG (chevron-down when expanded, chevron-right
           when collapsed). The pre-refactor template used PrimeIcons CSS classes
           ('pi pi-chevron-right' / 'pi pi-chevron-down'), but PrimeIcons CSS is no
           longer loaded since the PrimeNG removal — the spans rendered empty and
           the toggle button looked blank. Inline SVG mirrors how every other UI
           element in the codebase emits icons post-refactor. -->
      @if (!isNodeLeaf()) {
        <button
          type="button"
          class="p-tree-node-toggle-button p-link"
          [attr.aria-expanded]="isExpanded()"
          (click)="toggle($event)"
          >
          @if (isExpanded()) {
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="p-tree-node-toggle-icon inline-block w-3 h-3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          } @else {
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="p-tree-node-toggle-icon inline-block w-3 h-3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          }
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
    @if (isExpanded() && node().children && node().children.length) {
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

      /* Node Content Area — daisyUI theme tokens replace the previous
         hardcoded light-gray + emerald palette. Selected/hover states map to
         --color-primary so they follow whichever brand color the active
         theme uses, instead of always rendering green. */
      .p-treenode-content {
        border-radius: 4px;
        padding: 0.25rem 0.5rem;
        display: flex;
        align-items: center;
        outline-color: transparent;
        color: var(--color-base-content);
        gap: 0.5rem;
        transition:
          background 0.2s,
          color 0.2s,
          box-shadow 0.2s;
        cursor: default;
      }
      .p-treenode-selectable {
        cursor: pointer;
      }
      .p-treenode-content:focus-visible {
        box-shadow: 0 0 0 0.2rem color-mix(in oklab, var(--color-primary) 50%, transparent);
        outline: 0 none;
      }
      .p-treenode-selectable:not(.p-highlight):not(.p-treenode-selected):hover {
        background: var(--color-base-200);
        color: var(--color-base-content);
      }
      /* Selection Highlight (non-checkbox) */
      .p-treenode-content.p-highlight {
        background: color-mix(in oklab, var(--color-primary) 18%, var(--color-base-100));
        color: var(--color-primary);
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
        width: 1.5rem;
        height: 1.5rem;
        color: var(--color-base-content);
        opacity: 0.7;
        border: 0 none;
        background: transparent;
        border-radius: 50%;
        transition:
          background 0.2s,
          color 0.2s,
          box-shadow 0.2s,
          opacity 0.2s;
        outline-color: transparent;
        padding: 0;
      }
      .p-tree-node-toggle-button:enabled:hover {
        background: var(--color-base-300);
        color: var(--color-base-content);
        opacity: 1;
      }
      .p-treenode-content.p-highlight .p-tree-node-toggle-button:hover {
        background: color-mix(in oklab, var(--color-primary) 12%, transparent);
        color: var(--color-primary);
      }
      .p-tree-node-toggle-icon {
        font-size: 0.875rem;
      }

      /* Checkbox */
      .p-checkbox {
        display: inline-flex;
        cursor: pointer;
        user-select: none;
        vertical-align: bottom;
        position: relative;
        width: 1.25rem;
        height: 1.25rem;
        margin-right: 0.5rem;
      }
      .p-checkbox-box {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 1.25rem;
        height: 1.25rem;
        border: 1px solid var(--color-base-300);
        border-radius: 4px;
        background: var(--color-base-100);
        transition:
          background-color 0.2s,
          border-color 0.2s,
          box-shadow 0.2s;
      }
      .p-checkbox-box.p-highlight {
        border-color: var(--color-primary);
        background: var(--color-primary);
      }
      .p-checkbox-box.p-indeterminate {
        border-color: var(--color-primary);
        background: var(--color-primary);
      }
      .p-checkbox-box.p-weak-highlight {
        border-color: color-mix(in oklab, var(--color-primary) 50%, var(--color-base-300));
        background: color-mix(in oklab, var(--color-primary) 25%, var(--color-base-100));
      }
      .p-checkbox-icon {
        font-size: 0.875rem;
        color: var(--color-primary-content, #ffffff);
        transition-duration: 0.2s;
        line-height: normal;
      }
      .p-checkbox-box:not(.p-highlight):not(.p-indeterminate):hover {
        border-color: var(--color-primary);
      }

      /* Node Icon */
      .p-treenode-icon {
        color: var(--color-base-content);
        opacity: 0.6;
        margin-right: 0.5rem;
        transition: color 0.2s, opacity 0.2s;
      }
      .p-treenode-selectable:not(.p-highlight):not(.p-treenode-selected):hover
        .p-treenode-icon {
        color: var(--color-base-content);
        opacity: 0.9;
      }
      .p-treenode-content.p-highlight .p-treenode-icon {
        color: var(--color-primary);
        opacity: 1;
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
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TreeNodeComponent {
  node = input.required<TreeNode>();
  // Local override for the expansion state. `node` is a read-only signal input;
  // mutating `node().expanded` does not bump the signal's version, so under
  // OnPush + signal-based CD the bindings that read it never re-evaluate. We
  // hold the override locally and let `isExpanded()` fall back to the input's
  // initial value when no toggle has happened yet. `toggle()` writes to this
  // signal AND keeps `node().expanded` in sync so external callers (parent
  // tree, picklist) reading the node object directly still observe the change.
  private expandedOverride = signal<boolean | null>(null);
  isExpanded = computed<boolean>(() => {
    const override = this.expandedOverride();
    return override !== null ? override : !!this.node().expanded;
  });
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
    const newExpanded = !this.isExpanded();
    this.expandedOverride.set(newExpanded);
    // Keep the node object's `expanded` flag in sync so external readers
    // (parent tree, picklist filter, persisted state) observe the new value.
    this.node().expanded = newExpanded;
    this.nodeToggle.emit({
      originalEvent: event,
      node: this.node(),
      expanded: newExpanded,
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
    if (this.isExpanded() && !this.isNodeLeaf()) {
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
