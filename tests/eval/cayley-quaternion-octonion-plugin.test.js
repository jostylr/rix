import { describe, expect, test } from "bun:test";
import { formatValue, parseAndEvaluate } from "../../src/index.js";

describe("cayley Phase 1 and 2 plugin", () => {
    test("keeps exact order, sparse products, adapters, and capability gates", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cayley");
            i := .cayley.BasisValue(2,1);
            j := .cayley.BasisValue(2,2);
            z := .complex.FromParts(2,3);
            old := .exactAlgebras.Quaternion(1,2,3,4);
            [ (i*j).Components(), (j*i).Components(),
              .cayley.BasisProduct(3,1,2)[:index],
              .cayley.VerifyMultiplication(i,j),
              .cayley.FromComplex(z).Components(),
              .cayley.FromExactAlgebra(old).Components(),
              .cayley.Level(4).Capabilities()[:division] ];
        `);
        expect(formatValue(result)).toBe("[[0, 0, 0, 1], [0, 0, 0, -1], 3, 1, [2, 3], [1, 2, 3, 4], _]");
    });

    test("refines mixed certified-real components to enclosing boxes", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cayley");
            .Plugin.Load("algebraic-real");
            q := .cayley.Value(2,[1,.ar.Sqrt2(),0,1/3]);
            box := q.Refine({= absoluteWidth=1/1000,maxWork=400 });
            [q.ZeroStatus()[:status],box[:certified],box[:goalMet],
             box[:componentIntervals][2],q[:componentBackends][2]];
        `);
        expect(result.values[0].value).toBe("nonzero");
        expect(String(result.values[1])).toBe("1");
        expect(String(result.values[2])).toBe("1");
        expect(formatValue(result.values[3])).toContain(":");
        expect(result.values[4].value).toBe("rix.algebraic-real@1");
    });
});

describe("quaternion Phase 1 and 2 plugin", () => {
    test("provides exact facade arithmetic and explicit division order", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("quaternion");
            i := .quaternion.Basis(1); j := .quaternion.Basis(2);
            q := .quaternion.Quaternion(1,2,3,4);
            [ (i*j).Components(),(j*i).Components(),q.NormSquared(),
              q.Inverse().Components(),(q*q.Inverse()).Components(),q.ZeroStatus()[:status] ];
        `);
        expect(formatValue(result)).toBe("[[0, 0, 0, 1], [0, 0, 0, -1], 30, [1/30, -1/15, -1/10, -2/15], [1, 0, 0, 0], nonzero]");
    });

    test("evaluates intrinsic slices and exposes negative-axis direction families", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("quaternion");
            q := .quaternion.Quaternion(1,2,3,4);
            expq := q.Exp();
            family := .quaternion.Quaternion(-1).LogResult();
            chosen := .quaternion.Quaternion(-1).Log({= branchDirection=[0,1,0] });
            [expq[:cayley][:componentBackends][1],expq.Record()[:sliceEvidence][:associative],
             family[:status],family[:branchFamily][:directions],chosen.Components()[3].Value()];
        `);
        expect(result.values[0].value).toBe("float");
        expect(String(result.values[1])).toBe("1");
        expect(result.values[2].value).toBe("branchFamily");
        expect(result.values[3].value).toBe("unitSphere2");
        expect(result.values[4].value).toContain("3.14159");
    });
});

describe("octonion Phase 1 and 2 plugin", () => {
    test("certifies alternative and Moufang fixtures while preserving nonassociativity", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("octonion");
            e1 := .octonion.Basis(1); e2 := .octonion.Basis(2); e4 := .octonion.Basis(4);
            o := .octonion.Octonion(1,2,3,4,5,6,7,8);
            [((e1*e2)*e4).Components(),(e1*(e2*e4)).Components(),
             .octonion.VerifyIdentity(:alternativityLeft,o,e1)[:valid],
             .octonion.VerifyIdentity(:moufang,e1,e2,e4)[:valid],
             .octonion.VerifyIdentity(:nonassociative,e1,e2,e4)[:valid],o.NormSquared()];
        `);
        expect(formatValue(result)).toBe("[[0, 0, 0, 0, 0, 0, 0, 1], [0, 0, 0, 0, 0, 0, 0, -1], 1, 1, 1, 204]");
    });

    test("records one-generated series order and slice branch evidence", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("octonion");
            e1 := .octonion.Basis(1);
            polynomial := e1.Series([1,2,3]);
            expi := e1.Exp();
            family := .octonion.Octonion(-1).LogResult();
            [polynomial.Components(),polynomial.Record()[:evaluationOrder],
             polynomial.Record()[:sliceEvidence][:associativeSubalgebra],
             expi[:cayley][:componentBackends][1],family[:status],family[:branchFamily][:directions]];
        `);
        expect(formatValue(result)).toBe("[[-2, 2, 0, 0, 0, 0, 0, 0], rightHorner, 1, float, branchFamily, unitSphere6]");
    });
});
