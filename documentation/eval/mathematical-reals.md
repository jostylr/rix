# Refinable reals in mathematical expressions

`.ExpressionReal(source, options?)` explicitly adapts an existing certified,
arbitrarily refinable singleton Numerics provider into a core constant node.
It captures the source and calls `NumericsCapabilities()` followed by one
bounded `Refine(request)`. Raw provider maps are not automatically promoted.

```{.rix exec=true}
.Plugin.Load("numerics");
r := .ExpressionReal(.numerics.Sqrt(2),{= absoluteWidth=1/10,maxWork=30 });
key := .ExpressionKey(r);
copy ::= r;
result := .ExpressionRefine(copy,{= absoluteWidth=1/10000,maxWork=100 });
result[:goalMet] ##@ == 1;
.ExpressionKey(r)==key ##@ == 1;
r==copy ##@ == 1;
.ExpressionConstantInfo(r)[:refinable] ##@ == 1;
e := ::x+r;
e.Kind() ##@ == :operator;
```

## Identity, knowledge, and work

`.ExpressionRefine(constant, options?)` explicitly invokes the retained
procedure and returns its full checked Numerics result. It does not evaluate
a general expression tree. Requests use the normal refinement normalization,
provider limits, width targets, work budgets, and evidence requirements.
Options must be a map when supplied. Synchronous and asynchronous evaluation
are supported, without a separate mathematical execution scope.

Each adaptation has a fresh opaque identity. Copies and earlier expressions
retain that identity and share its accumulated enclosure. Successful certified
refinement intersects the retained enclosure; the symbolic key does not
change. Inspection and equality never trigger refinement. Re-adapting the
same source creates another identity, so equality between separately adapted
values remains `?`, even when their enclosures happen to agree. Equality to
the same adapter is `1`. General comparison of different reals is future work.

## Validation and trust

Providers must advertise the Numerics capabilities schema, refinement support,
`certified=1`, `arbitraryRefinement=1`, and singleton denotation. Every result
passes the existing refinement contract checker: schema, certification and
approximation consistency, width/status consistency, declared evidence, and
reported work limits. A finite certified enclosure is required. A subsequent
enclosure disjoint from retained knowledge errors without changing that
knowledge. Invalid or uncertified results are not installed. Provider exceptions
propagate, and provider-side effects are not rolled back.

This is **protocol validation, not independent verification of arbitrary
provider code or proof payloads**. A provider can lie about its guarantees or
its work. The adapter preserves the declared evidence level and marks
`validation=:protocolChecked`; it does not manufacture a proof. Mixed evidence
levels produce `:mixed` for the accumulated enclosure. Use trusted providers
and the host's execution controls for untrusted code.

`ExpressionConstantInfo` reports `provider=:refinableReal`, singleton denotation,
`refinable=1`, the accumulated `enclosure`, `evidenceLevel`, and validation kind.
`lastStatus` and `lastGoalMet` expose the last accepted refinement outcome,
including the initial call made during adaptation.
Here `exact=1` means a single mathematical value, not a rational point enclosure
or decidable equality. Copying a source isolates its value structure, but captured
function environments and external effects still follow ordinary RiX semantics.

## Useful results when a budget runs out

A valid certified `:budgetExhausted` result is accepted even when `goalMet=_`.
It still provides a usable enclosure. Check the returned status and goal flag
instead of treating adapter construction or refinement as proof that a requested
width was achieved.

```{.rix exec=true}
.Plugin.Load("numerics");
r := .ExpressionReal(.numerics.Sqrt(2),{= absoluteWidth=1/100000,maxWork=1 });
result := .ExpressionRefine(r,{= absoluteWidth=1/100000,maxWork=1 });
result[:status] ##@ == :budgetExhausted;
result[:certified] ##@ == 1;
result[:goalMet] ##@ == _;
```

The adapter retains a live in-memory procedure, not executable text in a saved
file. [Mathematical serialization](mathematical-serialization.md) preserves
frozen snapshots; safe recipe restoration, context evaluation,
and provider-aware calculus/CAS remain separate roadmap work. The older
name-based consumers continue to reject extended constants explicitly.
