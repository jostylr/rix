# Explanatory Explorations

An Explanatory Exploration is a mathematical/programming investigation with a
companion RiX program. It sits between reference documentation and a language
tutorial: the goal is to expose an algorithm, the theorem that makes it safe,
and the evidence RiX records while it runs.

Each exploration contains:

1. the mathematical enclosure statement;
2. the exact RiX objects that supply its premises;
3. a walk through the returned evidence fields;
4. a browser-safe `.rix` companion with controls or editable parameters; and
5. a final **Further explorations** section with concrete experiments.

The companion sources use only bundled plugins and portable output values. To
try one locally, pass it to the RiX runner. To use it in `rix-web`, open or paste
the `.rix` source into a worksheet and run it; the final value is a portable
Fragment, Table, and Graphic rather than host-specific HTML.

Current explorations:

- [Lipschitz midpoint enclosures](numerics/lipschitz-midpoint.md)
- [Second-derivative Taylor enclosures](numerics/second-derivative-taylor.md)

