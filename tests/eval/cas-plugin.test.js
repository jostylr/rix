import { describe, expect, test } from "bun:test";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
    parseAndEvaluateAsync,
} from "../../src/index.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function entry(value, key) {
    return value.entries.get(String(key).toLowerCase());
}

function text(value) {
    return value?.value ?? null;
}

// Independent numerical spot checks of the public derivative graph; these
// assertions test the rules, and are not used as runtime certificates.
function numericalGraph(graph, x) {
    const kind = text(entry(graph,"kind"));
    if (kind === "constant") {
        const value = entry(graph,"value");
        const [n,d="1"] = value.toString().split("/");
        return Number(n)/Number(d);
    }
    if (kind === "variable") return x;
    if (kind === "apply") {
        const a = numericalGraph(entry(graph,"arguments").values[0],x);
        const id = text(entry(graph,"semanticid"));
        if (id === "rix.function.sin@1") return Math.sin(a);
        if (id === "rix.function.cos@1") return Math.cos(a);
        throw new Error(`Unexpected test semantic function ${id}`);
    }
    const [a,b] = entry(graph,"operands").values.map(g => numericalGraph(g,x));
    switch (text(entry(graph,"operation"))) {
        case "add": return a+b;
        case "subtract": return a-b;
        case "multiply": return a*b;
        case "divide": return a/b;
        case "power": return a**b;
        case "negate": return -a;
        default: throw new Error("Unexpected test graph operation");
    }
}

