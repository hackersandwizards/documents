/** Every word the deck prints itself, in English. */
export const READOUT_TEXT = {
  lang: "en",
  documentTitle: "Survey Readout: {customer}",
  eyebrow: "Attendee Feedback Readout · Internal",
  days: "{days}-day training",
  responses: "responses",
  attendees: "attendees",
  responseRate: "response rate",
  team: "team",
  teams: "teams",
  verbatim: "Questions and answers appear verbatim, as the form asked them.",
  kicker: "Attendee feedback · {customer}",
  glance: "At a glance",
  overall: "/ {end} overall satisfaction",
  /** Under the overall score, naming the bars beside it. */
  distribution: "Mean of {n} responses. The bars show the spread behind it.",
  /** The same line for a single response, which has no mean and no spread. */
  distributionOne: "From a single response, shown by the bar.",
  /** Over each bar of the overall distribution, and on the baseline for a rating nobody chose. */
  answers: "{n} answers",
  answer: "{n} answer",
  axis: "Rating, {start} (low) to {end} (high)",
  /** The axis of a scale too long for "{n} answers" over each bar, which then prints the count alone. */
  axisCounts: "Answers per rating, {start} (low) to {end} (high)",
  completed: "completed",
  /** Submissions an attendee left before the end: they score nothing. */
  unfinished: "{n} unfinished, not scored",
  ofAttendees: "of {attendees} attendees",
  scores: "Scores by dimension",
  /** The scores slide's sections in order; the first takes a scale without a group. */
  groups: ["Content & format", "Trainer", "Confidence & application"],
  noDimension: "No dimension resolved for this form. See Flags on the readout slide.",
  barKey: "Bar = mean on {start}–{end}",
  bandFrom: "from {value}",
  bandBelow: "below",
  overallScale: "Overall satisfaction (page 2): {start}–{end}",
  stripKey: "Strip = share of answers per rating",
  risks: "Biggest perceived risk for applying agentic engineering",
  noRisk: '"{label}": {n} ({share}%), not ranked as a risk',
  riskCaption: "Multi-select · {n} respondents · bar = share of respondents",
  liked: "What they liked",
  improve: "What to improve",
  asked: 'Asked: "{question}"',
  noAnswers: "No free-text responses.",
  more: "Longest answers first. + {n} more in the raw snapshot.",
  readout: "Readout",
  strengths: "Strengths",
  weakSpots: "Weak spots",
  flags: "Flags",
  markerKey: "Marker = the score's band on page 3:",
  /** The four bands, strong to weak. */
  bands: ["strong", "good", "middling", "weak"],
  flagKey: "flag, not a score",
};
export type ReadoutText = typeof READOUT_TEXT;
