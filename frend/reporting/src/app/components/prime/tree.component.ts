import {
  Component,
  input,
  model,
  output,
  TemplateRef,
  viewChild,
  ElementRef,
  OnInit,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TreeNodeComponent } from './tree-node.component'; // Import the node component

// Define TreeNode interface (can be in its own file)
export interface TreeNode {
  key?: string;
  label: string;
  data?: any;
  icon?: string;
  expandedIcon?: string;
  collapsedIcon?: string;
  children?: TreeNode[];
  expanded?: boolean;
  type?: string;
  parent?: TreeNode;
  partialSelected?: boolean;
  styleClass?: string;
  draggable?: boolean;
  droppable?: boolean;
  selectable?: boolean;
  leaf?: boolean;
  style?: string;
  visible?: boolean; // Added for filtering
  // Used by the picklist's `flattenGroupNodes` mode. When set, the node is
  // treated as a "leaf" that, when moved back from target to source, is
  // re-grouped under a parent node identified by `originalParentKey`. The
  // picklist creates the parent group on demand if it no longer exists in
  // the source.
  originalParentKey?: string;
  originalParentLabel?: string;
}

@Component({
  selector: 'dburst-tree',
  standalone: true,
  imports: [CommonModule, FormsModule, TreeNodeComponent], // Import CustomTreeNodeComponent here
  template: `
    <div
      id="{{ treeId() }}"
      class="p-tree p-component"
      [ngClass]="{
        'p-tree-selectable': !!selectionMode(),
        'p-tree-loading': loading(),
      }"
      >
      @if (loading() && loadingMode() === 'mask') {
        <div
          class="p-tree-mask p-overlay-mask"
          >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="p-tree-loading-icon inline-block w-4 h-4 animate-spin"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
        </div>
      }

      @if (filter()) {
        <div class="p-tree-filter-container">
          <input
            #filterInput
            id="filterInput{{ treeId() }}"
            type="text"
            class="p-tree-filter p-inputtext p-component"
            [attr.placeholder]="filterPlaceholder() || 'Filter'"
            (input)="onFilterKeyup($event)"
            />
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="p-tree-filter-icon inline-block w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z"/></svg>
          </div>
        }

        <div class="p-tree-wrapper" [style.max-height]="scrollHeight()">
          <ul class="p-tree-container p-tree-root-children" role="tree">
            @for (node of visibleNodes; track trackBy($index, node)) {
              <dburst-tree-node
                [node]="node"
                [level]="0"
                [indentation]="indentation()"
                [selectable]="isSelectable()"
                [checkboxMode]="selectionMode() === 'checkbox'"
                [isSelected]="isSelected(node)"
                [selection]="selection()"
                [treeId]="treeId()"
                [showTooltips]="showTooltips()"
            [nodeTemplate]="
              nodeTemplate() || _templateMap()?.[node.type || 'default']
            "
                (nodeSelect)="handleNodeSelect($event)"
                (nodeUnselect)="handleNodeUnselect($event)"
                (nodeToggle)="handleNodeToggle($event)"
                (nodeWeakClick)="nodeWeakClick.emit($event)"
                >
              </dburst-tree-node>
            }
          </ul>
          @if (isEmpty()) {
            <div class="p-tree-empty-message">
              {{ emptyMessage() || 'No records found' }}
            </div>
          }
        </div>
      </div>
    `,
  styles: [
    `
      :host {
        display: block;
      }
      /* Base Tree Styles */
      .p-tree {
        background: #ffffff; /* dt('tree.background') */
        color: #4b5563; /* dt('tree.color') */
        padding: 0.5rem; /* dt('tree.padding') */
        border: 1px solid #dee2e6; /* Example border */
        border-radius: 6px; /* Example border-radius */
        position: relative; /* Needed for mask */
        overflow: hidden; /* Contain elements */
      }
      .p-tree-wrapper {
        overflow: auto; /* Enable scrolling if needed */
      }
      .p-tree-container.p-tree-root-children {
        display: flex;
        list-style-type: none;
        flex-direction: column;
        margin: 0;
        padding: 0;
        gap: 0px; /* dt('tree.gap') - Adjust as needed */
        padding-block-start: 0px; /* dt('tree.gap') */
      }

      /* Filter Styles */
      .p-tree-filter-container {
        position: relative;
        margin-bottom: 0.5rem; /* Spacing */
      }
      .p-tree-filter {
        width: 100%;
        padding: 0.5rem 0.75rem; /* Basic input padding */
        padding-right: 2.5rem; /* Space for icon */
        border: 1px solid #ced4da;
        border-radius: 6px;
        box-sizing: border-box; /* Include padding and border in width */
      }
      .p-tree-filter-icon {
        position: absolute;
        top: 50%;
        right: 0.75rem;
        transform: translateY(-50%);
        color: #6c757d;
      }

      /* Loading Mask Styles */
      .p-tree-mask {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.4); /* Semi-transparent white */
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10; /* Ensure it's above content */
      }
      .p-tree-loading-icon {
        font-size: 2rem; /* dt('tree.loading.icon.size') */
        width: 2rem;
        height: 2rem;
        color: var(
          --primary-color,
          #10b981
        ); /* Use primary color if available */
      }
      /* Add pi-spin animation if not globally available */
      @keyframes pi-spin {
        100% {
          transform: rotate(360deg);
        }
      }
      .pi-spin {
        animation: pi-spin 1s linear infinite;
      }

      /* Empty Message Styles */
      .p-tree-empty-message {
        padding: 1rem;
        text-align: center;
        color: #6c757d;
      }
    `,
  ],
})
export class TreeComponent implements OnInit, OnChanges {
  treeId = input<string | undefined>(undefined);

