import { test, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import type { Quiz } from '../src/lib/schemas/quiz';
import { BuilderPage } from '../e2e/pages/BuilderPage';
import { PlayPage } from '../e2e/pages/PlayPage';
import { resetStorage, seedQuizzes } from '../e2e/utils/storage';
import { stubRepo } from '../e2e/utils/github';

// Generates every screenshot in docs/screenshots/, so the images in the README and the docs can be
// REGENERATED rather than re-captured by hand. The three that existed before this file were taken
// manually and had already drifted: the builder shot predated the per-kind "Add" buttons, the
// settings legend and the error pill, all of which it appeared to show the absence of.
//
// Not part of `pnpm test:e2e` — it lives outside e2e/ and has its own config for that reason. It
// asserts nothing; running it in CI would just write files nobody looks at. Run `pnpm screenshots`
// after a UI change that any documented screen is showing.
//
// Content here is written to READ well, not to be minimal — these are the first thing someone sees
// of the app, so the quizzes are plausible ones rather than "e2e-quiz-1". Anything random is pinned
// (`shuffle_questions`/`shuffle_options` off) so re-running produces the same image and the diff
// stays empty when nothing actually changed.

const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

const now = '2025-01-01T00:00:00.000Z';

function quiz(
  id: string,
  title: string,
  description: string,
  codes: string[],
  settings: Quiz['settings'] = {}
): Quiz {
  return {
    id,
    title,
    description,
    category: 'general knowledge',
    tags: ['sample'],
    // The two shuffles stay pinned off whatever a caller adds — every image here has to be
    // byte-identical across runs (see the seeded Math.random below).
    settings: { ...settings, shuffle_questions: false, shuffle_options: false },
    createdAt: now,
    updatedAt: now,
    questions: codes.map((code, i) => ({ id: `${id}-q${i + 1}`, code }))
  };
}

/** One question, played on its own — what most of the per-variant images below are. */
function single(id: string, code: string): Quiz {
  return quiz(id, 'Sample', 'One question', [code]);
}

// `shuffle_options: false` is not enough to pin these images. The four placement variants are in
// `ALWAYS_SHUFFLED_VARIANTS` (grading.ts) and shuffle their boards unconditionally — deliberately,
// since an order_items board pre-sorted into the right answer would give the game away. That left
// order_items, match_pairs and group_items producing a different PNG on every run.
//
// So the randomness is pinned at its source, for the screenshot run only: a seeded generator in
// place of `Math.random`, installed before any app code runs. Deterministic but still well mixed,
// rather than a constant — a fixed return value makes Fisher-Yates degenerate into a predictable
// near-rotation, which would look like a board that had barely been shuffled.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    let state = 0x2f6e2b1;
    Math.random = () => {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
});

async function seed(page: Page, quizzes: Quiz[]): Promise<void> {
  await page.goto('/');
  await resetStorage(page);
  await seedQuizzes(page, quizzes);
}

/** Every image in this file goes through here, so the whole set shares one look.
 *
 * `pad` is the reason this exists at all. `locator.screenshot()` clips to the element's border
 * box, which put a card's own 1px border hard against the image edge — the images read as cropped
 * rather than framed, and a `shadow-md` (the import dialog) was cut off entirely, since a shadow
 * paints outside the box it belongs to. Clipping a padded rectangle out of a full-page screenshot
 * instead means the gutter is filled by the real page background (`--color-surface` on `<body>`),
 * so the frame is the app's own colour rather than transparency.
 *
 * `fullPage` plus a scroll to the top is what makes the maths safe: `boundingBox()` is
 * viewport-relative, `clip` under `fullPage` is document-relative, and at scroll 0 those agree —
 * including for the tall shots (home, results, review) that don't fit in the 900px viewport.
 *
 * `animations: 'disabled'` is not cosmetic. Several of these are captured immediately after an
 * interaction, so a Svelte `fade`/`scale` was still part-way through when the shot was taken and
 * the same command produced a different PNG each run — seven of them churned on every re-run. It
 * fast-forwards finite animations to their end state, which is the state these images should show
 * anyway. */
