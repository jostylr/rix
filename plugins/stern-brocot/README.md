# Stern–Brocot plugin

This plugin is written in RiX and builds reusable exact view-model records over
the representation-sensitive fraction plugin.

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
