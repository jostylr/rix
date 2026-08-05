import { describe, test, expect } from "bun:test";
import { tokenize } from "../../src/parser/tokenizer.js";
import { parse } from "../../src/parser/parser.js";

function testSystemLookup(name) {
  return { type: "identifier", name };
}

function parseCode(code) {
  return parse(tokenize(code), testSystemLookup);
}

function stripMetadata(obj) {
  if (Array.isArray(obj)) return obj.map(stripMetadata);
  if (obj && typeof obj === "object") {
    const { pos, original, ...rest } = obj;
    const result = {};
    for (const [key, value] of Object.entries(rest)) {
      result[key] = stripMetadata(value);
    }
    return result;
  }
  return obj;
}

describe("System Spec Parser", () => {
  test("parses bare {# ... } and infers outputs", () => {
    const expr = stripMetadata(parseCode("{# p = x + 1 };"))[0].expression;
    expect(expr).toEqual({
      type: "SystemSpecLiteral",
      sigil: "{#",
      inputs: [],
      outputs: ["p"],
      outputsDeclared: false,
      outputMode: "named",
      statements: [
        {
          type: "SpecDefinition",
          target: "p",
          expr: {
            type: "BinaryOperation",
            operator: "+",
            left: { type: "UserIdentifier", name: "x" },
            right: { type: "Number", value: "1" },
          },
        },
      ],
    });
  });

  test("parses inputs-only header", () => {
    const expr = stripMetadata(parseCode("{#x,y# p = x + y };"))[0].expression;
    expect(expr.inputs).toEqual(["x", "y"]);
    expect(expr.outputs).toEqual(["p"]);
    expect(expr.outputsDeclared).toBe(false);
  });

  test("parses outputs-only header", () => {
    const expr = stripMetadata(parseCode("{#:p,q# p = 1; q = 2 };"))[0].expression;
    expect(expr.inputs).toEqual([]);
    expect(expr.outputs).toEqual(["p", "q"]);
    expect(expr.outputsDeclared).toBe(true);
  });

  test("parses full inputs:outputs header with import metadata", () => {
    const expr = stripMetadata(parseCode("{#x,y,z:p# <a~outer_a> p = x^2 * y + @z };"))[0].expression;
    expect(expr.inputs).toEqual(["x", "y", "z"]);
    expect(expr.outputs).toEqual(["p"]);
    expect(expr.imports).toEqual([{ local: "a", source: "outer_a", mode: "copy" }]);
  });

  test("rejects duplicate inputs", () => {
    expect(() => parseCode("{#x,x:p# p = x };")).toThrow(/Duplicate input 'x'/);
  });

  test("rejects duplicate outputs", () => {
    expect(() => parseCode("{#x:p,p# p = x };")).toThrow(/Duplicate output 'p'/);
  });

  test("rejects overlapping inputs and outputs", () => {
    expect(() => parseCode("{#x:x# x = 1 };")).toThrow(/cannot be both an input and an output/);
  });

  test("parses an anonymous-output expression spec", () => {
    const expr = stripMetadata(parseCode("{#t# t^2 - 4 };"))[0].expression;
    expect(expr.outputMode).toBe("expression");
    expect(expr.inputs).toEqual(["t"]);
    expect(expr.outputs).toEqual([]);
    expect(expr.statements).toEqual([]);
    expect(expr.expression.type).toBe("BinaryOperation");
    expect(expr.expression.operator).toBe("-");
  });

  test("parses {#x} as the identity-symbol spec", () => {
    const expr = stripMetadata(parseCode("{#x};"))[0].expression;
    expect(expr.outputMode).toBe("identity");
    expect(expr.inputs).toEqual(["x"]);
    expect(expr.expression).toEqual({ type: "UserIdentifier", name: "x" });
  });

  test("parses mixed definitions and constraints as a symbolic system", () => {
    const expr = stripMetadata(parseCode("{#x:p# p = x + 1; p >= 0 };"))[0].expression;
    expect(expr.outputMode).toBe("system");
    expect(expr.statements.map((statement) => statement.type)).toEqual(["SpecDefinition", "SpecConstraint"]);
    expect(expr.statements[1].expr.operator).toBe(">=");
  });

  test("rejects non-identifier assignment targets", () => {
    expect(() => parseCode("{# a.b = 1 };")).toThrow(/definition targets must be bare identifiers/);
  });

  test("declared roles do not restrict auxiliary definitions", () => {
    const expr = stripMetadata(parseCode("{#:p# q = 1; p == q };"))[0].expression;
    expect(expr.outputs).toEqual(["p"]);
    expect(expr.statements[0].target).toBe("q");
  });

  test("declared outputs may be specified relationally instead of assigned", () => {
    const expr = stripMetadata(parseCode("{#x:y# y^2 == x };"))[0].expression;
    expect(expr.outputMode).toBe("system");
    expect(expr.outputs).toEqual(["y"]);
    expect(expr.statements[0].type).toBe("SpecConstraint");
  });

  test("rejects duplicate definitions after inference", () => {
    expect(() => parseCode("{# p = 1; p = 2 };")).toThrow(/defined more than once/);
  });

  test("a single comparison is a system rather than an expression spec", () => {
    const expr = stripMetadata(parseCode("{#x# x^2 == 4 };"))[0].expression;
    expect(expr.outputMode).toBe("system");
    expect(expr.statements[0].type).toBe("SpecConstraint");
  });
});