async function shotPadded(
  page: Page,
  name: string,
  target: Locator | Locator[],
  pad = 16
): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  // Several locators when the thing being photographed isn't one box. A question card's action
  // strip is `lg:absolute lg:right-full` (QuestionCard.svelte) — a child of the card that renders
  // OUTSIDE it, so the card's own bounding box stops short of it and a plain padded crop sliced
  // the strip's buttons in half down the left edge.
  const boxes = [];
  for (const locator of Array.isArray(target) ? target : [target]) {
    const box = await locator.boundingBox();
    if (!box) throw new Error(`Nothing to frame for ${name}`);
    boxes.push(box);
  }
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const box = {
    x: left,
    y: top,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - left,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - top
  };
  await page.screenshot({
    path: `${OUT}/${name}.png`,
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    clip: {
      x: Math.max(0, box.x - pad),
      y: Math.max(0, box.y - pad),
      width: box.width + pad * 2,
      height: box.height + pad * 2
    }
  });
}

/** Captures the page's `<main>` — everything but the site header, which is the same in every shot
 * and only eats vertical space in a docs image. */
async function shotMain(page: Page, name: string): Promise<void> {
  await shotPadded(page, name, page.locator('main'));
}

/** The question card's action strip, which sits outside the card's own box at this viewport (see
 * `shotPadded`). Anchored on its topmost button rather than the container's shape, so it's the
 * strip's own left edge that frames the shot. */
function questionActions(page: Page): Locator {
  return page.getByRole('button', { name: /Try this question|Stop testing this question/ });
}

/** A crop running vertically from `top`'s upper edge to `bottom`'s lower edge, and horizontally
 * across `across` — for the two things an element screenshot can't frame: a settings block (nothing
 * in the DOM wraps just it) and an open description panel (`position: fixed`, so it isn't inside
 * the row it's anchored to).
 *
 * The horizontal extent is a separate argument on purpose. Deriving it from the same two elements
 * cropped to whichever of them was widest, which for a description panel meant slicing through the
 * legend behind it and cutting its keys off mid-word. */
async function shotRegion(
  page: Page,
  name: string,
  {
    top,
    bottom,
    across,
    pad = 14
  }: { top: Locator; bottom: Locator; across: Locator; pad?: number }
): Promise<void> {
  const first = await top.boundingBox();
  const last = await bottom.boundingBox();
  const frame = await across.boundingBox();
  if (!first || !last || !frame) throw new Error(`Nothing to frame for ${name}`);
  const y = Math.max(0, first.y - pad);
  await page.screenshot({
    path: `${OUT}/${name}.png`,
    animations: 'disabled',
    clip: {
      x: Math.max(0, frame.x - pad),
      y,
      width: frame.width + pad * 2,
      height: Math.max(last.y + last.height, first.y + first.height) + pad - y
    }
  });
}

/** Plays `code` as a one-question quiz and captures it, after an optional interaction — a board
 * mid-use explains its mechanic far better than an untouched one does. */
async function shotVariant(
  page: Page,
  name: string,
  code: string,
  interact?: (page: Page, play: PlayPage) => Promise<void>
): Promise<void> {
  await seed(page, [single(`shot-${name}`, code)]);
  const play = new PlayPage(page);
  await play.goto(`shot-${name}`);
  if (interact) await interact(page, play);
  await shotMain(page, name);
}

