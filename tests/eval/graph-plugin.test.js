import { describe, expect, test } from "bun:test";
import { formatValue, parseAndEvaluate } from "../../src/index.js";

describe("graph plugin", () => {
    test("solves and certifies exact nonnegative shortest paths", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("graph");
            graph := .graph.Weighted([:a,:b,:c,:d,:e],[
              [:a,:b,4],[:a,:c,1],[:c,:b,2],[:b,:d,1],
              [:c,:d,5],[:c,:e,8],[:d,:e,3]
            ]);
            paths := graph.ShortestPaths(:a); path := paths.PathTo(:e);
            badDistances := {= a=0,b=_,c=1,d=4,e=7 };
            bad := {=
              schema="rix.graph.certificate@1",kind=:shortestPaths,
              graph=graph,source=:a,distances=badDistances,
              predecessors=paths[:predecessors]
            };
            {: paths[:distances][:e],path[:vertices],path[:weight],paths[:settledorder],paths.Verify(),.graph.CheckCertificate(bad) };
        `);
        expect(formatValue(result)).toBe("( 7, [a, c, b, d, e], 7, [a, c, b, d, e], 1, _ )");
    });

    test("keeps zero edges, unreachable vertices, components, and DAG status explicit", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("graph");
            graph := .graph.Weighted([:a,:b,:c,:d],[[:a,:b,0],[:c,:d,1]]);
            dag := .graph.Weighted([:parse,:lower,:evaluate],[[:parse,:lower,1],[:lower,:evaluate,1]],{= directed=1});
            cycle := .graph.Weighted([:a,:b],[[:a,:b,1],[:b,:a,1]],{= directed=1});
            {: graph.ShortestPaths(:a)[:distances][:b],graph.ShortestPaths(:a)[:unreachable],
               graph.BreadthFirst(:a)[:order],graph.ConnectedComponents()[:components],
               dag.TopologicalSort()[:order],cycle.TopologicalSort()[:status] };
        `);
        expect(formatValue(result)).toBe("( 0, [c, d], [a, b], [[a, b], [c, d]], [parse, lower, evaluate], cycleDetected )");
    });

    test("rejects invalid vertices, negative weights, and invalid algorithm domains", () => {
        expect(() => parseAndEvaluate(`.Plugin.Load("graph");.graph.Weighted([:a,:a],[])`)).toThrow(/unique/i);
        expect(() => parseAndEvaluate(`.Plugin.Load("graph");.graph.Weighted([:a,:b],[[:a,:b,-1]])`)).toThrow(/negative/i);
        expect(() => parseAndEvaluate(`.Plugin.Load("graph");.graph.Weighted([:a,:b],[],{= directed=1}).ConnectedComponents()`)).toThrow(/undirected/i);
    });
});
