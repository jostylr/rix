# Structural arithmetic follow-up work

The first backtick-parser implementation deliberately establishes the
dispatch, structural-value, splice, and function protocols before expanding
the notation surface.

## Parser surface

- Add comments inside `.SArith` bodies.
- Add the remaining RiX exact literal spellings, including mixed numbers,
  continued fractions, explicit bases, and intervals.
- Extend the initial ambiguity diagnostics (`-x^2`, `-x!`, `1/2!`, and
  `1/2^3`) as new prefix and postfix forms are added.
- Add explicit function parameter declarations, such as
  `.SArith.Fun(y,x):body`, when parameter order or unused parameters must be
  supplied rather than inferred.

## Structural algebra

- Add configurable constructor/operation tables for custom operator glyphs,
  fixity, precedence, and associativity.
- Add deliberate rules for unequal-denominator fraction addition. The initial
  implementation combines equal denominators and otherwise retains a `Sum`.
- Add canonical flattening policies for nested `Sum` and `Product` forms.
- Add public inspection, rendering, collapse, and transformation methods on
  structural values.
- Add domain-aware cancellation with explicit nonzero assumptions.

## Parser plugins and tooling

- Add a RiX-level helper for constructing registered parser objects without
  host JavaScript.
- Add CodeMirror mixed-language highlighting selected by the leading-dot
  parser header.
- Add structured source spans to every secondary-language node rather than
  retaining only errors relative to the backtick body.
- Remove the transitional uppercase `LANG(context):body` parser syntax after
  downstream uses have migrated to `.Name:body`.
