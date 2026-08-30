// Deterministic content.json builders — used by the mock engine and as the
// shape the model is asked to fill. Structures follow the public H5P content
// specs for each library; calibrate against real Smart Import exports in data/.

interface QA {
  question: string;
  correct: string;
  distractors: string[];
}

export function buildSummary(concepts: string[]) {
  return {
    intro: "Choose the correct statement.",
    summaries: concepts.slice(0, 5).map((c) => ({
      subline: "",
      tip: "",
      summary: [
        `${c} is accurately described here.`,
        `${c} is described incorrectly here.`,
        `${c} is unrelated to this material.`,
      ],
    })),
    overallFeedback: [{ from: 0, to: 100 }],
    solvedLabel: "Progress:",
    scoreLabel: "Wrong answers:",
    resultLabel: "Your result",
    labelCorrect: "Correct.",
    labelIncorrect: "Incorrect! Please try again.",
    alternativeIncorrectLabel: "Incorrect",
    labelCorrectAnswers: "Correct answers.",
    tipButtonLabel: "Show tip",
    scoreBarLabel: "You got :num out of :total points",
  };
}

let scid = 0;
const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    // deterministic-ish; fine for a mock
    const r = (scid++ * 9301 + 49297) % 233280;
    const v = c === "x" ? r % 16 : (r % 4) + 8;
    return v.toString(16);
  });

export function buildQuestionSet(qa: QA[]) {
  return {
    introPage: { showIntroPage: false },
    progressType: "dots",
    passPercentage: 50,
    disableBackwardsNavigation: false,
    randomQuestions: false,
    questions: qa.slice(0, 8).map((q) => ({
      library: "H5P.MultiChoice 1.16",
      subContentId: uuid(),
      params: {
        question: `<p>${q.question}</p>\n`,
        answers: [
          { text: `<div>${q.correct}</div>\n`, correct: true },
          ...q.distractors.slice(0, 3).map((d) => ({
            text: `<div>${d}</div>\n`,
            correct: false,
          })),
        ],
        behaviour: { singleAnswer: true, enableRetry: true, enableSolutionsButton: true },
      },
      metadata: { contentType: "Multiple Choice", license: "U", title: q.question.slice(0, 40) },
    })),
    texts: {
      prevButton: "Previous",
      nextButton: "Next",
      finishButton: "Finish",
      textualProgress: "Question @current of @total",
    },
    endGame: { showResultPage: true, showSolutionButton: true, showRetryButton: true },
  };
}

export function buildDialogCards(
  pairs: { term: string; definition: string }[],
) {
  return {
    title: "Key concepts",
    mode: "normal",
    description: "Flip each card to check the definition.",
    dialogs: pairs.slice(0, 12).map((p) => ({
      text: `<p>${p.term}</p>\n`,
      answer: `<p>${p.definition}</p>\n`,
      tips: {},
    })),
    behaviour: { enableRetry: true, disableBackwardsNavigation: false, scaleTextNotCard: false, randomCards: false },
    next: "Next",
    prev: "Previous",
    retry: "Retry",
    answer: "Turn",
    progressText: "Card @card of @total",
  };
}

export function buildDragText(gapSentences: { text: string; answer: string }[]) {
  return {
    taskDescription: "<p>Drag the words into the correct gaps.</p>\n",
    textField: gapSentences
      .slice(0, 8)
      .map((g) => g.text.replace(g.answer, `*${g.answer}*`))
      .join("\n"),
    overallFeedback: [{ from: 0, to: 100 }],
    checkAnswer: "Check",
    tryAgain: "Retry",
    showSolution: "Show solution",
    behaviour: { enableRetry: true, enableSolutionsButton: true, instantFeedback: false },
    dropZoneIndex: "Drop Zone @index.",
  };
}

export function buildCrossword(entries: { clue: string; answer: string }[]) {
  return {
    taskDescription: "<p>Solve the crossword using the clues.</p>\n",
    words: entries
      .filter((e) => /^[A-Za-z][A-Za-z\s-]{1,18}$/.test(e.answer))
      .slice(0, 10)
      .map((e, i) => ({
        clue: e.clue,
        answer: e.answer.toUpperCase().replace(/\s+/g, ""),
        orientation: i % 2 === 0 ? "across" : "down",
        fixWord: false,
      })),
    behaviour: { enableRetry: true, enableSolutionsButton: true, enableInstantFeedback: false },
    theme: { backgroundColor: "#173354" },
    l10n: { across: "Across", down: "Down", checkAnswer: "Check", tryAgain: "Retry", showSolution: "Show solution" },
    a11y: {},
  };
}

