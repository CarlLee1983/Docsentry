# Baseline suppression lives outside the engine

Baseline suppression is applied to an already-ordered report, outside
`VerificationEngine.verify`, rather than being consulted while contracts are
evaluated. A contract therefore never learns that one of its findings is
suppressed, which keeps the engine deterministic and keeps "what is true about
this checkout" separate from "what this project has chosen to defer".

**Falsified if:** `src/core/verify.ts` imports `src/core/baseline.ts`, or any
module under `src/core/rules/` reads baseline state.