  value = input<TreeNode[]>([]);
  selectionMode = input<'single' | 'multiple' | 'checkbox' | null>(null);
  selection = model<any>(null);
  filter = input<boolean>(false);
  filterBy = input<string>('label');
  filterPlaceholder = input<string | undefined>(undefined);
  filterMode = input<'lenient' | 'strict'>('lenient');
  loading = input<boolean>(false);
  loadingMode = input<'mask' | 'icon'>('mask'); // 'icon' mode not fully implemented here
  loadingIcon = input<string>('');
  emptyMessage = input<string | undefined>(undefined);
  scrollHeight = input<string | undefined>(undefined);
  indentation = input<number>(1.5); // Default indentation in rem
  propagateSelectionUp = input<boolean>(true);
  propagateSelectionDown = input<boolean>(true);
  // When false, suppresses ALL checkbox tooltips on this tree.
  showTooltips = input<boolean>(true);
  metaKeySelection = input<boolean>(false); // For multiple selection
  nodeTemplate = input<TemplateRef<any> | undefined>(undefined); // Specific template for all nodes
  _templateMap = input<{ [key: string]: TemplateRef<any> } | undefined>(undefined); // For typed nodes

  selectionChange = output<any>();
  nodeSelect = output<{
    originalEvent: Event;
    node: TreeNode;
  }>();
  nodeUnselect = output<{
    originalEvent: Event;
    node: TreeNode;
  }>();
  nodeExpand = output<{
    originalEvent: Event;
    node: TreeNode;
  }>();
  nodeCollapse = output<{
    originalEvent: Event;
    node: TreeNode;
  }>();
  // Emitted when the user clicks the checkbox of a "weak-highlight"
  // (light blue) node. Forwarded verbatim from the tree-node component;
  // the picklist handles it by removing the table from target.
  nodeWeakClick = output<{
    originalEvent: Event;
    node: TreeNode;
  }>();
  onFilter = output<{
    filter: string;
    filteredValue: TreeNode[] | null;
  }>();

  filterInputViewChild = viewChild<ElementRef<HTMLInputElement>>('filterInput');

  visibleNodes: TreeNode[] = [];
  _filteredNodes: TreeNode[] | null = null;
  _filterValue: string = '';
  nodeTouched: boolean = false; // For metaKeySelection on touch devices

  // Basic trackBy function
  trackBy = (index: number, node: TreeNode) => node.key || node;

