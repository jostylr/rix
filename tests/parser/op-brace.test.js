import { describe, expect, test } from "bun:test";
import { tokenize } from "../../src/parser/tokenizer.js";
import { parse } from "../../src/parser/parser.js";

function testSystemLookup(name) {
  const ops = {
    ADD: { type: "function", arity: 2 },
    MUL: { type: "function", arity: 2 },
    AND: { type: "function", arity: 2 },
    OR: { type: "function", arity: 2 },
    NARY_UNION: { type: "function", arity: -1 },
    NARY_INTERSECT: { type: "function", arity: -1 },
    NARY_CONCAT: { type: "function", arity: -1 },
    MIN: { type: "function", arity: -1 },
    MAX: { type: "function", arity: -1 },
  };
  return ops[name] || { type: "unknown" };
}

function parseCode(code) {
  const tokens = tokenize(code);
  return parse(tokens, testSystemLookup);
}

function stripMetadata(obj) {
  if (Array.isArray(obj)) {
    return obj.map(stripMetadata);
  } else if (obj !== null && typeof obj === "object") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key !== "pos" && key !== "original") {
        result[key] = stripMetadata(value);
      }
    }
    return result;
  }
  return obj;
}

describe("N-ary operator braces and logically aliases", () => {
  test("{+ 1, 2, 3}", () => {
    const result = stripMetadata(parseCode("{+ 1, 2, 3};"));
    expect(result[0].expression.type).toBe("FunctionCall");
    expect(result[0].expression.function.name).toBe("ADD");
    expect(result[0].expression.arguments.positional.length).toBe(3);
  });
  test("{* 4, 5}", () => {
    const result = stripMetadata(parseCode("{* 4, 5};"));
    expect(result[0].expression.type).toBe("FunctionCall");
    expect(result[0].expression.function.name).toBe("MUL");
    expect(result[0].expression.arguments.positional.length).toBe(2);
  });
  test("&& and ||", () => {
    const result = stripMetadata(parseCode("1 && 0 || 1;"));
    expect(result[0].expression.type).toBe("BinaryOperation");
    expect(result[0].expression.operator).toBe("||");
    expect(result[0].expression.left.operator).toBe("&&");
  });
  test("{&& 1, 0}", () => {
    const result = stripMetadata(parseCode("{&& 1, 0, 1};"));
    expect(result[0].expression.type).toBe("FunctionCall");
    expect(result[0].expression.function.name).toBe("AND");
    expect(result[0].expression.arguments.positional.length).toBe(3);
  });
  test("{|| 0, 1}", () => {
    const result = stripMetadata(parseCode("{|| 0, 1};"));
    expect(result[0].expression.type).toBe("FunctionCall");
    expect(result[0].expression.function.name).toBe("OR");
    expect(result[0].expression.arguments.positional.length).toBe(2);
  });
  test("{\\/ A, B, C}", () => {
    const result = stripMetadata(parseCode("{\\/ A, B, C};"));
    expect(result[0].expression.type).toBe("FunctionCall");
    expect(result[0].expression.function.name).toBe("NARY_UNION");
    expect(result[0].expression.arguments.positional.length).toBe(3);
  });
  test("{/\\ A, B, C}", () => {
    const result = stripMetadata(parseCode("{/\\ A, B, C};"));
    expect(result[0].expression.type).toBe("FunctionCall");
    expect(result[0].expression.function.name).toBe("NARY_INTERSECT");
    expect(result[0].expression.arguments.positional.length).toBe(3);
  });
  test("{++ A, B, C}", () => {
    const result = stripMetadata(parseCode("{++ A, B, C};"));
    expect(result[0].expression.type).toBe("FunctionCall");
    expect(result[0].expression.function.name).toBe("NARY_CONCAT");
    expect(result[0].expression.arguments.positional.length).toBe(3);
  });
  test("{<< 5, 2, 9, -3}", () => {
    const result = stripMetadata(parseCode("{<< 5, 2, 9, -3};"));
    expect(result[0].expression.type).toBe("FunctionCall");
    expect(result[0].expression.function.name).toBe("MIN");
    expect(result[0].expression.arguments.positional.length).toBe(4);
  });
  test("{>> 5, 2, 9, -3}", () => {
    const result = stripMetadata(parseCode("{>> 5, 2, 9, -3};"));
    expect(result[0].expression.type).toBe("FunctionCall");
    expect(result[0].expression.function.name).toBe("MAX");
    expect(result[0].expression.arguments.positional.length).toBe(4);
  });
});
