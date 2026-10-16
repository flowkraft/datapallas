import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { closeOthersOfGroup, type PanelLike } from './panel-group.ts';

function panel(name: string | null, open = false): PanelLike {
  return { open, getAttribute: (attribute) => (attribute === 'name' ? name : null) };
}

describe('closeOthersOfGroup', () => {
  it('closes the open panel of the same name when another one opens', () => {
    const first = panel('areas', true);
    const second = panel('areas', true);
    const closed = closeOthersOfGroup(second, [first, second]);
    assert.deepEqual([first.open, second.open], [false, true]);
    assert.deepEqual(closed, [first]);
  });

  it('leaves panels of another name, and panels that are already closed, as they are', () => {
    const other = panel('industries', true);
    const shut = panel('areas', false);
    const opened = panel('areas', true);
    assert.deepEqual(closeOthersOfGroup(opened, [other, shut, opened]), []);
    assert.deepEqual([other.open, shut.open, opened.open], [true, false, true]);
  });

  it('does nothing for a panel with no name, which is not in a group', () => {
    const lone = panel(null, true);
    const another = panel(null, true);
    assert.deepEqual(closeOthersOfGroup(another, [lone, another]), []);
    assert.equal(lone.open, true);
  });

  it('does nothing for a panel that is not open: a panel that just closed closes nobody', () => {
    const open = panel('areas', true);
    const closing = panel('areas', false);
    assert.deepEqual(closeOthersOfGroup(closing, [open, closing]), []);
    assert.equal(open.open, true);
  });
});
