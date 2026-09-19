import { describe, expect, test } from "bun:test";
import { formatValue, parseAndEvaluate } from "../../src/index.js";
import { forEachShapedCell } from "../../src/runtime/shaped.js";

function flat(value) {
    const result = [];
    forEachShapedCell(value, (entry) => result.push(String(entry)));
    return result;
}

describe("linalg Phase 1 plugin", () => {
    test("solves exact dense systems and reports rank states", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            unique := .linalg.Solve([2, 1; 1, -1], [5, 1]);
            under := .linalg.Solve({:1x2: 1, 1}, [2]);
            inconsistent := .linalg.Solve([1, 1; 2, 2], [1, 3]);
            [unique[:status], unique[:solution], under[:status], under[:nullspace].Len(),
             inconsistent[:status], .linalg.Determinant([2, 1; 1, -1]), .linalg.Inverse([1, 2; 3, 5])];
        `);
        expect(result.values[0].value).toBe("unique");
        expect(flat(result.values[1])).toEqual(["2", "1"]);
        expect(result.values[2].value).toBe("underdetermined");
        expect(String(result.values[3])).toBe("1");
        expect(result.values[4].value).toBe("inconsistent");
        expect(String(result.values[5])).toBe("-3");
        expect(flat(result.values[6])).toEqual(["-5", "2", "3", "-1"]);
    });

    test("changes vector and tensor Frames while retaining representation lineage", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            vspace := .linalg.VectorSpace({= name="plane", dimension=2, over=:Rational });
            standard := .linalg.Frame(vspace, {= name="standard", basis=:defining });
            skew := .linalg.Frame(vspace, {= name="skew", relativeTo=standard, basis=[1, 1; 0, 1] });
            vector := {:2: /Vector: Standard/ 2, 3};
            covector := {:2: /Covector: Standard/ 2, 3};
            operator := {:2x2: /Tensor: Standard@Standard*/ 1, 2; 3, 4};
            vectorSkew := .linalg.Transform(vector, skew);
            covectorSkew := .linalg.Transform(covector, skew);
            operatorRoundTrip := .linalg.Transform(.linalg.Transform(operator, skew), standard);
            [vectorSkew.components, covectorSkew.components,
             .linalg.SameTensor(vector, vectorSkew), operatorRoundTrip.components];
        `);
        expect(flat(result.values[0])).toEqual(["-1", "3"]);
        expect(flat(result.values[1])).toEqual(["2", "5"]);
        expect(result.values[2]).not.toBeNull();
        expect(flat(result.values[3])).toEqual(["1", "2", "3", "4"]);
        expect(formatValue(parseAndEvaluate(`
            .Plugin.Load("linalg");
            vspace := .linalg.VectorSpace("plane", 2);
            a := .linalg.Frame(vspace, "a", :defining);
            b := .linalg.Frame(vspace, {= name="b", relativeTo=a, basis=[1, 1; 0, 1] });
            v := .linalg.Vector([2, 3], a);
            .linalg.Transform!(v, b);
            [v.components];
        `))).toBe("[{:2: -1, 3 }]");
    });

    test("typed headers require Frames and vector arithmetic converts the right representation to the left", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            vspace := .linalg.VectorSpace("V", 2);
            e := .linalg.Frame(vspace, "e", :defining);
            f := .linalg.Frame(vspace, {= relativeTo=e, basis=[1, 1; 0, 1] });
            x := {:2: /Vector: E/ 2, 3};
            y := x.Transform(f);
            p := {:2: /Vector: E*/ 4, 5};
            [x.__type, p.__type, (x + y).components, .linalg.SameTensor(x, y), p.Pair(y)];
        `);
        expect(result.values[0].value).toBe("Vector");
        expect(result.values[1].value).toBe("Covector");
        expect(flat(result.values[2])).toEqual(["4", "6"]);
        expect(result.values[3]).not.toBeNull();
        expect(String(result.values[4])).toBe("23");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("linalg");
            vspace := .linalg.VectorSpace("V", 2);
            {:2: /Vector: Vspace/ 1, 2};
        `)).toThrow("a Frame");
    });

    test("independent tensor slots may use differently sized spaces and independent target Frames", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            v := .linalg.VectorSpace("V", 2);
            w := .linalg.VectorSpace("W", 3);
            e := .linalg.Frame(v, "e", :defining);
            f := .linalg.Frame(v, {= relativeTo=e, basis=[1, 1; 0, 1] });
            g := .linalg.Frame(w, "g", :defining);
            h := .linalg.Frame(w, {= relativeTo=g, basis=[1,0,1; 0,1,0; 0,0,1] });
            t := {:2x3: /Tensor: E@G*/ 1,2,3; 4,5,6};
            changed := t.Transform([f, h]);
            roundTrip := changed.Transform([e, g]);
            [changed.Frames().Map((frame)->frame[:name]), roundTrip.components, .linalg.SameTensor(t, roundTrip)];
        `);
        expect(result.values[0].values.map((name) => name.value)).toEqual(["frame", "frame"]);
        expect(flat(result.values[1])).toEqual(["1", "2", "3", "4", "5", "6"]);
        expect(result.values[2]).not.toBeNull();
    });

    test("lineage retains the origin plus the configured recent representation limit", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            vspace := .linalg.VectorSpace({= name="V", dimension=2, lineageLimit=2 });
            e := .linalg.Frame(vspace, "e", :defining);
            f := .linalg.Frame(vspace, {= relativeTo=e, basis=[1,1;0,1] });
            x0 := {:2: /Vector: E/ 1, 2};
            x1 := x0.Transform(f);
            x2 := x1.Transform(e);
            x3 := x2.Transform(f);
            [x3.identity[:origin] != _, x3.identity[:representations].Len(), .linalg.SameTensor(x0, x3)];
        `);
        expect(result.values[0]).not.toBeNull();
        expect(String(result.values[1])).toBe("3");
        expect(result.values[2]).not.toBeNull();
    });
});

