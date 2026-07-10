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
      statements: [
        {
          type: "SpecAssign",
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

  test("rejects unsupported body statements", () => {
    expect(() => parseCode("{# x + 1 };")).toThrow(/only support symbolic assignments/);
  });

  test("rejects non-identifier assignment targets", () => {
    expect(() => parseCode("{# a.b = 1 };")).toThrow(/assignment targets must be bare identifiers/);
  });

  test("rejects undeclared outputs when header is present", () => {
    expect(() => parseCode("{#:p# q = 1 };")).toThrow(/is not a declared output/);
  });

  test("rejects missing assignments for declared outputs", () => {
    expect(() => parseCode("{#:p,q# p = 1 };")).toThrow(/declared output 'q' is never assigned/);
  });

  test("rejects duplicate assignments after inference", () => {
    expect(() => parseCode("{# p = 1; p = 2 };")).toThrow(/assigned more than once/);
  });
});
