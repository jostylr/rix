# Proposed `cayley` plugin

`cayley` is the planned scalar-generic Cayley–Dickson service. This directory
is specification-only: there is deliberately no discoverable
`*.plugin.rix` manifest until the Phase 1 component, enclosure, and capability
contracts are implemented and tested.

The service will sit between representation-generic real/complex values and
typed Quaternion/Octonion façades. Its responsibilities are:

- recursive basis/component construction in dimensions `2^n`;
- parenthesized multiplication and conjugation;
- norm-squared and certified origin separation;
- component-box enclosure over certified real singletons;
- capability-gated inverse and left/right division;
- adapters that preserve existing exact-rational `exact-algebras` values.

The scalar contract must supply a central commutative real algebra with exact
or certified singleton arithmetic. A value using mixed real backends may meet
at Oracle, but the Cayley layer must retain component evidence and must never
turn finite real set enclosures into scalar singletons.

Division is not inferred solely from a power-of-two dimension. Complex,
Quaternion, and Octonion levels have the required composition-algebra
properties over appropriate real scalars; sedenions and later levels have zero
divisors and must advertise only partial invertibility.

See [tutorial.md](tutorial.md) for the intended teaching surface,
[`../complex/architecture.md`](../complex/architecture.md) for the layer
boundary, and [`../TODO.md`](../TODO.md) for acceptance phases.