describe("linalg Phase 2 exact decompositions", () => {
    test("runs replayable fraction-free Bareiss elimination and certifies determinants", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            A := [0,2,1; 2,3,4; 4,1,5];
            elimination := .linalg.Bareiss(A);
            certificate := .linalg.DeterminantCertificate(A);
            [elimination[:echelon], elimination[:pivots], elimination[:rowswaps],
             elimination[:determinant], elimination.Verify(), elimination[:stages].Len(),
             certificate[:determinant], certificate[:independentcheck], certificate.Verify()];
        `);
        expect(flat(result.values[0])).toEqual(["2", "3", "4", "0", "4", "2", "0", "0", "-2"]);
        expect(result.values[1].values.map(String)).toEqual(["1", "2", "3"]);
        expect(result.values[2].values.map((swap) => swap.values.map(String))).toEqual([["1", "2"]]);
        expect(result.values.slice(3).map(String)).toEqual(["2", "1", "3", "2", "2", "1"]);
    });

    test("returns reusable row-pivoted LU and exact LDU factorization objects", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            A := [0,2; 3,4];
            lu := .linalg.LU(A);
            ldu := .linalg.LDU(A);
            [lu[:permutation], lu[:lower], lu[:upper], lu[:determinant],
             lu.Verify(), ldu.Verify(), lu.Solve([2,7]), ldu.Solve([2,7]), lu.Inverse()];
        `);
        expect(flat(result.values[0])).toEqual(["0", "1", "1", "0"]);
        expect(flat(result.values[1])).toEqual(["1", "0", "0", "1"]);
        expect(flat(result.values[2])).toEqual(["3", "4", "0", "2"]);
        expect(result.values.slice(3, 6).map(String)).toEqual(["-6", "1", "1"]);
        expect(flat(result.values[6])).toEqual(["1", "1"]);
        expect(flat(result.values[7])).toEqual(["1", "1"]);
        expect(flat(result.values[8])).toEqual(["-2/3", "1/3", "1/2", "0"]);

        const singular = parseAndEvaluate('.Plugin.Load("linalg"); .linalg.LU([1,2;2,4])');
        expect(String(singular.entries.get("rank"))).toBe("1");
        expect(String(singular.entries.get("singular"))).toBe("1");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("linalg");
            (.linalg.LU([1,2;2,4])).Solve([1,2]);
        `)).toThrow("cannot solve uniquely");
    });

    test("constructs exact row, column, and null-space basis records", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            A := [1,2,3; 2,4,6];
            rows := .linalg.RowSpace(A);
            columns := .linalg.ColumnSpace(A);
            nulls := .linalg.NullSpace(A);
            [rows, columns, nulls, rows.Verify(), columns.Verify(), nulls.Verify()];
        `);
        const [rows, columns, nulls] = result.values;
        expect(rows.entries.get("kind").value).toBe("rowSpace");
        expect(String(rows.entries.get("dimension"))).toBe("1");
        expect(flat(rows.entries.get("basis").values[0])).toEqual(["1", "2", "3"]);
        expect(columns.entries.get("kind").value).toBe("columnSpace");
        expect(flat(columns.entries.get("basis").values[0])).toEqual(["1", "2"]);
        expect(nulls.entries.get("kind").value).toBe("nullSpace");
        expect(nulls.entries.get("basis").values.map(flat)).toEqual([
            ["-2", "1", "0"], ["-3", "0", "1"],
        ]);
        expect(result.values.slice(3).map(String)).toEqual(["1", "1", "1"]);
    });

    test("returns reduced exact QR when every orthogonalized norm is rational", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            square := .linalg.QR([3,0;4,5]);
            tallMatrix := {:3x2: /Matrix/ 3,0;4,0;0,5};
            tall := tallMatrix.QR();
            [square[:status],square.Q(),square.R(),square.Verify(),
             tall[:q],tall[:r],tall.Verify(),square[:algorithm],square[:coefficientdomain]];
        `);
        expect(result.values[0].value).toBe("decomposed");
        expect(flat(result.values[1])).toEqual(["3/5", "-4/5", "4/5", "3/5"]);
        expect(flat(result.values[2])).toEqual(["5", "4", "0", "3"]);
        expect(String(result.values[3])).toBe("1");
        expect(flat(result.values[4])).toEqual(["3/5", "0", "4/5", "0", "0", "1"]);
        expect(flat(result.values[5])).toEqual(["5", "0", "0", "5"]);
        expect(result.values.slice(6, 7).map(String)).toEqual(["1"]);
        expect(result.values[7].value).toBe("modifiedGramSchmidt");
        expect(result.values[8].value).toBe("Rational");
    });

    test("reports exact QR coefficient, rank, and shape boundaries structurally", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            extension := .linalg.QR([1,0;1,1]);
            dependent := .linalg.QR([3,6;4,8]);
            wide := .linalg.QR([1,0,0;0,1,0]);
            [extension[:status],extension[:column],extension[:squarednorm],extension[:requiredextension],
             extension[:completedcolumns],dependent[:status],dependent[:column],dependent[:completedcolumns],
             wide[:status],wide[:rowcount],wide[:columncount]];
        `);
        expect(result.values[0].value).toBe("unsupportedCoefficientExtension");
        expect(result.values.slice(1, 3).map(String)).toEqual(["1", "2"]);
        expect(result.values[3].entries.get("kind").value).toBe("squareRoot");
        expect(String(result.values[3].entries.get("radicand"))).toBe("2");
        expect(String(result.values[4])).toBe("0");
        expect(result.values[5].value).toBe("rankDeficient");
        expect(result.values.slice(6, 8).map(String)).toEqual(["2", "1"]);
        expect(result.values[8].value).toBe("requiresTallOrSquareMatrix");
        expect(result.values.slice(9).map(String)).toEqual(["2", "3"]);
    });

    test("models linear maps between spaces with composition, duals, pushforwards, and pullbacks", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            V := .linalg.VectorSpace("V",2); W := .linalg.VectorSpace("W",3);
            e := .linalg.Frame(V,"e",:defining); g := .linalg.Frame(W,"g",:defining);
            A := .linalg.LinearMap(V,W,{:3x2: 1,0;0,1;1,1},{= sourceFrame=e,targetFrame=g,name="A" });
            B := .linalg.LinearMap(V,V,[1,1;0,1],{= sourceFrame=e,targetFrame=e,name="B" });
            x := .linalg.Vector([1,2],e); alpha := .linalg.Covector([1,1,1],g);
            {:
                A.Pushforward(x).components,
                A.Pullback(alpha).components,
                B.Inverse().Pushforward(B.Pushforward(x)).components,
                A.Compose(B).Pushforward(x).components,
                A.Dual().Verify(),A.Verify(),.linalg.DualSpace(V)[:dimension]
            };
        `);
        expect(flat(result.values[0])).toEqual(["1", "2", "3"]);
        expect(flat(result.values[1])).toEqual(["2", "2"]);
        expect(flat(result.values[2])).toEqual(["1", "2"]);
        expect(flat(result.values[3])).toEqual(["3", "2", "5"]);
        expect(result.values.slice(4, 6).map(String)).toEqual(["1", "1"]);
        expect(String(result.values[6])).toBe("2");
    });

    test("forms tensor products and exact primal-dual contractions", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            V := .linalg.VectorSpace("V",2); e := .linalg.Frame(V,"e",:defining);
            x := .linalg.Vector([1,2],e); alpha := .linalg.Covector([3,4],e);
            product := .linalg.TensorProduct(x,alpha);
            spaceProduct := .linalg.TensorProduct(V,.linalg.DualSpace(V));
            {: product.components,product.Contract(1,2),spaceProduct[:dimension] };
        `);
        expect(flat(result.values[0])).toEqual(["3", "4", "6", "8"]);
        expect(String(result.values[1])).toBe("11");
        expect(String(result.values[2])).toBe("4");
    });

    test("realizes bounded polynomials as linked vectors and serializes stable lineage records", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            P3 := .linalg.PolynomialSpace(3,:x);
            polynomial := .p\`x^2+2*x+3\`;
            view := P3.Realize(polynomial);
            rebuilt := view.Reconstruct();
            moved := view[:vector].Transform(P3[:frame]);
            {:
                view[:schema],view[:domain].__type,view[:vector].components,
                rebuilt==polynomial,.linalg.Serialize(view),.linalg.Serialize(moved)
            };
        `);
        expect(result.values[0].value).toBe("rix.linalg.linear-realization@1");
        expect(result.values[1].value).toBe("Polynomial");
        expect(flat(result.values[2])).toEqual(["3", "2", "1", "0"]);
        expect(String(result.values[3])).toBe("1");
        expect(result.values[4].entries.get("kind").value).toBe("linearRealization");
        expect(result.values[5].entries.get("kind").value).toBe("tensorRepresentation");
        expect(String(result.values[5].entries.get("tensorid"))).toBe(
            String(result.values[4].entries.get("vector").entries.get("tensorid")),
        );
    });
});

