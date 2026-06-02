import { Component, inject, input, model, output, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common'; // Import CommonModule
import { FormsModule } from '@angular/forms'; // Import FormsModule if needed for inputs/buttons potentially
import { TreeNode, TreeComponent } from './tree.component'; // Import TreeComponent

@Component({
    selector: 'dburst-picklist',
    standalone: true,
    imports: [CommonModule, FormsModule, TreeComponent],
    templateUrl: './picklist.component.html',
    styles: [
        `
      :host {
        display: block;
      }

      /* Picklist Layout Styles */
      .p-picklist {
        display: flex;
        gap: 1rem; /* dt('picklist.gap') - Adjust as needed */
      }

      .p-picklist-controls {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 0.5rem; /* dt('picklist.controls.gap') - Adjust as needed */
      }

      .p-picklist-list-container {
        flex: 1 1 50%;
        display: flex; /* Added to manage header/tree layout */
        flex-direction: column; /* Added */
      }

      /* All colors below use daisyUI theme tokens (--color-base-*, --color-primary*)
         so the picklist follows the active theme instead of locking to a fixed
         light-gray palette inherited from the PrimeNG defaults. */
      .p-picklist-header {
        background: var(--color-base-200);
        color: var(--color-base-content);
        border: 1px solid var(--color-base-300);
        padding: 0.75rem 1rem;
        font-weight: 600;
        border-bottom: 0 none;
        border-top-right-radius: 6px;
        border-top-left-radius: 6px;
      }

      /* Ensure tree takes remaining space */
      .p-picklist-list-container > dburst-tree {
        flex-grow: 1;
        border-top-left-radius: 0;
        border-top-right-radius: 0;
        border: 1px solid var(--color-base-300);
        border-top: 0;
        overflow-y: auto;
      }

      /* Basic Button Styles */
      .p-button {
        display: inline-flex;
        cursor: pointer;
        user-select: none;
        align-items: center;
        vertical-align: bottom;
        text-align: center;
        overflow: hidden;
        position: relative;
        border: 1px solid var(--color-base-300);
        background: var(--color-base-200);
        color: var(--color-base-content);
        padding: 0.5rem 1rem;
        font-size: 1rem;
        transition:
          background-color 0.2s,
          color 0.2s,
          border-color 0.2s,
          box-shadow 0.2s;
        border-radius: 6px;
      }
      .p-button:enabled:hover {
        background: var(--color-base-300);
        color: var(--color-base-content);
        border-color: var(--color-base-300);
      }
      .p-button:disabled {
        opacity: 0.65;
        cursor: default;
      }
      .p-button-icon-only {
        width: 2.5rem;
        padding: 0.5rem 0;
        justify-content: center;
      }
      .p-button .pi {
        font-size: 1.25rem;
      }

      .p-picklist-field-toolbar {
        display: flex;
        gap: 0.25rem;
        padding: 0.35rem 0.5rem;
        background: var(--color-base-200);
        border: 1px solid var(--color-base-300);
        border-top: 0;
        border-bottom: 0;
      }
      .p-button-toolbar {
        padding: 0.2rem 0.5rem;
        font-size: 0.8rem;
        border-radius: 4px;
      }
      .p-button-toolbar .pi {
        font-size: 0.8rem;
      }
      .p-button-toolbar-active {
        background: color-mix(in oklab, var(--color-primary) 18%, var(--color-base-100));
        border-color: var(--color-primary);
        color: var(--color-primary);
        font-weight: 600;
      }
      .p-button-toolbar-active:enabled:hover {
        background: color-mix(in oklab, var(--color-primary) 28%, var(--color-base-100));
        border-color: var(--color-primary);
        color: var(--color-primary);
      }
    `,
    ]
})
export class PicklistComponent {
  private cdRef = inject(ChangeDetectorRef);

  picklistId = input<string | undefined>(undefined);

  sourceItems = model<TreeNode[]>([]);
  targetItems = model<TreeNode[]>([]);

  sourceHeader = input<string>('');
  targetHeader = input<string>('');
  sourceFilterPlaceholder = input<string>('Filter...');
  targetFilterPlaceholder = input<string>('Filter...');

  enableFieldSelection = input<boolean>(false);

  // When true, the picklist treats top-level source nodes as "groups" and
  // their child nodes (those marked with `originalParentKey`) as "leaves".
  // Move-to-target explodes any selected group into its leaf descendants —
  // the group folder itself never appears on the target side. Move-to-source
  // restores leaves under their original parent group, recreating the parent
  // on the fly if it no longer exists in source. The original parent
  // identity is read from each leaf's `originalParentKey` / `originalParentLabel`
  // fields, which the caller must populate when building the source tree.
  flattenGroupNodes = input<boolean>(false);

  selectedSourceNodes: TreeNode[] = [];
  selectedTargetNodes: TreeNode[] = [];
  fieldIncludedNodes: TreeNode[] = [];
  fieldSelectionMode: 'allDetails' | 'namesOnly' | 'custom' = 'allDetails';

  get activeTargetSelection(): TreeNode[] {
    return this.enableFieldSelection() ? this.fieldIncludedNodes : this.selectedTargetNodes;
  }

  set activeTargetSelection(value: TreeNode[]) {
    if (this.enableFieldSelection()) {
      this.fieldIncludedNodes = value;
      this.fieldSelectionMode = 'custom';
      // If a previously-empty (p-fully-deselected) target row now has any
      // of its children re-included, clear the empty marker so the row can
      // render normally again. updateTableNodeStyles() respects the marker
      // and will skip the row, so we have to clear it BEFORE that runs.
      const includedKeys = new Set((value || []).map((n) => n.key));
      for (const t of this.targetItems()) {
        if (t.styleClass !== 'p-fully-deselected') continue;
        const isLeafTable = !t.children?.length;
        const reincluded = isLeafTable
          ? includedKeys.has(t.key)
          : t.children!.some((c) => includedKeys.has(c.key));
        if (reincluded) {
          t.styleClass = '';
        }
      }
      this.updateTableNodeStyles();
    } else {
      this.selectedTargetNodes = value;
    }
  }

  moveToTarget() {
    // Promote: regardless of whether the user clicked a group, a table or
    // a column, the move operates on whole tables only. Orphan column
    // moves are impossible because promoteToTableLevel always returns
    // table-level nodes.
    const promoted = this.promoteToTableLevel(
      this.sourceItems(),
      this.selectedSourceNodes,
    );
    if (promoted.length === 0) {
      this.clearSelection();
      return;
    }
    const promotedKeys = new Set(promoted.map((n) => n.key));
    const nodesToKeep: TreeNode[] = [];
    const nodesToMove: TreeNode[] = [];
    this.partitionNodes(
      this.sourceItems(),
      promotedKeys,
      nodesToKeep,
      nodesToMove,
    );
    this.sourceItems.set(nodesToKeep);
    this.targetItems.set([...this.targetItems(), ...nodesToMove]);
    if (this.enableFieldSelection()) {
      this.autoIncludeNodes(nodesToMove);
      this.updateTableNodeStyles();
    }
    this.clearSelection();
    this.updateEmitters();
  }

  moveAllToTarget() {
    if (!this.sourceItems() || this.sourceItems().length === 0) return;
    // Always collect at the TABLE level — never move orphan column nodes
    // (defensive against any stale state in source).
    const movedItems = this.collectAllTableNodes(this.sourceItems());
    if (movedItems.length === 0) return;
    this.targetItems.set([...this.targetItems(), ...movedItems]);
    this.sourceItems.set([]);
    if (this.enableFieldSelection()) {
      this.autoIncludeNodes(movedItems);
      this.updateTableNodeStyles();
    }
    this.clearSelection();
    this.updateEmitters();
  }

  moveToSource() {
    // Read from activeTargetSelection so the move works in both modes:
    //   - enableFieldSelection=false → activeTargetSelection === selectedTargetNodes
    //   - enableFieldSelection=true  → activeTargetSelection === fieldIncludedNodes
    // Then promote to table level so a column-level click on the right
    // moves the WHOLE TABLE back to source — never just the orphan column.
    const promoted = this.promoteToTableLevel(
      this.targetItems(),
      this.activeTargetSelection,
    );
    if (promoted.length === 0) {
      this.clearSelection();
      return;
    }
    const promotedKeys = new Set(promoted.map((n) => n.key));
    const nodesToKeep: TreeNode[] = [];
    const nodesToMove: TreeNode[] = [];
    this.partitionNodes(
      this.targetItems(),
      promotedKeys,
      nodesToKeep,
      nodesToMove,
    );
    this.targetItems.set(nodesToKeep);
    // Strip any target-only visual state (partialSelected, p-weak-selected,
    // p-fully-deselected) before the nodes land back in source — the source
    // tree uses simple binary checkboxes only.
    this.resetTargetSideState(nodesToMove);
    if (this.flattenGroupNodes()) {
      // Re-group each leaf back under its original parent group in source.
      // If the parent no longer exists (because all its children were moved
      // out earlier and the empty group was dropped), recreate it on the fly.
      this.regroupLeavesIntoSource(nodesToMove);
    } else {
      this.sourceItems.set([...this.sourceItems(), ...nodesToMove]);
    }
    if (this.enableFieldSelection()) {
      this.removeFromFieldSelection(nodesToMove);
    }
    this.clearSelection();
    this.updateEmitters();
  }

  /**
   * Called by the tree when the user clicks the checkbox of a target node
   * that is currently in the "weak-highlight" (light blue / name-only)
   * state. Marks the table as fully deselected — checkbox renders empty
   * — but LEAVES THE TABLE IN THE RIGHT PANEL. The user moves it back to
   * source explicitly via the `<` button when they want to.
   *
   * This is what gives the user a per-checkbox path to fully unselect
   * (green → light blue → empty), instead of being stuck in the
   * green ↔ light blue ping-pong that the previous behavior produced.
   *
   * The empty marker lives on the node as `p-fully-deselected` inside
   * styleClass. updateTableNodeStyles() honors it and refrains from
   * re-applying `p-weak-selected` to the row.
   */
  onTargetWeakClick(event: { originalEvent: Event; node: TreeNode }) {
    if (!event?.node) return;
    event.node.styleClass = 'p-fully-deselected';
    if (this.enableFieldSelection()) {
      this.removeFromFieldSelection([event.node]);
    }
    this.clearSelection();
    this.cdRef.detectChanges();
  }

  moveAllToSource() {
    if (!this.targetItems() || this.targetItems().length === 0) return;
    // Strip target-only visual state from every node before they return
    // to source.
    this.resetTargetSideState(this.targetItems());
    if (this.flattenGroupNodes()) {
      // Restore every leaf in target back into its original parent group.
      this.regroupLeavesIntoSource(this.targetItems());
    } else {
      this.sourceItems.set([...this.sourceItems(), ...this.targetItems()]);
    }
    this.targetItems.set([]);
    if (this.enableFieldSelection()) {
      this.fieldIncludedNodes = [];
    }
    this.clearSelection();
    this.updateEmitters();
  }

  // --- Field Selection Toolbar Actions ---

  selectAllFields(): void {
    this.fieldIncludedNodes = [];
    this.collectAllNodes(this.targetItems(), this.fieldIncludedNodes);
    this.fieldIncludedNodes = [...this.fieldIncludedNodes];
    this.clearPartialSelected(this.targetItems());
    this.clearFullyDeselectedMarker(this.targetItems());
    this.fieldSelectionMode = 'allDetails';
    this.updateTableNodeStyles();
    this.cdRef.detectChanges();
  }

  selectNamesOnly(): void {
    this.fieldIncludedNodes = [];
    this.clearPartialSelected(this.targetItems());
    this.clearFullyDeselectedMarker(this.targetItems());
    this.fieldSelectionMode = 'namesOnly';
    this.updateTableNodeStyles();
    this.cdRef.detectChanges();
  }

  // Toolbar buttons globally reset the selection mode, so any per-row
  // "fully deselected" markers are cleared too — otherwise rows that the
  // user emptied earlier would stay invisible while the toolbar says
  // "all" or "names only".
  private clearFullyDeselectedMarker(nodes: TreeNode[]): void {
    if (!nodes) return;
    for (const node of nodes) {
      if (node.styleClass === 'p-fully-deselected') node.styleClass = '';
    }
  }

  // --- Field Selection State for Prompt Building ---

  getFieldSelectionState(): {
    fullDetailTables: TreeNode[];
    partialDetailTables: { node: TreeNode; selectedChildren: TreeNode[] }[];
    nameOnlyTables: TreeNode[];
  } {
    const full: TreeNode[] = [];
    const partial: { node: TreeNode; selectedChildren: TreeNode[] }[] = [];
    const nameOnly: TreeNode[] = [];

    const includedKeys = new Set(
      (this.fieldIncludedNodes || []).map((n) => n.key),
    );

    for (const tableNode of this.targetItems()) {
      // Skip rows the user explicitly emptied via the third tri-state
      // click. They're parked on the right but not part of any bucket
      // — they won't be sent to AI.
      if (tableNode.styleClass === 'p-fully-deselected') continue;

      if (!tableNode.children?.length) {
        if (includedKeys.has(tableNode.key)) {
          full.push(tableNode);
        } else {
          nameOnly.push(tableNode);
        }
        continue;
      }

      const selectedChildren = tableNode.children.filter((child) =>
        includedKeys.has(child.key),
      );

      if (selectedChildren.length === tableNode.children.length) {
        full.push(tableNode);
      } else if (selectedChildren.length > 0) {
        partial.push({ node: tableNode, selectedChildren });
      } else {
        nameOnly.push(tableNode);
      }
    }

    return { fullDetailTables: full, partialDetailTables: partial, nameOnlyTables: nameOnly };
  }

  // --- Private Helpers ---

  // ── Promote-to-table-level helpers ──
  // The picklist always operates at the table level when moving things
  // between source and target. The user can never move an orphan column
  // out of its parent table; selecting a column promotes the move to the
  // whole table. Selecting a group folder promotes to all of its tables.
  // Selecting a table moves the table verbatim.

  /**
   * "Table-level" promotion. Walks the user's selection on the given side
   * (source or target) and returns a deduped array of TABLE nodes that
   * should actually be moved. The rules:
   *
   *   - Selected GROUP node (no `originalParentKey`, has table children) →
   *     expand to all its descendant tables; the group node itself is NOT
   *     moved (the existing partitionNodes recursion drops the empty
   *     group automatically).
   *   - Selected TABLE node → kept as-is.
   *   - Selected COLUMN node (a child of a table node) → promoted up to
   *     its parent table. The user can never move a single column out of
   *     its table without taking the whole table along.
   *
   * Returns whole table nodes from `tree` (NOT the user's selection
   * objects), preserving identity so partitionNodes finds them by key.
   */
  private promoteToTableLevel(
    tree: TreeNode[],
    selection: TreeNode[] | undefined,
  ): TreeNode[] {
    if (!selection || selection.length === 0) return [];
    const selectedKeys = new Set<string | undefined>(
      selection.map((n) => n.key),
    );
    const result: TreeNode[] = [];
    const seen = new Set<string | undefined>();
    const addTable = (table: TreeNode) => {
      if (!table || seen.has(table.key)) return;
      seen.add(table.key);
      result.push(table);
    };

    // Visit every node in the tree. Decide its role from structure:
    //   - has originalParentKey OR no children → table leaf
    //   - has children that are themselves tables → group
    //   - is a child of a table → column
    const visit = (node: TreeNode, parent: TreeNode | null) => {
      if (!node) return;
      const isTable = this.isTableNode(node);
      const isGroup = !isTable && this.hasTableChildren(node);
      const isColumn = !isTable && !isGroup && parent && this.isTableNode(parent);
      const isSelected = selectedKeys.has(node.key);

      if (isSelected) {
        if (isTable) {
          addTable(node);
        } else if (isGroup) {
          // Promote: collect every descendant table.
          for (const t of this.collectTablesUnder(node)) addTable(t);
        } else if (isColumn) {
          // Promote: take the parent table whole.
          addTable(parent!);
        }
      }
      if (node.children?.length) {
        for (const c of node.children) visit(c, node);
      }
    };
    for (const n of tree || []) visit(n, null);
    return result;
  }

  /**
   * Collect every TABLE node in the subtree rooted at `node`. Used by
   * promoteToTableLevel and by moveAllToTarget.
   */
  private collectTablesUnder(node: TreeNode): TreeNode[] {
    const out: TreeNode[] = [];
    const walk = (n: TreeNode) => {
      if (!n) return;
      if (this.isTableNode(n)) {
        out.push(n);
        return; // table's children are columns — don't descend into them
      }
      if (n.children?.length) {
        for (const c of n.children) walk(c);
      }
    };
    walk(node);
    return out;
  }

  /**
   * Collect every TABLE node from a tree (any depth). Used by `>>`.
   */
  private collectAllTableNodes(tree: TreeNode[]): TreeNode[] {
    const out: TreeNode[] = [];
    for (const root of tree || []) {
      for (const t of this.collectTablesUnder(root)) out.push(t);
    }
    return out;
  }

  /**
   * A table node is one that either:
   *   - in flattenGroupNodes mode: has `originalParentKey` set. Anything
   *     without originalParentKey is either a top-level group or a deeper
   *     column descendant — never a table.
   *   - in non-flatten mode: sits at the top with no children, or has
   *     children that are themselves leaves (columns).
   *
   * The flatten branch is critical: without it, the heuristic below would
   * mis-classify column nodes (which also have no children) as tables and
   * promote-to-table-level would add orphan columns to the move set.
   */
  private isTableNode(node: TreeNode): boolean {
    if (!node) return false;
    if (this.flattenGroupNodes()) {
      return !!node.originalParentKey;
    }
    if (!node.children?.length) return true;
    return node.children.every((c) => !c.children?.length);
  }

  private hasTableChildren(node: TreeNode): boolean {
    return !!node?.children?.some((c) => this.isTableNode(c));
  }

  /**
   * Strip target-side visual state from a node and all its descendants.
   * Called whenever a node returns from target → source. The source tree
   * uses simple binary checkboxes; carrying flags like `partialSelected`,
   * `p-weak-selected`, or `p-fully-deselected` over from the target tree
   * leaves stale visuals (the "stuck horizontal line" bug, light blue
   * checks on source rows, etc.). Source-side propagation is off so
   * nothing organically clears these flags — we have to do it explicitly
   * at move-back time.
   */
  private resetTargetSideState(nodes: TreeNode[] | undefined): void {
    if (!nodes) return;
    const visit = (node: TreeNode) => {
      if (!node) return;
      node.partialSelected = false;
      // Drop only target-only marker classes; preserve any other styling.
      if (
        node.styleClass === 'p-weak-selected' ||
        node.styleClass === 'p-fully-deselected'
      ) {
        node.styleClass = '';
      }
      if (node.children?.length) {
        for (const c of node.children) visit(c);
      }
    };
    for (const n of nodes) visit(n);
  }

  /**
   * Restore each leaf in `leaves` back into the source tree under its
   * original parent group. The parent group is identified by the leaf's
   * `originalParentKey`. If a parent group with that key still exists in
   * source, append the leaf to its children. Otherwise create a fresh group
   * node (icon, label, etc.) on the fly.
   *
   * Group nodes are kept ordered by first appearance — newly recreated
   * groups are appended to the end of source. Leaves within a group are
   * kept in their re-add order.
   */
  private regroupLeavesIntoSource(leaves: TreeNode[]): void {
    if (!leaves || leaves.length === 0) return;

    const newSource = [...this.sourceItems()];

    // Build a map of existing parent-key → group node so leaves with the
    // same parent reuse the same group reference. A "group" here is any
    // top-level source node that does NOT carry an originalParentKey
    // (only the table leaves carry it, by construction in
    // mapDomainGroupsToTreeNodes).
    const groupByKey = new Map<string, TreeNode>();
    for (const root of newSource) {
      if (!root.originalParentKey && root.key) {
        groupByKey.set(root.key, root);
      }
    }

    for (const leaf of leaves) {
      if (leaf?.originalParentKey) {
        const parentKey = leaf.originalParentKey!;
        const parentLabel = leaf.originalParentLabel || parentKey;
        let group = groupByKey.get(parentKey);
        if (!group) {
          group = {
            key: parentKey,
            label: parentLabel,
            icon: 'layer-group',
            children: [],
          };
          groupByKey.set(parentKey, group);
          newSource.push(group);
        }
        // Replace the children array with a new one that includes the leaf
        // (immutable update so Angular's change detection picks it up).
        group.children = [...(group.children || []), leaf];
      } else {
        // Defensive: a non-leaf got passed in (shouldn't happen because
        // groups never live on the target side, but pass through cleanly).
        newSource.push(leaf);
      }
    }

    this.sourceItems.set(newSource);
  }

  private updateTableNodeStyles(): void {
    if (!this.enableFieldSelection()) return;
    const includedKeys = new Set(
      (this.fieldIncludedNodes || []).map((n) => n.key),
    );
    for (const tableNode of this.targetItems()) {
      // Tables marked as "fully deselected" (third tri-state) keep that
      // marker until something explicitly re-selects them. Nothing in this
      // function should overwrite it back to weak-selected.
      if (tableNode.styleClass === 'p-fully-deselected') continue;

      if (!tableNode.children?.length) {
        tableNode.styleClass = includedKeys.has(tableNode.key) ? '' : 'p-weak-selected';
        continue;
      }
      const selectedChildren = tableNode.children.filter((child) =>
        includedKeys.has(child.key),
      );
      if (selectedChildren.length === 0) {
        tableNode.styleClass = 'p-weak-selected';
      } else {
        tableNode.styleClass = '';
      }
    }
  }

  private autoIncludeNodes(nodes: TreeNode[]): void {
    for (const node of nodes) {
      this.fieldIncludedNodes.push(node);
      if (node.children?.length) {
        this.autoIncludeNodes(node.children);
      }
    }
    this.fieldIncludedNodes = [...this.fieldIncludedNodes];
  }

  private removeFromFieldSelection(nodes: TreeNode[]): void {
    const keysToRemove = new Set<string | undefined>();
    this.collectAllKeys(nodes, keysToRemove);
    this.fieldIncludedNodes = this.fieldIncludedNodes.filter(
      (n) => !keysToRemove.has(n.key),
    );
  }

  private collectAllKeys(
    nodes: TreeNode[],
    keys: Set<string | undefined>,
  ): void {
    for (const node of nodes) {
      keys.add(node.key);
      if (node.children?.length) {
        this.collectAllKeys(node.children, keys);
      }
    }
  }

  private collectAllNodes(nodes: TreeNode[], collected: TreeNode[]): void {
    for (const node of nodes) {
      collected.push(node);
      if (node.children?.length) {
        this.collectAllNodes(node.children, collected);
      }
    }
  }

  private clearPartialSelected(nodes: TreeNode[]): void {
    for (const node of nodes) {
      node.partialSelected = false;
      if (node.children?.length) {
        this.clearPartialSelected(node.children);
      }
    }
  }

  private partitionNodes(
    nodes: TreeNode[],
    selectedKeys: Set<string | undefined>,
    nodesToKeep: TreeNode[],
    nodesToMove: TreeNode[],
  ) {
    if (!nodes) return;
    for (const node of nodes) {
      const nodeKey = node.key;
      if (selectedKeys.has(nodeKey)) {
        nodesToMove.push(node);
      } else if (node.children && node.children.length > 0) {
        const childNodesToKeep: TreeNode[] = [];
        const childNodesToMove: TreeNode[] = [];
        this.partitionNodes(
          node.children,
          selectedKeys,
          childNodesToKeep,
          childNodesToMove,
        );
        if (childNodesToMove.length > 0 && childNodesToKeep.length > 0) {
          const partialNode = { ...node, children: childNodesToKeep };
          nodesToKeep.push(partialNode);
          nodesToMove.push(...childNodesToMove);
        } else if (childNodesToMove.length > 0) {
          nodesToMove.push(...childNodesToMove);
        } else {
          nodesToKeep.push(node);
        }
      } else {
        nodesToKeep.push(node);
      }
    }
  }

  private clearSelection() {
    this.selectedSourceNodes = [];
    this.selectedTargetNodes = [];
  }

  private updateEmitters() {
    // model() signals notify parent automatically when .set() is called
  }
}
