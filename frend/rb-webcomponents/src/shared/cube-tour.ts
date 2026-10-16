/**
 * The steps of a cube in a dashboard tour: its first story, followed from its question to its answer.
 * They are the middle of the tour only - the dashboard's own tour (`dashboard-tour.ts`) opens and closes it.
 *
 * It teaches how Show Me works, not what one story means, so it is written once for every cube and
 * only fills in the words of the first story. The page is reached through the cube's own element ids
 * (`hint-<id>`, `btnShowMe-<id>`, `cubeFieldsHalf`, `cubeRuntimeResult`, `lnkCubeResetView`), asked
 * inside `root` - the one cube - because a page can hold several cubes and their ids repeat.
 */

import type { TourStep } from './tour';

export interface TourStory {
  id: string;
  question: string;
  text: string;
  query?: { dimensions?: string[]; measures?: string[] };
}

export interface CubeTourOptions {
  story: TourStory;
  /** The one cube this tour is about. */
  root: Element;
  /** A field's name as the reader reads it in the tree (its title), given the name the story uses. */
  titleOf: (name: string) => string;
  /** What the Show Me button does: the tour presses it for the reader. */
  showMe: () => void;
  /** Opens the "Apply this story?" Yes / No beside Show Me, as pressing the button does; resolves once it is drawn. */
  openGate?: () => Promise<void> | void;
  /** Closes it again, without applying anything. */
  closeGate?: () => void;
  /** Opens Reset view's "Sure?" Yes / No, as pressing the button does; resolves once it is drawn. */
  openReset?: () => Promise<void> | void;
  /** Closes it again, without resetting anything. */
  closeReset?: () => void;
  /** Resolves once the answer under the explorer has followed the last tick (never waits for long). */
  answered?: () => Promise<void> | void;
}

/** An element of the cube by id; a story's id is the author's, so it is quoted rather than trusted. */
export function inCube(root: Element, id: string): Element | null {
  return root.querySelector('[id="' + id.replace(/["\\]/g, '\\$&') + '"]');
}

/** A story names a date as `OrderDate.month`; the tree has the date once, as `OrderDate`. */
export function fieldOf(name: string): string {
  return name.split('.')[0];
}

/** "**A**", "**A** and **B**", "**A**, **B** and **C**": field names as the card says them, in bold. */
export function boldList(names: string[]): string {
  const bold = names.map((name) => '**' + name.replace(/\*/g, '') + '**');
  if (bold.length <= 1) return bold.join('');
  return bold.slice(0, -1).join(', ') + ' and ' + bold[bold.length - 1];
}

/** Resolves when `ready()` is true, or after `ms`: a slow answer is shown late, never waited for forever. */
function until(ready: () => boolean, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const look = () => {
      if (ready() || Date.now() - started >= ms) return resolve();
      setTimeout(look, 60);
    };
    look();
  });
}

