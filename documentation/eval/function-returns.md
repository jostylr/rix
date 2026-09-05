# Diagnostic guards and function-scoped early returns

RiX separates three activities: deciding whether a function variant applies,
checking whether a computation can proceed, and performing that computation.
An expected rejection often deserves a useful result rather than an exception
or a different algorithm. Return guards express that directly.

## The two operators

| Expression | Trigger | Otherwise |
|---|---|---|
| `check ?_> result` | Decided negative/null `_` | Preserve the check's value |
| `check ??> result` | Undecided `?` | Preserve the check's value |

On a trigger, evaluate `result` and immediately return it from the **current
function call**. Do not execute later prep entries or body statements. The
result can be any RiX value, including a diagnostic map, `_`, or `?`.

Both operators require an active function call **whenever they are evaluated**,
even if the selected return would not fire. They are valid in function prep,
default-parameter expressions, and function bodies, including nested blocks,
cases, loops, and async scopes. They do not return from the surrounding block;
RiX's existing block/loop break syntax remains separate. Defining a function
containing these operators is valid at top level; evaluating one at top level
is an error.

## Tutorial: separate validation from calculation

```{.rix exec=true id=diagnostic-prep}
CoursePower(x,n) ?!- [
    n ? :Integer ?_> {= status=:unsupported,reason=:integerExponentRequired },
    n >= 0 ?_> {= status=:unsupported,reason=:negativeExponent },
    n <= 8 ?_> {= status=:unsupported,reason=:degreeBudgetExceeded }
] -> {= status=:complete,value=x^n };

CoursePower(2,3)[:value] ##@ == 8;
CoursePower(2,-1)[:reason] ##@ == :negativeExponent;
CoursePower(2,9)[:reason] ##@ == :degreeBudgetExceeded;
```

The mathematical body contains only the successful computation. The `?!-`
mode keeps unexpected errors visible, while the annotated checks return
expected unsupported results. This pattern is used in the CAS trig-power
integration helper: its applicability, exponent budget, and affine-argument
checks precede construction of the antiderivative.

## Tutorial: keep negative and undecided separate

```{.rix exec=true id=diagnostic-decisions}
Choose(decision) ?!- [
    decision ?_> {= status=:rejected } ??> {= status=:unresolved }
] -> {= status=:accepted };

Choose(_)[:status] ##@ == :rejected;
Choose(?)[:status] ##@ == :unresolved;
Choose(1)[:status] ##@ == :accepted;
Choose(0)[:status] ##@ == :accepted;
```

As elsewhere in RiX, **zero is truthy**, not false. Numeric requirements must
be comparisons such as `n > 0`. `?_>` must not classify uncertainty as a
negative result. If neither operator handles the current decision, prep keeps
its existing policy: `?-`/`?!-` propagate undecided, `??-` allows undecided
fallthrough, and `??!-` raises an error for undecided.

In a body, an untriggered guard is just its original value. A standalone
`decision ?_> rejected;` does not stop the body when `decision` is `?`.
Handle both states explicitly when proceeding requires a decided positive.

## Tutorial: return through a nested block

```{.rix exec=true id=body-return}
Describe(x) -> {;
    x ? :Integer ?_> :notInteger;
    {;
        @x >= 0 ?_> :negative;
    };
    :nonnegativeInteger;
};

Describe(:word) ##@ == :notInteger;
Describe(-2) ##@ == :negative;
Describe(3) ##@ == :nonnegativeInteger;
```

The negative path exits `Describe`, not only its inner block. Normal scope and
capture rules still apply: the inner block needs `@x`. The return operator
itself introduces no new scope.

## Tutorial: retain diagnostic setup bindings

```{.rix exec=true id=bound-diagnostic}
RequirePositive(x) ?!- [
    candidate = x ?_> {= status=:missing,value=candidate },
    candidate > 0 ?_> {= status=:rejected,value=candidate }
] -> {= status=:accepted,value=candidate };

RequirePositive(_)[:status] ##@ == :missing;
RequirePositive(-3)[:value] ##@ == -3;
RequirePositive(4)[:value] ##@ == 4;
```

The binding runs before its return check, so the diagnostic can inspect it.
The left side is evaluated once; only a triggered payload is evaluated.

## Tutorial: a handled rejection is final in dispatch

```{.rix exec=true id=return-dispatch}
Select = [
    (x) ?- [x ? :Integer, x >= 0 ?_> :negative] -> x^2,
    (x) -> :differentInputFamily
];
Select(3) ##@ == 9;
Select(-3) ##@ == :negative;
Select(:word) ##@ == :differentInputFamily;
```

The unannotated type check says "not this variant". The annotated sign check
says "this call has a result". Returning `_` or `?` explicitly is also final;
dispatch never guesses whether to continue by inspecting the returned value.

## Call ownership and cleanup

Each recursive invocation has its own return target. A callback's guard
returns from that callback, not its caller. For example:

```{.rix exec=true id=callback-return}
Transform() -> {;
    results = [1,_,?].Map((x)->{; x ?_> 20 ??> 30; x+1; });
    results[1]+results[2]+results[3];
};
Transform() ##@ == 52;
```

Call arguments are evaluated by the caller before entering the callee. Thus
`Other(_ ?_> diagnostic)` inside `F` returns from `F`; it never calls `Other`.
Defaults evaluated during parameter binding belong to the new callee instead.
Evaluating deferred code does not capture a permanent return target: it uses
the active call when the code executes. A finished activation cannot receive a
later return.

Returns unwind intervening scopes and run registered `##_` cleanup. Cleanup
errors remain errors; they are not discarded as successful returns. Return
control is not an ordinary runtime error and is not swallowed by soft prepared
trials or counted as a successful `.TestError` assertion.

Async evaluation awaits both the check and the selected payload. Nested async
scopes unwind and perform their existing cancellation/cleanup before the
function returns. Work already started concurrently is not rolled back; do
not use early return as a transaction or as a replacement for cancellation.

## Precedence and errors

Return guards bind **below assignment, logical operators, comparisons, and
postfix checks**. Consequently:

```text
bound = expression ?_> diagnostic
    means (bound = expression) ?_> diagnostic

a && b ?_> diagnostic
    means (a && b) ?_> diagnostic

check ?_> rejected ??> unresolved
    means (check ?_> rejected) ??> unresolved
```

The operators associate left-to-right. Parenthesize a nested return expression
when it belongs inside a payload. A semicolon ends a body guard; a comma ends
a prep entry. Parentheses are also helpful when mixing return guards with
ordinary `?:`, `?_`, and `??` conditional branches.

An exception in an unannotated/check expression retains the surrounding prep
mode's existing behavior. An exception in a **selected return payload**
propagates even through soft prep: a broken diagnostic is not a dispatch miss.
Neither operator turns an error into an unsupported result automatically.

```{.rix exec=true id=outside-call-return expect-error="active function call"}
1 ?_> :unused;
```

## Implementation contract

The parser emits `ReturnGuard(condition, decision, value)`. Lowering produces
`GUARD_RETURN({decision}, DEFER(condition), DEFER(value))`, in the Logic
capability group. Evaluation checks the dynamic call target first, evaluates
the condition once, and either preserves it or transfers a returned value to
that activation. Sync and async invocation boundaries treat that transfer as
a matched result independently of the value's truth state.

Existing source without these operators retains its prep/dispatch semantics.
