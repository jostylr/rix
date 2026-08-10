# Symbolic meta-plugin

`.symbolic` is a small opt-in umbrella for representation-sensitive exact
work. Loading it activates `.fraction` and `.fracfun`; their dependencies also
make `.poly` and `.ratfun` available.

```rix
.Plugin.Load("symbolic");
f := .frac(6,8);
F := .ff`(x^2-1)/(x-1)`;
{: f, F.Form(), .symbolic.Services() };
```

The meta-plugin does not add alternate arithmetic rules of its own. It provides
one discoverable loading point and delegates constructors to the focused
plugins so their schemas and ownership remain stable. The meta-plugin itself is
pure RiX; `.fracfun`, which it loads, remains a host implementation until RiX
has a stable public symbolic-expression builder rather than private IR mutation.