test('home, builder and player', async ({ page }) => {
  await seed(page, [
    quiz('shot-home-1', 'Pub Quiz Night', 'Six rounds, no phones, loser buys the next round.', [
      'pick_one: Which bird gathers in a murmuration?\n{\n=Starlings\n~Swifts\n~Swallows\n}'
    ]),
    quiz('shot-home-2', 'Capitals of Europe', 'Forty countries, one map, no clues.', [
      'type_answer: What is the capital of Italy?\n{\n=Rome\n}'
    ]),
    quiz('shot-home-3', 'The Picture Round', 'Flags, landmarks and one very old video clip.', [
      'pick_one: Whose flag is this?\n{\n=Japan\n~Tunisia\n}'
    ])
  ]);

  await page.goto('/');
  await shotMain(page, 'home');

  // Form mode, reached the way an author reaches it — by clicking the question they want to edit.
  const builder = new BuilderPage(page);
  await builder.gotoEdit('shot-home-1');
  await page.getByText('Which bird gathers in a murmuration?').click();
  await shotPadded(page, 'builder-form', [
    page.locator('[data-question-id]'),
    questionActions(page)
  ]);

  // Code mode: source on the left, live preview on the right, and the settings legend underneath.
  await builder.gotoEdit('shot-home-1');
  await page.getByRole('button', { name: 'Edit question code' }).click();
  await shotPadded(page, 'builder-code', [
    page.locator('[data-question-id]'),
    questionActions(page)
  ]);

  // View mode — the card as it sits in a stack, which is what the builder mostly looks like.
  await builder.gotoEdit('shot-home-1');
  await shotPadded(page, 'builder-view', [
    page.locator('[data-question-id]'),
    questionActions(page)
  ]);

  // The welcome screen — now the first thing anyone sees when they press Play. Settings chosen so
  // the rules list shows several genuinely different kinds of rule (a clock, a reveal policy, a
  // win threshold) rather than only the ones every quiz has.
  await seed(page, [
    quiz(
      'shot-welcome',
      'Pub Quiz Night',
      'Six rounds, no phones, loser buys the next round.',
      [
        'pick_one: Which bird gathers in a murmuration?\n{\n=Starlings\n~Swifts\n~Swallows\n}',
        'type_answer: What is the capital of Italy?\n{\n=Rome\n}',
        'order_items: Put these in chronological order\n{\n=Bronze Age\n=Iron Age\n=Middle Ages\n}'
      ],
      { timer_mode: 'per_quiz', timer_seconds: 300, reveal_scores: 'at_end', percent_to_win: 60 }
    )
  ]);
  const welcome = new PlayPage(page);
  await welcome.goto('shot-welcome', { start: false });
  await shotMain(page, 'player-welcome');

  await shotVariant(
    page,
    'player',
    'pick_one: Which bird gathers in a murmuration?\n{\n=Starlings\n~Swifts\n~Swallows\n~Sparrows\n}'
  );
});

