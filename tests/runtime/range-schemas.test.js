import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const schema = (name) => JSON.parse(readFileSync(
    new URL(`../../schemas/${name}`, import.meta.url),
    "utf8",
));

describe("versioned certified-range schemas", () => {
    test("range-set v1 requires its explicit portable version", () => {
        const value = schema("range-set.schema.json");
        expect(value.$id).toEndWith("/range-set/v1.schema.json");
        expect(value.required).toContain("version");
        expect(value.properties.version.const).toBe(1);
    });

    test("provider domain coverage uses the accepted four independent states", () => {
        const value = schema("range-provider-result.schema.json");
        expect(value.properties.domainStatus.enum).toEqual([
            "allDefined", "partiallyDefined", "noDefinedInputs", "unresolved",
        ]);
        expect(value.properties.status.enum).not.toContain("domainViolation");
    });

    test("the evidence schema reserves arithmetic, derivative, and Sturm rules", () => {
        const rules = schema("range-evidence.schema.json").$defs.node.properties.rule.enum;
        expect(rules).toContain("arith.divide");
        expect(rules).toContain("monotone.derivativeSign");
        expect(rules).toContain("polynomial.sturmSequence");
        expect(rules).toContain("polynomial.completeCriticalPoints");
    });

    test("domain and calculus witnesses bind exact subject identities and inputs", () => {
        const domain = schema("domain-witness.schema.json");
        expect(domain.properties.coverage.enum).toEqual([
            "allDefined", "partiallyDefined", "noDefinedInputs", "unresolved",
        ]);
        for (const name of [
            "derivative-range-witness.schema.json",
            "monotonicity-witness.schema.json",
            "critical-points-witness.schema.json",
        ]) {
            const value = schema(name);
            expect(value.required).toContain("functionGraph");
        }
    });
});
