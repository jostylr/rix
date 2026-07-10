import { tokenize } from "../../src/parser/tokenizer.js";
import { parse } from "../../src/parser/parser.js";

function testSystemLookup(name) {
  const systemSymbols = {
    SIN: { type: "function", arity: 1 },
    COS: { type: "function", arity: 1 },
    PI: { type: "constant", value: Math.PI },
    HELP: { type: "identifier" },
    LOAD: { type: "identifier" },
    UNLOAD: { type: "identifier" },
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

// ============================================================
// Phase 1B: Tokenizer Tests
// ============================================================

describe("Phase 1B Tokenizer", () => {
  describe("0z[N] custom base", () => {
    test("0z[23]13FA tokenizes as number", () => {
      const tokens = tokenize("0z[23]13FA");
      expect(tokens[0].type).toBe("Number");
      expect(tokens[0].value).toBe("0z[23]13FA");
    });

    test("0z[7]123 tokenizes as number", () => {
      const tokens = tokenize("0z[7]123");
      expect(tokens[0].type).toBe("Number");
      expect(tokens[0].value).toBe("0z[7]123");
    });

    test("negative 0z custom base", () => {
      const tokens = tokenize("-0z[16]FF");
      expect(tokens[0].type).toBe("Number");
      expect(tokens[0].value).toBe("-0z[16]FF");
    });
  });

  describe(".. double-dot token", () => {
    test(".. tokenizes as single symbol", () => {
      const tokens = tokenize("obj..prop");
      expect(tokens[1].type).toBe("Symbol");
      expect(tokens[1].value).toBe("..");
    });

    test(". still works for single dot", () => {
      const tokens = tokenize("obj.prop");
      expect(tokens[1].type).toBe("Symbol");
      expect(tokens[1].value).toBe(".");
    });
  });

  describe(".| and |. tokens", () => {
    test(".| tokenizes as single symbol", () => {
      const tokens = tokenize("obj.|");
      expect(tokens[1].type).toBe("Symbol");
      expect(tokens[1].value).toBe(".|");
    });

    test("|. tokenizes as single symbol", () => {
      const tokens = tokenize("obj|.");
      // |. follows identifier, so it's separate
      expect(tokens[1].type).toBe("Symbol");
      expect(tokens[1].value).toBe("|.");
    });
  });

  describe("{! mutation token", () => {
    test("{! tokenizes as single symbol", () => {
      const tokens = tokenize("{! +a=3 }");
      expect(tokens[0].type).toBe("Symbol");
      expect(tokens[0].value).toBe("{!");
    });
  });
});

// ============================================================
// Phase 1B: Parser Tests
// ============================================================

describe("Phase 1B Parser", () => {
  describe(".. double-dot meta property access", () => {
    test("obj..name is now a parse error (use obj.name instead)", () => {
      expect(() => parseCode("obj..b;")).toThrow();
    });

    test("obj.. without property returns all meta props (ExternalAccess/META_ALL)", () => {
      const expr = stripMetadata(parseCode("obj..;"))[0].expression;
      expect(expr.type).toBe("ExternalAccess");
      expect(expr.object).toEqual({ type: "UserIdentifier", name: "obj" });
      expect(expr.property).toBeNull();
    });

    test("obj..a is a parse error", () => {
      expect(() => parseCode("obj..a;")).toThrow();
    });

    test("obj..b = 9 is a parse error", () => {
      expect(() => parseCode("obj..b = 9;")).toThrow();
    });
  });

  describe(".| KeySet and |. ValueSet", () => {
    test("obj.| produces KeySet", () => {
      const expr = stripMetadata(parseCode("obj.|;"))[0].expression;
      expect(expr.type).toBe("KeySet");
      expect(expr.object).toEqual({ type: "UserIdentifier", name: "obj" });
    });

    test("obj|. produces ValueSet", () => {
      const expr = stripMetadata(parseCode("obj|.;"))[0].expression;
      expect(expr.type).toBe("ValueSet");
      expect(expr.object).toEqual({ type: "UserIdentifier", name: "obj" });
    });
  });

  describe("@{...} deferred blocks", () => {
    test("@{; a; b} produces DeferredBlock with BlockContainer", () => {
      const expr = stripMetadata(parseCode("@{; a; b};"))[0].expression;
      expect(expr.type).toBe("DeferredBlock");
      expect(expr.body.type).toBe("BlockContainer");
      expect(expr.body.elements.length).toBe(2);
    });

    test("@{? x > 0; x < 10} produces DeferredBlock with CaseContainer", () => {
      const expr = stripMetadata(parseCode("@{? x > 0; x < 10};"))[0].expression;
      expect(expr.type).toBe("DeferredBlock");
      expect(expr.body.type).toBe("CaseContainer");
    });

    test("@{ a, b } produces DeferredBlock with plain brace container", () => {
      const expr = stripMetadata(parseCode("@{ a, b };"))[0].expression;
      expect(expr.type).toBe("DeferredBlock");
    });

    test("@{; a; b } produces DeferredBlock with BlockContainer", () => {
      const expr = stripMetadata(parseCode("@{; a; b };"))[0].expression;
      expect(expr.type).toBe("DeferredBlock");
      expect(expr.body.type).toBe("BlockContainer");
    });

    test("deferred block in CASE-like context", () => {
      // CASE(@{x > 0}, @{3*x}, @{x+2})
      const expr = stripMetadata(parseCode("CASE(@{; x > 0}, @{; 3*x}, @{; x+2});"))[0].expression;
      expect(expr.type).toBe("FunctionCall");
      expect(expr.arguments.positional.length).toBe(3);
      expect(expr.arguments.positional[0].type).toBe("DeferredBlock");
      expect(expr.arguments.positional[1].type).toBe("DeferredBlock");
      expect(expr.arguments.positional[2].type).toBe("DeferredBlock");
    });

    test("deferred block in LOOP context", () => {
      const expr = stripMetadata(parseCode("LOOP(@{; i = 0}, @{; i < 10}, @{; x = x + i}, @{; i = i + 1});"))[0].expression;
      expect(expr.type).toBe("FunctionCall");
      expect(expr.arguments.positional.length).toBe(4);
      for (const arg of expr.arguments.positional) {
        expect(arg.type).toBe("DeferredBlock");
      }
    });
  });

  describe("Mutation syntax: obj{= ...} and obj{! ...}", () => {
    test("obj{= +a=3 } produces Mutation (copy)", () => {
      const expr = stripMetadata(parseCode("obj{= +a=3 };"))[0].expression;
      expect(expr.type).toBe("Mutation");
      expect(expr.target).toEqual({ type: "UserIdentifier", name: "obj" });
      expect(expr.mutate).toBe(false);
      expect(expr.operations.length).toBe(1);
      expect(expr.operations[0].action).toBe("add");
      expect(expr.operations[0].key).toBe("a");
      expect(expr.operations[0].value).toEqual({ type: "Number", value: "3" });
    });

    test("obj{! +a=3 } produces Mutation (in-place)", () => {
      const expr = stripMetadata(parseCode("obj{! +a=3 };"))[0].expression;
      expect(expr.type).toBe("Mutation");
      expect(expr.mutate).toBe(true);
    });

    test("obj{= +a=3, -.b, +c } multiple operations", () => {
      const expr = stripMetadata(parseCode("obj{= +a=3, -.b, +c };"))[0].expression;
      expect(expr.type).toBe("Mutation");
      expect(expr.operations.length).toBe(3);

      expect(expr.operations[0].action).toBe("add");
      expect(expr.operations[0].key).toBe("a");
      expect(expr.operations[0].value).toEqual({ type: "Number", value: "3" });

      expect(expr.operations[1].action).toBe("remove");
      expect(expr.operations[1].key).toBe("b");
      expect(expr.operations[1].value).toBeNull();

      expect(expr.operations[2].action).toBe("add");
      expect(expr.operations[2].key).toBe("c");
      expect(expr.operations[2].value).toBeNull();
    });

    test("mutation with := for value assignment", () => {
      const expr = stripMetadata(parseCode("obj{= +a:=3 };"))[0].expression;
      expect(expr.type).toBe("Mutation");
      expect(expr.operations[0].value).toEqual({ type: "Number", value: "3" });
    });
  });

  describe("Extended base prefixes", () => {
    test("0t (ternary) tokenizes correctly", () => {
      const tokens = tokenize("0t12");
      expect(tokens[0].type).toBe("Number");
      expect(tokens[0].value).toBe("0t12");
    });

    test("0q (quaternary) tokenizes correctly", () => {
      const tokens = tokenize("0q33");
      expect(tokens[0].type).toBe("Number");
      expect(tokens[0].value).toBe("0q33");
    });

    test("0c (duodecimal/clock) tokenizes correctly", () => {
      const tokens = tokenize("0cAB");
      expect(tokens[0].type).toBe("Number");
      expect(tokens[0].value).toBe("0cAB");
    });

    test("0m (base 60) tokenizes correctly", () => {
      const tokens = tokenize("0m59");
      expect(tokens[0].type).toBe("Number");
      expect(tokens[0].value).toBe("0m59");
    });

    test("0y (base 64) tokenizes correctly", () => {
      const tokens = tokenize("0y1Az");
      expect(tokens[0].type).toBe("Number");
      expect(tokens[0].value).toBe("0y1Az");
    });

    test("0u (base 36) tokenizes correctly", () => {
      const tokens = tokenize("0uZZ");
      expect(tokens[0].type).toBe("Number");
      expect(tokens[0].value).toBe("0uZZ");
    });

    test("0j (vigesimal/base 20) tokenizes correctly", () => {
      const tokens = tokenize("0jIG");
      expect(tokens[0].type).toBe("Number");
      expect(tokens[0].value).toBe("0jIG");
    });

    test("0f (base 5) tokenizes correctly", () => {
      const tokens = tokenize("0f43");
      expect(tokens[0].type).toBe("Number");
      expect(tokens[0].value).toBe("0f43");
    });

    test("0s (base 7) tokenizes correctly", () => {
      const tokens = tokenize("0s65");
      expect(tokens[0].type).toBe("Number");
      expect(tokens[0].value).toBe("0s65");
    });

    test("all bases parse in expression context", () => {
      const ast = parseCode("0xFF + 0b101 + 0t12;");
      const expr = stripMetadata(ast)[0].expression;
      expect(expr.type).toBe("BinaryOperation");
    });
  });

  describe("Integration: combined Phase 1B features", () => {
    test("meta property in assignment (obj.meta = {= a, b })", () => {
      const expr = stripMetadata(parseCode("obj.meta = {= a, b };"))[0].expression;
      expect(expr.type).toBe("BinaryOperation");
      expect(expr.operator).toBe("=");
      expect(expr.left.type).toBe("DotAccess");
      expect(expr.right.type).toBe("MapContainer");
    });

    test("mutation with deferred block value", () => {
      const expr = stripMetadata(parseCode("obj{= +handler=@{; x + 1} };"))[0].expression;
      expect(expr.type).toBe("Mutation");
      expect(expr.operations[0].value.type).toBe("DeferredBlock");
    });

    test("deferred block containing mutation", () => {
      const expr = stripMetadata(parseCode("@{; obj{! +a=1} };"))[0].expression;
      expect(expr.type).toBe("DeferredBlock");
      expect(expr.body.elements[0].type).toBe("Mutation");
    });
  });

});