test('the nine question variants', async ({ page }) => {
  await shotVariant(
    page,
    'variant-pick-one',
    'pick_one: Which planet is closest to the Sun?\n{\n=Mercury\n~Venus\n~Mars\n~Earth\n}'
  );

  await shotVariant(
    page,
    'variant-pick-many',
    'pick_many: Which of these are noble gases?\n{\n=Argon\n=Neon\n~Nitrogen\n~Oxygen\n}\n:partial_credit=true',
    async (page) => {
      await page.getByLabel('Argon', { exact: true }).check();
    }
  );

  await shotVariant(
    page,
    'variant-type-answer',
    'type_answer: What is the capital of Italy?\n{\n=Rome\n=Roma\n}',
    async (page) => {
      const field = page.getByPlaceholder('Type your answer');
      await field.fill('Rome');
      // Blurred on purpose. `fill()` leaves the field focused, and whether its focus ring had
      // painted by the time the shot was taken varied run to run — this was the last image still
      // producing a binary diff from an unchanged UI. An unfocused filled field is also the
      // truer picture of "here is an answer typed in".
      await field.blur();
    }
  );

  await shotVariant(
    page,
    'variant-type-pattern',
    'type_pattern: Give any year in the 1990s.\n{\n=199[0-9]\n~19[0-8][0-9]\n}',
    async (page) => {
      await page.getByPlaceholder('Type your answer').fill('1994');
    }
  );

  // Mid-round: a couple of correct guesses and one wrong, so the board shows what it does with each.
  await shotVariant(
    page,
    'variant-guess-letters',
    'guess_letters: A holiday classic, four words\n{\n=[M]urder on the Orient Express\n}',
    async (page) => {
      for (const letter of ['e', 'r', 'z']) {
        await page.getByRole('button', { name: letter, exact: true }).click();
      }
    }
  );

  // One item already placed, so the numbered slots and the pool both have something to show.
  await shotVariant(
    page,
    'variant-order-items',
    'order_items: Put these in chronological order\n{\n=Moon landing\n=Fall of the Berlin Wall\n=First iPhone\n}',
    async (page) => {
      await page.getByRole('button', { name: 'Moon landing', exact: true }).click();
      await page.getByRole('button', { name: /Position 1/ }).click();
    }
  );

  await shotVariant(
    page,
    'variant-match-pairs',
    'match_pairs: Match the capital to its country\n{\n=Paris -> France\n=Tokyo -> Japan\n=Cairo -> Egypt\n}',
    async (page) => {
      await page.getByRole('button', { name: 'Paris', exact: true }).click();
      await page.getByRole('button', { name: 'France', exact: true }).click();
    }
  );

  await shotVariant(
    page,
    'variant-group-items',
    'group_items: Sort these animals by habitat\n{\n=Fish -> Water\n=Frog -> Water\n=Lion -> Land\n=Eagle -> Air\n}',
    async (page) => {
      await page.getByRole('button', { name: 'Fish', exact: true }).click();
      await page
        .getByRole('group', { name: 'Water' })
        .getByRole('button', { name: 'Place here' })
        .click();
    }
  );

  await shotVariant(
    page,
    'variant-fill-blanks',
    'fill_blanks: The ___ is the powerhouse of the ___.\n{\n=mitochondria\n=cell\n~nucleus\n}',
    async (page) => {
      await page.getByRole('button', { name: 'mitochondria', exact: true }).click();
      await page.getByRole('button', { name: /Blank 1/ }).click();
    }
  );
});

test('media, hints and the answer reveal', async ({ page }) => {
  const flag =
    'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27300%27%20height%3D%27200%27%20viewBox%3D%270%200%2060%2040%27%3E%3Crect%20width%3D%2760%27%20height%3D%2740%27%20fill%3D%27%23fff%27%20stroke%3D%27%23ddd%27%20stroke-width%3D%270.5%27%2F%3E%3Ccircle%20cx%3D%2730%27%20cy%3D%2720%27%20r%3D%2711%27%20fill%3D%27%23bc002d%27%2F%3E%3C%2Fsvg%3E';

  await shotVariant(
    page,
    'question-media',
    `pick_one: Whose flag is this?\n![A white flag with a single red circle](${flag})\n{\n=Japan\n~Bangladesh\n~Tunisia\n}`
  );

  // The hint already revealed — a screenshot of an unrevealed one shows only a button.
  await shotVariant(
    page,
    'question-reveal',
    'pick_one: Which bird gathers in a murmuration?\n!<reveal>[Nudge me](They do it at dusk, in their thousands.) %-1%\n{\n=Starlings\n~Swifts\n~Swallows\n}',
    async (page) => {
      await page.getByRole('button', { name: /Nudge me/ }).click();
    }
  );

  // A graded question, showing the right/wrong tinting and the score line.
  await shotVariant(
    page,
    'answer-reveal',
    'pick_one: Which planet is closest to the Sun?\n!<analysis>[Why?](Mercury orbits at about 0.39 AU — closer than Venus at 0.72.)\n{\n=Mercury\n~Venus\n~Mars\n}\n:reveal_answers=after_every_question\n:reveal_scores=after_every_question',
    async (page, play) => {
      await page.getByLabel('Venus', { exact: true }).check();
      await play.submitAnswerButton.click();
    }
  );

  // Picture options on both sides of a match — the thing that's hardest to picture from syntax.
  const blue =
    'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27300%27%20height%3D%27200%27%20viewBox%3D%270%200%2060%2040%27%3E%3Crect%20width%3D%2720%27%20height%3D%2740%27%20fill%3D%27%23002395%27%2F%3E%3Crect%20x%3D%2720%27%20width%3D%2720%27%20height%3D%2740%27%20fill%3D%27%23fff%27%2F%3E%3Crect%20x%3D%2740%27%20width%3D%2720%27%20height%3D%2740%27%20fill%3D%27%23ed2939%27%2F%3E%3C%2Fsvg%3E';
  await shotVariant(
    page,
    'variant-match-pairs-pictures',
    `match_pairs: Match each flag to its country\n{\n=![A white flag with a red circle](${flag}) -> Japan\n=![Blue, white and red bands](${blue}) -> France\n}`
  );
});

