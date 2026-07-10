import { tokenize } from "../../src/parser/tokenizer.js";
import { parse } from "../../src/parser/parser.js";

function testSystemLookup(name) {
  const systemSymbols = {
    SIN: { type: "function", arity: 1 },
    COS: { type: "function", arity: 1 },
    LOG: { type: "function", arity: 1 },
    MAX: { type: "function", arity: -1 },
    PI: { type: "constant", value: Math.PI },
    E: { type: "constant", value: Math.E },
    AND: { type: "operator", precedence: 40, associativity: "left", operatorType: "infix" },
    OR: { type: "operator", precedence: 30, associativity: "left", operatorType: "infix" },
    NOT: { type: "operator", precedence: 110, operatorType: "prefix" },
  };
  return systemSymbols[name] || { type: "identifier" };
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

describe("Phase 1 Tokenizer", () => {
  describe("@_ system function prefix", () => {
    test("tokenizes @_ASSIGN as SystemFunction identifier", () => {
      const tokens = tokenize("@_ASSIGN");
      expect(tokens[0].type).toBe("Identifier");
      expect(tokens[0].kind).toBe("SystemFunction");
      expect(tokens[0].value).toBe("ASSIGN");
      expect(tokens[0].original).toBe("@_ASSIGN");
    });

    test("tokenizes @_Add normalized to uppercase", () => {
      const tokens = tokenize("@_Add");
      expect(tokens[0].kind).toBe("SystemFunction");
      expect(tokens[0].value).toBe("ADD");
    });

    test("tokenizes @_retrieve normalized to uppercase", () => {
      const tokens = tokenize("@_retrieve");
      expect(tokens[0].kind).toBe("SystemFunction");
      expect(tokens[0].value).toBe("RETRIEVE");
    });

    test("@_ alone tokenizes as symbol", () => {
      const tokens = tokenize("@_");
      expect(tokens[0].type).toBe("Symbol");
      expect(tokens[0].value).toBe("@_");
    });

    test("@_ followed by digit does not form SystemFunction", () => {
      const tokens = tokenize("@_3");
      expect(tokens[0].type).toBe("Symbol");
      expect(tokens[0].value).toBe("@_");
    });

    test("concatenating originals reconstructs @_ input", () => {
      const input = "@_ASSIGN(x, 5)";
      const tokens = tokenize(input);
      expect(tokens.map(t => t.original).join("")).toBe(input);
    });

    test("@_CALL in expression context", () => {
      const tokens = tokenize("y = @_CALL(f, x)");
      expect(tokens[0].kind).toBe("User");
      expect(tokens[1].value).toBe("=");
      expect(tokens[2].kind).toBe("SystemFunction");
      expect(tokens[2].value).toBe("CALL");
    });
  });

  describe("Brace sigil tokens", () => {
    test("{= tokenized as single symbol", () => {
      const tokens = tokenize("{= a }");
      expect(tokens[0].value).toBe("{=");
    });

    test("{? tokenized as single symbol", () => {
      const tokens = tokenize("{? x }");
      expect(tokens[0].value).toBe("{?");
    });

    test("{; tokenized as single symbol", () => {
      const tokens = tokenize("{; a }");
      expect(tokens[0].value).toBe("{;");
    });

    test("{| tokenized as single symbol", () => {
      const tokens = tokenize("{| 1 }");
      expect(tokens[0].value).toBe("{|");
    });

    test("{: tokenized as single symbol", () => {
      const tokens = tokenize("{: a }");
      expect(tokens[0].value).toBe("{:");
    });

    test("{@ tokenized as single symbol", () => {
      const tokens = tokenize("{@ i }");
      expect(tokens[0].value).toBe("{@");
    });

    test("{# tokenized as single symbol", () => {
      const tokens = tokenize("{# p = x + 1 }");
      expect(tokens[0].value).toBe("{#");
    });

    test("plain { still works", () => {
      const tokens = tokenize("{ a }");
      expect(tokens[0].value).toBe("{");
    });

    test("{; still works for code blocks", () => {
      const tokens = tokenize("{; a }");
      expect(tokens[0].value).toBe("{;");
    });
  });

  describe("= token", () => {
    test("= tokenized as symbol", () => {
      const tokens = tokenize("x = 5");
      expect(tokens[1].value).toBe("=");
    });

    test("== remains distinct from =", () => {
      const tokens = tokenize("x == 5");
      expect(tokens[1].value).toBe("==");
    });

    test(":= remains distinct from =", () => {
      const tokens = tokenize("x := 5");
      expect(tokens[1].value).toBe(":=");
    });
  });
});

describe("Phase 1 Parser", () => {
  describe("= as assignment", () => {
    test("x = 5 is assignment", () => {
      const expr = stripMetadata(parseCode("x = 5;"))[0].expression;
      expect(expr.type).toBe("BinaryOperation");
      expect(expr.operator).toBe("=");
      expect(expr.left).toEqual({ type: "UserIdentifier", name: "x" });
      expect(expr.right).toEqual({ type: "Number", value: "5" });
    });

    test("= is right-associative (x = y = 3)", () => {
      const expr = stripMetadata(parseCode("x = y = 3;"))[0].expression;
      expect(expr.operator).toBe("=");
      expect(expr.right.operator).toBe("=");
      expect(expr.right.right).toEqual({ type: "Number", value: "3" });
    });

    test(":= still works for assignment", () => {
      const expr = stripMetadata(parseCode("x := 5;"))[0].expression;
      expect(expr.operator).toBe(":=");
    });

    test("== is equality (not assignment)", () => {
      const expr = stripMetadata(parseCode("x == 5;"))[0].expression;
      expect(expr.operator).toBe("==");
    });

    test("= lower precedence than arithmetic", () => {
      const expr = stripMetadata(parseCode("x = a + b;"))[0].expression;
      expect(expr.operator).toBe("=");
      expect(expr.right.operator).toBe("+");
    });

    test("= with function definition F(x) = expr", () => {
      const expr = stripMetadata(parseCode("result = SIN(PI);"))[0].expression;
      expect(expr.operator).toBe("=");
      expect(expr.right.type).toBe("FunctionCall");
    });
  });

  describe("Implicit multiplication (lowercase f(x))", () => {
    test("f(x) produces ImplicitMultiplication", () => {
      const expr = stripMetadata(parseCode("f(x);"))[0].expression;
      expect(expr.type).toBe("ImplicitMultiplication");
      expect(expr.left).toEqual({ type: "UserIdentifier", name: "f" });
      expect(expr.right.type).toBe("Grouping");
    });

    test("f(2 + 3) with expression inside", () => {
      const expr = stripMetadata(parseCode("f(2 + 3);"))[0].expression;
      expect(expr.type).toBe("ImplicitMultiplication");
      expect(expr.right.expression.operator).toBe("+");
    });

    test("abc(x, y) with tuple inside", () => {
      const expr = stripMetadata(parseCode("abc(x, y);"))[0].expression;
      expect(expr.type).toBe("ImplicitMultiplication");
      expect(expr.right.type).toBe("Tuple");
      expect(expr.right.elements.length).toBe(2);
    });

    test("uppercase F(x) is FunctionCall", () => {
      const expr = stripMetadata(parseCode("F(x);"))[0].expression;
      expect(expr.type).toBe("FunctionCall");
    });

    test("SIN(x) is FunctionCall", () => {
      const expr = stripMetadata(parseCode("SIN(x);"))[0].expression;
      expect(expr.type).toBe("FunctionCall");
      expect(expr.function.type).toBe("SystemIdentifier");
    });

    test("lowercase f(x) :-> still creates FunctionDefinition", () => {
      const expr = stripMetadata(parseCode("f(x) :-> x + 1;"))[0].expression;
      expect(expr.type).toBe("FunctionDefinition");
      expect(expr.name.name).toBe("f");
      expect(expr.parameters.positional).toEqual([{ name: "x", defaultValue: null }]);
    });

    test("uppercase F(x) :-> creates FunctionDefinition", () => {
      const expr = stripMetadata(parseCode("F(x) :-> x + 1;"))[0].expression;
      expect(expr.type).toBe("FunctionDefinition");
      expect(expr.name.name).toBe("F");
    });



  });

  describe("@_ SystemCall", () => {
    test("@_ASSIGN(x, 5) produces SystemCall", () => {
      const expr = stripMetadata(parseCode("@_ASSIGN(x, 5);"))[0].expression;
      expect(expr.type).toBe("SystemCall");
      expect(expr.name).toBe("ASSIGN");
      expect(expr.arguments.positional.length).toBe(2);
    });

    test("@_ADD(a, b) produces SystemCall", () => {
      const expr = stripMetadata(parseCode("@_ADD(a, b);"))[0].expression;
      expect(expr.type).toBe("SystemCall");
      expect(expr.name).toBe("ADD");
    });

    test("@_RETRIEVE(x) produces SystemCall", () => {
      const expr = stripMetadata(parseCode("@_RETRIEVE(x);"))[0].expression;
      expect(expr.type).toBe("SystemCall");
      expect(expr.name).toBe("RETRIEVE");
    });

    test("nested system calls", () => {
      const expr = stripMetadata(parseCode("@_ASSIGN(i, @_ADD(i, 1));"))[0].expression;
      expect(expr.type).toBe("SystemCall");
      expect(expr.name).toBe("ASSIGN");
      expect(expr.arguments.positional[1].type).toBe("SystemCall");
      expect(expr.arguments.positional[1].name).toBe("ADD");
    });

    test("@_ ref without call produces SystemFunctionRef", () => {
      const expr = stripMetadata(parseCode("@_ASSIGN;"))[0].expression;
      expect(expr.type).toBe("SystemFunctionRef");
      expect(expr.name).toBe("ASSIGN");
    });

    test("system call in assignment", () => {
      const expr = stripMetadata(parseCode("result = @_ADD(3, 4);"))[0].expression;
      expect(expr.operator).toBe("=");
      expect(expr.right.type).toBe("SystemCall");
      expect(expr.right.name).toBe("ADD");
    });

    test("system call with keyword args", () => {
      const expr = stripMetadata(parseCode("@_CALL(f, x; mode := 1);"))[0].expression;
      expect(expr.type).toBe("SystemCall");
      expect(expr.arguments.keyword).toHaveProperty("mode");
    });
  });

  describe("Brace sigil containers", () => {
    test("{= produces MapContainer", () => {
      const expr = stripMetadata(parseCode("{= a, b, c };"))[0].expression;
      expect(expr.type).toBe("MapContainer");
      expect(expr.sigil).toBe("{=");
      expect(expr.elements.length).toBe(3);
    });

    test("{? produces CaseContainer (semicolons)", () => {
      const expr = stripMetadata(parseCode("{? x > 0; x < 10 };"))[0].expression;
      expect(expr.type).toBe("CaseContainer");
      expect(expr.sigil).toBe("{?");
      expect(expr.elements.length).toBe(2);
    });

    test("{; produces BlockContainer (semicolons)", () => {
      const expr = stripMetadata(parseCode("{; a := 1; b := 2; a + b };"))[0].expression;
      expect(expr.type).toBe("BlockContainer");
      expect(expr.sigil).toBe("{;");
      expect(expr.elements.length).toBe(3);
    });

    test("{| produces SetContainer (commas)", () => {
      const expr = stripMetadata(parseCode("{| 1, 2, 3 };"))[0].expression;
      expect(expr.type).toBe("SetContainer");
      expect(expr.sigil).toBe("{|");
      expect(expr.elements.length).toBe(3);
    });

    test("{: produces TupleContainer (commas)", () => {
      const expr = stripMetadata(parseCode("{: a, b };"))[0].expression;
      expect(expr.type).toBe("TupleContainer");
      expect(expr.sigil).toBe("{:");
      expect(expr.elements.length).toBe(2);
    });

    test("{@ produces LoopContainer (semicolons)", () => {
      const expr = stripMetadata(parseCode("{@ i := 0; i + 1 };"))[0].expression;
      expect(expr.type).toBe("LoopContainer");
      expect(expr.sigil).toBe("{@");
      expect(expr.elements.length).toBe(2);
    });

    test("empty brace sigil container", () => {
      const expr = stripMetadata(parseCode("{| };"))[0].expression;
      expect(expr.type).toBe("SetContainer");
      expect(expr.elements.length).toBe(0);
    });

    test("brace sigil with trailing separator", () => {
      const expr = stripMetadata(parseCode("{| 1, 2, 3, };"))[0].expression;
      expect(expr.type).toBe("SetContainer");
      expect(expr.elements.length).toBe(3);
    });

    test("brace sigil with nested expressions", () => {
      const expr = stripMetadata(parseCode("{= a + 1, b * 2 };"))[0].expression;
      expect(expr.type).toBe("MapContainer");
      expect(expr.elements.length).toBe(2);
      expect(expr.elements[0].operator).toBe("+");
      expect(expr.elements[1].operator).toBe("*");
    });

    test("brace sigil with assignments inside", () => {
      const expr = stripMetadata(parseCode("{; x = 1; y = 2 };"))[0].expression;
      expect(expr.type).toBe("BlockContainer");
      expect(expr.elements.length).toBe(2);
      expect(expr.elements[0].operator).toBe("=");
    });
  });

  describe("Integration: combined features", () => {
    test("system call with = assignment", () => {
      const expr = stripMetadata(parseCode("x = @_ASSIGN(y, 10);"))[0].expression;
      expect(expr.operator).toBe("=");
      expect(expr.right.type).toBe("SystemCall");
    });

    test("implicit mul inside brace sigil", () => {
      const expr = stripMetadata(parseCode("{| f(x), g(y) };"))[0].expression;
      expect(expr.type).toBe("SetContainer");
      expect(expr.elements[0].type).toBe("ImplicitMultiplication");
      expect(expr.elements[1].type).toBe("ImplicitMultiplication");
    });

    test("system call inside brace sigil", () => {
      const expr = stripMetadata(parseCode("{; @_ASSIGN(x, 1); @_ADD(x, 2) };"))[0].expression;
      expect(expr.type).toBe("BlockContainer");
      expect(expr.elements[0].type).toBe("SystemCall");
      expect(expr.elements[1].type).toBe("SystemCall");
    });

    test("lowercase function def with keyword param and condition", () => {
      const expr = stripMetadata(parseCode("h(x; n ? x > 0) :-> x + n;"))[0].expression;
      expect(expr.type).toBe("FunctionDefinition");
      expect(expr.name.name).toBe("h");
      expect(expr.parameters.keyword.length).toBe(1);
      expect(expr.parameters.conditionals.length).toBe(1);
    });
  });
});
