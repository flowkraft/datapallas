// What the tooltip of each folder in the cube's field tree says. The words are the same for every
// cube: they explain what the folder is for, and only the names in them come from the cube.
//
//   npm test        (inside frend/rb-webcomponents)

/** The folders of the field tree that have a tooltip. */
export type FolderKind = 'measures' | 'main' | 'join' | 'filters' | 'drill';

export interface FolderTipFacts {
  /** The name the folder shows: the cube's title, or a joined table's title. */
  title?: string;
  /** Where the data comes from (the table, or the SQL a cube is built on). */
  source?: string;
  /** How a joined table meets the main one, as the cube says it: `one_to_many`. */
  relationship?: string;
}

const LONGEST_SOURCE = 160;

export function folderTip(kind: FolderKind, facts: FolderTipFacts = {}): string {
  const title = (facts.title ?? '').trim();
  switch (kind) {
    case 'measures':
      return (
        'The numbers you want to see: how much, how many. Each one is added up, counted or averaged ' +
        'from the data. Tick one or more, then tick something under "group by" to see them split up.'
      );
    case 'main': {
      const source = (facts.source ?? '').replace(/\s+/g, ' ').trim();
      const shown = source.length > LONGEST_SOURCE ? source.slice(0, LONGEST_SOURCE - 1) + '…' : source;
      return (
        (title ? title + ': w' : 'W') +
        'hat to read the numbers by. Tick one and the answer gets one row for each of its values, for example ' +
        'one row per country or per month. A field that holds a number, such as an order number, is here too: ' +
        'it is for grouping, not for adding up.' +
        (shown ? '\n\nData: ' + shown : '')
      );
    }
    case 'join': {
      const how = (facts.relationship ?? '').replace(/_/g, ' ').trim();
      return (
        (title ? title + ': m' : 'M') +
        'ore to read the numbers by, from a table that is joined to this one. Tick one and the answer gets one ' +
        'row for each of its values.' +
        (how ? '\n\nJoin: ' + how : '')
      );
    }
    case 'filters':
      return (
        'Ready-made conditions prepared for this data cube, for example only the shipped orders. Tick one to keep just ' +
        'the rows that match it: it narrows the answer instead of adding a column.'
      );
    case 'drill':
      return (
        'Ready-made paths from the broad to the detailed, such as year → quarter → month. Tick a level ' +
        'and the levels above it are ticked with it, so you can go one step deeper at a time.'
      );
  }
}
