import { describe, test, expect } from "bun:test";
import { tokenize } from "../../src/parser/tokenizer.js";
import { parse } from "../../src/parser/parser.js";

function systemLookup(name) {
  const systemSymbols = {
    MAX: { type: "function", arity: -1 },
  };
  return systemSymbols[name] || { type: "identifier" };
}

function parseCode(code) {
  return parse(tokenize(code), systemLookup);
}

describe("comma sequence expressions", () => {
  test("loop init parses comma-separated assignments as one loop slot", () => {
    const [loop] = parseCode("{@ i = 1, j = 3; i < j; i + j; i += 1}");

    expect(loop.type).toBe("LoopContainer");
    expect(loop.elements).toHaveLength(4);
    expect(loop.elements[0].type).toBe("SequenceExpression");
    expect(loop.elements[0].expressions).toHaveLength(2);
    expect(loop.elements[0].expressions[0].operator).toBe("=");
    expect(loop.elements[0].expressions[1].operator).toBe("=");
    expect(loop.elements[1].operator).toBe("<");
    expect(loop.elements[3].operator).toBe("+=");
  });

  test("loop preserves empty semicolon slots as holes", () => {
    const [loop] = parseCode("{@ i = 0; i < 5; ; i += 1; i^2}");

    expect(loop.type).toBe("LoopContainer");
    expect(loop.elements).toHaveLength(5);
    expect(loop.elements[2].type).toBe("Hole");
    expect(loop.elements[3].operator).toBe("+=");
  });

  test("loop preserves compact consecutive semicolon slots as holes", () => {
    const [loop] = parseCode("{@ i = 0; i < 5;; i += 1; i^2}");

    expect(loop.type).toBe("LoopContainer");
    expect(loop.elements).toHaveLength(5);
    expect(loop.elements[2].type).toBe("Hole");
    expect(loop.elements[3].operator).toBe("+=");
  });

  test("explicit temporal blocks parse comma sequences as one expression", () => {
    const [block] = parseCode("{; i = 1, j = 3; i + j}");

    expect(block.type).toBe("BlockContainer");
    expect(block.elements).toHaveLength(2);
    expect(block.elements[0].type).toBe("SequenceExpression");
    expect(block.elements[0].expressions).toHaveLength(2);
  });

  test("array commas still separate elements", () => {
    const [array] = parseCode("[i = 1, j = 3]");

    expect(array.type).toBe("Array");
    expect(array.elements).toHaveLength(2);
    expect(array.elements[0].type).toBe("BinaryOperation");
    expect(array.elements[1].type).toBe("BinaryOperation");
  });

  test("tuple and map commas still separate entries", () => {
    const [tuple] = parseCode("{: i = 1, j = 3}");
    const [map] = parseCode("{= i = 1, j = 3}");

    expect(tuple.type).toBe("TupleContainer");
    expect(tuple.elements).toHaveLength(2);
    expect(tuple.elements[0].type).toBe("BinaryOperation");

    expect(map.type).toBe("MapContainer");
    expect(map.elements).toHaveLength(2);
    expect(map.elements[0].type).toBe("MapEntry");
  });

  test("function call commas still separate arguments", () => {
    const [call] = parseCode("MAX(i = 1, j = 3)");

    expect(call.type).toBe("FunctionCall");
    expect(call.arguments.positional).toHaveLength(2);
    expect(call.arguments.positional[0].type).toBe("BinaryOperation");
    expect(call.arguments.positional[1].type).toBe("BinaryOperation");
  });
});
