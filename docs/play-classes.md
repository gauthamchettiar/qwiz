# Styling the play screen

Every element a player sees carries a `qwiz-` class. Those names are a **published API**: a quiz's
`theme-css:` block, and the built-in presets, both target them, so renaming one breaks themes
people have already written.

Use them from a quiz's own CSS (the **Look** row in the builder, or `theme-css:` in a `.qwiz`
file — see [the format reference](./qwiz-format.md#giving-a-quiz-its-own-look)).

## The classes

| Class                    | What it is                                                 |
| ------------------------ | ---------------------------------------------------------- |
| `.qwiz-welcome`          | The whole welcome panel, before the run starts             |
| `.qwiz-title`            | The quiz's title on that panel                             |
| `.qwiz-description`      | Its description                                            |
| `.qwiz-rules`            | The "How this quiz works" list                             |
| `.qwiz-start`            | The Start button                                           |
| `.qwiz-question`         | One question, whole — the wrapper everything below sits in |
| `.qwiz-question-text`    | The question's own text                                    |
| `.qwiz-options`          | The container holding a choice question's options          |
| `.qwiz-option`           | One option. A `<label>` wrapping a real radio or checkbox  |
| `.qwiz-option--selected` | …that the player has picked                                |
| `.qwiz-option--correct`  | …revealed as correct, after answering                      |
| `.qwiz-option--wrong`    | …that the player picked and got wrong                      |

The state classes sit **alongside** `.qwiz-option`, never replacing it, so `.qwiz-option` styles
every option and `.qwiz-option--correct` styles only the revealed-correct ones.

## Notes that will save you time

- **Your rules are appended after the app's stylesheet**, so a single class beats a Tailwind
  utility of the same specificity without needing `!important`.
- **A preset applies first, your CSS second.** You are overriding the preset, not fighting it.
- **The option's `<input>` is real.** Loud presets hide it (`.qwiz-option input { display: none }`)
  and treat the whole tile as the control; quiet ones leave it visible. Hiding it costs nothing in
  accessibility — the `<label>` still labels it, and keyboard and screen-reader behaviour are
  unchanged.
- **`:nth-child()` works on `.qwiz-options`**, which is how the Arcade preset gives each option a
  different colour.
- **Colours you don't set come from the player's own app theme.** If you want your look to be the
  same for everyone, set them explicitly rather than relying on Qwiz's defaults.

## Example

```css
.qwiz-question-text {
  font-family: Georgia, serif;
  font-size: 1.5rem;
}

.qwiz-option {
  border-radius: 999px;
  padding: 1rem 1.25rem;
}

.qwiz-option--correct {
  background: #e6f4ea;
  border-color: #1e7e34;
}
```

## When your colour doesn't apply

Some elements carry their own semantic colour class (`.qwiz-rules li` is muted, image captions are
subtle). Setting `color` on the container won't reach them, because an explicit colour on the child
beats an inherited one. Name the child:

```css
.qwiz-rules,
.qwiz-rules li {
  color: #cfc6f5;
}
```

Option text is the exception and inherits normally, so `.qwiz-option { color: #fff }` is enough.
