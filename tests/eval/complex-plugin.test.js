import { describe, expect, test } from "bun:test";
import { RationalInterval } from "@ratmath/core";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/index.js";
import { loadFloatPlugin } from "../../plugins/float/node-installer.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function entry(map, key) {
    return map.entries.get(String(key).toLowerCase());
}

function text(value) {
    return value?.value ?? null;
}

describe("representation-generic Complex plugin", () => {
    test("is a bundled pure-RiX plugin with a complex-specific enclosure contract", () => {
        const options = runtime();
        const info = parseAndEvaluate('.Plugin.Info("complex")', options);

        expect(text(entry(info, "kind"))).toBe("rix");
        expect(text(entry(info, "mount"))).toBe("complex");
        expect(entry(info, "requires").values.map(text)).toContain("rix.numerics@1");
        expect(entry(info, "provides").values.map(text)).toContain("rix.enclosable-complex@1");
        expect(() => parseAndEvaluate(".complex(1,2)", options)).toThrow("available but not loaded");

        const value = parseAndEvaluate('.Plugin.Load("complex"); .complex(1,2)', options);
        expect(value._ext.get("__type").value).toBe("ComplexReal");
        expect(text(entry(value, "valueKind"))).toBe("complexReal");
        expect(text(entry(value, "denotation"))).toBe("singleton");
        expect(text(entry(value, "schema"))).toBe("rix.complex.real@1");

        const capabilities = parseAndEvaluate(".complex(1,2).ComplexCapabilities()", options);
        expect(text(entry(capabilities, "enclosureGeometry"))).toBe("axisAlignedRectangle");
        expect(text(entry(capabilities, "denotation"))).toBe("singleton");
        expect(entry(capabilities, "arbitraryRefinement").value).toBe(1n);
    });

    test("performs native exact arithmetic and Rational embedding", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("complex");
            z = .complex(1,2);
            w = .complex(3,-1);
            values = [z+w,z-w,z*w,z/w,-z,z+4,z.Conjugate()];
            {: values.Map((value)->value.Real()), values.Map((value)->value.Imaginary()), z.NormSquared() }
        `, options);

        expect(result.values[0].values.map(String)).toEqual(["4", "-2", "5", "1/10", "-1", "5", "1"]);
        expect(result.values[1].values.map(String)).toEqual(["1", "3", "5", "7/10", "-2", "2", "-2"]);
        expect(String(result.values[2])).toBe("5");
        expect(() => parseAndEvaluate("z/.complex(0,0)", options)).toThrow("exact complex zero");
    });

    test("combines different certified real families and returns a containing rectangle", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("complex");
            .Plugin.Load("algebraic-real");
            .Plugin.Load("continued-fraction");
            z = .complex.FromParts(.ar.Sqrt2(),.cf.Sqrt2());
            z.Refine({= absoluteWidth=1/1000,maxWork=400 })
        `, options);

        expect(text(entry(result, "schema"))).toBe("rix.complex.enclosure@1");
        expect(text(entry(result, "geometry"))).toBe("axisAlignedRectangle");
        expect(text(entry(result, "status"))).toBe("enclosed");
        expect(entry(result, "interval")).toBeUndefined();
        const real = entry(result, "realInterval");
        const imaginary = entry(result, "imaginaryInterval");
        expect(real).toBeInstanceOf(RationalInterval);
        expect(imaginary).toBeInstanceOf(RationalInterval);
        const tolerance = parseAndEvaluate("1/1000", options);
        const two = parseAndEvaluate("2", options).toRational();
        for (const interval of [real, imaginary]) {
            expect(interval.high.subtract(interval.low).lessThanOrEqual(tolerance)).toBe(true);
            expect(interval.low.multiply(interval.low).lessThanOrEqual(two)).toBe(true);
            expect(interval.high.multiply(interval.high).greaterThanOrEqual(two)).toBe(true);
        }
        expect(entry(entry(result, "work"), "calls").value <= 400n).toBe(true);
    });

    test("rejects finite set Balls and Floats while accepting nested singleton Balls", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("complex"); .Plugin.Load("ball")', options);

        expect(() => parseAndEvaluate(".complex(.ball(1,1/10),0)", options))
            .toThrow("certified arbitrarily refinable singleton real");
        const accepted = parseAndEvaluate(".complex(.ball.Sqrt(2),0)", options);
        expect(accepted._ext.get("__type").value).toBe("ComplexReal");

        loadFloatPlugin(options.systemContext, options.registry);
        expect(() => parseAndEvaluate(".complex(.float(1),0)", options))
            .toThrow("certified arbitrarily refinable singleton real");
    });

    test("reports certified zero separation without treating overlap as zero", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("complex");
            {: .complex(0,0).ZeroStatus(), .complex(1,0).ZeroStatus(), .complex(0,2).ZeroStatus() }
        `, options);

        expect(result.values.map((item) => text(entry(item, "status"))))
            .toEqual(["zero", "nonzero", "nonzero"]);
        expect(result.values.every((item) => entry(item, "certified")?.value === 1n)).toBe(true);
    });

    test("refines exponential, sine, and cosine through real Numerics algorithms", () => {
        const options = runtime();
        const results = parseAndEvaluate(`
            .Plugin.Load("complex");
            values = [.complex.Exp(.complex(0,0)),.complex.Sin(.complex(0,0)),.complex.Cos(.complex(0,0))];
            values.Map((value)->value.Refine({= absoluteWidth=1/100,maxWork=600 }))
        `, options).values;

        expect(results.map((result) => text(entry(result, "status"))))
            .toEqual(["enclosed", "enclosed", "enclosed"]);
        expect(results.map((result) => entry(result, "realInterval").toString()))
            .toEqual(["1:1", "0:0", "1:1"]);
        expect(results.map((result) => entry(result, "imaginaryInterval").toString()))
            .toEqual(["0:0", "0:0", "0:0"]);
    });

    test("keeps principal Log and Sqrt branch outcomes explicit", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("complex");
            ordinary=.complex.LogResult(.complex(1,1));
            cut=.complex.LogResult(.complex(-2,0));
            origin=.complex.LogResult(.complex(0,0));
            sqrtCut=.complex.SqrtResult(.complex(-2,0));
            sqrtOrigin=.complex.SqrtResult(.complex(0,0));
            {:
                ordinary[:status],cut[:status],origin[:status],sqrtCut[:status],
                cut[:value] != _,origin[:value] != _,sqrtCut[:value] != _,
                sqrtOrigin[:status],sqrtOrigin[:value].Real(),sqrtOrigin[:value].Imaginary()
            }
        `, options);

        expect(result.values.slice(0, 4).map(text)).toEqual([
            "resolved", "branchBoundary", "undefinedAtZero", "branchBoundary",
        ]);
        expect(result.values.slice(4, 7).map((value) => value?.value ?? null)).toEqual([1n, null, 1n]);
        expect(text(result.values[7])).toBe("branchPoint");
        expect(result.values.slice(8).map(String)).toEqual(["0", "0"]);
        expect(() => parseAndEvaluate(".complex.Log(.complex(0,0))", options))
            .toThrow("inspect LogResult");

        const sqrtCut = parseAndEvaluate(`
            root=.complex.Sqrt(.complex(-2,0));
            root.Refine({= absoluteWidth=1/1000,maxWork=300 })
        `, options);
        expect(entry(sqrtCut, "realInterval").toString()).toBe("0:0");
        const imaginary = entry(sqrtCut, "imaginaryInterval");
        const two = parseAndEvaluate("2", options).toRational();
        expect(imaginary.low.multiply(imaginary.low).lessThanOrEqual(two)).toBe(true);
        expect(imaginary.high.multiply(imaginary.high).greaterThanOrEqual(two)).toBe(true);
    });
});