test('results and review', async ({ page }) => {
  await seed(page, [
    quiz('shot-results', 'Capitals of Europe', 'Forty countries, one map, no clues.', [
      'pick_one: What is the capital of France?\n{\n=Paris\n~Lyon\n~Marseille\n}',
      'type_answer: What is the capital of Italy?\n{\n=Rome\n}'
    ])
  ]);
  const play = new PlayPage(page);
  await play.goto('shot-results');

  await page.getByLabel('Paris', { exact: true }).check();
  await play.submitAnswerButton.click();
  await play.nextQuestionButton.click();
  await play.typedAnswerInput.fill('Rome');
  await play.submitAnswerButton.click();
  await play.seeResultsButton.click();
  await shotMain(page, 'results');

  await play.reviewAnswersButton.click();
  await shotMain(page, 'review');
});

test('settings and import', async ({ page }) => {
  await seed(page, [
    quiz('shot-settings', 'Pub Quiz Night', 'Six rounds, no phones.', [
      'pick_one: Which bird gathers in a murmuration?\n{\n=Starlings\n~Swifts\n~Swallows\n}\n:points_correct=2\n:options_layout=grid2x2'
    ])
  ]);
  const builder = new BuilderPage(page);
  await builder.gotoEdit('shot-settings');

  // The question's settings block, open, with its key legend showing — scoped to the question card
  // because the quiz metadata card above has a settings block of its own with the same controls.
  await page.getByText('Which bird gathers in a murmuration?').click();
  const card = page.locator('[data-question-id]');
  const settingsToggle = card.getByRole('button', { name: /^Settings/ });
  const addSetting = card.getByRole('button', { name: 'Add setting' });
  await settingsToggle.scrollIntoViewIfNeeded();
  await shotRegion(page, 'settings-block', {
    top: settingsToggle,
    bottom: addSetting,
    across: card
  });

  // One key's description panel open, which is what every key in that legend does. Framed from the
  // legend key down to the panel itself, since the panel is fixed-positioned and lives outside the
  // block it describes.
  const legendKey = card.getByRole('button', { name: 'points_correct', exact: true });
  await legendKey.click();
  const panel = page.getByRole('note');
  await panel.waitFor();
  await shotRegion(page, 'setting-help', { top: settingsToggle, bottom: panel, across: card });

  // The import dialog, including "Load a sample".
  await page.goto('/');
  await page.getByRole('button', { name: 'Import' }).click();
  await shotPadded(page, 'import', page.getByRole('dialog'));

  // The share dialog, with a real link in it. Its URL is deterministic for a fixed document —
  // deflate is, and the preview server's origin is fixed — so this image stays byte-identical.
  await builder.gotoEdit('shot-settings');
  await builder.shareLink();
  await shotPadded(page, 'share-dialog', page.getByRole('dialog'));
});

