# Bounded course calculus and local domain evidence

The course layer now combines checked integration rules, local conditional
rewrites, exact definite integrals, certified range quadrature and an explicit
approximate fallback. It uses the public Calculus graphs and existing Rational,
Polynomial and Numerics services. No external solver or global assumption state
is involved.

## Mixed trigonometric powers and quadratic radicals

```{.rix exec=true}
.Plugin.Load("cas");
x := .calculus.Variable(:x);
Sin := .calculus.Sin(); Cos := .calculus.Cos();
r := .cas.Integrate(Sin(2*x+1)^2*Cos(2*x+1)^3,:x);
r[:status] ##@ == :complete;
.cas.CheckIntegral(r)[:accepted] ##@ == 1;
r[:rules];
```

Products `Sin(u)^m Cos(u)^n` use the same affine argument and nonnegative
Integer powers with total degree at most 8. An odd exponent gives a finite
substitution sum; two even exponents use double-angle power reduction.
Different plain sine/cosine arguments continue to use the earlier product-to-sum
rule. Unsupported degrees or arguments return an explicit reason.

```{.rix exec=true}
.Plugin.Load("cas");
x := .calculus.Variable(:x); Sqrt := .calculus.Sqrt();
r := .cas.Integrate(Sqrt(2*x^2+4*x+4),:x);
r[:status] ##@ == :complete;
.cas.CheckIntegral(r)[:accepted] ##@ == 1;
r[:obligations];
```

The radical subset is `Sqrt(a*x^2+b*x+c)` and a variable-independent numerator
divided by that square root, with exact Rational coefficients and `a != 0`.
Completion of the square selects the circular `Asin` or hyperbolic/log-absolute
identity. Nondegenerate primitives retain the strict positive-radicand interior
obligation, including disconnected exterior domains. The degenerate square-root
case uses `u Abs(u)/2`; a degenerate reciprocal stays unsupported. No complex
branch is inferred. Replay now checks obligations, rules and evidence flags as
well as the primitive; deleting a pole restriction invalidates a claim.

## Exact, certified and approximate definite integrals

```{.rix exec=true}
.Plugin.Load("cas");
x := .calculus.Variable(:x);
exact := .cas.Definite(x^2,:x,0,1);
exact[:value] ##@ == 1/3;
odd := .cas.Definite((x-2)^3,:x,1,3);
odd[:method] ##@ == :intervalSymmetry;
odd[:value] ##@ == 0;
.cas.CheckDefinite(odd) ##@ == 1;
```

`Definite(expression,variable,lower,upper,options)` first checks the entire source
domain. It recognizes parity about the interval midpoint, preserves reversed
orientation and never uses odd symmetry across an unresolved pole. Odd functions
integrate to zero. Even symmetry reduces numerical work to one half and retains
the factor of two.

A supported primitive with discharged domain obligations gives an exact scalar
or an exact `valueExpression`; in the latter case `value` is `_` and `interval`
is only a certified numerical enclosure of that exact expression. Endpoint
range evaluation does not convert a transcendental value to a Rational identity.

```{.rix exec=true}
.Plugin.Load("cas");
x := .calculus.Variable(:x); Exp := .calculus.Exp();
r := .cas.Definite(Exp(-x^2),:x,0,1,{= panels=8,tolerance=1/10000 });
r[:status] ##@ == :certified;
r[:certified] ##@ == 1;
.cas.CheckDefinite(r) ##@ == 1;
r[:interval];
```

When the exact rule ladder stops, certified quadrature encloses each complete
panel with `Numerics.GraphRange` and adds interval-times-width contributions.
It needs no derivative assumptions. `goalMet` says whether the requested width
was achieved; a certified interval can remain wider than requested, with
`work.exhausted=1`. Elementary range graphs support the existing bounded real
Sin, Cos, Exp, Log, Sqrt and Abs providers. Domain violations remain unresolved.

```{.rix exec=true}
.Plugin.Load("cas");
x := .calculus.Variable(:x); Exp := .calculus.Exp();
r := .cas.Definite(Exp(-x^2),:x,0,1,{= panels=4,fallback=:approximate });
r[:status] ##@ == :approximate;
r[:certified] ##@ == _;
r[:interval] ##@ == _;
r[:candidate];
```