export function cubeShowMeSteps(o: CubeTourOptions): TourStep[] {
  const { story, root } = o;
  const measures = (story.query?.measures ?? []).map((n) => o.titleOf(fieldOf(n)));
  const dimensions = (story.query?.dimensions ?? []).map((n) => o.titleOf(fieldOf(n)));

  /** What the story ticks, in the card's words: the numbers, then what they are read by. */
  /** The first box a story ticked: checkboxes are `chk-meas-<name>` and `chk-dim-<name>`. */
  const firstTicked = (): Element | null => {
    for (const name of story.query?.measures ?? []) {
      const box = inCube(root, 'chk-meas-' + fieldOf(name));
      if (box) return box;
    }
    for (const name of story.query?.dimensions ?? []) {
      const box = inCube(root, 'chk-dim-' + fieldOf(name));
      if (box) return box;
    }
    return null;
  };

  /** A tick as the reader sees it: the checkbox with its name, found inside this cube when it is asked for. */
  const ticksOf = (prefix: 'chk-meas-' | 'chk-dim-', names: string[]) => (): Element[] =>
    names.map((name) => inCube(root, prefix + fieldOf(name))?.closest('label') ?? null).filter((el): el is Element => !!el);

  /** "like **Net Sales**": an example from the story itself, so the card names what is on this very screen. */
  const like = (names: string[]): string => (names.length > 0 ? ', like ' + boldList(names.slice(0, 1)) : '');

  const closing = 'Show Me only saves you the clicking. Every box stays yours: untick one, tick another, and the answer follows.';

  /** What the tour does for the reader: it presses Show Me, and brings the first tick into view in the field list. */
  const pressShowMe = async () => {
    o.closeGate?.();
    o.showMe();
    // The ticks are drawn a moment after the press.
    await until(() => {
      const box = firstTicked() as HTMLInputElement | null;
      return !!box && box.checked === true;
    }, 1500);
    firstTicked()?.scrollIntoView({ block: 'nearest' });
  };

  /** A folder of the field list (`grp-measures`, `grp-main`): the row that opens and closes it. */
  const folder = (id: string) => inCube(root, id);

  /** The fields list scrolls on its own: put a folder at its top, so the folder and what is under it can be lit. */
  const folderToTop = (id: string) => {
    const list = inCube(root, 'cubeFieldsHalf');
    const row = folder(id);
    if (!list || !row) return;
    list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top - 4;
  };

  /** A real click on a box, as the reader's own: the cube ticks it and asks the data, exactly as for a person. */
  const click = (box: Element | null) => (box as HTMLInputElement | null)?.click();

  /**
   * The fields step does what it says: the example number and the example dimension are ticked with real clicks, and
   * whatever else the explorer reads the numbers by is unticked first - so the answer underneath is the one the step names.
   */
  const tickTheExample = async () => {
    const dimension = story.query?.dimensions?.[0];
    const measure = story.query?.measures?.[0];
    if (!dimension && !measure) return;
    const wanted = dimension ? inCube(root, 'chk-dim-' + fieldOf(dimension)) : null;
    root.querySelectorAll('input[id^="chk-dim-"]').forEach((box) => {
      if (box !== wanted && (box as HTMLInputElement).checked) click(box);
    });
    const number = measure ? inCube(root, 'chk-meas-' + fieldOf(measure)) : null;
    if (number && !(number as HTMLInputElement).checked) click(number);
    if (wanted && !(wanted as HTMLInputElement).checked) click(wanted);
    await o.answered?.();
  };

  const steps: TourStep[] = [
    {
      // What the words name, each lit by itself: the numbers' folder, the first number, and the folder of what they are read by.
      before: async () => {
        const list = inCube(root, 'cubeFieldsHalf');
        if (list) list.scrollTop = 0;
        await tickTheExample();
      },
      // While it is shown the fields list is let out of its scrolling box, on top, so that the whole of it - the example
      // dimension too - is on the screen together; the undo puts the box, its z-index and everything else back.
      during: () => {
        const half = inCube(root, 'cubeFieldsHalf') as HTMLElement | null;
        if (!half) return;
        const saved = { maxHeight: half.style.maxHeight, overflow: half.style.overflow, zIndex: half.style.zIndex, scrollTop: half.scrollTop };
        half.style.maxHeight = 'none';
        half.style.overflow = 'visible';
        half.style.zIndex = '99999';
        return () => {
          half.style.maxHeight = saved.maxHeight;
          half.style.overflow = saved.overflow;
          half.style.zIndex = saved.zIndex;
          half.scrollTop = saved.scrollTop;
        };
      },
      // The whole list is brought onto the screen, not only its first row: the folders and the example dimension are all at once in view.
      focus: () => inCube(root, 'cubeFieldsHalf'),
      target: () => [
        folder('grp-measures'),
        ...ticksOf('chk-meas-', (story.query?.measures ?? []).slice(0, 1))(),
        folder('grp-main'),
        ...ticksOf('chk-dim-', (story.query?.dimensions ?? []).slice(0, 1))(),
      ].filter((el): el is Element => !!el),
      each: true,
      optional: true,
      title: 'Your data, as tick boxes',
      content:
        'On the left is **everything the explorer can show you**. The **numbers** are what you add up' +
        like(measures) +
        '; the other folders are what you **group by**' +
        like(dimensions) +
        '. Tick a box and the answer underneath is asked again at once' +
        (measures.length > 0 && dimensions.length > 0
          ? ' - the tour has just ticked ' + boldList([measures[0], dimensions[0]]) + ', so the answer below is ' + boldList([measures[0]]) + ' by ' + boldList([dimensions[0]]) + '.'
          : '.'),
    },
    {
      before: () => o.closeGate?.(),
      target: () => inCube(root, 'cubeStoriesHalf'),
      optional: true,
      title: 'Data Stories: ideas to start from',
      content:
        'The **Data Stories** are ideas for useful questions to ask of this data: inspiration, a starting point, and a way to learn what the explorer can do. Each one lists the ticks it needs, and **Show Me** applies them so you see how such a question is built. Then make it your own: change the ticks, or ask something entirely different.',
    },
    {
      before: () => o.closeGate?.(),
      target: () => inCube(root, 'hint-' + story.id),
      title: story.question,
      content: story.text,
    },
    {
      // The button and the question it opens, lit together: the tour presses Show Me here, so the reader sees what it asks.
      before: async () => {
        await o.openGate?.();
        await until(() => !!inCube(root, 'hintGate-' + story.id), 1500);
      },
      target: () => [inCube(root, 'btnShowMe-' + story.id), inCube(root, 'hintGate-' + story.id)].filter((el): el is Element => !!el),
      title: 'What Show Me does',
      content:
        '**Show Me** ticks the boxes this question needs and asks the data. It checks first - **Apply this story?** - so nothing moves until you say **Yes**, and **No** leaves your explorer untouched. On the next step the tour says Yes for you.',
    },
    // The tick steps. Pressing Show Me is done by the first of them, so nothing here repeats another card:
    // the numbers, then what they are read by - and a story that ticks nothing still gets one plain step.
    ...(measures.length > 0 || dimensions.length > 0
      ? [
          ...(measures.length > 0
            ? [{
                before: async () => {
                  await pressShowMe();
                  // The numbers' folder is lit with them: bring it to the top, and keep the last tick in view.
                  folderToTop('grp-measures');
                  ticksOf('chk-meas-', story.query?.measures ?? [])().at(-1)?.scrollIntoView({ block: 'nearest' });
                },
                target: () => [folder('grp-measures'), ...ticksOf('chk-meas-', story.query?.measures ?? [])()]
                  .filter((el): el is Element => !!el),
                each: true,
                title: 'Ticked for you',
                content:
                  boldList(measures) + ': the numbers this question adds up. Show Me ticked them, so you did not have to hunt for them.' +
                  (dimensions.length === 0 ? ' ' + closing : ''),
              } satisfies TourStep]
            : []),
          ...(dimensions.length > 0
            ? [{
                before: async () => {
                  if (measures.length === 0) await pressShowMe();
                  folderToTop('grp-main');
                },
                // The folder they sit in is lit too: it is what "group by" names.
                target: () => [folder('grp-main'), ...ticksOf('chk-dim-', story.query?.dimensions ?? [])()]
                  .filter((el): el is Element => !!el),
                each: true,
                optional: measures.length > 0,
                title: 'What they are read by',
                content: boldList(dimensions) + ': what the numbers are split by, so the answer has one row for each. ' + closing,
              } satisfies TourStep]
            : []),
        ]
      : [{
          before: pressShowMe,
          title: 'Ticked for you',
          content: 'Show Me ticked what the question needs. Every box stays yours: tick or untick anything yourself.',
        } satisfies TourStep]),
    {
      before: async () => {
        o.closeReset?.();
        await until(() => !!inCube(root, 'cubeRuntimeTable') || !!inCube(root, 'cubeRuntimeValue'), 4000);
      },
      target: () => inCube(root, 'cubeRuntimeResult'),
      title: 'The answer, right underneath',
      content: 'Below both halves is the answer to exactly what is ticked, and nothing more. Change one tick and it is asked again.',
    },
    {
      // The button and the question it opens, lit together.
      before: async () => {
        await o.openReset?.();
        await until(() => !!inCube(root, 'resetGate'), 1500);
      },
      target: () => [inCube(root, 'lnkCubeResetView'), inCube(root, 'resetGate')].filter((el): el is Element => !!el),
      // Only shown, never answered: whichever way the reader leaves the step, the question is closed and nothing is reset.
      during: () => () => o.closeReset?.(),
      optional: true,
      title: 'Lost? Start over',
      content: '**Reset view** takes the explorer back to how its author published it, so you can start over whenever you have ticked yourself into a corner.',
    },
  ];
  return steps;
}
