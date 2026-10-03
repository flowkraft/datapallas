# Layout and widgets: from a decision to a page

Step 5 of the method. The kind (`data-kinds.md`) gave me the cards that are *possible*. This file is how I choose the ones that belong and put them in the order a person reads them.

---

## 1 · The intentional test

A dashboard is **not** a collection of everything the data supports. It is the answer to one person's recurring question. Before a card goes on the page it passes this test, and I say its answer in a line:

1. **A person.** Who opens this page, and when? ("The head of sales, Monday morning." "The credit controller, daily.")
2. **A decision.** What do they choose with it again and again? ("Which channel gets the next euro." "Whom to call today.")
3. **Every widget answers part of that decision.** If its answer is already on the page, it goes. If it is there only because the data allowed it, or because it would look good, it goes.
4. **Every filter is a choice that person makes**, and its default is the view they open the page for.
5. **The page shows one finding**, in its title or its first line, that the page itself proves: "Every month this year runs above the same month last year", not "Sales dashboard".

A page that fails the test is shortened, never padded. If the user asks for a card that fails it, I say what it does not answer and offer where it would belong (a zoom-in page, or "also possible").

## 2 · The reading order

Top to bottom, in the order the question is asked:

1. **The headline:** a title with the finding, then the **KPI row**: the total, the recent window if the page has no period filter, the growth.
2. **The trend:** one full-width time series, the hero.
3. **The why:** breakdowns: by category, by source, by product.
4. **The where and who:** geography, the top N, the segments.
5. **Seasonality** if the decision is about timing: weekday × hour, month of year.
6. **The list to act on:** a table, **last**. It is what the reader does next.

This is a **checklist, not a template**. A step the decision does not need is left out. A pipeline page may have no geography; a stand-up page may have no trend. Never fill a step to complete the skeleton.

## 3 · Which widget for which answer

By what the answer is, and for a category by its cardinality (`column-roles.md`, section 3):

| The answer is | Widget |
|---|---|
| One number | **Number** (currency, percent or plain, with a label that says the period) |
| One number with a direction | **Trend** (the number and a small line of its recent history) |
| One number against a goal | **Gauge** (a rate with good/bad bands; for "higher is worse", e.g. churn or overdue, reverse the bands) or **Progress** (a total against a target) |
| A value over time | **Line** (one series, or a few); **Area**, stacked, for a **mix over time** |
| Actual against a plan over time | **Combo**: bars plus a target line; a second axis when the units differ (revenue and margin %) |
| A category with up to 5 values | **Pie** or **doughnut**, or stacked area over time |
| A category with up to 12 values | **Bar** (vertical) or **row** (horizontal, better for long names) |
| A category with more than 12 values | **Top N** plus a table, or top 5 and bottom 5; never every value |
| Two measures per entity | **Scatter**; with a third measure as size, **bubble** |
| A spread, not an average | **Boxplot** (durations, pay by level) |
| A change broken into steps | **Waterfall** (MRR movement, revenue → profit) |
| Stages that lose people | **Funnel** (an ordered pipeline) |
| A flow from one category to another | **Sankey** (channel → category) |
| A rate by country | **Map, region**, on the rate and not on the count, so a big market is not dark just for its size |
| Points with latitude and longitude | **Map, pin** |
| Weekday × hour, cohort × age, region × month | **Pivot**, shown as a heatmap |
| A list to act on, a lookup | **Tabulator** (sorting, paging, hidden columns) |
| One record, all its fields | **Detail** |
| Words: the finding, a caveat | **Text** (markdown), and a **Divider** to separate areas |

Two more things I check:
- **A pie only up to about 5 slices.** Beyond that it is a bar.
- **A map needs a country or a coordinate pair.** If there is neither, no map.

## 4 · Sizes on the 12-column grid

The Canvas is a 12-column grid; a unit is about 80 px of height. These are the shapes that read well:

| Widget | Size (width × height) |
|---|---|
| A title or the finding (Text) | 12 × 1 |
| A KPI (Number, Trend, Progress) | 3 × 2, four across a row |
| A Gauge | 3 × 3 |
| The hero time series | 12 × 4 |
| Two charts side by side | 6 × 4 each; 8 × 4 + 4 × 4 when one is the main one |
| A map | 6 × 5 alone, 8 × 5 with a 4 × 5 list beside it, 12 × 5 for pins |
| A heatmap pivot | 12 × 5 or 6 |
| The list to act on (Tabulator) | 12 × 4 or 5, last |

Layout is by drag in the Canvas; `datapallas-dashboards` shows how. I give the user the row-by-row picture ("row 1: four numbers; row 2: the trend at full width…").

## 5 · How much: caps

A page holds **about 14 widgets and 4 filters at most.** Past that, people stop reading the cards and stop using the filters. When the data supports more, I split into a second dashboard (a zoom-in) rather than grow the first.

## 6 · The time grain follows the date span

A series is only readable at the grain that gives each point enough data. By the length of the history:

| Span of the data | Grain of the line |
|---|---|
| up to about 2 months | by **day** |
| up to about 2 years | by **week** or **month** |
| beyond that | by **month** or **quarter** |

Two more rules about grain:
- **Volume sets the floor.** If a series would hold fewer than about 30–50 events a point, coarsen it. A weekly line over a few hundred sessions is noise; a monthly one is a signal. A growth % on a few dozen rows swings by many points: fold small groups into "Other" or use a longer window.
- **Year over year needs more than a year.** Same-month-last-year needs at least 13 months of dates. With less I do not offer it, and I say why.

## 7 · Filters

- **Order: time first,** then the dimensions the reader decides by, **the most used first**. A page has at most 4.
- **Every filter has a meaningful default**: the view the person opens the page for (this year, the last 12 months, "all"), not an empty box. The default of a date filter is relative to the data's own "today", not a typed date, so the page does not go stale.
- **The control follows the choice:** a radio for up to about 5 exclusive values, a select for one of many, a multiselect with search for several, a datepicker for a range, a checkbox for a yes/no, a text box for a number. Options come from the data (a SQL list), except a short fixed list.
- **A filter is bound to the widgets it should narrow.** Some widgets are deliberately **not** narrowed (four regions side by side while one is chosen); I say so on the page.
- **A filter on another table's column** (a country on a page of orders, where the country is on the customer) makes the widget a joined query: it needs SQL or a cube rather than the one-table visual builder. I say that when I plan it.

## 8 · The recent window

A "last 30 days" or "last 7 days" tile beside the total **only when the page has no period filter and its reader acts on recent change**: a marketing lead watching new customers, a support lead at the stand-up. A page with a period filter already shows the reader's own window, so it gets no extra tile.

## 9 · Honesty on the page

- **Say it when the data is a sample,** and label counts as estimates.
- **No absolute date in a text widget that a later load would falsify** ("last November", not "November 2025").
- **A small group gets no rate:** a country with a few deliveries shows no late %, and the page says so.
- **A target-based widget names its target** and where it comes from.
- **Money is never added across currencies.**

## 10 · How I present a dashboard in my answer

For each one, in this order, short:

1. **Name and finding** — one line.
2. **Who and the decision.**
3. **Data:** the tables and columns, and any reference inferred from a name.
4. **Layout:** rows top to bottom, each widget with its type and one line on why it is there.
5. **Filters** with their defaults.
6. **Missing:** what the data cannot fill, and what would unlock it.
7. **See it live:** the matching demo, from `live-demos.md`.
