import { expect, test } from "bun:test";
import { createDefaultRegistry } from "../../src/eval/evaluator.js";
import { Context } from "../../src/runtime/context.js";
import { Integer } from "@ratmath/core";

test("generic Min and Max reduce through a plugin comparison variant and retain normalized operands", () => {
    const registry = createDefaultRegistry();
    const context = new Context();
    context.setEnv("__registry__", registry);
    const boxed = (value, normalized = false) => ({ type: "test_box", value, normalized });

    registry.installVariant("COMPARE", {
        name: "TestBoxCompare",
        prepare(args) {
            if (args.length !== 2 || !args.every((value) => value?.type === "test_box")) return false;
            return { args: args.map((value) => boxed(value.value, true)) };
        },
        impl(args) {
            return new Integer(args[0].value < args[1].value ? -1n : args[0].value > args[1].value ? 1n : 0n);
        },
    });

    const evaluate = () => { throw new Error("This test evaluates concrete values only"); };
    const minimum = registry.call("MIN", [boxed(3), boxed(1), boxed(2)], context, evaluate);
    const maximum = registry.call("MAX", [boxed(3), boxed(1), boxed(2)], context, evaluate);

    expect(minimum).toMatchObject({ value: 1, normalized: true });
    expect(maximum).toMatchObject({ value: 3, normalized: true });
});

test("explicit operator priorities are deterministic and reject ties", () => {
    const registry = createDefaultRegistry();
    const context = new Context();
    const evaluate = () => { throw new Error("This test evaluates concrete values only"); };
    const matches = { prep: (args) => args.length === 2 && args.every((value) => value?.type === "priority_box") };

    registry.installVariant("COMPARE", {
        name: "LowPriorityBoxCompare",
        priority: 10,
        ...matches,
        impl: () => new Integer(-1n),
    });
    registry.installVariant("COMPARE", {
        name: "HighPriorityBoxCompare",
        priority: 20,
        ...matches,
        impl: () => new Integer(1n),
    });
    expect(registry.call("COMPARE", [{ type: "priority_box" }, { type: "priority_box" }], context, evaluate).value).toBe(1n);

    registry.installVariant("COMPARE", {
        name: "TiedPriorityBoxCompare",
        priority: 20,
        ...matches,
        impl: () => new Integer(0n),
    });
    expect(() => registry.call("COMPARE", [{ type: "priority_box" }, { type: "priority_box" }], context, evaluate))
        .toThrow(/Ambiguous COMPARE variants/);
});