describe("browser-safe course CAS plugin", () => {
    test("async integration and replay agree with sync across expression families", async () => {
        const scope = runtime();
        // Construct sources through the async entry point too: graph-building
        // callbacks must not leave promises inside expression records.
        const result = await parseAndEvaluateAsync(`
            .Plugin.Load("cas");
            x := .calculus.Variable(:x);
            Sin := .calculus.Sin(); Cos := .calculus.Cos(); Exp := .calculus.Exp();
            sources := [Sin(x^2),Sin(x^2)+x,Sin(2*x+1),Sin(x)^2,
                Sin(x)*Cos(3*x),x^2*Exp(2*x),1/(2*x+1),x^3+2*x,
                .rf\`(2*x+3)/(x^2-1)\`,.rf\`1/(x^2+1)\`];
            sources.Map((source)->{;
                result = .cas.Integrate(source,:x);
                {: result,.cas.CheckIntegral(result) };
            });
        `, scope);
        const sync = parseAndEvaluate(`sources.Map((source)->.cas.Integrate(source,:x));`, scope);
        for (let i=0;i<result.values.length;i++) {
            const [integral,replay] = result.values[i].values;
            expect(text(entry(integral,"status"))).toBe(i<2 ? "unsupported" : "complete");
            expect(text(entry(integral,"reason"))).toBe(text(entry(sync.values[i],"reason")));
            expect(entry(replay,"accepted").value).toBe(1n);
            if (i>=2) {
                scope.context.set("asyncprimitive",entry(integral,"antiderivative"));
                scope.context.set("syncprimitive",entry(sync.values[i],"antiderivative"));
                expect(parseAndEvaluate('.calculus.StructuralKey(asyncPrimitive)==.calculus.StructuralKey(syncPrimitive)',scope).value).toBe(1n);
            }
        }
    }, 120_000);

    test("diagnostic guards preserve rejection reasons across rule families", () => {
        const scope = runtime();
        parseAndEvaluate('.Plugin.Load("cas");',scope);
        const result = parseAndEvaluate(`
            x := .calculus.Variable(:x);
            Sin := .calculus.Sin(); Cos := .calculus.Cos();
            Exp := .calculus.Exp(); Log := .calculus.Log(); Sqrt := .calculus.Sqrt();
            sources := [Sin(x^2),Cos(x^2),Exp(x^2),Log(x^2),
                x*Exp(x^2),Exp(x^2)*x,Sin(x^2)*Cos(x),Sin(x)*Cos(x^2),
                1/(x^2+1),x/(x+1),Sin(x)*Exp(x),Sin(x)^(-2),Sin(x)^9,
                Sin(x^2)^2,Sqrt(x)+x,x-Sqrt(x),2*Sqrt(x),-Sqrt(x)];
            sources.Map((source)->{;
                result = .cas.Integrate(source,x);
                {: result,.cas.CheckIntegral(result) };
            });
        `, scope);
        const reasons = ["nonAffineSineArgument","nonAffineCosineArgument",
            "nonAffineExponentialArgument","nonAffineLogarithmArgument",
            "nonAffineExponentialArgument","nonAffineExponentialArgument",
            "nonAffineTrigonometricArgument","nonAffineTrigonometricArgument",
            "unsupportedQuotient","unsupportedQuotient","unsupportedProduct",
            "unsupportedTrigonometricExponent","trigonometricDegreeBudgetExceeded",
            "nonAffineTrigonometricArgument","unsupportedSumTerm","unsupportedDifferenceTerm",
            "unsupportedSemanticFunction","unsupportedSemanticFunction"];
        result.values.forEach((row,index) => {
            const [integral,replay] = row.values;
            expect(text(entry(integral,"status"))).toBe("unsupported");
            expect(text(entry(integral,"reason"))).toBe(reasons[index]);
            expect(entry(replay,"accepted").value).toBe(1n);
        });
    });

    for (const [mode,evaluate] of [["sync",parseAndEvaluate],["async",parseAndEvaluateAsync]]) {
        test(`${mode}: malformed replay envelopes return diagnostics before accessing claims`, async () => {
            const scope = runtime();
            parseAndEvaluate('.Plugin.Load("cas");',scope);
            const result = await evaluate(`
                [0,_,{= },{= schema="wrong" }].Map((candidate)->
                    {: .cas.CheckIntegral(candidate),.cas.CheckSimplification(candidate) });
            `, scope);
            for (const row of result.values) {
                expect(text(entry(row.values[0],"reason"))).toBe("malformedCasIntegral");
                expect(text(entry(row.values[1],"reason"))).toBe("malformedCasSimplification");
            }
        });
    }

    test("invalid public arguments retain explanatory errors", () => {
        for (const [call,message] of [
            ['.cas.Integrate(1,:x,0)',"CAS integration options must be a Map"],
            ['.cas.Integrate(1,0)',"CAS variable must be a string or Calculus variable"],
            ['.cas.Simplify("invalid")',"CAS expected a Calculus expression or exact scalar"],
        ]) {
            expect(() => parseAndEvaluate(`.Plugin.Load("cas"); ${call};`,runtime())).toThrow(message);
        }
    });

    test("reduces bounded sine/cosine powers and differentiates back to the integrand", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            x := .calculus.Variable(:x);
            Sin := .calculus.Sin();
            Cos := .calculus.Cos();
            sources := [Sin(2*x+1)^2,Sin(-3*x+2)^5,Cos(2*x-1)^4,Cos(x)^8];
            sources.Map((source)->{;
                integral = .cas.Integrate(source,:x);
                derivative = .calculus.PartialResult(integral[:antiderivative],:x);
                {: source,integral,derivative[:expression],.cas.CheckIntegral(integral) };
            });
        `, runtime());
        for (const row of result.values) {
            const [source,integral,derivative,replay] = row.values;
            expect(text(entry(integral,"status"))).toBe("complete");
            expect(entry(replay,"accepted").value).toBe(1n);
            for (const x of [-1.25,0,0.4,1.5]) {
                expect(numericalGraph(derivative,x)).toBeCloseTo(numericalGraph(source,x),10);
            }
        }
    });

    test("product-to-sum covers every ordering, equal frequencies, and opposite frequencies", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            x := .calculus.Variable(:x);
            Sin := .calculus.Sin();
            Cos := .calculus.Cos();
            sources := [Sin(x)*Sin(3*x),Cos(x)*Cos(3*x),Sin(x)*Cos(3*x),Cos(x)*Sin(3*x),
                        Sin(x+1)*Sin(x-2),Cos(x)*Cos(-x),Sin(x)*Cos(-x),Cos(x)*Sin(x+1)];
            sources.Map((source)->{;
                integral = .cas.Integrate(source,:x);
                derivative = .calculus.PartialResult(integral[:antiderivative],:x);
                {: source,integral,derivative[:expression] };
            });
        `, runtime());
        for (const row of result.values) {
            const [source,integral,derivative] = row.values;
            expect(text(entry(integral,"status"))).toBe("complete");
            for (const x of [-1,0,0.25,2]) {
                expect(numericalGraph(derivative,x)).toBeCloseTo(numericalGraph(source,x),10);
            }
        }
    });

    test("trigonometric reduction budgets and replay tampering are explicit", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            x := .calculus.Variable(:x);
            Sin := .calculus.Sin();
            integral := .cas.Integrate(Sin(x)^2,x);
            {: .cas.Integrate(Sin(x)^9,x),.cas.Integrate(Sin(x)^(-2),x),
               .cas.Integrate(Sin(x^2)^2,x),.cas.CheckIntegral(integral.Set("antiderivative",x)) };
        `, runtime());
        expect(text(entry(result.values[0],"reason"))).toBe("trigonometricDegreeBudgetExceeded");
        expect(text(entry(result.values[1],"reason"))).toBe("unsupportedTrigonometricExponent");
        expect(text(entry(result.values[2],"reason"))).toBe("nonAffineTrigonometricArgument");
        expect(entry(result.values[3],"accepted")).toBeNull();
    });
    test("is bundled over Calculus, Polynomial, and RationalFunction services", () => {
        const info = parseAndEvaluate('.Plugin.Info("cas")', runtime());
        expect(text(entry(info, "kind"))).toBe("rix");
        expect(entry(info, "requires").values.map(text)).toEqual([
            "rix.calculus@1",
            "rix.polynomial@1",
            "rix.rational-function@1",
        ]);
        expect(entry(info, "schemas").values.map(text)).toEqual([
            "rix.cas.rewrite@1",
            "rix.cas.integral@1",
        ]);
    });

    test("replays checked simplification and rejects a changed expression", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            x := .calculus.Variable(:x);
            simplified := .cas.Simplify(-(-(x+0)));
            accepted := .cas.CheckSimplification(simplified);
            changed := simplified.Set("expression",x+1);
            rejected := .cas.CheckSimplification(changed);
            {: simplified,accepted,rejected };
        `, runtime());
        expect(text(entry(result.values[0], "status"))).toBe("complete");
        expect(entry(result.values[1], "accepted").value).toBe(1n);
        expect(entry(result.values[2], "accepted")).toBeNull();
    });

    test("normalizes, collects, expands, and factors exact course polynomials", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            x := .calculus.Variable(:x);
            source := (x+1)*(x-1);
            normalized := .cas.NormalizePolynomial(source,:x);
            collected := .cas.Collect(source,:x);
            expanded := .cas.Expand(source,:x);
            factored := .cas.Factor(source,:x);
            {: normalized,collected,expanded,factored };
        `, runtime());
        expect(entry(result.values[1], "coefficients").values.map(String)).toEqual(["-1", "0", "1"]);
        expect(text(entry(result.values[2], "operation"))).toBe("expand");
        expect(entry(result.values[3], "factors").values).toHaveLength(2);
    });

    test("integrates powers, affine substitutions, exponentials, and logarithms by parts", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            x := .calculus.Variable(:x);
            Exp := .calculus.Exp();
            Log := .calculus.Log();
            polynomial := .cas.Integrate(3*x^2+4,x);
            affinePower := .cas.Integrate((2*x+3)^4,x);
            exponential := .cas.Integrate(Exp(2*x+3),x);
            byParts := .cas.Integrate(x^2*Exp(x),x);
            logarithm := .cas.Integrate(Log(2*x+1),x);
            {: polynomial,affinePower,exponential,byParts,logarithm,
               .calculus.Evaluate(polynomial[:antiderivative],{= x=2 }) };
        `, runtime());
        for (const item of result.values.slice(0, 5)) {
            expect(text(entry(item, "status"))).toBe("complete");
        }
        expect(result.values[5].toString()).toBe("16");
        expect(entry(result.values[4], "obligations").values).toHaveLength(1);
        expect(entry(result.values[3], "rules").values.map((rule) => text(entry(rule, "rule"))))
            .toContain("integrationByPartsExpPower");
    });

    test("integrates exact linear partial fractions and independently replays the result", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            rational := .rf\`(2*x+3)/(x^2-1)\`;
            integral := .cas.Integrate(rational);
            checked := .cas.CheckIntegral(integral);
            {: integral,checked };
        `, runtime());
        const integral = result.values[0];
        expect(text(entry(integral, "status"))).toBe("complete");
        expect(entry(integral, "obligations").values).toHaveLength(2);
        expect(entry(result.values[1], "accepted").value).toBe(1n);
    });

    test("uses log absolute value for reciprocal domains without a false positivity restriction", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            x := .calculus.Variable(:x);
            integral := .cas.Integrate(1/x,x);
            {: integral,.cas.CheckIntegral(integral) };
        `, runtime());
        const integral = result.values[0];
        const antiderivative = entry(integral, "antiderivative");
        const product = entry(antiderivative, "operands").values[0];
        const logarithm = entry(product, "operands").values[1];
        expect(text(entry(logarithm, "semanticid"))).toBe("rix.function.log.real-principal@1");
        const absolute = entry(logarithm, "arguments").values[0];
        expect(text(entry(absolute, "semanticid"))).toBe("rix.function.abs.real@1");
        expect(text(entry(entry(integral, "obligations").values[0], "relation"))).toBe("nonzero");
        expect(entry(result.values[1], "accepted").value).toBe(1n);
    });

    test("integrates affine sine and cosine course cases", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            x := .calculus.Variable(:x);
            Sin := .calculus.Sin();
            Cos := .calculus.Cos();
            {: .cas.Integrate(Sin(2*x+1),x),.cas.Integrate(Cos(3*x-2),x) };
        `, runtime());
        for (const integral of result.values) {
            expect(text(entry(integral, "status"))).toBe("complete");
            expect(entry(integral, "obligations").values).toHaveLength(0);
        }
        expect(text(entry(entry(result.values[0], "rules").values[0], "rule")))
            .toBe("affineSineSubstitution");
        expect(text(entry(entry(result.values[1], "rules").values[0], "rule")))
            .toBe("affineCosineSubstitution");
    });

    test("integrates irreducible quadratic partial fractions with an Atan graph", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            integral := .cas.Integrate(.rf\`1/(x^2+1)\`);
            {: integral,.cas.CheckIntegral(integral) };
        `, runtime());
        const integral = result.values[0];
        expect(text(entry(integral, "status"))).toBe("complete");
        expect(entry(integral, "rules").values.map((rule) => text(entry(rule, "rule"))))
            .toContain("irreducibleQuadraticPartialFraction");
        expect(entry(result.values[1], "accepted").value).toBe(1n);
    });

    test("returns a structured unsupported result outside the course ladder", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            x := .calculus.Variable(:x);
            Sqrt := .calculus.Sqrt();
            .cas.Integrate(Sqrt(x^2+1),x);
        `, runtime());
        expect(text(entry(result, "status"))).toBe("unsupported");
        expect(text(entry(result, "reason"))).toBe("unsupportedSemanticFunction");
        expect(entry(result, "antiderivative")).toBeNull();
    });
});
