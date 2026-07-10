import { describe, test, expect } from "bun:test";
import { rixToIR } from "../../bin/rix-to-ir.js";

describe("RiX-to-IR Script", () => {
    describe("Basic Literals", () => {
        test("integer literal", () => {
            const output = rixToIR("42;");
            expect(output).toBe('LITERAL("42")');
        });

        test("rational literal", () => {
            const output = rixToIR("3/4;");
            expect(output).toBe('LITERAL("3/4")');
        });

        test("string literal", () => {
            const output = rixToIR('"hello";');
            expect(output).toBe('STRING("hello")');
        });

        test("null literal", () => {
            const output = rixToIR("_;");
            expect(output).toBe("NULL()");
        });

        test("hex literal", () => {
            const output = rixToIR("0xFF;");
            expect(output).toBe('LITERAL("0xFF")');
        });
    });

    describe("Variables", () => {
        test("variable reference", () => {
            const output = rixToIR("x;");
            expect(output).toBe('RETRIEVE("x")');
        });

        test("assignment", () => {
            const output = rixToIR("x = 5;");
            expect(output).toBe('ASSIGN("x", LITERAL("5"))');
        });

        test(":= produces ASSIGN_COPY", () => {
            const output = rixToIR("x := 5;");
            expect(output).toBe('ASSIGN_COPY("x", LITERAL("5"))');
        });
    });

    describe("Arithmetic", () => {
        test("addition", () => {
            const output = rixToIR("a + b;");
            expect(output).toBe('ADD(RETRIEVE("a"), RETRIEVE("b"))');
        });

        test("subtraction", () => {
            const output = rixToIR("a - b;");
            expect(output).toBe('SUB(RETRIEVE("a"), RETRIEVE("b"))');
        });

        test("multiplication", () => {
            const output = rixToIR("a * b;");
            expect(output).toBe('MUL(RETRIEVE("a"), RETRIEVE("b"))');
        });

        test("division", () => {
            const output = rixToIR("a / b;");
            expect(output).toBe('DIV(RETRIEVE("a"), RETRIEVE("b"))');
        });

        test("exponentiation", () => {
            const output = rixToIR("a ^ b;");
            expect(output).toBe('POW(RETRIEVE("a"), RETRIEVE("b"))');
        });

        test("negation", () => {
            const output = rixToIR("-x;");
            expect(output).toBe('NEG(RETRIEVE("x"))');
        });

        test("precedence: 2 + 3 * 4", () => {
            const output = rixToIR("2 + 3 * 4;");
            expect(output).toBe(
                'ADD(LITERAL("2"), MUL(LITERAL("3"), LITERAL("4")))',
            );
        });

        test("modulo", () => {
            const output = rixToIR("a % b;");
            expect(output).toBe('MOD(RETRIEVE("a"), RETRIEVE("b"))');
        });

        test("integer division", () => {
            const output = rixToIR("a // b;");
            expect(output).toBe('INTDIV(RETRIEVE("a"), RETRIEVE("b"))');
        });
    });

    describe("Comparison & Logic", () => {
        test("equality", () => {
            const output = rixToIR("a == b;");
            expect(output).toBe('EQ(RETRIEVE("a"), RETRIEVE("b"))');
        });

        test("less than", () => {
            const output = rixToIR("a < b;");
            expect(output).toBe('LT(RETRIEVE("a"), RETRIEVE("b"))');
        });

        test("greater than", () => {
            const output = rixToIR("a > b;");
            expect(output).toBe('GT(RETRIEVE("a"), RETRIEVE("b"))');
        });

        test("interval", () => {
            const output = rixToIR("a : b;");
            expect(output).toBe('INTERVAL(RETRIEVE("a"), RETRIEVE("b"))');
        });
    });

    describe("Function Calls", () => {
        test("uppercase function call", () => {
            const output = rixToIR("SIN(x);");
            expect(output).toBe('CALL("SIN", RETRIEVE("x"))');
        });

        test("multi-arg function call", () => {
            const output = rixToIR("F(x, y);");
            expect(output).toBe('CALL("F", RETRIEVE("x"), RETRIEVE("y"))');
        });

        test("lowercase implicit multiplication", () => {
            const output = rixToIR("f(x);");
            expect(output).toBe('MUL(RETRIEVE("f"), RETRIEVE("x"))');
        });
    });

    describe("Function Definitions", () => {
        test("named function definition (:->)", () => {
            const output = rixToIR("F(x) :-> x + 1;");
            expect(output).toContain("FUNCDEF");
            expect(output).toContain('"F"');
            expect(output).toContain("ADD");
        });

        test("named function definition (-> alias for :->)", () => {
            // F(x) -> body  is the same as  F(x) :-> body
            const output = rixToIR("F(x) -> x + 1;");
            expect(output).toContain("FUNCDEF");
            expect(output).toContain('"F"');
            expect(output).toContain("ADD");
        });

        test("-> and :-> produce identical output", () => {
            const arrow = rixToIR("Square(x) -> x ^ 2;");
            const colonArrow = rixToIR("Square(x) :-> x ^ 2;");
            expect(arrow).toBe(colonArrow);
        });

        test("lambda", () => {
            const output = rixToIR("(x) -> x^2;");
            expect(output).toContain("LAMBDA");
            expect(output).toContain("POW");
        });
    });

    describe("Collections", () => {
        test("array", () => {
            const output = rixToIR("[1, 2, 3];");
            expect(output).toBe('ARRAY(LITERAL("1"), LITERAL("2"), LITERAL("3"))');
        });

        test("set", () => {
            const output = rixToIR("{| 1, 2, 3 };");
            expect(output).toBe('SET(LITERAL("1"), LITERAL("2"), LITERAL("3"))');
        });

        test("tuple", () => {
            const output = rixToIR("{: a, b };");
            expect(output).toBe('TUPLE(RETRIEVE("a"), RETRIEVE("b"))');
        });
    });

    describe("Control Flow", () => {
        test("block", () => {
            const output = rixToIR("{; a = 1; a + 2 };");
            expect(output).toContain("BLOCK");
            expect(output).toContain("ASSIGN");
            expect(output).toContain("ADD");
        });

        test("ternary", () => {
            const output = rixToIR("x > 0 ?? 1 ?: -1;");
            expect(output).toContain("TERNARY");
            expect(output).toContain("GT");
            expect(output).toContain("DEFER");
        });

        test("case container", () => {
            const output = rixToIR("{? x > 0; x < 10 };");
            expect(output).toContain("CASE");
            expect(output).toContain("DEFER");
        });

        test("loop container", () => {
            const output = rixToIR("{@ i := 0; i + 1 };");
            expect(output).toContain("LOOP");
            expect(output).toContain("DEFER");
        });
    });

    describe("Deferred Blocks", () => {
        test("deferred block", () => {
            const output = rixToIR("@{; x + 1 };");
            expect(output).toContain("DEFER");
            expect(output).toContain("BLOCK");
        });
    });

    describe("Property Access", () => {
        test("dot access", () => {
            const output = rixToIR("obj.a;");
            expect(output).toBe('META_GET(RETRIEVE("obj"), "a")');
        });

        test("external access (all meta)", () => {
            const output = rixToIR("obj..;");
            expect(output).toBe('META_ALL(RETRIEVE("obj"))');
        });

        test("keys", () => {
            const output = rixToIR("obj.|;");
            expect(output).toBe('KEYS(RETRIEVE("obj"))');
        });

        test("values", () => {
            const output = rixToIR("obj|.;");
            expect(output).toBe('VALUES(RETRIEVE("obj"))');
        });
    });

    describe("Pipes", () => {
        test("pipe", () => {
            const output = rixToIR("x |> F;");
            expect(output).toBe('PIPE(RETRIEVE("x"), RETRIEVE("F"))');
        });

        test("map pipe", () => {
            const output = rixToIR("[1, 2, 3] |>> f;");
            expect(output).toContain("PMAP");
        });

        test("filter pipe", () => {
            const output = rixToIR("[1, 2, 3] |>? f;");
            expect(output).toContain("PFILTER");
        });

        test("reduce pipe", () => {
            const output = rixToIR("[1, 2, 3] |>: f;");
            expect(output).toContain("PREDUCE");
        });
    });

    describe("System Functions (@_)", () => {
        test("@_ADD call", () => {
            const output = rixToIR("@_ADD(a, b);");
            expect(output).toBe('SYS_CALL("ADD", RETRIEVE("a"), RETRIEVE("b"))');
        });

        test("@_ASSIGN", () => {
            const output = rixToIR("@_ASSIGN(x, 5);");
            expect(output).toContain("ASSIGN");
        });

        test("@_ reference", () => {
            const output = rixToIR("@_ASSIGN;");
            expect(output).toBe('SYSREF("ASSIGN")');
        });
    });

    describe("Solve / Assertions", () => {
        test(":=: → SOLVE", () => {
            const output = rixToIR("x :=: 5;");
            expect(output).toContain("SOLVE");
        });

        test(":<: → ASSERT_LT", () => {
            const output = rixToIR("x :<: 5;");
            expect(output).toContain("ASSERT_LT");
        });
    });

    describe("--lang flag (langPrefix mode)", () => {
        test("integer with @_ prefix", () => {
            const output = rixToIR("42;", { langPrefix: true });
            expect(output).toBe('@_LITERAL("42")');
        });

        test("assignment with @_ prefix", () => {
            const output = rixToIR("x = 5;", { langPrefix: true });
            expect(output).toBe('@_ASSIGN("x", @_LITERAL("5"))');
        });

        test("arithmetic with @_ prefix", () => {
            const output = rixToIR("2 + 3;", { langPrefix: true });
            expect(output).toBe('@_ADD(@_LITERAL("2"), @_LITERAL("3"))');
        });

        test("function call with @_ prefix", () => {
            const output = rixToIR("SIN(x);", { langPrefix: true });
            expect(output).toBe('@_CALL("SIN", @_RETRIEVE("x"))');
        });

        test("complex expression with @_ prefix", () => {
            const output = rixToIR("x = 2 + 3 * 4;", { langPrefix: true });
            expect(output).toBe(
                '@_ASSIGN("x", @_ADD(@_LITERAL("2"), @_MUL(@_LITERAL("3"), @_LITERAL("4"))))',
            );
        });

        test("array with @_ prefix", () => {
            const output = rixToIR("[1, 2, 3];", { langPrefix: true });
            expect(output).toBe(
                '@_ARRAY(@_LITERAL("1"), @_LITERAL("2"), @_LITERAL("3"))',
            );
        });
    });

    describe("Multi-statement files", () => {
        test("multiple statements produce multiple lines", () => {
            const output = rixToIR("x = 5;\ny = 10;\nx + y;");
            const lines = output.split("\n");
            expect(lines.length).toBe(3);
            expect(lines[0]).toContain("ASSIGN");
            expect(lines[1]).toContain("ASSIGN");
            expect(lines[2]).toContain("ADD");
        });

        test("comments are filtered out (NOP)", () => {
            const output = rixToIR("## this is a comment\nx = 5;");
            const lines = output.split("\n").filter((l) => l.trim());
            // Comment should become NOP and be filtered
            expect(lines.length).toBe(1);
            expect(output).toContain('ASSIGN("x", LITERAL("5"))');
        });

        test("multi-line tag comments are filtered out", () => {
            const output = rixToIR("##TAG## ignored ##TAG##\ny = 10;");
            const lines = output.split("\n").filter((l) => l.trim());
            expect(lines.length).toBe(1);
            expect(output).toContain('ASSIGN("y", LITERAL("10"))');
        });
    });

    describe("Mutation", () => {
        test("obj{= +a=3 } → MUTCOPY", () => {
            const output = rixToIR("obj{= +a=3 };");
            expect(output).toContain("MUTCOPY");
        });

        test("obj{! +a=3 } → MUTINPLACE", () => {
            const output = rixToIR("obj{! +a=3 };");
            expect(output).toContain("MUTINPLACE");
        });
    });

    describe("Assignments", () => {
        test("dot assignment", () => {
            const output = rixToIR("obj.a = 7;");
            expect(output).toContain("META_SET");
        });

        test("index assignment", () => {
            const output = rixToIR("arr[i] = val;");
            expect(output).toContain("INDEX_SET");
        });
    });
});