  ngOnInit() {
    this.updateVisibleNodes();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['value']) {
      this.updateVisibleNodes();
      if (this.hasFilterActive()) {
        this._filter(this._filterValue); // Re-apply filter if value changes
      }
    }
    if (changes['selectionMode'] || changes['selection']) {
      // Potentially update partial selection states if needed
    }
  }

  updateVisibleNodes() {
    this.visibleNodes = this._filteredNodes ?? this.value() ?? [];
    // Initialize parent references and potentially other properties
    this.initializeNodes(null, this.value());
  }

  initializeNodes(parent: TreeNode | null, nodes: TreeNode[] | undefined) {
    if (!nodes) return;
    for (const node of nodes) {
      node.parent = parent ?? undefined; // Set parent reference
      if (node.children) {
        this.initializeNodes(node, node.children);
      }
    }
  }

  onFilterKeyup(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this._filterValue = value;
    this._filter(value);
  }

  _filter(value: string) {
    const filterValue = value.trim();
    if (filterValue === '') {
      this._filteredNodes = null;
    } else {
      this._filteredNodes = [];
      const searchFields: string[] = this.filterBy().split(',');
      const filterText = filterValue.toLowerCase(); // Basic case-insensitive filter
      const isStrictMode = this.filterMode() === 'strict';

      for (let node of this.value()) {
        const copyNode = { ...node }; // Shallow copy to avoid modifying original
        const params = { searchFields, filterText, isStrictMode };
        if (this.filterNode(copyNode, params)) {
          this._filteredNodes.push(copyNode);
        }
      }
    }
    this.updateVisibleNodes();
    this.onFilter.emit({
      filter: filterValue,
      filteredValue: this._filteredNodes,
    });
  }

  // Recursive function to check if a node or its children match the filter
  filterNode(
    node: TreeNode,
    params: {
      searchFields: string[];
      filterText: string;
      isStrictMode: boolean;
    },
  ): boolean {
    let matched = this.isFilterMatched(node, params);

    if (node.children) {
      let filteredChildren: TreeNode[] = [];
      let childMatched = false;
      for (const childNode of node.children) {
        const copyChild = { ...childNode }; // Shallow copy children too
        if (this.filterNode(copyChild, params)) {
          filteredChildren.push(copyChild);
          childMatched = true;
        }
      }
      node.children = filteredChildren; // Replace children with filtered ones
      // In lenient mode, expand parent if a child matches
      if (!params.isStrictMode && childMatched) {
        node.expanded = true; // Auto-expand filtered nodes
        matched = true;
      }
      // In strict mode, only include parent if it matches directly AND has matched children
      if (params.isStrictMode && matched && !childMatched) {
        matched = false; // Parent matches, but no children do in strict mode
      }
      // If parent doesn't match but children do
      if (!matched && childMatched) {
        matched = true;
      }
    }
    // Ensure leaf nodes are included if they match directly
    if (this.isNodeLeaf(node) && this.isFilterMatched(node, params)) {
      matched = true;
    }

    node.visible = matched; // Mark node visibility based on match
    return matched;
  }

  // Checks if the node itself matches the filter text
  isFilterMatched(
    node: TreeNode,
    params: { searchFields: string[]; filterText: string },
  ): boolean {
    for (const field of params.searchFields) {
      const fieldValue = (node[field] ?? '').toString().toLowerCase();
      if (fieldValue.includes(params.filterText)) {
        return true;
      }
    }
    return false;
  }

  resetFilter() {
    this._filteredNodes = null;
    this._filterValue = '';
    if (this.filterInputViewChild()) {
      this.filterInputViewChild().nativeElement.value = '';
    }
    this.updateVisibleNodes();
    this.onFilter.emit({ filter: '', filteredValue: null });
  }

  hasFilterActive(): boolean {
    return this._filterValue.length > 0;
  }

  handleNodeToggle(event: {
    originalEvent: Event;
    node: TreeNode;
    expanded: boolean;
  }) {
    if (event.expanded) {
      this.nodeExpand.emit({
        originalEvent: event.originalEvent,
        node: event.node,
      });
    } else {
      this.nodeCollapse.emit({
        originalEvent: event.originalEvent,
        node: event.node,
      });
    }
    // Force change detection if needed, though direct property binding should handle it
  }

  handleNodeSelect(event: { originalEvent: Event; node: TreeNode }) {
    const node = event.node;
    const originalEvent = event.originalEvent;

    if (!this.selectionMode() || node.selectable === false) {
      return;
    }

    const isSelected = this.isSelected(node);
    const metaKey =
      (this.metaKeySelection() &&
        !this.nodeTouched &&
        (originalEvent as MouseEvent).ctrlKey) ||
      (originalEvent as MouseEvent).metaKey;

    if (this.selectionMode() === 'single') {
      if (isSelected) {
        this.selection.set(null);
        this.nodeUnselect.emit({ originalEvent, node });
      } else {
        this.selection.set(node);
        this.nodeSelect.emit({ originalEvent, node });
      }
    } else if (this.selectionMode() === 'multiple') {
      if (isSelected) {
        if (metaKey) {
          this.selection.set((this.selection() || []).filter((n) => n.key !== node.key));
          this.nodeUnselect.emit({ originalEvent, node });
        } else {
          this.selection.set([node]);
          this.nodeSelect.emit({ originalEvent, node });
        }
      } else {
        this.selection.set(metaKey ? [...(this.selection() || []), node] : [node]);
        this.nodeSelect.emit({ originalEvent, node });
      }
    } else if (this.selectionMode() === 'checkbox') {
      if (!this.selection()) this.selection.set([]);
      const index = this.findIndexInSelection(node);

      if (index !== -1) {
        // Node is currently selected, deselect it
        if (this.propagateSelectionDown()) this.propagateDown(node, false);
        else {
          const arr = [...this.selection()];
          arr.splice(index, 1);
          this.selection.set(arr);
        }

        if (this.propagateSelectionUp() && node.parent)
          this.propagateUp(node.parent, false);

        this.nodeUnselect.emit({ originalEvent, node });
      } else {
        // Node is not selected, select it
        if (this.propagateSelectionDown()) this.propagateDown(node, true);
        else this.selection.set([...this.selection(), node]);

        if (this.propagateSelectionUp() && node.parent)
          this.propagateUp(node.parent, true);

        this.nodeSelect.emit({ originalEvent, node });
      }
      // Update partial selection states after propagation
      this.updatePartialSelection(this.value());
    }

    this.selectionChange.emit(this.selection());
    this.nodeTouched = false; // Reset touch flag
  }

  handleNodeUnselect(event: { originalEvent: Event; node: TreeNode }) {
    // This is mostly handled within handleNodeSelect now, but keep the output emit
    // If direct unselect logic is needed (e.g., external button), implement here
  }

  findIndexInSelection(node: TreeNode): number {
    if (!this.selection()) return -1;

    if (this.selectionMode() === 'single') {
      return this.selection()?.key === node.key ? 0 : -1;
    } else {
      return (this.selection() as TreeNode[]).findIndex(
        (n) => n.key === node.key,
      );
    }
  }

  isSelected(node: TreeNode): boolean {
    return this.findIndexInSelection(node) !== -1;
  }

  isSelectable(): boolean {
    return this.selectionMode() != null;
  }

  isNodeLeaf(node: TreeNode): boolean {
    return node.leaf === false
      ? false
      : !(node.children && node.children.length > 0);
  }

  isEmpty(): boolean {
    return !this.visibleNodes || this.visibleNodes.length === 0;
  }

  // --- Checkbox Propagation Logic ---

  propagateUp(node: TreeNode, select: boolean) {
    if (!node || !this.value()) return; // Check if node or value is null/undefined

    let selectedCount = 0;
    let childPartialSelected = false;

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        if (this.isSelected(child)) {
          selectedCount++;
        } else if (child.partialSelected) {
          childPartialSelected = true;
        }
      }
    } else {
      // Handle case where node might not have children initially
      // or children array is empty
    }

    const nodeIndex = this.findIndexInSelection(node);
    const isNodeSelected = nodeIndex !== -1;

    if (
      select &&
      node.children &&
      selectedCount === node.children.length &&
      !childPartialSelected
    ) {
      // All children selected, select parent if not already selected
      if (!isNodeSelected) {
        this.selection.set([...(this.selection() || []), node]);
      }
      node.partialSelected = false;
    } else {
      // Not all children selected or some are partially selected
      if (isNodeSelected) {
        // Parent is selected, but children aren't fully selected -> deselect parent
        const arr = [...this.selection()];
        arr.splice(nodeIndex, 1);
        this.selection.set(arr);
      }
      // Set partial selection if at least one child is selected or partially selected
      node.partialSelected =
        childPartialSelected ||
        (selectedCount > 0 &&
          (!node.children || selectedCount < node.children.length));
    }

    // Propagate to the parent node
    if (node.parent) {
      this.propagateUp(node.parent, select);
    }
  }

  propagateDown(node: TreeNode, select: boolean) {
    const index = this.findIndexInSelection(node);

    if (select && index === -1) {
      this.selection.set([...(this.selection() || []), node]);
    } else if (!select && index !== -1) {
      const arr = [...this.selection()];
      arr.splice(index, 1);
      this.selection.set(arr);
    }
    node.partialSelected = false; // When propagating down, the node itself is fully selected or deselected

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        this.propagateDown(child, select);
      }
    }
  }

  // Call this after selection changes to update visual states
  updatePartialSelection(nodes: TreeNode[] | undefined) {
    if (
      !nodes ||
      this.selectionMode() !== 'checkbox' ||
      !this.propagateSelectionUp()
    )
      return;

    for (const node of nodes) {
      if (!this.isNodeLeaf(node) && node.children) {
        this.updatePartialSelection(node.children); // Update children first

        let selectedCount = 0;
        let childPartialSelected = false;
        for (const child of node.children) {
          if (this.isSelected(child)) {
            selectedCount++;
          } else if (child.partialSelected) {
            childPartialSelected = true;
          }
        }

        const isSelected = this.isSelected(node);
        if (isSelected) {
          node.partialSelected = false; // If selected, cannot be partial
        } else {
          node.partialSelected =
            childPartialSelected ||
            (selectedCount > 0 && selectedCount < node.children.length);
        }
      } else {
        node.partialSelected = false; // Leaf nodes cannot be partial
      }
    }
  }
}