An explicit `fallback=:approximate` instead uses midpoint samples after the same
whole-domain check. Its candidate has no integral error certificate. Missing
providers, domain holes and failed evidence admission retain unresolved regions;
no partial sum is returned as a whole integral. Default panel count is 16,
maximum 256. Graph traversal is limited to 4096 nodes and depth 64; shared replay
also limits exact components to 4096 digits and retained evidence to 16 MiB.
Evidence exhaustion preserves the entire unprocessed suffix. Exact rules do not
allocate numerical panels. This is finite classroom work, not general Risch
integration or improper-integral regularization.

## Local premises and domain-preserving displays

```{.rix exec=true}
.Plugin.Load("cas");
x := .calculus.Variable(:x);
r := .cas.Rewrite(x/x,:cancelSelf);
r[:status] ##@ == :conditional;
r[:excludedZeros].Len() ##@ == 1;
.cas.CheckRewrite(r) ##@ == 1;
domain := .cas.AbsDomain(x);
.cas.CheckDomain(domain) ##@ == 1;
domain[:branches];
```

`Rewrite(source,rule,premises=[])` recognizes `:absNonnegative`, `:absNonpositive`,
`:sqrtSquare`, `:nestedIntegerPower`, `:trigPythagorean`, `:cancelSelf` and
`:cancelFactor`. Nested Integer exponents are bounded by absolute value 8.
Premises are existing `calculus.Obligation(:domain,relation,expression)` records.
Matching premises change status from `conditional` to `assumed`; they are not
proved by matching and `certified` stays `_`. Every condition remains in the
result, and cancellation retains excluded denominator zeros. Consumers must
keep those conditions when displaying or evaluating the replacement.
`AbsDomain` is an inert, replayable two-branch real domain graph, with a separate
warning that its boundary derivative need not exist. It changes no global
assumption or branch policy.

## Inert equation problems and declared derivatives

```{.rix exec=true}
.Plugin.Load("calculus");
x := .calculus.Variable(:x);
p := .calculus.DifferentialProblem([-x],:t,[:x],{= domain=0:1 });
b := .calculus.BoundaryProblem(p,[{= at=0,expression=x-1 }]);
b[:execution] ##@ == :inert;
q := .calculus.IntegralEquation("course.u",x,:t,0,1,x);
q[:solver] ##@ == :unavailable;
```

`DifferentialProblem(rhs,variable,unknowns,options)` describes a vector equation
of order 1..16, with 1..16 distinct unknown names. An optional ordered finite
domain bounds boundary locations. `BoundaryProblem` accepts at most 32 conditions;
each expression is compared with zero using its `relation` (default `:eq`).
`IntegralEquation(unknown,kernel,integrationVariable,lower,upper,forcing,options)`
is a Fredholm second-kind specification: `u(x) = forcing(x) + scale * integral
kernel(x,t)*u(t) dt`. `outputVariable` defaults to `:x`, `scale` to 1. The ordered
endpoints are retained. These records do not execute ODE/Numerics/Solve; no general
integral-equation solver is claimed.

```{.rix exec=true}
.Plugin.Load("calculus");
x := .calculus.Variable(:x);
F := .calculus.Function("course.f");
D := .calculus.Function("course.df");
declaration := .calculus.DerivativeDeclaration("course.f","course.df",0:1,(-2):2);
.calculus.UseDeclaredDerivative(F,D,declaration);
r := .calculus.DifferentiateResult(F(x),:x);
r[:obligations];
```

Derivative declarations retain provider IDs, order, interval domain, range bound
and caller-declared evidence. Importing a record does nothing. Only an explicit
`UseDeclaredDerivative` call attaches an already available mathematical function
through the existing registry. It supports first derivatives; higher-order
providers use successive declarations (inert declarations may state orders
1..8). The domain obligation retains the complete declaration. This is an
assumption, not a checked native derivative rule or a certified bound; trusted
numerical execution remains an explicit provider choice.
