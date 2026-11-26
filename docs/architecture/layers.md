# Layers

```mermaid
graph LR
  L0["."]
  L1["catalog"]
  L2["components"]
  L3["scripts"]
  L4["test"]
  L1 -->|9| L0
  L1 -->|44| L2
  L1 -->|42| L3
  L2 -->|11| L3
  L4 -->|2| L0
  L4 -->|5| L1
  L4 -->|129| L3
```

## scripts

| Forbidden import                                                                          | Message                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `^(?:(?:\.\./)+(?:components\|catalog)\|@hackersandwizards/documents/components)(?:/\|$)` | `scripts/** cannot import from components/, catalog/, or @hackersandwizards/documents/components. Move shared types, helpers, or sample data into scripts/ (such as scripts/samples.ts), or render components via scripts/compose.ts or catalog/. Do not silence with oxlint-disable.` |
