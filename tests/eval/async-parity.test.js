import { describe, expect, test } from "bun:test";
import {
    createDefaultSystemContext,
    parseAndEvaluateAsync,
} from "../../src/eval/evaluator.js";
import { formatValue } from "../../src/eval/format.js";
import { Context } from "../../src/runtime/context.js";
import { UNDECIDED } from "../../src/runtime/decision.js";
import { getDiagnostics } from "../../src/runtime/diagnostics.js";

function asyncIdentitySystem() {
    const systemContext = createDefaultSystemContext({ frozen: false });
    systemContext.registerHost("slow", {
        impl: async ([value]) => {
            await Promise.resolve();
            return value;
        },
    });
    systemContext.registerHost("fail", {
        impl: async () => {
            await Promise.resolve();
            throw new Error("async boom");
        },
    });
    systemContext.freeze();
    return systemContext;
}

describe("promise-aware evaluator parity", () => {
    test("supports placeholder partials for system capabilities", async () => {
        const value = await parseAndEvaluateAsync("P := .Add(_1, 2); P(3)");
        expect(value.value).toBe(5n);
    });

    test("expands spread arguments in user calls", async () => {
        const value = await parseAndEvaluateAsync("F(x, y) -> x + y; F(...[2, 3])");
        expect(value.value).toBe(5n);
    });

    test("binds omitted parameters to the RiX hole", async () => {
        const value = await parseAndEvaluateAsync("F := x -> x ?| 7; F()");
        expect(value.value).toBe(7n);
    });

    test("iterates tail-self calls without exposing the internal marker", async () => {
        const value = await parseAndEvaluateAsync(
            "F := n -> n > 0 ?: $(n - 1) ?_ 0; F(20000)",
        );
        expect(value.value).toBe(0n);
    });

    test("keeps postfix checks promise-aware", async () => {
        const typed = await parseAndEvaluateAsync("{$ 1 } ##: :integer");
        const predicated = await parseAndEvaluateAsync("{$ 3 } ##@ > 0");
        expect(typed.value).toBe(1n);
        expect(predicated.value).toBe(3n);
    });

    test("runs Debug, Trace, and Eval through promise-aware lazy dispatch", async () => {
        const context = new Context();
        const debugged = await parseAndEvaluateAsync('.Debug("basic", 1 + 2)', { context });
        const traced = await parseAndEvaluateAsync(
            '.Trace("basic", 1, [], () -> 42)',
            { context },
        );
        const evaluated = await parseAndEvaluateAsync(".Eval(@{1 + 2})", { context });

        expect([debugged.value, traced.value, evaluated.value]).toEqual([3n, 42n, 3n]);
        const events = getDiagnostics(context).events;
        expect(events.map((event) => event.entries.get("kind").value)).toEqual(["debug", "trace"]);
        expect(events[0].entries.get("data").entries.get("final").value).toBe(3n);
        const traceCalls = events[1].entries.get("data").entries.get("calls").values;
        expect(traceCalls.map((entry) => entry.entries.get("event").value)).toEqual(["enter", "exit"]);
    });

    test("awaits async bodies inside Debug, Trace, and Eval", async () => {
        const context = new Context();
        const systemContext = asyncIdentitySystem();
        const debugged = await parseAndEvaluateAsync(
            '.Debug("async", .slow(7))',
            { context, systemContext },
        );
        const traced = await parseAndEvaluateAsync(
            '.Trace("async", 1, [], () -> .slow(8))',
            { context, systemContext },
        );
        const evaluated = await parseAndEvaluateAsync(
            '.Eval(@{ .slow(x) }, {= x=9 })',
            { context, systemContext },
        );

        expect([debugged.value, traced.value, evaluated.value]).toEqual([7n, 8n, 9n]);
        const events = getDiagnostics(context).events;
        expect(events[0].entries.get("data").entries.get("final").value).toBe(7n);
        expect(events[1].entries.get("data").entries.get("final").value).toBe(8n);
        const traceExit = events[1].entries.get("data").entries.get("calls").values.at(-1);
        expect(traceExit.entries.get("value").value).toBe(8n);
    });

    test("preserves concrete and raw operands for built-in lazy capabilities", async () => {
        const context = new Context();
        const exported = await parseAndEvaluateAsync(".TypeExport(7)", { context });
        const defined = await parseAndEvaluateAsync(
            ".Define(:F, .Params(:x), x + 1); F(2)",
            { context },
        );
        const generated = await parseAndEvaluateAsync(
            ".Shaped.Generate({: 2 }, (i) -> i[1])",
            { context },
        );
        const dumped = await parseAndEvaluateAsync('.Dump("x", 1)', { context });
        const inspected = await parseAndEvaluateAsync('.InfoValue("x", 1)', { context });
        const stopped = await parseAndEvaluateAsync('.Stop("x", _)', { context });

        expect(exported.entries.get("type").value).toBe("Integer");
        expect(defined.value).toBe(3n);
        expect(generated.shape).toEqual([2]);
        expect(generated.data.map((value) => value.value)).toEqual([1n, 2n]);
        expect([dumped.value, inspected.value]).toEqual([1n, 1n]);
        expect(stopped).toBeNull();
        expect(getDiagnostics(context).events.map((event) =>
            event.entries.get("kind").value)).toEqual(["log", "info"]);
    });

    test("awaits async setup and bodies in Test, TestError, and TestStop", async () => {
        const context = new Context();
        const systemContext = asyncIdentitySystem();
        const sequential = await parseAndEvaluateAsync(
            '.Test("async-seq", {; x := .slow(1) }, [.slow(x == 1), {; x ~= .slow(2); .slow(x == 2) }])',
            { context, systemContext },
        );
        const isolated = await parseAndEvaluateAsync(
            '.Test("async-iso", {; x := .slow(1) }, {= first=.slow(x == 1), second=.slow(x == 1) })',
            { context, systemContext },
        );
        const errorTest = await parseAndEvaluateAsync(
            '.TestError("async-error", {; x := .slow(1) }, {; .slow(x); .Error("boom") })',
            { context, systemContext },
        );
        const rejectedErrorTest = await parseAndEvaluateAsync(
            '.TestError("async-rejection", {; }, .fail())',
            { context, systemContext },
        );
        const stopTest = await parseAndEvaluateAsync(
            '.TestStop("async-stop", {; x := .slow(1) }, {; .slow(x); .Stop("halt", 1) })',
            { context, systemContext },
        );

        expect(sequential.entries.get("passed").value).toBe(1n);
        expect(sequential.entries.get("summary").entries.get("passed").value).toBe(2n);
        expect(isolated.entries.get("passed").value).toBe(1n);
        expect(isolated.entries.get("summary").entries.get("passed").value).toBe(2n);
        expect(errorTest.entries.get("passed").value).toBe(1n);
        expect(errorTest.entries.get("expr").entries.get("outcome").value).toBe("error");
        expect(rejectedErrorTest.entries.get("passed").value).toBe(1n);
        expect(rejectedErrorTest.entries.get("expr").entries.get("outcome").value)
            .toBe("runtimeError");
        expect(stopTest.entries.get("passed").value).toBe(1n);
        expect(stopTest.entries.get("expr").entries.get("outcome").value).toBe("stop");
    });

    test("keeps Multi operands sequential across async suspension", async () => {
        const order = [];
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("step", {
            impl: async ([value]) => {
                if (value.value === 1n) {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }
                order.push(value.value);
                return value;
            },
        });
        systemContext.freeze();

        const value = await parseAndEvaluateAsync(
            ".Multi(.step(1), .step(2))",
            { systemContext },
        );
        expect(value.value).toBe(2n);
        expect(order).toEqual([1n, 2n]);
    });

    test("awaits values in top-level collection literals", async () => {
        const systemContext = asyncIdentitySystem();
        const sequence = await parseAndEvaluateAsync(
            "[.slow(1), .slow(2)]",
            { systemContext },
        );
        const map = await parseAndEvaluateAsync(
            "{= first=.slow(3), second=.slow(4) }",
            { systemContext },
        );

        expect(sequence.values.map((value) => value.value)).toEqual([1n, 2n]);
        expect([...map.entries.values()].map((value) => value.value)).toEqual([3n, 4n]);
        expect(sequence.values.some((value) => typeof value?.then === "function")).toBe(false);
        expect([...map.entries.values()].some((value) => typeof value?.then === "function")).toBe(false);
    });

    test("awaits interpolations in text and document templates", async () => {
        const systemContext = asyncIdentitySystem();
        const text = await parseAndEvaluateAsync(
            '@"value @{.slow(2)}"',
            { systemContext },
        );
        const document = await parseAndEvaluateAsync(
            '@"""\np: value @{.slow(3)}\n"""',
            { systemContext },
        );

        expect(text.value).toBe("value 2");
        expect(formatValue(document)).toContain("value 3");
        expect(formatValue(document)).not.toContain("[object Promise]");
    });

    test("awaits lazy base conversion operands and specifications", async () => {
        const systemContext = asyncIdentitySystem();
        const formatted = await parseAndEvaluateAsync(
            ".slow(10) _> 2",
            { systemContext },
        );
        const parsed = await parseAndEvaluateAsync(
            '.slow("101") <_ 2',
            { systemContext },
        );
        const certified = await parseAndEvaluateAsync(
            '.slow(1/97) ~> .slow(".10")',
            { systemContext },
        );
        const custom = await parseAndEvaluateAsync(
            '0Q = .slow(16); 10 _> 0Q',
            { systemContext },
        );

        expect(formatted.value).toBe("1_010");
        expect(parsed.value).toBe(5n);
        expect(formatValue(certified)).toBe("0.0103092783?");
        expect(custom.value).toBe("A");
    });

    test("uses async traversal barriers at top level", async () => {
        const systemContext = asyncIdentitySystem();
        const reduced = await parseAndEvaluateAsync(
            "[1, 2, 3] |>: ((acc, value) -> .slow(acc + value))",
            { systemContext },
        );
        const sorted = await parseAndEvaluateAsync(
            "[3, 1, 2] |<> ((left, right) -> .slow(left - right))",
            { systemContext },
        );
        const split = await parseAndEvaluateAsync(
            "[1, 2, 3] |>/| (value -> .slow(value == 2))",
            { systemContext },
        );
        const chunked = await parseAndEvaluateAsync(
            "[1, 2, 3] |>#| (value -> .slow(value == 2))",
            { systemContext },
        );
        const sliced = await parseAndEvaluateAsync(
            ".slow([1, 2, 3]) |>/ 1:2",
            { systemContext },
        );
        const clamped = await parseAndEvaluateAsync(
            ".slow([1, 2, 3]) |>// .slow(2):.slow(9)",
            { systemContext },
        );

        expect(reduced.value).toBe(6n);
        expect(sorted.values.map((value) => value.value)).toEqual([1n, 2n, 3n]);
        expect(split.values.map((piece) => piece.values.map((value) => value.value)))
            .toEqual([[1n], [3n]]);
        expect(chunked.values.map((piece) => piece.values.map((value) => value.value)))
            .toEqual([[1n, 2n], [3n]]);
        expect(sliced.values.map((value) => value.value)).toEqual([1n, 2n]);
        expect(clamped.values.map((value) => value.value)).toEqual([2n, 3n]);
    });

    test("awaits mutation targets, values, and bracket selectors", async () => {
        const systemContext = asyncIdentitySystem();
        const result = await parseAndEvaluateAsync(`
            arr = [1, 2, 3];
            .slow(arr)[.slow(2)] = .slow(9);
            obj = {= seed=0 };
            .slow(obj).answer = .slow(7);
            .slow(obj) .= .slow({= extra=8 });
            tensor = {:2x2: 1, 2; 3, 4};
            before = tensor[.slow(2), .slow(1)];
            column = tensor[.slow(1):.slow(2), .slow(1)];
            tensor[.slow(2), .slow(1)] = .slow(10);
            [arr[2], obj.answer, obj.extra, before, column, tensor[2, 1]];
        `, { systemContext });

        expect(result.values.slice(0, 4).map((value) => value.value))
            .toEqual([9n, 7n, 8n, 3n]);
        expect(formatValue(result.values[4])).toBe("{:2: 1, 10 }");
        expect(result.values[5].value).toBe(10n);
    });

    test("awaits semantic, type, outfit, and multifunction operands", async () => {
        const systemContext = asyncIdentitySystem();
        const result = await parseAndEvaluateAsync(`
            outfitted = {^ /#answer/ .slow(7) };
            membership = .slow(outfitted) ? :Integer;
            soft = .slow(7) ~: :Rational;
            strict = .slow(8) ~!: :Rational;
            exported = .TypeExport(.slow(soft));
            imported = .TypeImport(.slow(exported));
            F = {> .slow(x -> .slow(x + 1)) };
            [outfitted.__name, membership, soft, strict, imported, F(2)];
        `, { systemContext });

        expect(result.values[0].value).toBe("answer");
        expect(result.values[1].value).toBe(1n);
        expect(result.values.slice(2).map((value) => formatValue(value)))
            .toEqual(["7", "8", "7", "3"]);
    });

    test("awaits multifunction prep before selecting a variant", async () => {
        const systemContext = asyncIdentitySystem();
        const value = await parseAndEvaluateAsync(`
            F = {>
                (x) ?- [.slow(x > 0)] -> :positive,
                (x) -> :fallback
            };
            [F(-1), F(1)];
        `, { systemContext });

        expect(value.values.map((entry) => entry.value)).toEqual(["fallback", "positive"]);
    });

    test("preserves strict and undecided multifunction prep semantics", async () => {
        const blocked = await parseAndEvaluateAsync(`
            F = {>
                (x) ?- [x < 0.55] -> :below,
                (x) -> :fallback
            };
            F(0.5?);
        `);
        const falling = await parseAndEvaluateAsync(`
            F = {>
                (x) ??- [x < 0.55] -> :below,
                (x) -> :fallback
            };
            F(0.5?);
        `);

        expect(blocked).toBe(UNDECIDED);
        expect(falling.value).toBe("fallback");
        await expect(parseAndEvaluateAsync("F(x) ?!- [x > 0] -> x; F(-1)"))
            .rejects.toThrow("F prep failed at entry 1");
        await expect(parseAndEvaluateAsync("F(x) ??!- [x < 0.55] -> x; F(0.5?)"))
            .rejects.toThrow("F prep remained undecided at entry 1");
    });

    test("calls symbolic specs, units, exact generators, and partial sysrefs", async () => {
        const systemContext = asyncIdentitySystem();
        const result = await parseAndEvaluateAsync(`
            S := {#x# x^2};
            ReversedAdd := .Add(_2, _1);
            AddRef := .Add;
            AddTwo := AddRef(_1, 2);
            SlowPartial := .slow(_1);
            [
                .Units[:m](3),
                .Exact[:pi](3),
                S(3),
                ReversedAdd(3, 4),
                AddTwo(5),
                SlowPartial(9)
            ];
        `, { systemContext });

        expect(formatValue(result.values[0])).toBe("3~[m]");
        expect(formatValue(result.values[1])).toBe("3~{pi}");
        expect(formatValue(result.values[2])).toBe("{# 3 ^ 2 }");
        expect(result.values.slice(3).map((value) => value.value)).toEqual([7n, 7n, 9n]);
    });

    test("keeps self and parent-self callable identity during async calls", async () => {
        const self = await parseAndEvaluateAsync("F := x -> $.label; F.label = 42; F(1)");
        const parent = await parseAndEvaluateAsync(`
            F = {>
                (x) /Base/ -> x + 1,
                (x) /Again/ -> $$[:Base](x) * 2
            };
            F[:Again](3);
        `);

        expect(self.value).toBe(42n);
        expect(parent.value).toBe(8n);
    });

    test("retains lexical scheduling for escaped multifunctions and cleans call state", async () => {
        let active = 0;
        let maximumActive = 0;
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("slow", {
            impl: async ([value]) => {
                active += 1;
                maximumActive = Math.max(maximumActive, active);
                await Promise.resolve();
                active -= 1;
                return value;
            },
        });
        systemContext.freeze();
        const context = new Context();

        const value = await parseAndEvaluateAsync(`
            F := {$ {> (xs) -> {; xs |>> .slow } } };
            F([1, 2, 3, 4]);
        `, { context, systemContext });
        expect(value.values.map((entry) => entry.value)).toEqual([1n, 2n, 3n, 4n]);
        expect(maximumActive).toBeGreaterThan(1);
        expect(active).toBe(0);

        await expect(parseAndEvaluateAsync(`
            Strict := {$ (x) ?!- [x > 0] -> x };
            Strict(-1);
        `, { context, systemContext })).rejects.toThrow("<lambda> prep failed at entry 1");
        expect(context.localScopes).toHaveLength(0);
        expect(context.callStack).toHaveLength(0);
        expect(context.currentCallables).toHaveLength(0);
        expect((await parseAndEvaluateAsync("1 + 1", { context, systemContext })).value).toBe(2n);
    });

    test("caps implicit traversal arguments for partial callbacks", async () => {
        const mapped = await parseAndEvaluateAsync("[1, 2, 3] |>> .Add(_1, 10)");
        const reduced = await parseAndEvaluateAsync("[1, 2, 3] |>: .Add(_1, _2)");
        const streamed = await parseAndEvaluateAsync(
            "(.Stream([1, 2, 3]) |>> .Add(_1, 10)).Collect()",
        );

        expect(mapped.values.map((entry) => entry.value)).toEqual([11n, 12n, 13n]);
        expect(reduced.value).toBe(6n);
        expect(streamed.values.map((entry) => entry.value)).toEqual([11n, 12n, 13n]);
    });
});
