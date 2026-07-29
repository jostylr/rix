# Structural arithmetic implementation record

All items from the first backtick-parser follow-up are implemented. This page
remains as the completion record and as a compact index to the supported
surface.

## Parser surface

- [x] Add comments inside `.SArith` bodies.
- [x] Add the remaining RiX exact literal spellings, including mixed numbers,
  continued fractions, explicit bases, and intervals.
- [x] Extend the initial ambiguity diagnostics (`-x^2`, `-x!`, `1/2!`, and
  `1/2^3`) as new prefix and postfix forms are added.
- [x] Add explicit function parameter declarations, such as
  `.SArith.Fun(y,x):body`, when parameter order or unused parameters must be
  supplied rather than inferred.

## Structural algebra

- [x] Add configurable constructor/operation tables for custom operator glyphs,
  fixity, precedence, and associativity.
- [x] Add deliberate rules for unequal-denominator fraction addition. Applied
  addition now uses a least common denominator while retaining `Fraction`.
- [x] Add canonical flattening policies for nested `Sum` and `Product` forms.
- [x] Add public inspection, rendering, collapse, and transformation methods on
  structural values.
- [x] Add domain-aware cancellation with explicit nonzero assumptions.

## Parser plugins and tooling

- [x] Add a RiX-level helper for constructing registered parser objects without
  host JavaScript.
- [x] Add CodeMirror mixed-language highlighting selected by the leading-dot
  parser header.
- [x] Add structured source spans to every secondary-language node rather than
  retaining only errors relative to the backtick body.
- [x] Remove the transitional uppercase `LANG(context):body` parser syntax after
  downstream uses have migrated to `.Name:body`.
