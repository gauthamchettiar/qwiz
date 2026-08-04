# The `.qwizgroup` format

A `.qwizgroup` file turns a folder of `.qwiz` files in a public GitHub repository into a **group** —
something people can browse, work through in order, or play as one long quiz, from a single link.

It is deliberately the same shape as a `.qwiz` file: a `---` frontmatter block, then blank-line
separated blocks. If you can write a quiz, you already know this format.

```
---
title: The Qwiz Trail
description: Clear one to unlock the next, then face the final boss.
:mode=journey
---

quiz: world-capitals.qwiz
id: capitals

quiz: spelling-bee.qwiz
id: spelling
requires: [capitals]

quiz: grand-finale.qwiz
id: finale
requires: [spelling]
:require_win=true
```

Put that in a file called `.qwizgroup` at the root of your repository (or in any folder), push it,
and open:

```
https://qwiz.gauthamchettiar.com/group?repo=your-name/your-repo
```

A worked example ships with Qwiz in [`examples/group/`](../examples/group/).

---

## Why write one

**You don't have to.** Point Qwiz at any public repository containing `.qwiz` files and it will list
them, using the folder structure as the grouping. A manifest buys you three things:

1. **Modes.** Journeys, merged mega-quizzes, playlists and the rest only exist because a manifest
   says so.
2. **Titles without a wait.** A `title:` on each entry means the list renders immediately. Without
   one, Qwiz shows the filename, because knowing the real title would mean downloading every quiz
   in the group before drawing anything.
3. **No rate limit.** This is the big one. To find quizzes in a repository _without_ a manifest,
   Qwiz has to ask GitHub's API for the file list — and unauthenticated API calls are capped at **60
   per hour per IP address**, shared with everything else on that network. A manifest that lists its
   quizzes needs **no API calls at all**: every file is fetched from `raw.githubusercontent.com`,
   which isn't rate limited. On a shared network — an office, a school, a conference — that is the
   difference between the link working and the link failing.

---

## Group-wide settings

Written in the frontmatter as `:key=value`, exactly like a quiz's own settings.

| Key                  | Accepted values                                                  | Default   | Applies to | What it does                                                                                                   |
| -------------------- | ---------------------------------------------------------------- | --------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| `discover`           | `true`, `false`                                                  | `false`   | `folders`  | Also list every `.qwiz` file found in the repository, not just the ones named here. Costs one GitHub API call. |
| `mode`               | `folders`, `journey`, `merge`, `playlist`, `gauntlet`, `shuffle` | `folders` | all        | How the group is presented and played. See below.                                                              |
| `pick`               | any number                                                       | `1`       | `shuffle`  | How many quizzes to draw.                                                                                      |
| `questions_per_pick` | any number                                                       | `1`       | `gauntlet` | Questions answered before choosing a category again.                                                           |
| `require_win`        | `true`, `false`                                                  | `false`   | `journey`  | Whether a quiz must be _won_ to unlock the next, rather than merely finished.                                  |
| `rounds`             | any number                                                       | `10`      | `gauntlet` | How many category picks make up a full run.                                                                    |
| `shuffle_quizzes`    | `true`, `false`                                                  | `false`   | `playlist` | Play the quizzes in a random order. Not the same as `shuffle_questions`, which randomises _within_ one quiz.   |

A key used in a mode it means nothing to is an **error**, not a silent no-op — writing `:rounds=5`
under a journey would otherwise look like it did something.

