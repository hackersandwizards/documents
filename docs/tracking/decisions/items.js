window.DECISION_REPOS = window.DECISION_REPOS || {};
window.DECISION_REPOS["documents"] = [
  {
    id: "doc-table-band",
    title:
      "Tables with a band (a total row, a rate card's rates): keep the band, now bleeding 5 pt past the text edge (B, shipped in v0.2.2), or drop the band (A)?",
    area: "brand",
    priority: 3,
    order: 1,
    status: "open",
    context:
      "Your feedback of 01.11.: the total and rate rows sat indented on their tinted band while every other row was flush, and the amount ran into the band's right edge. v0.2.2 ships B: a table holding a band reaches 5 pt past the text edge on both sides, rules and band included, so every row's text stays flush with the heading. Blind review, 2 personas (buyer, design-minded engineering lead) x Claude and Codex x 2 runs, 8 reviews per variant: A no band 92.4, B 89.9, F band kept with text touching its edges 82.3, the old state 74.0; noise 3.4. A and B tie; A would undo the band blind round 4 chose (quote 89.4), so it waits for you. Against A: the total stands out a little less. Against B (the Claude personas): rules and band reach past the edge of the boxes above. Side by side: ~/Downloads/stand-entscheidungen/doc-table-edges/index.html.",
    options: [
      {
        key: "b",
        label: "B keep the band, bleeding 5 pt (shipped)",
        detail:
          "No change. Rules and band of a banded table reach 5 pt past the text edge on both sides.",
      },
      {
        key: "a",
        label: "A drop the band",
        detail:
          "Total rows keep the strong teal rule and the teal figure; rate rows keep the teal figure; no tint, no bleed.",
      },
    ],
    recommended: "b",
  },
];
