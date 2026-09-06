# Mathematical contexts and binders

`{& header & body }` evaluates the body once and returns a mathematical context
record. It is not an integration or iteration operation. It shares the current
programming scope: ordinary assignments and `::` names have the same visibility
inside and after the context. Empty headers and empty bodies are legal.

```{.rix exec=true}
count := 0;
c := {& :::t | 1:0; :::t > 0 &
    count ~= count+1;
    :::t^2 * ::parameter;
};
count ##@ == 1;
c[:schema] ##@ == "rix.math.context@1";
c[:domains][1][:domain][:orientation] ##@ == :desc;
c[:domains][1][:domain][:lowerclosed] ##@ == _;
```

## Header declarations

Separate header items with semicolons. A leading `:::name` declares a fresh
bound identity if that name is not already declared in this header. It can
stand alone, lead a comparison, or precede `| source`. Later compatible
declarations narrow the same binder. `(:::x,:::y) | (0:1,2:3)` declares two
binders with one domain each; the source is evaluated once. Duplicate names
within one tuple are rejected.

The body and later header items can reference declared binders. Forward
references and bound references outside a declaring context error. A nested
context inherits outer binders unless its own header declares the same name;
that declaration shadows the outer identity throughout the inner context.
Every context evaluation creates fresh identities. Functions constructed in
the body retain references to its binders when called later. Bound symbols
cannot be assigned immutable definitions or updated with assignment operators.

All other header items must be comparisons (`==`, `!=`, `<`, `<=`, `>`, `>=`).
They retain evaluated left/right expression data, rather than reducing the
comparison prematurely to `?`. They do not define symbols or change ordinary
`==` behavior, either inside or outside the body. Assumption-aware evaluation
will be an explicit context operation in a subsequent stage.

## Exact domains and conflict checking

The current source forms are:

- A rational interval, retaining its original start/end and direction.
- `(interval,:asc)` or `(interval,:desc)`, explicitly selecting traversal.
- `{= start=0,end=1,lowerclosed=_,upperclosed=1 }`, specifying exact endpoints
  and optional inclusion flags. Inclusion refers to sorted lower/upper
  endpoints, even when traversal descends. Flags are `1` or `_` and default
  to closed. Unknown fields error.

Compatible numeric bounds intersect, including strict endpoints. Disjoint
bounds, an excluded singleton, false exact comparisons, or contradictory
traversal directions error before the body executes. Sources and header
expressions already evaluated are not rolled back. Original traversal
start/end remain provenance; normalized `lower`/`upper` describe the narrowed
domain, and are not a replacement integration path.

Symbolic equalities and other constraints beyond these bounded checks remain
unresolved, not proved consistent. Symbolic/dependent endpoints and arbitrary
ordered sources are not yet supported and error explicitly. This stage does
not perform interval membership inference on expression-valued endpoints.

## Returned value

The immutable record exposes `schema`, `result`, `binders`, `assumptions`,
`domains`, and `consistency`. Binders are in declaration order. Each domain
entry contains `symbol` and its normalized `domain`; assumptions contain
`operator`, `left`, and `right`. `consistency` is `:checkedBounds` when the
implemented exact checks cover the constraints, or `:unresolved` otherwise.
Neither is a general satisfiability proof or a guarantee about future symbol
definitions. Free symbols may have domain entries without being binders.

`result` is the body's last value (or `_` for an empty body). Extracting it
does not apply the retained assumptions. Consequently this foundation does
not produce assumption-dependent rewrites that can escape without conditions.
Consumers needing assumptions should keep the entire context record.

```{.rix exec=true}
conditional := {& ::b == ::a-0 & ::b==::a };
conditional[:consistency] ##@ == :unresolved;
.ExpressionDefinition(::b) ##@ == _;
box := {& (:::u,:::v) | (0:1,2:3) & :::u+:::v };
.SameSymbol(box[:binders][1],box[:binders][2]) ##@ == _;
```

Bounded free substitution and rational evaluation are available below. General
context reasoning and identity-aware calculus/CAS consumers remain subsequent stages.
Use [mathematical graph serialization](mathematical-serialization.md) for portable
storage rather than treating this runtime record schema as the file format.

## Localizing a retained context

Use [MathSubstitute and MathEvaluate](mathematical-localization.md) for explicit
identity-based free substitution and bounded exact rational evaluation. Evaluation
reports retain the context and distinguish conditional candidates from complete values.