**Every quiz-wide setting also works here.** Anything from
[`settings.md`'s quiz-wide table](./settings.md) — `points_to_win`, `shuffle_questions`,
`questions_per_run`, `timer_mode`, and the rest — can be written in a `.qwizgroup` frontmatter. In
`merge` mode those become the merged quiz's own settings, which is how an exam-style draw works
without any dedicated feature:

```
---
title: Revision Exam
:mode=merge
:questions_per_run=20
:timer_mode=per_quiz
:timer_seconds=1800
---
```

Twenty questions drawn at random from every quiz in the group, thirty minutes on the clock.

---

## Entry keys

Each blank-line-separated block after the frontmatter describes one quiz.

| Key        | Required     | Applies to | What it does                                                                                       |
| ---------- | ------------ | ---------- | -------------------------------------------------------------------------------------------------- |
| `quiz`     | **yes**      | all        | Path to a `.qwiz` file, relative to the folder this manifest is in.                                |
| `group`    | no           | `folders`  | Section label. Overrides the file's own folder, so a flat directory can present as named sections. |
| `id`       | in `journey` | all        | Unique name for this entry. Defaults to the filename slug. `requires:` refers to it.               |
| `requires` | no           | `journey`  | Entry ids that must be cleared before this one unlocks. Omit for a starting point.                 |
| `title`    | no           | all        | What to call it in a list, so the group renders without downloading every quiz.                    |

A block may also carry `:key=value` lines. Those accept `require_win` plus any quiz-wide setting, so
one entry can be timed or scored differently from the rest of its group:

```
quiz: grand-finale.qwiz
id: finale
requires: [spelling]
:require_win=true
:points_to_win=6
:timer_mode=per_quiz
:timer_seconds=300
```

### Paths

`quiz:` paths are relative to the manifest's own folder, so a group can be moved wholesale without
rewriting every line. `../` is allowed. Absolute paths, and anything that climbs above the
repository root, are refused — and so are URLs: **a manifest may only name files in its own
repository.** Letting it name arbitrary URLs would turn a manifest into a general-purpose fetcher
and make the link lie about what it loaded.

---

## Modes

### `folders` — the default

Browse the group as a folder tree and play any quiz in it. Folders come from the file paths, or from
an explicit `group:` label. This is also what you get with no manifest at all.

### `journey`

Each quiz unlocks the next, per its `requires:`. `require_win` decides whether _finishing_ a quiz
counts or whether you have to _win_ it (see `points_to_win` / `percent_to_win` in
[`settings.md`](./settings.md)). Progress is kept in your own browser, and is never uploaded.

`id:` is mandatory here — without it, a typo in a `requires:` list could silently produce a quiz
nothing ever unlocks.

A `requires:` naming an entry that doesn't exist, or a loop where two quizzes each wait on the
other, is an error rather than something you discover as a permanently locked screen.

### `merge`

Every question from every listed quiz becomes one long quiz. The group's own frontmatter supplies
its title, description and rules. Combine with `:questions_per_run=N` for an exam-style random draw.

### `playlist`

Play the quizzes back to back in the order listed, with one scoreboard across the whole run. Add
`:shuffle_quizzes=true` to randomise that order.

### `gauntlet`

The group's subfolders become categories. You pick a category, answer `questions_per_pick`
questions from it, then pick again — for `rounds` rounds — and are scored on the average.

### `shuffle`

Draw `pick` quizzes from the group at random and play those.

---

## Several groups in one repository

A `.qwizgroup` in a subfolder owns that subfolder. The nearest manifest at or above a file is the
one that governs it, so a repository can hold as many groups as it likes:

```
.qwizgroup            ← governs everything not claimed below
rounds/one.qwiz
trail/.qwizgroup      ← governs trail/
trail/first.qwiz
trail/second.qwiz
```

A folders group shows any nested group as a link to its own screen rather than flattening its
contents in. You can also link straight to one:

```
/group?repo=owner/repo&path=trail
```

---

## Link options

| Parameter | Meaning                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------- |
| `repo`    | `owner/name`, or a whole `github.com` address. Required.                                        |
| `path`    | A folder inside the repository. Defaults to the root.                                           |
| `ref`     | A branch, tag or commit. Defaults to the repository's default branch, resolved fresh each time. |

Leaving `ref` off is usually what you want: the link keeps working when a default branch is renamed,
and always shows the current version. Pin it (`&ref=v1`) when you want a link that can't change
under you.

One caveat worth knowing: `raw.githubusercontent.com` caches for around five minutes, so a quiz you
just pushed may take a few minutes to appear.

---

## Limits

- **Public repositories and gists only.** Qwiz reads GitHub signed out, and never sends your
  credentials, so anything private is simply invisible to it.
- **Very large repositories** can't be listed in one call. If Qwiz says so, add a `.qwizgroup` — a
  manifest that names its quizzes has no such limit, because nothing has to be scanned.
- **Nothing is saved to your browser** by opening a group. Play a quiz and press _Save a copy_ to
  keep it.
