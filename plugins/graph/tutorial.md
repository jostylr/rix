---
title: Solve exact graph problems
description: Validate weighted graphs and retain checkable shortest-path evidence.
theme: Algorithms and computer science
plugin: graph
status: implemented
---

## Shortest paths without an infinity sentinel

```rix
.Plugin.Load("graph");
graph := .graph.Weighted([:a,:b,:c,:d,:e],[
  [:a,:b,4],[:a,:c,1],[:c,:b,2],[:b,:d,1],
  [:c,:d,5],[:c,:e,8],[:d,:e,3]
]);
paths := graph.ShortestPaths(:a);
pathToE := paths.PathTo(:e);
{:
  paths[:distances],pathToE[:vertices],pathToE[:weight],
  paths[:unreachable],paths.Verify()
};
```

Zero-weight edges are ordinary edges. Missing distances represent unreachable
vertices. The certificate checks all edge inequalities and verifies that every
reported reachable vertex has a predecessor chain back to the source.

## Traversal, components, and dependency order

```rix
.Plugin.Load("graph");
undirected := .graph.Weighted([:a,:b,:c,:d],[[:a,:b,0],[:c,:d,1]]);
directed := .graph.Weighted([:parse,:lower,:evaluate],[
  [:parse,:lower,1],[:lower,:evaluate,1]
],{= directed=1});
{:
  undirected.BreadthFirst(:a)[:order],
  undirected.ConnectedComponents()[:components],
  directed.TopologicalSort()[:order]
};
```