// A quiz group published on GitHub. Stubbed exactly as the e2e suite stubs it (see
// e2e/utils/github.ts) — a screenshot run must no more depend on a real repository being reachable
// than a test run does, and a stub also keeps the content deterministic.
test('quiz groups from GitHub', async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);

  const round = (title: string, question: string, right: string, wrong: string) =>
    [
      '---',
      `title: ${title}`,
      ':shuffle_questions=false',
      '---',
      '',
      question,
      '{',
      `=${right}`,
      `~${wrong}`,
      '}'
    ].join('\n');

  await stubRepo(page, 'qwiz-quizzes', 'pub-quiz', {
    files: {
      '.qwizgroup': [
        '---',
        'title: Thursday Night Quiz',
        'description: Every round we have ever run, from the easy opener to the decider.',
        ':mode=folders',
        '---',
        '',
        'quiz: rounds/general-knowledge.qwiz',
        'title: General Knowledge',
        '',
        'quiz: rounds/music.qwiz',
        'title: Music and Lyrics',
        '',
        'quiz: finals/the-decider.qwiz',
        'title: The Decider'
      ].join('\n'),
      'rounds/general-knowledge.qwiz': round(
        'General Knowledge',
        'Which planet is closest to the Sun?',
        'Mercury',
        'Venus'
      ),
      'rounds/music.qwiz': round(
        'Music and Lyrics',
        'Who released "Rumours" in 1977?',
        'Fleetwood Mac',
        'The Eagles'
      ),
      'finals/the-decider.qwiz': round(
        'The Decider',
        'What is the capital of Australia?',
        'Canberra',
        'Sydney'
      )
    }
  });

  await page.goto('/group?repo=qwiz-quizzes%2Fpub-quiz');
  await page.getByRole('heading', { name: 'Thursday Night Quiz' }).waitFor();
  await shotPadded(page, 'group-folders', page.locator('main'));

  // The journey map, part-way through: one cleared, one open, one still locked — the only state
  // that shows what the mode actually does.
  await stubRepo(page, 'qwiz-quizzes', 'trail', {
    files: {
      '.qwizgroup': [
        '---',
        'title: The Qwiz Trail',
        'description: Clear one to unlock the next, then face the final boss.',
        ':mode=journey',
        ':require_win=false',
        '---',
        '',
        'quiz: world-capitals.qwiz',
        'id: capitals',
        'title: World Capitals',
        '',
        'quiz: spelling-bee.qwiz',
        'id: spelling',
        'title: Spelling Bee',
        'requires: [capitals]',
        '',
        'quiz: grand-finale.qwiz',
        'id: finale',
        'title: The Grand Finale',
        'requires: [spelling]',
        ':require_win=true'
      ].join('\n'),
      'world-capitals.qwiz': round('World Capitals', 'Capital of Japan?', 'Tokyo', 'Osaka'),
      'spelling-bee.qwiz': round(
        'Spelling Bee',
        'Which is spelled correctly?',
        'necessary',
        'neccessary'
      ),
      'grand-finale.qwiz': round('The Grand Finale', 'Capital of Canada?', 'Ottawa', 'Toronto')
    }
  });

  // Seeded directly rather than played through: the image needs a specific mid-journey state, and
  // the store is the honest way to arrange one (same rule the e2e suite follows for seeding).
  await page.goto('/group?repo=qwiz-quizzes%2Ftrail');
  await page.evaluate(() =>
    localStorage.setItem(
      'qwiz:group-progress',
      JSON.stringify({
        'qwiz-quizzes/trail': {
          plays: { capitals: { completed: true, won: true } },
          updatedAt: '2025-01-01T00:00:00.000Z'
        }
      })
    )
  );
  await page.reload();
  await page.getByText('1 of 3 cleared').waitFor();
  await shotPadded(page, 'group-journey', page.locator('main'));
});
