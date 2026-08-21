# Stern–Brocot plugin

This plugin is written in RiX and builds reusable exact view-model records and
classroom Grids over the representation-sensitive fraction plugin.

    .Plugin.Load("stern-brocot");

    node := .sternBrocotDescribe(.frac(3, 5));
    tree := .sternBrocotVisibleTree(node["current"], 2);
    value := .sternBrocotEvaluate(x -> x^2 - 1/2, node["current"]);

sternBrocotDescribe returns schema rix.stern-brocot.node@1, including the
current fraction, parent, children, ancestors, Farey boundaries, mediant,
path, continued fraction, and convergents.

sternBrocotVisibleTree returns schema rix.stern-brocot.tree@1. Its nodes and
edges retain exact Fraction values; a browser or portable Graphics renderer
decides how to lay them out.

sternBrocotEvaluate accepts a RiX callable rather than source text. Browser
hosts that accept formula text should parse it in a restricted scope and then
call this function.

## Exact path records and Grids

`Path(fraction)` records the signed-tree root and every exact step to the target,
including the direction and Farey boundaries. `Grid(fraction)` presents the
same record as a portable structured-output Grid without choosing a particular
renderer.

```rix
.Plugin.Load("stern-brocot");
path := .sternBrocot.Path(.frac(3,5));
grid := .sternBrocot.Grid(path["target"]);
{: path, grid };
```

## Farey sequences

`Farey(order)` returns the complete sequence between `0` and `1` for a positive
order no larger than 10,000. Every adjacent pair carries its exact determinant
and a neighbor verdict. `FareyView(order)` returns a classroom Grid; the direct
exports are `.fareySequence(order)` and `.fareyGrid(order)`.

```rix
.Plugin.Load("stern-brocot");
sequence := .sternBrocot.Farey(5);
view := .sternBrocot.FareyView(5);
{: sequence["values"], sequence["adjacency"], view };
```
