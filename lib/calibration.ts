// Structural reference for the model engine — the SHAPE of H5P content.json for
// each content type, so the LLM matches H5P's format. No topic content: the twin
// generates strictly from the educator's provided source.

export const STRUCTURE_REFERENCE: Record<string, string> = {
  "H5P.SingleChoiceSet": JSON.stringify({
    choices: [
      {
        subContentId: "<uuid v4>",
        question: "<plain text, no HTML>",
        answers: [
          "<the correct answer, FIRST>",
          "<distractor>",
          "<distractor>",
          "<distractor>",
        ],
      },
    ],
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
      showResultsButtonLabel: "Show results",
      retryButtonLabel: "Retry",
      solutionViewTitle: "Solution list",
      correctText: "Correct!",
      incorrectText: "Incorrect!",
      shouldSelect: "Should have been selected",
      shouldNotSelect: "Should not have been selected",
      resultHeader: "Your result:",
    },
  }),
};

STRUCTURE_REFERENCE["H5P.QuestionSet"] = STRUCTURE_REFERENCE["H5P.SingleChoiceSet"];
