/** Hardcoded example `.qwiz` documents, offered from the Import dialog's "Load a sample" modal
 * so a new author can see the format in action rather than starting from a blank page. Each one
 * deliberately exercises a different slice of the format — together they touch every feature
 * quizScript.ts supports (see the parser's own top-of-file doc comment for the full syntax). */
export interface SampleQuiz {
  title: string;
  description: string;
  code: string;
}

export const sampleQuizzes: SampleQuiz[] = [
  {
    title: 'World Capitals',
    description:
      'A plain single-select quiz — the simplest shape a quiz gets. Good starting point.',
    code: `---
title: World Capitals
description: A quick trip around the globe — match each country to its capital city.
category: geography
tags: [geography, capitals, easy]
:max_questions=5
:shuffle_questions=true
---

single_choice: What is the capital of France?
{
=Paris
~London
~Berlin
~Madrid
}

single_choice: What is the capital of Japan?
{
=Tokyo
~Seoul
~Beijing
~Bangkok
}

single_choice: What is the capital of Australia?
{
=Canberra
~Sydney
~Melbourne
~Perth
}

single_choice: What is the capital of Canada?
{
=Ottawa
~Toronto
~Vancouver
~Montreal
}

single_choice: What is the capital of Egypt?
{
=Cairo
~Alexandria
~Giza
~Luxor
}`
  },
  {
    title: 'Media & Hints Showcase',
    description:
      'Image options, a video option, and a reveal hint in both places it can go — before the options and tucked inside them.',
    code: `---
title: Media & Hints Showcase
description: Demonstrates image options, a video option, and reveal hints — both as a question-level extra and interspersed inside the options block.
category: demo
tags: [demo, media, hints]
---

single_choice: Which of these is the Eiffel Tower?
!<reveal>[Need a hint?](It's in Paris, France, and made of wrought iron.) %-1%
:option_display=grid
{
=![Eiffel Tower](https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/La_tour_d%27eiffel_en_journ%C3%A9e_%287_ao%C3%BBt_2023%29.jpg/3840px-La_tour_d%27eiffel_en_journ%C3%A9e_%287_ao%C3%BBt_2023%29.jpg)
~![Big Ben](https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Big_Ben_at_sunset_-_2014-10-27_17-30.jpg/960px-Big_Ben_at_sunset_-_2014-10-27_17-30.jpg)
~![Pisa](https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Exterior_of_the_Leaning_Tower_%28Pisa%29_04.jpg/960px-Exterior_of_the_Leaning_Tower_%28Pisa%29_04.jpg)
~![Colosseum](https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Rom_%28IT%29%2C_Kolosseum_--_2024_--_0610.jpg/960px-Rom_%28IT%29%2C_Kolosseum_--_2024_--_0610.jpg)
}

single_choice: Which of these is the classic video used as "Rick Roll"?
{
=!<youtube>[Rick Astley - Never Gonna Give You Up](https://www.youtube.com/watch?v=dQw4w9WgXcQ)
~!<youtube>[Some other video](https://www.youtube.com/watch?v=9bZkp7q19f0)
!<reveal>[Why does this matter?](It's the internet's most famouse harmless prank!)
}`
  },
  {
    title: 'Advanced Scoring',
    description:
      'Multi-select with partial credit, per-option point weights, quiz-wide win thresholds, and text-escaping edge cases.',
    code: `---
title: Advanced Scoring
description: Multi-select partial credit, per-option point weights, and quiz-wide win thresholds — for authors who want more than plain right/wrong.
category: demo
tags: [demo, scoring, advanced]
:points_to_win=15
:percentage_points_to_win=70
---

multiple_choice: Which of these are primary colors? (select all that apply)
:partial_points=true
{
=Red %3%
=Green %3%
=Blue %3%
=Yellow %3%
~Purple
}
:difficulty=easy

multiple_choice: Which of these are noble gases?
:penalty=-1
:point=5
:max_answers=3
{
=Helium
~Oxygen
=Neon
~Nitrogen
}
:difficulty=hard

single_choice: Escaping demo — one option's text starts with a literal "=", the other is quoted.
{
=\\=mc^2 is Einstein's famous equation
~"This whole option is quoted, so it stays plain text"
}`
  },
  {
    title: 'Type the Answer',
    description:
      'The typed variant in all its shapes: a single input, character boxes (single and multi-guess), partial credit, and fuzzy/numeric matching.',
    code: `---
title: Type the Answer
description: Demonstrates the typed variant — single input, character-box input (single and multi-guess), multi-guess partial credit, and the fuzzy/numeric matching settings.
category: demo
tags: [demo, typed]
---

typed: What is the capital of France? (typo-tolerant — try "Pario")
:fuzzy_tolerance=20
{
=Paris
=paris
}

typed: What is the value of pi, to two decimal places?
:numeric_tolerance=0.01
{
=3.14
}

typed: Guess the 5-letter fruit that keeps doctors away. (character-box input)
:input_display=boxes
{
=apple
}

typed: Name two of these three fruits that starts with A-B-C. (partial credit for each one you get right)
:partial_points=true
:min_answers=1
:max_answers=2
:penalty=-1
{
=apple
=banana
=cherry
}

typed: Name these two cities. (multi-guess character-box input)
:input_display=boxes
:min_answers=2
:max_answers=2
{
=new york
=san jose
}`
  },
  {
    title: 'Hangman Challenge',
    description:
      'The character_input variant: guess a word letter-by-letter from an on-screen bank, Hangman-style — pre-revealed characters, a per-wrong-guess penalty, and both reveal_mode options.',
    code: `---
title: Hangman Challenge
description: Guess each word one letter at a time. A wrong guess costs a point.
category: demo
tags: [demo, character_input, hangman]
---

character_input: Guess the capital of France (one letter pre-revealed)
{
=[P]aris
}
:letter_bank=alphabet
:reveal_mode=all
:penalty=-1

character_input: Name a primary color (repeated letters reveal one at a time)
{
=yellow
}
:letter_bank=auto
:reveal_mode=sequence
:prereveal_count=1
:penalty=-1`
  }
];
