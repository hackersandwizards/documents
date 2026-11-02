import styles from "@hackersandwizards/scaffolding/stylelint";

// The engine's own definitions beside brand's tokens: the document tokens, the base, and the
// properties a page sets in a style attribute (inline-properties.css).
export default styles({
  importFrom: [
    "tokens.css",
    "document.css",
    "inline-properties.css",
    "@hackersandwizards/brand/print.css",
    "@hackersandwizards/brand/document.css",
    "@hackersandwizards/brand/marker.css",
    "@hackersandwizards/brand/elements.css",
  ],
});
