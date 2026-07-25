# Rule registry stays internal

The rule registry is sealed inside the package and Docsentry exposes no
rule-plugin Interface. A plugin Interface would be a shallow seam while every
rule implementation still lives in this package, and publishing one would freeze
the internal shape of rule evaluation before there is evidence about what an
external rule actually needs.

**Falsified if:** `package.json` `exports` grows an entry beyond `"."`, or any
module under `src/core/rules/` becomes reachable from the published surface.