describe("optimize Phase 1 plugin", () => {
    test("solves exact standard-form linear programs", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("optimize");
            program := .optimize.LinearProgram([3, 2], [1, 1; 1, 0; 0, 1], [4, 2, 3]);
            solved := .optimize.Solve(program);
            unbounded := .optimize.Maximize([1], {:1x1: 0}, [1]);
            [solved.status, solved.solution, solved.objectiveValue, solved.feasible, unbounded.status,
             solved[:method],solved[:certificatestatus],solved[:certificate],solved[:diagnostics]];
        `);
        expect(result.values[0].value).toBe("optimal");
        expect(flat(result.values[1])).toEqual(["2", "2"]);
        expect(String(result.values[2])).toBe("10");
        expect(String(result.values[3])).toBe("1");
        expect(result.values[4].value).toBe("unbounded");
        expect(result.values[5].value).toBe("standardPrimalSimplex");
        expect(result.values[6].value).toBe("notAvailable");
        expect(result.values[7]).toBeNull();
        expect(result.values[8].values.at(-1).value).toMatch(/twoPhase=1/i);
    });

    test("keeps evaluation, minimization, and bounded-work results in pure RiX", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("optimize");
            program := .optimize.LinearProgram([1], {:1x1: 1}, [4]);
            inside := program.Evaluate([2]);
            outside := .optimize.Evaluate(program, [5]);
            minimum := .optimize.Minimize([1], {:1x1: 1}, [4]);
            limited := .optimize.Solve(
                .optimize.LinearProgram([3, 2], [1, 1; 1, 0; 0, 1], [4, 2, 3]),
                {= maxIterations=1 }
            );
            [inside.objectiveValue, inside.feasible, outside.feasible,
             minimum.status, minimum.objectiveValue, limited.status, .Plugin.Info("optimize")[:kind]];
        `);
        expect(String(result.values[0])).toBe("2");
        expect(String(result.values[1])).toBe("1");
        expect(result.values[2]).toBeNull();
        expect(result.values[3].value).toBe("optimal");
        expect(String(result.values[4])).toBe("0");
        expect(result.values[5].value).toBe("iterationLimit");
        expect(result.values[6].value).toBe("rix");
    });

    test("reports infeasible models through the two-phase solver", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("optimize");
            solved := .optimize.Minimize([1], {:1x1: 1}, [-1]);
            solved.status;
        `);
        expect(result.value).toBe("infeasible");
    });
});

describe("optimize Phase 2 general exact LP", () => {
    test("handles equality and greater-than constraints with exact primal/dual certificates", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("optimize");
            equality := .optimize.LinearProgram([1,0],[1,1;1,0],[3,2],{= relations=[:eq,:le] });
            minimum := .optimize.LinearProgram([1],{:1x1: 1},[2],{= sense=:min,relations=[:ge] });
            a := equality.Solve({= twoPhase=1 }); b := minimum.Solve();
            {:
                a[:status],a[:solution],a[:objectivevalue],a[:dualsolution],a[:certificate].Verify(),a[:method],a[:certificatestatus],
                b[:status],b[:solution],b[:objectivevalue],b[:dualsolution],b[:certificate].Verify()
            };
        `);
        expect(result.values[0].value).toBe("optimal");
        expect(flat(result.values[1])).toEqual(["2", "1"]);
        expect(String(result.values[2])).toBe("2");
        expect(flat(result.values[3])).toEqual(["0", "1"]);
        expect(String(result.values[4])).toBe("1");
        expect(result.values[5].value).toBe("twoPhaseExactSimplex");
        expect(result.values[6].value).toBe("verified");
        expect(result.values[7].value).toBe("optimal");
        expect(flat(result.values[8])).toEqual(["2"]);
        expect(String(result.values[9])).toBe("2");
        expect(flat(result.values[10])).toEqual(["-1"]);
        expect(String(result.values[11])).toBe("1");
    });

    test("canonicalizes free and bounded variables without losing original coordinates", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("optimize");
            free := .optimize.LinearProgram([1],{:1x1: 1},[-1],{=
                relations=[:le],lowerBounds=[_],upperBounds=[_]
            }).Solve();
            bounded := .optimize.LinearProgram([1],{:1x1: 0},[1],{=
                lowerBounds=[-2],upperBounds=[3]
            }).Solve();
            {: free[:solution],free[:objectivevalue],bounded[:solution],bounded[:objectivevalue] };
        `);
        expect(flat(result.values[0])).toEqual(["-1"]);
        expect(String(result.values[1])).toBe("-1");
        expect(flat(result.values[2])).toEqual(["3"]);
        expect(String(result.values[3])).toBe("3");
    });

    test("returns independently replayable infeasible and unbounded certificates", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("optimize");
            impossible := .optimize.LinearProgram([1],[1;1],[2,1],{= relations=[:ge,:le] }).Solve();
            ray := .optimize.LinearProgram([1],{:1x1: 1},[0],{= relations=[:ge] }).Solve();
            {:
                impossible[:status],impossible[:certificate].Verify(),
                ray[:status],ray[:certificate][:direction],ray[:certificate].Verify()
            };
        `);
        expect(result.values[0].value).toBe("infeasible");
        expect(String(result.values[1])).toBe("1");
        expect(result.values[2].value).toBe("unbounded");
        expect(flat(result.values[3])).toEqual(["1"]);
        expect(String(result.values[4])).toBe("1");
    });

    test("publishes basis reuse, exact RHS sensitivity, and stable model interchange", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("optimize");
            model := .optimize.LinearProgram([1,0],[1,1;1,0],[3,2],{= relations=[:eq,:le],name="demo" });
            solved := model.Solve({= twoPhase=1 });
            rebuilt := .optimize.FromRecord(model.Record());
            {:
                solved[:basisfactorization].Verify(),solved.BasisSolve([4,1]),
                solved[:sensitivity][:rhsranges],rebuilt.Record(),rebuilt.Solve({= twoPhase=1 })[:objectivevalue]
            };
        `);
        expect(String(result.values[0])).toBe("1");
        expect(flat(result.values[1])).toEqual(["3", "1"]);
        expect(result.values[2].values).toHaveLength(2);
        expect(result.values[2].values[0].entries.get("deltalower")).not.toBeNull();
        expect(result.values[3].entries.get("schema").value).toBe("rix.optimize.linear-program@2");
        expect(String(result.values[4])).toBe("2");
    });
});

describe("solve Phase 1 plugin", () => {
    test("solves affine symbolic equality systems with named exact values", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("solve");
            system := {#a,b:x,y# x + y == a; x - y == b };
            answer := .solve.System(system, {= values={= a=3, b=1 } });
            [answer[:status], answer[:classification], answer[:solution][:x],
             answer[:solution][:y], .Plugin.Info("solve")[:kind]];
        `);
        expect(result.values[0].value).toBe("unique");
        expect(result.values[1].value).toBe("linearEqualities");
        expect(String(result.values[2])).toBe("2");
        expect(String(result.values[3])).toBe("1");
        expect(result.values[4].value).toBe("rix");
    });

    test("rejects implicit nonlinear dispatch without an explicit polynomial provider", () => {
        expect(() => parseAndEvaluate(`
            .Plugin.Load("solve");
            .solve.System({#:x# x^2 == 4 });
        `)).toThrow("Nonlinear power");
    });
});

