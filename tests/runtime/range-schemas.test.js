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
        expect(rules).toContain("monotone.polynomialPiece");
        expect(rules).toContain("polynomial.sturmSequence");
        expect(rules).toContain("polynomial.completeCriticalPoints");
        expect(rules).toContain("polynomial.monotonicityPartition");
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
            "monotonicity-partition-witness.schema.json",
        ]) {
            const value = schema(name);
            expect(value.required).toContain("functionGraph");
        }
        expect(schema("critical-points-witness.schema.json").required).toContain("variable");
    });

    test("the Calculus graph-range result separates enclosure from exact image", () => {
        const value = schema("calculus-graph-range.schema.json");
        expect(value.$id).toEndWith("/calculus-graph-range/v1.schema.json");
        expect(value.properties.schema.const).toBe("rix.numerics.calculus-graph-range@1");
        expect(value.required).toContain("certified");
        expect(value.required).toContain("exactImage");
        expect(value.properties.domainStatus.enum).toEqual([
            "allDefined", "partiallyDefined", "noDefinedInputs", "unresolved",
        ]);
        const recognition = schema("calculus-graph-recognition.schema.json");
        expect(recognition.$id).toEndWith("/calculus-graph-recognition/v1.schema.json");
        expect(recognition.properties.kind.enum).toEqual(["polynomial", "rationalFunction"]);
        expect(recognition.properties.cancellationPerformed.const).toBe(false);
        const derivativeSign = schema("calculus-derivative-sign.schema.json");
        expect(derivativeSign.$id).toEndWith("/calculus-derivative-sign/v1.schema.json");
        expect(derivativeSign.properties.direction.enum).toContain("unknown");
        expect(derivativeSign.required).toContain("monotonicityCertified");
        const lipschitz = schema("calculus-lipschitz-range.schema.json");
        expect(lipschitz.properties.strategy.const).toBe("lipschitzMidpoint");
        expect(lipschitz.required).toContain("partitions");
        const taylor = schema("calculus-taylor-range.schema.json");
        expect(taylor.properties.strategy.const).toBe("secondDerivativeTaylor");
        expect(taylor.properties.curvature.enum).toContain("mixed");
        const simplification = schema("calculus-graph-simplification.schema.json");
        expect(simplification.properties.schema.const).toBe("rix.calculus.graph-simplification@1");
        expect(simplification.properties.rules.items.properties.rule.enum)
            .toContain("divisionIdentity");
        const facts = schema("function-facts.schema.json");
        expect(facts.properties.schema.const).toBe("rix.numerics.function-facts@1");
        expect(facts.properties.operations.items.enum).toContain("singularities");
        expect(schema("range-provider.schema.json").properties.facts.$ref)
            .toBe("function-facts.schema.json");
        const rewrite = schema("calculus-graph-rewrite.schema.json");
        expect(rewrite.properties.theorem.enum).toContain("divide.cancelself");
        const box = schema("rational-box.schema.json");
        expect(box.properties.schema.const).toBe("rix.numerics.rational-box@1");
        expect(box.properties.dimension.maximum).toBe(16);
        const multivariate = schema("multivariate-range.schema.json");
        expect(multivariate.properties.strategy.enum).toEqual([
            "jacobianSubdivision", "affineArithmetic", "multivariateTaylorModel",
        ]);
    });
});
