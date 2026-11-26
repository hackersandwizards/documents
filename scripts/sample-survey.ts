/** A rating question's tally on a 1-based scale: its distribution, count and mean. */
const ratings = (title: string, dist: number[], group?: string) => {
  const start = 1;
  const n = dist.reduce((a, b) => a + b, 0);
  const mean = dist.reduce((sum, c, i) => sum + c * (start + i), 0) / n;
  return { title, n, mean, start, end: start + dist.length - 1, dist, group };
};

/** An attendee-feedback readout: invented responses for an invented team. */
export const surveyReadout = {
  customerName: "Musterwerk AG",
  training: "Agentic Engineering Training",
  days: 2,
  dateRange: "Training date 12 Nov 2026",
  attendees: 12,
  teams: 1,
  counts: { all: 11, completed: 10 },
  headline: ratings("How satisfied are you with the training overall?", [0, 0, 1, 4, 5]),
  scales: [
    ratings("The exercises fit our daily work.", [0, 1, 5, 4]),
    ratings("The pace was right for me.", [0, 2, 6, 2]),
    ratings("The trainer explained clearly.", [0, 0, 3, 7], "Trainer"),
    ratings("The trainer answered our questions.", [0, 0, 2, 8], "Trainer"),
    ratings("I feel confident using agents at work.", [0, 3, 5, 2], "Confidence & application"),
  ],
  risks: [
    { label: "Review effort grows", n: 5 },
    { label: "Unclear rules in the team", n: 3 },
    { label: "Tool access", n: 2 },
  ],
  noRisk: { label: "I do not see a major risk", n: 1 },
  asked: { liked: "What did you like most?", improve: "What should we improve?" },
  liked: [
    "An invented answer: the exercises on a real codebase made the difference for me.",
    "An invented answer: clear structure and room for questions.",
    "An invented answer: the review loop.",
  ],
  improve: [
    "An invented answer: more time for the second exercise.",
    "An invented answer: a short summary at the end of each day.",
  ],
  readout: {
    strengths: [
      "Overall satisfaction (4.4)",
      "The exercises fit our daily work. (3.3)",
      "The trainer explained clearly. (3.7)",
      "The trainer answered our questions. (3.8)",
    ],
    weak: ["I feel confident using agents at work. (2.9)"],
    // bandColor of 2.9 on 1-4.
    weakColors: ["var(--deck-bar-step)"],
    flags: ["Top perceived risk: Review effort grows (5×)"],
  },
};