describe("solve Phase 2 domain dispatch and Solution values", () => {
    test("returns finite, parametric, and empty exact Solution objects", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("solve");
            finite := .solve.System({#a,b:x,y# x+y==a; x-y==b },{= values={= a=3,b=1 } });
            parametric := .solve.System({#:x,y# x+y==2 },{= parameters=["s"] });
            chosen := parametric.Substitute({= s=3 });
            empty := .solve.System({#:x# x==1; x==2 });
            {:
                finite[:kind],finite[:solution],finite.Check(),
                parametric[:kind],parametric[:parameters],chosen,parametric.Residuals(chosen),parametric.Check(chosen),
                empty[:kind]
            };
        `);
        expect(result.values[0].value).toBe("finite");
        expect(String(result.values[1].entries.get("x"))).toBe("2");
        expect(String(result.values[2])).toBe("1");
        expect(result.values[3].value).toBe("parametric");
        expect(result.values[4].values[0].value).toBe("s");
        expect([String(result.values[5].entries.get("x")), String(result.values[5].entries.get("y"))])
            .toEqual(["-1", "3"]);
        expect(result.values[6].values.map(String)).toEqual(["0"]);
        expect(String(result.values[7])).toBe("1");
        expect(result.values[8].value).toBe("empty");
    });

    test("normalizes mixed definitions and inequalities before Optimize dispatch", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("solve");
            linearProgram := .solve.System({#:x,y# x+y<=4; x<=2; y<=3 },{=
                objective={= x=3,y=2 },sense=:max
            });
            mixed := .solve.System({#:x,y# y=x+1; x>=0; y<=3 },{=
                objective={= x=1 },sense=:max
            });
            {:
                linearProgram[:classification],linearProgram[:solution],linearProgram.Check(),
                mixed[:solution],mixed.Check(),mixed[:optimizationresult][:certificate].Verify()
            };
        `);
        expect(result.values[0].value).toBe("optimization");
        expect([String(result.values[1].entries.get("x")), String(result.values[1].entries.get("y"))])
            .toEqual(["2", "2"]);
        expect(String(result.values[2])).toBe("1");
        expect([String(result.values[3].entries.get("x")), String(result.values[3].entries.get("y"))])
            .toEqual(["2", "3"]);
        expect(result.values.slice(4).map(String)).toEqual(["1", "1"]);
    });

    test("dispatches polynomial roots exactly and scalar callables through Numerics", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("solve");
            polynomial := .solve.Polynomial(.p\`x^2-2\`,1:2);
            viaSystem := .solve.System({#:x# x^2==2 },{= polynomial=.p\`x^2-2\`,interval=1:2 });
            numerical := .solve.Numerical((x)->x^2-2,1:2,{= absoluteWidth=1/100,maxWork=20 });
            {:
                polynomial[:kind],polynomial[:solution].CompareRational(3/2),polynomial.Check(),
                viaSystem[:classification],
                numerical[:classification],numerical[:status],numerical[:certified],numerical[:assumptions]
            };
        `);
        expect(result.values[0].value).toBe("branch");
        expect(result.values[1].value).toBe("less");
        expect(String(result.values[2])).toBe("1");
        expect(result.values[3].value).toBe("polynomial");
        expect(result.values[4].value).toBe("numerical");
        expect(result.values[5].value).toBe("isolatedAssumed");
        expect(result.values[6]).toBeNull();
        expect(result.values[7].values.map((item) => item.value)).toEqual(["continuityOrTrustedRootCount"]);
    });
});


test("linalg adapters preserve Matrix results and explain explicit method conversion", () => {
    expect(() => parseAndEvaluate('.Plugin.Load("linalg"); [1, 2; 3, 4].Determinant()'))
        .toThrow("~!: :Matrix");
    expect(formatValue(parseAndEvaluate('.Plugin.Load("linalg"); ([1, 2; 3, 4] ~!: :Matrix).Determinant()')))
        .toBe("-2");
    const value = parseAndEvaluate(`
        .Plugin.Load("linalg");
        source := [1, 2; 3, 4];
        result := .linalg.Rref(source);
        [source.__type, result.__type];
    `);
    expect(formatValue(value)).toBe("[Shaped, Matrix]");
});