export function buildAccordion(items: { title: string; body: string }[]) {
  return {
    hTag: "h3",
    panels: items.slice(0, 12).map((it) => ({
      title: it.title,
      content: {
        params: { text: `<p>${it.body}</p>\n` },
        library: "H5P.AdvancedText 1.1",
        subContentId: uuid(),
        metadata: { contentType: "Text", license: "U", title: it.title },
      },
    })),
  };
}

/**
 * Structure calibrated against a real Smart Import export
 * (data/plate-tectonics-single-choice-set.h5p): plain-text questions (no <p>),
 * answers[0] is the correct one, each choice carries a subContentId.
 */
export function buildSingleChoiceSet(qa: QA[]) {
  return {
    choices: qa.slice(0, 8).map((q) => ({
      subContentId: uuid(),
      question: q.question,
      answers: [q.correct, ...q.distractors.slice(0, 3)],
    })),
    behaviour: {
      timeoutCorrect: 1000,
      timeoutWrong: 1000,
      soundEffectsEnabled: false,
      enableRetry: true,
      enableSolutionsButton: true,
      passPercentage: 100,
      autoContinue: false,
    },
    overallFeedback: [
      { from: 0, to: 100, feedback: "You got :numcorrect of :maxscore correct" },
    ],
    l10n: {
      nextButtonLabel: "Next question",
      nextButton: "Next",
      showResultsButtonLabel: "Show results",
      retryButtonLabel: "Retry",
      solutionViewTitle: "Solution list",
      correctText: "Correct!",
      incorrectText: "Incorrect!",
      shouldSelect: "Should have been selected",
      shouldNotSelect: "Should not have been selected",
      muteButtonLabel: "Mute feedback sound",
      closeButtonLabel: "Close",
      slideOfTotal: "Slide :num of :total",
      scoreBarLabel: "You got :num out of :total points",
      solutionListQuestionNumber: "Question :num",
      a11yShowSolution:
        "Show the solution. The task will be marked with its correct solution.",
      a11yRetry:
        "Retry the task. Reset all responses and start the task over again.",
      resultHeader: "Your result:",
      totalScore: ":score of :maxScore correct",
      resultTableHeader: "Question",
      resultScoreTableHeader: "Score",
      correctAnswerIntroduction: "Correct answer",
    },
  };
}

export function buildTrueFalse(statement: string, answerIsTrue: boolean) {
  return {
    question: `<p>${statement}</p>\n`,
    correct: answerIsTrue ? "true" : "false",
    behaviour: { enableRetry: true, enableSolutionsButton: true, confirmCheckDialog: false, confirmRetryDialog: false, autoCheck: false },
    l10n: {
      trueText: "True",
      falseText: "False",
      score: "You got @score of @total points",
      checkAnswer: "Check",
      showSolutionButton: "Show solution",
      tryAgain: "Retry",
      wrongAnswerMessage: "Wrong answer",
      correctAnswerMessage: "Correct answer",
      scoreBarLabel: "You got :num out of :total points",
    },
    confirmCheck: { header: "Finish ?", body: "Are you sure you wish to finish ?", cancelLabel: "Cancel", confirmLabel: "Finish" },
    confirmRetry: { header: "Retry ?", body: "Are you sure you wish to retry ?", cancelLabel: "Cancel", confirmLabel: "Confirm" },
  };
}

export function buildFlashcards(pairs: { term: string; definition: string }[]) {
  return {
    cards: pairs.slice(0, 12).map((p) => ({
      text: `<p>${p.definition}</p>\n`,
      answer: p.term,
      tip: "",
    })),
    progressText: "Card @card of @total",
    next: "Next",
    previous: "Previous",
    checkAnswerText: "Check",
    showSolutionsRequiresInput: true,
    defaultAnswerText: "Your answer",
    correctAnswerText: "Correct",
    incorrectAnswerText: "Incorrect",
    showSolutionText: "Correct answer",
    results: "Results",
    ofCorrect: "@score of @total correct",
    showResults: "Show results",
    answerShortText: "A:",
    retry: "Retry",
    caseSensitive: false,
    cardAnnouncement: "Incorrect answer. Correct answer was @answer",
    pageAnnouncement: "Page @current of @total",
  };
}
