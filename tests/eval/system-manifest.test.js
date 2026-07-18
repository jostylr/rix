import { describe, expect, test } from "bun:test";
import { parse } from "../../src/parser/parser.js";
import { tokenize } from "../../src/parser/tokenizer.js";
import { lower } from "../../src/eval/lower.js";
import { createDefaultSystemContext } from "../../src/eval/evaluator.js";
import { SystemContext } from "../../src/runtime/system-context.js";
import { createSystemLookup } from "../../src/runtime/system-manifest.js";

function parseWithSystem(source, systemContext) {
    return parse(tokenize(source), createSystemLookup(systemContext));
}

describe("parser system manifest", () => {
    test("known PascalCase members are callable by adjacency", () => {
        const systemContext = createDefaultSystemContext();
        const ast = parseWithSystem(".Draw.Circle 1", systemContext);

        expect(ast[0].type).toBe("ImplicitApplication");
        expect(ast[0].callable.type).toBe("DotAccess");
        expect(ast[0].callable.systemPathInfo.kind).toBe("function");
        expect(lower(ast)[0].fn).toBe("CALL_METHOD");
    });

    test("known lowercase member spelling is rejected before evaluation", () => {
        const systemContext = createDefaultSystemContext();
        expect(() => parseWithSystem(".Draw.circle 1", systemContext))
            .toThrow("Unknown system member 'Draw.circle'");
    });

    test("known system values cannot be explicitly called", () => {
        const systemContext = createDefaultSystemContext();
        expect(() => parseWithSystem(".Plot()", systemContext))
            .toThrow("System value 'Plot' is not callable");
    });

    test("host plugin objects receive the same typed chained-path checks", () => {
        const systemContext = new SystemContext();
        systemContext.registerValue("plot", {
            type: "map",
            _ext: new Map([["RENDER", {
                type: "method_builtin",
                name: "Render",
                impl: () => null,
            }]]),
        });

        const ast = parseWithSystem(".plot.Render 1", systemContext);
        expect(ast[0].type).toBe("ImplicitApplication");
        expect(() => parseWithSystem(".plot.render 1", systemContext))
            .toThrow("Unknown system member 'plot.render'");
    });

    test("Core and Host management methods use their declared spelling", () => {
        const systemContext = createDefaultSystemContext();
        expect(parseWithSystem('.Core.Register("Thing", (x) -> x)', systemContext)[0].type).toBe("MethodCall");
        expect(() => parseWithSystem('.Core.register("Thing", (x) -> x)', systemContext))
            .toThrow("Unknown system member 'Core.register'");
    });
});
