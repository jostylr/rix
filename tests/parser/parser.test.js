import { tokenize } from "../../src/parser/tokenizer.js";
import { parse } from "../../src/parser/parser.js";

// Test system lookup function
function testSystemLookup(name) {
  const systemSymbols = {
    SIN: { type: "function", arity: 1 },
    COS: { type: "function", arity: 1 },
    TAN: { type: "function", arity: 1 },
    LOG: { type: "function", arity: 1 },
    MAX: { type: "function", arity: -1 },
    MIN: { type: "function", arity: -1 },
    PI: { type: "constant", value: Math.PI },
    E: { type: "constant", value: Math.E },
    AND: {
      type: "operator",
      precedence: 40,
      associativity: "left",
      operatorType: "infix",
    },
    OR: {
      type: "operator",
      precedence: 30,
      associativity: "left",
      operatorType: "infix",
    },
    NOT: { type: "operator", precedence: 110, operatorType: "prefix" },
    IN: {
      type: "operator",
      precedence: 60,
      associativity: "left",
      operatorType: "infix",
    },
    UNION: {
      type: "operator",
      precedence: 50,
      associativity: "left",
      operatorType: "infix",
    },
  };
  return systemSymbols[name] || { type: "identifier" };
}

function parseCode(code) {
  const tokens = tokenize(code);
  return parse(tokens, testSystemLookup);
}

function stripMetadata(obj) {
  if (Array.isArray(obj)) {
    return obj.map(stripMetadata);
  }
  if (obj && typeof obj === "object") {
    const { pos, original, sigil, ...rest } = obj;
    const result = {};
    for (const [key, value] of Object.entries(rest)) {
      if (key === "prep" && value === null) continue;
      if (key === "prepStrict" && value === false) continue;
      result[key] = stripMetadata(value);
    }
    return result;
  }
  return obj;
}

describe("RiX Parser", () => {
  describe("Function definitions", () => {
    test("standard function definition with :->", () => {
      const ast = parseCode("f(x) :-> x + 1;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "FunctionDefinition",
            name: { type: "UserIdentifier", name: "f" },
            parameters: {
              positional: [{ name: "x", defaultValue: null }],
              keyword: [],
              conditionals: [],
              metadata: {},
            },
            body: {
              type: "BinaryOperation",
              operator: "+",
              left: { type: "UserIdentifier", name: "x" },
              right: { type: "Number", value: "1" },
            },
          },
        },
      ]);
    });

    test("function definition with hole-default parameters", () => {
      const ast = parseCode("f(x, n ?= 5) :-> x^n;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "FunctionDefinition",
            name: { type: "UserIdentifier", name: "f" },
            parameters: {
              positional: [
                { name: "x", defaultValue: null },
                { name: "n", defaultValue: null, holeDefault: { type: "Number", value: "5" } },
              ],
              keyword: [],
              conditionals: [],
              metadata: {},
            },
            body: {
              type: "BinaryOperation",
              operator: "^",
              left: { type: "UserIdentifier", name: "x" },
              right: { type: "UserIdentifier", name: "n" },
            },
          },
        },
      ]);
    });

    test("function definition with keyword-only parameters", () => {
      const ast = parseCode("f(x, n ?= 5; a ?= 0) :-> (x-a)^n + 1;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "FunctionDefinition",
            name: { type: "UserIdentifier", name: "f" },
            parameters: {
              positional: [
                { name: "x", defaultValue: null },
                { name: "n", defaultValue: null, holeDefault: { type: "Number", value: "5" } },
              ],
              keyword: [
                { name: "a", defaultValue: null, holeDefault: { type: "Number", value: "0" } },
              ],
              conditionals: [],
              metadata: {},
            },
            body: {
              type: "BinaryOperation",
              operator: "+",
              left: {
                type: "BinaryOperation",
                operator: "^",
                left: {
                  type: "Grouping",
                  expression: {
                    type: "BinaryOperation",
                    operator: "-",
                    left: { type: "UserIdentifier", name: "x" },
                    right: { type: "UserIdentifier", name: "a" },
                  },
                },
                right: { type: "UserIdentifier", name: "n" },
              },
              right: { type: "Number", value: "1" },
            },
          },
        },
      ]);
    });

    test("function definition with condition", () => {
      const ast = parseCode(
        "h(x, y; n ? x^2 + y^2 == 1) :-> COS(x; n) * SIN(y; n);",
      );
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "FunctionDefinition",
            name: { type: "UserIdentifier", name: "h" },
            parameters: {
              positional: [
                { name: "x", defaultValue: null },
                { name: "y", defaultValue: null },
              ],
              keyword: [
                {
                  name: "n",
                  defaultValue: null,
                },
              ],
              conditionals: [
                {
                  type: "BinaryOperation",
                  operator: "==",
                  left: {
                    type: "BinaryOperation",
                    operator: "+",
                    left: {
                      type: "BinaryOperation",
                      operator: "^",
                      left: { type: "UserIdentifier", name: "x" },
                      right: { type: "Number", value: "2" },
                    },
                    right: {
                      type: "BinaryOperation",
                      operator: "^",
                      left: { type: "UserIdentifier", name: "y" },
                      right: { type: "Number", value: "2" },
                    },
                  },
                  right: { type: "Number", value: "1" },
                },
              ],
              metadata: {},
            },
            body: {
              type: "BinaryOperation",
              operator: "*",
              left: {
                type: "FunctionCall",
                function: {
                  type: "SystemIdentifier",
                  name: "COS",
                  systemInfo: { type: "function", arity: 1 },
                },
                arguments: {
                  positional: [{ type: "UserIdentifier", name: "x" }],
                  keyword: { n: { type: "UserIdentifier", name: "n" } },
                },
              },
              right: {
                type: "FunctionCall",
                function: {
                  type: "SystemIdentifier",
                  name: "SIN",
                  systemInfo: { type: "function", arity: 1 },
                },
                arguments: {
                  positional: [{ type: "UserIdentifier", name: "y" }],
                  keyword: { n: { type: "UserIdentifier", name: "n" } },
                },
              },
            },
          },
        },
      ]);
    });

    test("function call with semicolon separator", () => {
      const ast = parseCode("F(2, 3; a := 4);");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "FunctionCall",
            function: { type: "SystemIdentifier", name: "F", systemInfo: { type: "identifier" } },
            arguments: {
              positional: [
                { type: "Number", value: "2" },
                { type: "Number", value: "3" },
              ],
              keyword: {
                a: { type: "Number", value: "4" },
              },
            },
          },
        },
      ]);
    });

    test("function call with shorthand keyword argument", () => {
      const ast = parseCode("F(2; n);");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "FunctionCall",
            function: { type: "SystemIdentifier", name: "F", systemInfo: { type: "identifier" } },
            arguments: {
              positional: [{ type: "Number", value: "2" }],
              keyword: {
                n: { type: "UserIdentifier", name: "n" },
              },
            },
          },
        },
      ]);
    });

    test("simple assignment-style function definition", () => {
      const ast = parseCode("f := (x, n ?= 5; a ?= 0) -> (x-a)^n + 1;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BinaryOperation",
            operator: ":=",
            left: { type: "UserIdentifier", name: "f" },
            right: {
              type: "FunctionLambda",
              parameters: {
                positional: [
                  { name: "x", defaultValue: null },
                  { name: "n", defaultValue: null, holeDefault: { type: "Number", value: "5" } },
                ],
                keyword: [
                  { name: "a", defaultValue: null, holeDefault: { type: "Number", value: "0" } },
                ],
                conditionals: [],
                metadata: {},
              },
              body: {
                type: "BinaryOperation",
                operator: "+",
                left: {
                  type: "BinaryOperation",
                  operator: "^",
                  left: {
                    type: "Grouping",
                    expression: {
                      type: "BinaryOperation",
                      operator: "-",
                      left: { type: "UserIdentifier", name: "x" },
                      right: { type: "UserIdentifier", name: "a" },
                    },
                  },
                  right: { type: "UserIdentifier", name: "n" },
                },
                right: { type: "Number", value: "1" },
              },
            },
          },
        },
      ]);
    });

    test("lambda prep phase parses with soft mode", () => {
      const ast = parseCode("(x, y) ?- [sum = x + y, sum > 0] -> sum;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "FunctionLambda",
            parameters: {
              positional: [
                { name: "x", defaultValue: null },
                { name: "y", defaultValue: null },
              ],
              keyword: [],
              conditionals: [],
              metadata: {},
            },
            prep: {
              type: "Array",
              elements: [
                {
                  type: "BinaryOperation",
                  operator: "=",
                  left: { type: "UserIdentifier", name: "sum" },
                  right: {
                    type: "BinaryOperation",
                    operator: "+",
                    left: { type: "UserIdentifier", name: "x" },
                    right: { type: "UserIdentifier", name: "y" },
                  },
                },
                {
                  type: "BinaryOperation",
                  operator: ">",
                  left: { type: "UserIdentifier", name: "sum" },
                  right: { type: "Number", value: "0" },
                },
              ],
            },
            body: { type: "UserIdentifier", name: "sum" },
          },
        },
      ]);
    });

    test("named function prep phase parses with strict mode", () => {
      const ast = parseCode("F(x, y) ?!- [sum = x + y, sum > 0] -> sum;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "FunctionDefinition",
            name: { type: "SystemIdentifier", name: "F", systemInfo: { type: "identifier" } },
            parameters: {
              positional: [
                { name: "x", defaultValue: null },
                { name: "y", defaultValue: null },
              ],
              keyword: [],
              conditionals: [],
              metadata: {},
            },
            prep: {
              type: "Array",
              elements: [
                {
                  type: "BinaryOperation",
                  operator: "=",
                  left: { type: "UserIdentifier", name: "sum" },
                  right: {
                    type: "BinaryOperation",
                    operator: "+",
                    left: { type: "UserIdentifier", name: "x" },
                    right: { type: "UserIdentifier", name: "y" },
                  },
                },
                {
                  type: "BinaryOperation",
                  operator: ">",
                  left: { type: "UserIdentifier", name: "sum" },
                  right: { type: "Number", value: "0" },
                },
              ],
            },
            prepStrict: true,
            body: { type: "UserIdentifier", name: "sum" },
          },
        },
      ]);
    });

    test("named function variant parses with name header", () => {
      const ast = parseCode("(x) /Rational/ -> x;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "FunctionLambda",
            parameters: {
              positional: [{ name: "x", defaultValue: null }],
              keyword: [],
              conditionals: [],
              metadata: {},
            },
            variantName: "Rational",
            body: { type: "UserIdentifier", name: "x" },
          },
        },
      ]);
    });

    test("append variant parses as multifunction definition", () => {
      const ast = parseCode("F(x) ?- [x > 0] /Positive/ => x;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "FunctionVariantDefinition",
            name: { type: "SystemIdentifier", name: "F", systemInfo: { type: "identifier" } },
            parameters: {
              positional: [{ name: "x", defaultValue: null }],
              keyword: [],
              conditionals: [],
              metadata: {},
            },
            prep: {
              type: "Array",
              elements: [
                {
                  type: "BinaryOperation",
                  operator: ">",
                  left: { type: "UserIdentifier", name: "x" },
                  right: { type: "Number", value: "0" },
                },
              ],
            },
            variantName: "Positive",
            mode: "append",
            body: { type: "UserIdentifier", name: "x" },
          },
        },
      ]);
    });
  });

  describe("Basic arithmetic", () => {
    test("simple addition", () => {
      const ast = parseCode("2 + 3;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BinaryOperation",
            operator: "+",
            left: { type: "Number", value: "2" },
            right: { type: "Number", value: "3" },
          },
        },
      ]);
    });

    test("operator precedence", () => {
      const ast = parseCode("2 + 3 * 4;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BinaryOperation",
            operator: "+",
            left: { type: "Number", value: "2" },
            right: {
              type: "BinaryOperation",
              operator: "*",
              left: { type: "Number", value: "3" },
              right: { type: "Number", value: "4" },
            },
          },
        },
      ]);
    });

    test("right associativity of exponentiation", () => {
      const ast = parseCode("2 ^ 3 ^ 4;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BinaryOperation",
            operator: "^",
            left: { type: "Number", value: "2" },
            right: {
              type: "BinaryOperation",
              operator: "^",
              left: { type: "Number", value: "3" },
              right: { type: "Number", value: "4" },
            },
          },
        },
      ]);
    });
  });

  describe("Assignment operations", () => {
    test("simple assignment", () => {
      const ast = parseCode("x := 5;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BinaryOperation",
            operator: ":=",
            left: { type: "UserIdentifier", name: "x" },
            right: { type: "Number", value: "5" },
          },
        },
      ]);
    });

    test.each([
      ["++=", "x ++= y"],
      ["\\/=", "x \\/= y"],
      ["/\\=", "x /\\= y"],
      ["\\=", "x \\= y"],
      ["**=", "x **= y"],
      ["/^=", "x /^= y"],
      ["/~=", "x /~= y"],
    ])("combo assignment %s parses as a single operator", (operator, code) => {
      const ast = parseCode(`${code};`);
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BinaryOperation",
            operator,
            left: { type: "UserIdentifier", name: "x" },
            right: { type: "UserIdentifier", name: "y" },
          },
        },
      ]);
    });

    test.each([
      ["x ++ y;", "++"],
      ["x ++= y;", "++="],
      ["x ** y;", "**"],
      ["x **= y;", "**="],
      ["x \\ y;", "\\"],
      ["x \\= y;", "\\="],
      ["x /\\ y;", "/\\"],
      ["x /\\= y;", "/\\="],
      ["x \\/ y;", "\\/"],
      ["x \\/= y;", "\\/="],
    ])("nearby operator distinction for %s", (code, operator) => {
      const ast = parseCode(code);
      expect(stripMetadata(ast)[0].expression.operator).toBe(operator);
    });

    test("equation solving", () => {
      const ast = parseCode("x :=: 5;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BinaryOperation",
            operator: ":=:",
            left: { type: "UserIdentifier", name: "x" },
            right: { type: "Number", value: "5" },
          },
        },
      ]);
    });
  });

  describe("Function calls", () => {
    test("simple function call (uppercase)", () => {
      const ast = parseCode("F(x);");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "FunctionCall",
            function: { type: "SystemIdentifier", name: "F", systemInfo: { type: "identifier" } },
            arguments: {
              positional: [{ type: "UserIdentifier", name: "x" }],
              keyword: {},
            },
          },
        },
      ]);
    });

    test("lowercase f(x) is implicit multiplication", () => {
      const ast = parseCode("f(x);");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "ImplicitMultiplication",
            left: { type: "UserIdentifier", name: "f" },
            right: {
              type: "Grouping",
              expression: { type: "UserIdentifier", name: "x" },
            },
          },
        },
      ]);
    });

    test("system function call", () => {
      const ast = parseCode("SIN(PI);");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "FunctionCall",
            function: {
              type: "SystemIdentifier",
              name: "SIN",
              systemInfo: { type: "function", arity: 1 },
            },
            arguments: {
              positional: [
                {
                  type: "SystemIdentifier",
                  name: "PI",
                  systemInfo: { type: "constant", value: Math.PI },
                },
              ],
              keyword: {},
            },
          },
        },
      ]);
    });
  });

  describe("Unary operators", () => {
    test("unary minus", () => {
      const ast = parseCode("-x;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "UnaryOperation",
            operator: "-",
            operand: { type: "UserIdentifier", name: "x" },
          },
        },
      ]);
    });

    test("unary plus", () => {
      const ast = parseCode("+42;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "UnaryOperation",
            operator: "+",
            operand: { type: "Number", value: "42" },
          },
        },
      ]);
    });
  });

  describe("Collections", () => {
    test("array with elements", () => {
      const ast = parseCode("[1, 2, 3];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Array",
            elements: [
              { type: "Number", value: "1" },
              { type: "Number", value: "2" },
              { type: "Number", value: "3" },
            ],
          },
        },
      ]);
    });

    test("block with elements (plain braces)", () => {
      const ast = parseCode("{ a, b, c};");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BlockContainer",
            elements: [
              { type: "UserIdentifier", name: "a" },
              { type: "UserIdentifier", name: "b" },
              { type: "UserIdentifier", name: "c" },
            ],
          },
        },
      ]);
    });

    test("block with literal values", () => {
      const ast = parseCode("{3, 5, 6};");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BlockContainer",
            elements: [
              { type: "Number", value: "3" },
              { type: "Number", value: "5" },
              { type: "Number", value: "6" },
            ],
          },
        },
      ]);
    });

    test("block with key-value pairs (previously map)", () => {
      const ast = parseCode("{ a := 4, b := 5};");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BlockContainer",
            elements: [
              {
                type: "BinaryOperation",
                operator: ":=",
                left: { type: "UserIdentifier", name: "a" },
                right: { type: "Number", value: "4" },
              },
              {
                type: "BinaryOperation",
                operator: ":=",
                left: { type: "UserIdentifier", name: "b" },
                right: { type: "Number", value: "5" },
              },
            ],
          },
        },
      ]);
    });

    test("pattern matching in plain block", () => {
      const ast = parseCode("{ (x) -> x + 1, (y) -> y * 2};");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BlockContainer",
            elements: [
              {
                type: "FunctionLambda",
                parameters: {
                  positional: [{ name: "x", defaultValue: null }],
                  keyword: [], conditionals: [], metadata: {}
                },
                body: {
                  type: "BinaryOperation",
                  operator: "+",
                  left: { type: "UserIdentifier", name: "x" },
                  right: { type: "Number", value: "1" }
                }
              },
              {
                type: "FunctionLambda",
                parameters: {
                  positional: [{ name: "y", defaultValue: null }],
                  keyword: [], conditionals: [], metadata: {}
                },
                body: {
                  type: "BinaryOperation",
                  operator: "*",
                  left: { type: "UserIdentifier", name: "y" },
                  right: { type: "Number", value: "2" }
                }
              }
            ]
          }
        }
      ]);
    });

    test("transitional {$ } sigil behaves like a block alias", () => {
      const ast = parseCode("{$ x :=: 3*x + 2; y :=: x };");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BlockContainer",
            elements: [
              {
                type: "BinaryOperation",
                operator: ":=:",
                left: { type: "UserIdentifier", name: "x" },
                right: {
                  type: "BinaryOperation",
                  operator: "+",
                  left: {
                    type: "BinaryOperation",
                    operator: "*",
                    left: { type: "Number", value: "3" },
                    right: { type: "UserIdentifier", name: "x" },
                  },
                  right: { type: "Number", value: "2" },
                },
              },
              {
                type: "BinaryOperation",
                operator: ":=:",
                left: { type: "UserIdentifier", name: "y" },
                right: { type: "UserIdentifier", name: "x" },
              },
            ],
          },
        },
      ]);
    });

    test("empty block", () => {
      const ast = parseCode("{};");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BlockContainer",
            elements: [],
          },
        },
      ]);
    });

    test("2x2 matrix with semicolon separator", () => {
      const ast = parseCode("[1, 2; 3, 4];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Matrix",
            rows: [
              [
                { type: "Number", value: "1" },
                { type: "Number", value: "2" },
              ],
              [
                { type: "Number", value: "3" },
                { type: "Number", value: "4" },
              ],
            ],
          },
        },
      ]);
    });

    test("3x2 matrix with multiple rows", () => {
      const ast = parseCode("[1, 2; 3, 4; 5, 6];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Matrix",
            rows: [
              [
                { type: "Number", value: "1" },
                { type: "Number", value: "2" },
              ],
              [
                { type: "Number", value: "3" },
                { type: "Number", value: "4" },
              ],
              [
                { type: "Number", value: "5" },
                { type: "Number", value: "6" },
              ],
            ],
          },
        },
      ]);
    });

    test("3D tensor with double semicolon separator", () => {
      const ast = parseCode("[1, 2; 3, 4 ;; 5, 6; 7, 8];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Tensor",
            structure: [
              {
                row: [
                  { type: "Number", value: "1" },
                  { type: "Number", value: "2" },
                ],
                separatorLevel: 1,
              },
              {
                row: [
                  { type: "Number", value: "3" },
                  { type: "Number", value: "4" },
                ],
                separatorLevel: 2,
              },
              {
                row: [
                  { type: "Number", value: "5" },
                  { type: "Number", value: "6" },
                ],
                separatorLevel: 1,
              },
              {
                row: [
                  { type: "Number", value: "7" },
                  { type: "Number", value: "8" },
                ],
                separatorLevel: 0,
              },
            ],
            maxDimension: 3,
          },
        },
      ]);
    });

    test("single row matrix", () => {
      const ast = parseCode("[1, 2, 3; ];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Matrix",
            rows: [
              [
                { type: "Number", value: "1" },
                { type: "Number", value: "2" },
                { type: "Number", value: "3" },
              ],
              [],
            ],
          },
        },
      ]);
    });

    test("matrix with variables", () => {
      const ast = parseCode("[x, y; z, w];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Matrix",
            rows: [
              [
                { type: "UserIdentifier", name: "x" },
                { type: "UserIdentifier", name: "y" },
              ],
              [
                { type: "UserIdentifier", name: "z" },
                { type: "UserIdentifier", name: "w" },
              ],
            ],
          },
        },
      ]);
    });

    test("matrix starting with empty row", () => {
      const ast = parseCode("[; 1, 2];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Matrix",
            rows: [
              [],
              [
                { type: "Number", value: "1" },
                { type: "Number", value: "2" },
              ],
            ],
          },
        },
      ]);
    });

    test("column vector matrix", () => {
      const ast = parseCode("[1; 2; 3; 4];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Matrix",
            rows: [
              [{ type: "Number", value: "1" }],
              [{ type: "Number", value: "2" }],
              [{ type: "Number", value: "3" }],
              [{ type: "Number", value: "4" }],
            ],
          },
        },
      ]);
    });

    test("tensor with only separators", () => {
      const ast = parseCode("[;;];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Tensor",
            structure: [
              {
                row: [],
                separatorLevel: 2,
              },
              {
                row: [],
                separatorLevel: 0,
              },
            ],
            maxDimension: 3,
          },
        },
      ]);
    });

    test("4D tensor with mixed dimensions", () => {
      const ast = parseCode("[1 ;; 2 ;;; 3];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Tensor",
            structure: [
              {
                row: [{ type: "Number", value: "1" }],
                separatorLevel: 2,
              },
              {
                row: [{ type: "Number", value: "2" }],
                separatorLevel: 3,
              },
              {
                row: [{ type: "Number", value: "3" }],
                separatorLevel: 0,
              },
            ],
            maxDimension: 4,
          },
        },
      ]);
    });

    test("tensor literal with explicit shape header", () => {
      const ast = parseCode("{:2x3: a, b, c; d, e, f };");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "TensorLiteral",
            shape: [2, 3],
            elements: [
              { type: "UserIdentifier", name: "a" },
              { type: "UserIdentifier", name: "b" },
              { type: "UserIdentifier", name: "c" },
              { type: "UserIdentifier", name: "d" },
              { type: "UserIdentifier", name: "e" },
              { type: "UserIdentifier", name: "f" },
            ],
          },
        },
      ]);
    });

    test("rank-3 tensor literal with explicit shape header uses rows then columns within each depth slice", () => {
      const ast = parseCode("{:2x3x2: a, b, c; d, e, f ;; g, h, i; j, k, l };");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "TensorLiteral",
            shape: [2, 3, 2],
            elements: [
              { type: "UserIdentifier", name: "a" },
              { type: "UserIdentifier", name: "g" },
              { type: "UserIdentifier", name: "b" },
              { type: "UserIdentifier", name: "h" },
              { type: "UserIdentifier", name: "c" },
              { type: "UserIdentifier", name: "i" },
              { type: "UserIdentifier", name: "d" },
              { type: "UserIdentifier", name: "j" },
              { type: "UserIdentifier", name: "e" },
              { type: "UserIdentifier", name: "k" },
              { type: "UserIdentifier", name: "f" },
              { type: "UserIdentifier", name: "l" },
            ],
          },
        },
      ]);
    });

    test("rank-3 tensor literal rejects a 3x2 body under a 2x3x2 shape", () => {
      expect(() => parseCode("{:2x3x2: a, b; c, d; e, f ;; g, h; i, j; k, l };"))
        .toThrow("expects 3 columns per row");
    });

    test("empty tensor literal with explicit shape header", () => {
      const ast = parseCode("{:2x3:};");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "TensorLiteral",
            shape: [2, 3],
            elements: [],
          },
        },
      ]);
    });

    test("tensor bracket indexing with slices", () => {
      const ast = parseCode("m[1, ::];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BracketIndex",
            object: { type: "UserIdentifier", name: "m" },
            specs: [
              { type: "Number", value: "1" },
              { type: "FullSlice" },
            ],
          },
        },
      ]);
    });

    test("tensor bracket indexing preserves interval slices", () => {
      const ast = parseCode("m[-1:1, 2];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BracketIndex",
            object: { type: "UserIdentifier", name: "m" },
            specs: [
              { type: "Number", value: "-1:1" },
              { type: "Number", value: "2" },
            ],
          },
        },
      ]);
    });

    test("matrix transpose postfix", () => {
      const ast = parseCode("m^^;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Transpose",
            expression: { type: "UserIdentifier", name: "m" },
          },
        },
      ]);
    });

    test("matrix with expressions", () => {
      const ast = parseCode("[a + b, x * y; 1/2, 3^4];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Matrix",
            rows: [
              [
                {
                  type: "BinaryOperation",
                  operator: "+",
                  left: { type: "UserIdentifier", name: "a" },
                  right: { type: "UserIdentifier", name: "b" },
                },
                {
                  type: "BinaryOperation",
                  operator: "*",
                  left: { type: "UserIdentifier", name: "x" },
                  right: { type: "UserIdentifier", name: "y" },
                },
              ],
              [
                {
                  type: "Number",
                  value: "1/2",
                },
                {
                  type: "BinaryOperation",
                  operator: "^",
                  left: { type: "Number", value: "3" },
                  right: { type: "Number", value: "4" },
                },
              ],
            ],
          },
        },
      ]);
    });

    test("block import header parses on explicit block", () => {
      const expr = stripMetadata(parseCode("{; <a~x> a };"))[0].expression;
      expect(expr).toEqual({
        type: "BlockContainer",
        imports: [
          { local: "a", source: "x", mode: "copy" },
        ],
        elements: [
          { type: "UserIdentifier", name: "a" },
        ],
      });
    });

    test("block import header parses mixed copy and alias forms", () => {
      const expr = stripMetadata(parseCode("{; <a~x, b=y, z=, r> a + b };"))[0].expression;
      expect(expr.imports).toEqual([
        { local: "a", source: "x", mode: "copy" },
        { local: "b", source: "y", mode: "alias" },
        { local: "z", source: "z", mode: "alias" },
        { local: "r", source: "r", mode: "copy" },
      ]);
      expect(expr.elements[0].type).toBe("BinaryOperation");
    });

    test("plain block import header parses", () => {
      const expr = stripMetadata(parseCode("{ <x, y=> x + y };"))[0].expression;
      expect(expr.type).toBe("BlockContainer");
      expect(expr.imports).toEqual([
        { local: "x", source: "x", mode: "copy" },
        { local: "y", source: "y", mode: "alias" },
      ]);
    });

    test("block import header normalizes identifier casing", () => {
      const expr = stripMetadata(parseCode("{@ < maxIter, LocalName=OuterName > i = 0; i < maxIter; i; i += 1 };"))[0].expression;
      expect(expr.type).toBe("LoopContainer");
      expect(expr.imports).toEqual([
        { local: "maxiter", source: "maxiter", mode: "copy" },
        { local: "LOCALNAME", source: "OUTERNAME", mode: "alias" },
      ]);
    });

    test("empty import header is rejected", () => {
      expect(() => parseCode("{; <> a };")).toThrow("Import header cannot be empty");
    });

    test("invalid double tilde import is rejected", () => {
      expect(() => parseCode("{; <a~~x> a };")).toThrow("Malformed import header");
    });

    test("invalid double equals import is rejected", () => {
      expect(() => parseCode("{; <a==x> a };")).toThrow("Malformed import header");
    });

    test("trailing comma in import header is rejected", () => {
      expect(() => parseCode("{; <a~x,> a };")).toThrow("Trailing comma is not allowed in import header");
    });

    test("missing comma in import header is rejected", () => {
      expect(() => parseCode("{; <a~x b=y> a };")).toThrow("Malformed import header");
    });

    test("duplicate local targets in import header are rejected", () => {
      expect(() => parseCode("{; <a~x, a=y> a };")).toThrow("Duplicate import target 'a'");
      expect(() => parseCode("{; <maxIter, maxiter> a };")).toThrow("Duplicate import target 'maxiter'");
    });
  });

  describe("Code blocks", () => {
    test("empty code block", () => {
      const ast = parseCode("{; };");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BlockContainer",
            elements: [],
          },
        },
      ]);
    });

    test("code block with single expression", () => {
      const ast = parseCode("{; x := 1};");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BlockContainer",
            elements: [
              {
                type: "BinaryOperation",
                operator: ":=",
                left: { type: "UserIdentifier", name: "x" },
                right: { type: "Number", value: "1" },
              },
            ],
          },
        },
      ]);
    });

    test("code block with multiple elements", () => {
      const ast = parseCode("{; x := 1; y := 2};");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BlockContainer",
            elements: [
              {
                type: "BinaryOperation",
                operator: ":=",
                left: { type: "UserIdentifier", name: "x" },
                right: { type: "Number", value: "1" },
              },
              {
                type: "BinaryOperation",
                operator: ":=",
                left: { type: "UserIdentifier", name: "y" },
                right: { type: "Number", value: "2" },
              },
            ],
          },
        },
      ]);
    });

    test("code block with expressions", () => {
      const ast = parseCode("{; a + b; c * d};");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BlockContainer",
            elements: [
              {
                type: "BinaryOperation",
                operator: "+",
                left: { type: "UserIdentifier", name: "a" },
                right: { type: "UserIdentifier", name: "b" },
              },
              {
                type: "BinaryOperation",
                operator: "*",
                left: { type: "UserIdentifier", name: "c" },
                right: { type: "UserIdentifier", name: "d" },
              },
            ],
          },
        },
      ]);
    });

    test("nested blocks using plain braces", () => {
      const codeBlock = parseCode("{; 3};");
      const nestedBlock = parseCode("{ { 3 } };");

      expect(stripMetadata(codeBlock)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BlockContainer",
            elements: [{ type: "Number", value: "3" }],
          },
        },
      ]);

      expect(stripMetadata(nestedBlock)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BlockContainer",
            elements: [
              {
                type: "BlockContainer",
                elements: [{ type: "Number", value: "3" }],
              },
            ],
          },
        },
      ]);
    });

    test("nested blocks using plain braces", () => {
      // { { } } is a block containing an empty block
      const nestedBlock = parseCode("{ { } };");
      expect(stripMetadata(nestedBlock)[0].expression.type).toBe("BlockContainer");
      expect(stripMetadata(nestedBlock)[0].expression.elements[0].type).toBe(
        "BlockContainer",
      );
    });

    test("nested code blocks", () => {
      const ast = parseCode("{; a := {; 3 } };");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BlockContainer",
            elements: [
              {
                type: "BinaryOperation",
                operator: ":=",
                left: { type: "UserIdentifier", name: "a" },
                right: {
                  type: "BlockContainer",
                  elements: [{ type: "Number", value: "3" }],
                },
              },
            ],
          },
        },
      ]);
    });

    test("deeply nested code blocks", () => {
      const ast = parseCode("{; x := {; y := {; z := 42 } } };");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BlockContainer",
            elements: [
              {
                type: "BinaryOperation",
                operator: ":=",
                left: { type: "UserIdentifier", name: "x" },
                right: {
                  type: "BlockContainer",
                  elements: [
                    {
                      type: "BinaryOperation",
                      operator: ":=",
                      left: { type: "UserIdentifier", name: "y" },
                      right: {
                        type: "BlockContainer",
                        elements: [
                          {
                            type: "BinaryOperation",
                            operator: ":=",
                            left: { type: "UserIdentifier", name: "z" },
                            right: { type: "Number", value: "42" },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ]);
    });

    test("complex nested code blocks with multiple elements", () => {
      const ast = parseCode(
        "{; outer := 1; inner := {; nested := 2; nested + 1 }; result := outer + inner };",
      );
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BlockContainer",
            elements: [
              {
                type: "BinaryOperation",
                operator: ":=",
                left: { type: "UserIdentifier", name: "outer" },
                right: { type: "Number", value: "1" },
              },
              {
                type: "BinaryOperation",
                operator: ":=",
                left: { type: "UserIdentifier", name: "inner" },
                right: {
                  type: "BlockContainer",
                  elements: [
                    {
                      type: "BinaryOperation",
                      operator: ":=",
                      left: { type: "UserIdentifier", name: "nested" },
                      right: { type: "Number", value: "2" },
                    },
                    {
                      type: "BinaryOperation",
                      operator: "+",
                      left: { type: "UserIdentifier", name: "nested" },
                      right: { type: "Number", value: "1" },
                    },
                  ],
                },
              },
              {
                type: "BinaryOperation",
                operator: ":=",
                left: { type: "UserIdentifier", name: "result" },
                right: {
                  type: "BinaryOperation",
                  operator: "+",
                  left: { type: "UserIdentifier", name: "outer" },
                  right: { type: "UserIdentifier", name: "inner" },
                },
              },
            ],
          },
        },
      ]);
    });
  });

  describe("Script angle forms", () => {
    test('script import expression parses path, modifiers, inputs, and outputs', () => {
      const expr = stripMetadata(parseCode('<"poly" /-All,+Core,+@MAP/ a, b=@c ; x=result, y:deriv>;'))[0].expression;
      expect(expr).toEqual({
        type: "ScriptImportExpression",
        path: { type: "String", value: "poly", kind: "quote" },
        capabilityModifiers: [
          { action: "remove", targetType: "all", target: "All" },
          { action: "add", targetType: "group", target: "Core" },
          { action: "add", targetType: "function", target: "MAP" },
        ],
        inputs: [
          { target: "a", source: "a", mode: "copy" },
          { target: "b", source: "c", mode: "alias", sourceScope: "ancestor" },
        ],
        outputs: [
          { target: "x", source: "result", mode: "alias" },
          { target: "y", source: "deriv", mode: "copy_meta" },
        ],
      });
    });

    test("script binding declaration parses contract/export forms", () => {
      const decl = stripMetadata(parseCode("< a, b=, c~, d:, e~~, f:: >;"))[0].expression;
      expect(decl).toEqual({
        type: "ScriptBindingsDeclaration",
        bindings: [
          { target: "a", source: "a", mode: "copy" },
          { target: "b", source: "b", mode: "alias" },
          { target: "c", source: "c", mode: "copy" },
          { target: "d", source: "d", mode: "copy_meta" },
          { target: "e", source: "e", mode: "deep_copy" },
          { target: "f", source: "f", mode: "deep_copy_meta" },
        ],
      });
    });

    test("script outputs reject ancestor sources", () => {
      expect(() => parseCode('<"poly" ; x=@result>;')).toThrow("Ancestor scope sources are not allowed in this binding list");
    });
  });

  describe("Loop Headers And Break Blocks", () => {
    test("loop header with explicit max stores maxIterations", () => {
      const expr = stripMetadata(parseCode("{@:100@ i := 0; i < 1; i; i += 1 };"))[0].expression;
      expect(expr.type).toBe("LoopContainer");
      expect(expr.maxIterations).toBe(100);
      expect(expr.unlimited).toBeUndefined();
    });

    test("named unlimited loop stores name and unlimited flag", () => {
      const expr = stripMetadata(parseCode("{@cool::@ i := 0; i < 1; i; i += 1 };"))[0].expression;
      expect(expr.type).toBe("LoopContainer");
      expect(expr.name).toBe("cool");
      expect(expr.unlimited).toBe(true);
      expect(expr.maxIterations).toBeUndefined();
    });

    test("break block parses with optional target type and name", () => {
      const generic = stripMetadata(parseCode("{! 5 };"))[0].expression;
      expect(generic).toEqual({
        type: "BreakBlock",
        value: { type: "Number", value: "5" },
      });

      const typedNamed = stripMetadata(parseCode("{!@outer! x + 1 };"))[0].expression;
      expect(typedNamed).toEqual({
        type: "BreakBlock",
        targetType: "loop",
        targetName: "outer",
        value: {
          type: "BinaryOperation",
          operator: "+",
          left: { type: "UserIdentifier", name: "x" },
          right: { type: "Number", value: "1" },
        },
      });
    });
  });

  // Test postfix operators
  describe('Postfix operators', () => {
    describe('AT operator (@)', () => {
      test('simple AT operation', () => {
        const result = parseCode('PI@(1_^-6);');
        expect(stripMetadata(result)).toEqual([{
          type: 'Statement',
          expression: {
            type: 'At',
            target: {
              type: 'SystemIdentifier',
              name: 'PI',
              systemInfo: {
                type: 'constant',
                value: 3.141592653589793
              }
            },
            arg: {
              type: 'Number',
              value: '1_^-6'
            }
          }
        }]);
      });

      test('AT operation on user identifier', () => {
        const result = parseCode('x@(epsilon);');
        expect(stripMetadata(result)).toEqual([{
          type: 'Statement',
          expression: {
            type: 'At',
            target: {
              type: 'UserIdentifier',
              name: 'x'
            },
            arg: {
              type: 'UserIdentifier',
              name: 'epsilon'
            }
          }
        }]);
      });

      test('AT operation on expression', () => {
        const result = parseCode('(1/3)@(1_^-10);');
        expect(stripMetadata(result)).toEqual([{
          type: 'Statement',
          expression: {
            type: 'At',
            target: {
              type: 'Grouping',
              expression: {
                type: 'Number',
                value: '1/3'
              }
            },
            arg: {
              type: 'Number',
              value: '1_^-10'
            }
          }
        }]);
      });

      test('chained AT operations', () => {
        const result = parseCode('PI@(1_^-3)@(5_^-4);');
        expect(stripMetadata(result)).toEqual([{
          type: 'Statement',
          expression: {
            type: 'At',
            target: {
              type: 'At',
              target: {
                type: 'SystemIdentifier',
                name: 'PI',
                systemInfo: {
                  type: 'constant',
                  value: 3.141592653589793
                }
              },
              arg: {
                type: 'Number',
                value: '1_^-3'
              }
            },
            arg: {
              type: 'Number',
              value: '5_^-4'
            }
          }
        }]);
      });
    });

    describe('ASK operator (?)', () => {
      test('simple ASK operation', () => {
        const result = parseCode('PI?(3:4);');
        expect(stripMetadata(result)).toEqual([{
          type: 'Statement',
          expression: {
            type: 'Ask',
            target: {
              type: 'SystemIdentifier',
              name: 'PI',
              systemInfo: {
                type: 'constant',
                value: 3.141592653589793
              }
            },
            arg: {
              type: 'Number',
              value: '3:4'
            }
          }
        }]);
      });

      test('ASK operation with interval', () => {
        const result = parseCode('interval?(x);');
        expect(stripMetadata(result)).toEqual([{
          type: 'Statement',
          expression: {
            type: 'Ask',
            target: {
              type: 'UserIdentifier',
              name: 'interval'
            },
            arg: {
              type: 'UserIdentifier',
              name: 'x'
            }
          }
        }]);
      });

      test('ASK operation on expression', () => {
        const result = parseCode('(1/3)?(0.333:0.334);');
        expect(stripMetadata(result)).toEqual([{
          type: 'Statement',
          expression: {
            type: 'Ask',
            target: {
              type: 'Grouping',
              expression: {
                type: 'Number',
                value: '1/3'
              }
            },
            arg: {
              type: 'Number',
              value: '0.333:0.334'
            }
          }
        }]);
      });

      test('chained ASK operations', () => {
        const result = parseCode('PI?(3:4)?(true);');
        expect(stripMetadata(result)).toEqual([{
          type: 'Statement',
          expression: {
            type: 'Ask',
            target: {
              type: 'Ask',
              target: {
                type: 'SystemIdentifier',
                name: 'PI',
                systemInfo: {
                  type: 'constant',
                  value: 3.141592653589793
                }
              },
              arg: {
                type: 'Number',
                value: '3:4'
              }
            },
            arg: {
              type: 'UserIdentifier',
              name: 'true'
            }
          }
        }]);
      });
    });

    describe('Enhanced CALL operator (()', () => {
      test('function call on identifier (backward compatibility)', () => {
        const result = parseCode('SIN(x);');
        expect(stripMetadata(result)).toEqual([{
          type: 'Statement',
          expression: {
            type: 'FunctionCall',
            function: {
              type: 'SystemIdentifier',
              name: 'SIN',
              systemInfo: {
                type: 'function',
                arity: 1
              }
            },
            arguments: {
              positional: [{
                type: 'UserIdentifier',
                name: 'x'
              }],
              keyword: {}
            }
          }
        }]);
      });

      test('call on number (multiplication semantics)', () => {
        const result = parseCode('3(4);');
        expect(stripMetadata(result)).toEqual([{
          type: 'Statement',
          expression: {
            type: 'ImplicitMultiplication',
            left: { type: 'Number', value: '3' },
            right: {
              type: 'Grouping',
              expression: { type: 'Number', value: '4' }
            }
          }
        }]);
      });

      test('call on expression', () => {
        const result = parseCode('(2,3)(4,5);');
        expect(stripMetadata(result)).toEqual([{
          type: 'Statement',
          expression: {
            type: 'Call',
            target: {
              type: 'Tuple',
              elements: [{
                type: 'Number',
                value: '2'
              }, {
                type: 'Number',
                value: '3'
              }]
            },
            arguments: {
              positional: [{
                type: 'Number',
                value: '4'
              }, {
                type: 'Number',
                value: '5'
              }],
              keyword: {}
            }
          }
        }]);
      });

      test('chained calls', () => {
        const result = parseCode('f(x)(y);');
        expect(stripMetadata(result)).toEqual([{
          type: 'Statement',
          expression: {
            type: 'Call',
            target: {
              type: 'ImplicitMultiplication',
              left: {
                type: 'UserIdentifier',
                name: 'f'
              },
              right: {
                type: 'Grouping',
                expression: {
                  type: 'UserIdentifier',
                  name: 'x'
                }
              }
            },
            arguments: {
              positional: [{
                type: 'UserIdentifier',
                name: 'y'
              }],
              keyword: {}
            }
          }
        }]);
      });


      describe('Mixed postfix operations', () => {
        test('AT followed by ASK', () => {
          const result = parseCode('PI@(1_^-3)?(3.141:3.142);');
          expect(stripMetadata(result)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'Ask',
              target: {
                type: 'At',
                target: {
                  type: 'SystemIdentifier',
                  name: 'PI',
                  systemInfo: {
                    type: 'constant',
                    value: 3.141592653589793
                  }
                },
                arg: {
                  type: 'Number',
                  value: '1_^-3'
                }
              },
              arg: {
                type: 'Number',
                value: '3.141:3.142'
              }
            }
          }]);
        });

        test('CALL followed by AT', () => {
          const result = parseCode('f(x)@(epsilon);');
          expect(stripMetadata(result)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'At',
              target: {
                type: 'ImplicitMultiplication',
                left: {
                  type: 'UserIdentifier',
                  name: 'f'
                },
                right: {
                  type: 'Grouping',
                  expression: {
                    type: 'UserIdentifier',
                    name: 'x'
                  }
                }
              },
              arg: {
                type: 'UserIdentifier',
                name: 'epsilon'
              }
            }
          }]);
        });

        test('all three postfix operators chained', () => {
          const result = parseCode('f(x)@(1_^-6)?(result);');
          expect(stripMetadata(result)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'Ask',
              target: {
                type: 'At',
                target: {
                  type: 'ImplicitMultiplication',
                  left: {
                    type: 'UserIdentifier',
                    name: 'f'
                  },
                  right: {
                    type: 'Grouping',
                    expression: {
                      type: 'UserIdentifier',
                      name: 'x'
                    }
                  }
                },
                arg: {
                  type: 'Number',
                  value: '1_^-6'
                }
              },
              arg: {
                type: 'UserIdentifier',
                name: 'result'
              }
            }
          }]);
        });
      });

      describe('Precedence with other operators', () => {
        test('postfix has higher precedence than binary operators', () => {
          const result = parseCode('x@(eps) + y;');
          expect(stripMetadata(result)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'BinaryOperation',
              operator: '+',
              left: {
                type: 'At',
                target: {
                  type: 'UserIdentifier',
                  name: 'x'
                },
                arg: {
                  type: 'UserIdentifier',
                  name: 'eps'
                }
              },
              right: {
                type: 'UserIdentifier',
                name: 'y'
              }
            }
          }]);
        });

        test('postfix has higher precedence than infix condition ?', () => {
          const result = parseCode('x?(test) ? y : z;');
          expect(stripMetadata(result)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'BinaryOperation',
              operator: '?',
              left: {
                type: 'Ask',
                target: {
                  type: 'UserIdentifier',
                  name: 'x'
                },
                arg: {
                  type: 'UserIdentifier',
                  name: 'test'
                }
              },
              right: {
                type: 'BinaryOperation',
                operator: ':',
                left: {
                  type: 'UserIdentifier',
                  name: 'y'
                },
                right: {
                  type: 'UserIdentifier',
                  name: 'z'
                }
              }
            }
          }]);
        });

        test('postfix with property access', () => {
          const result = parseCode('obj.prop@(eps);');
          expect(stripMetadata(result)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'At',
              target: {
                type: 'DotAccess',
                object: {
                  type: 'UserIdentifier',
                  name: 'obj'
                },
                property: 'prop'
              },
              arg: {
                type: 'UserIdentifier',
                name: 'eps'
              }
            }
          }]);
        });
      });

      describe('Error cases', () => {
        test('? without parentheses should be infix condition operator', () => {
          const result = parseCode('x ? y : z;');
          expect(stripMetadata(result)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'BinaryOperation',
              operator: '?',
              left: {
                type: 'UserIdentifier',
                name: 'x'
              },
              right: {
                type: 'BinaryOperation',
                operator: ':',
                left: {
                  type: 'UserIdentifier',
                  name: 'y'
                },
                right: {
                  type: 'UserIdentifier',
                  name: 'z'
                }
              }
            }
          }]);
        });

        test('unclosed AT parentheses', () => {
          expect(() => parseCode('x@(y')).toThrow();
        });

        test('unclosed ASK parentheses', () => {
          expect(() => parseCode('x?(y')).toThrow();
        });

        test('method call uses a distinct AST node and keeps mutating ! in the method name', () => {
          const result = parseCode('arr.Push!(3, 4);');
          expect(stripMetadata(result)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'MethodCall',
              object: { type: 'UserIdentifier', name: 'arr' },
              method: 'PUSH!',
              arguments: {
                positional: [
                  { type: 'Number', value: '3' },
                  { type: 'Number', value: '4' }
                ],
                keyword: {}
              }
            }
          }]);
        });

        test('system access also allows ! in dotted capability names', () => {
          const result = parseCode('.Push!(3);');
          expect(stripMetadata(result)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'SystemCall',
              name: 'PUSH!',
              arguments: {
                positional: [{ type: 'Number', value: '3' }],
                keyword: {}
              },
              viaSystemContext: true
            }
          }]);
        });
      });
    });

    // Test pipe operations
    describe('Pipe operations', () => {
      test("simple pipe", () => {
        const ast = parseCode("x |> f;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Pipe",
              left: { type: "UserIdentifier", name: "x" },
              right: { type: "UserIdentifier", name: "f" },
            },
          },
        ]);
      });

      test("pipe with tuple", () => {
        const ast = parseCode("(3, 4) |> f;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Pipe",
              left: {
                type: "Tuple",
                elements: [
                  { type: "Number", value: "3" },
                  { type: "Number", value: "4" }
                ]
              },
              right: { type: "UserIdentifier", name: "f" },
            },
          },
        ]);
      });

      test("chained pipes with left associativity", () => {
        const ast = parseCode("x |> f |> g;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Pipe",
              left: {
                type: "Pipe",
                left: { type: "UserIdentifier", name: "x" },
                right: { type: "UserIdentifier", name: "f" },
              },
              right: { type: "UserIdentifier", name: "g" },
            },
          },
        ]);
      });

      test("explicit pipe with placeholders", () => {
        const ast = parseCode("(3, 4) ||> f(_2, _1);");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "ExplicitPipe",
              left: {
                type: "Tuple",
                elements: [
                  { type: "Number", value: "3" },
                  { type: "Number", value: "4" }
                ]
              },
              right: {
                type: "ImplicitMultiplication",
                left: { type: "UserIdentifier", name: "f" },
                right: {
                  type: "Tuple",
                  elements: [
                    { type: "PlaceHolder", place: 2 },
                    { type: "PlaceHolder", place: 1 }
                  ]
                }
              }
            },
          },
        ]);
      });

      test("map operator", () => {
        const ast = parseCode("[1, 2, 3] |>> f;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Map",
              left: {
                type: "Array",
                elements: [
                  { type: "Number", value: "1" },
                  { type: "Number", value: "2" },
                  { type: "Number", value: "3" }
                ]
              },
              right: { type: "UserIdentifier", name: "f" },
            },
          },
        ]);
      });

      test("map with lambda function", () => {
        const ast = parseCode("[1, 2, 3] |>> (x) -> x^2;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Map",
              left: {
                type: "Array",
                elements: [
                  { type: "Number", value: "1" },
                  { type: "Number", value: "2" },
                  { type: "Number", value: "3" }
                ]
              },
              right: {
                type: "FunctionLambda",
                parameters: {
                  positional: [{ name: "x", defaultValue: null }],
                  keyword: [],
                  conditionals: [],
                  metadata: {}
                },
                body: {
                  type: "BinaryOperation",
                  operator: "^",
                  left: { type: "UserIdentifier", name: "x" },
                  right: { type: "Number", value: "2" }
                }
              },
            },
          },
        ]);
      });

      test("filter operator", () => {
        const ast = parseCode("[1, 2, 3, 4] |>? (x) -> x > 2;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Filter",
              left: {
                type: "Array",
                elements: [
                  { type: "Number", value: "1" },
                  { type: "Number", value: "2" },
                  { type: "Number", value: "3" },
                  { type: "Number", value: "4" }
                ]
              },
              right: {
                type: "FunctionLambda",
                parameters: {
                  positional: [{ name: "x", defaultValue: null }],
                  keyword: [],
                  conditionals: [],
                  metadata: {}
                },
                body: {
                  type: "BinaryOperation",
                  operator: ">",
                  left: { type: "UserIdentifier", name: "x" },
                  right: { type: "Number", value: "2" }
                }
              },
            },
          },
        ]);
      });

      test("reduce operator", () => {
        const ast = parseCode("[1, 2, 3, 4] |>: (a, b) -> a + b;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Reduce",
              left: {
                type: "Array",
                elements: [
                  { type: "Number", value: "1" },
                  { type: "Number", value: "2" },
                  { type: "Number", value: "3" },
                  { type: "Number", value: "4" }
                ]
              },
              right: {
                type: "FunctionLambda",
                parameters: {
                  positional: [
                    { name: "a", defaultValue: null },
                    { name: "b", defaultValue: null }
                  ],
                  keyword: [],
                  conditionals: [],
                  metadata: {}
                },
                body: {
                  type: "BinaryOperation",
                  operator: "+",
                  left: { type: "UserIdentifier", name: "a" },
                  right: { type: "UserIdentifier", name: "b" }
                }
              },
            },
          },
        ]);
      });

      test("complex explicit pipe with multiple placeholders", () => {
        const ast = parseCode("(1, 2, 3) ||> g(_3, _2, _1);");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "ExplicitPipe",
              left: {
                type: "Tuple",
                elements: [
                  { type: "Number", value: "1" },
                  { type: "Number", value: "2" },
                  { type: "Number", value: "3" }
                ]
              },
              right: {
                type: "ImplicitMultiplication",
                left: { type: "UserIdentifier", name: "g" },
                right: {
                  type: "Tuple",
                  elements: [
                    { type: "PlaceHolder", place: 3 },
                    { type: "PlaceHolder", place: 2 },
                    { type: "PlaceHolder", place: 1 }
                  ]
                }
              }
            },
          },
        ]);
      });

      test("mixed pipe operations", () => {
        const ast = parseCode("[1, 2, 3] |>> (x) -> x * 2 |>? (y) -> y > 3;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Filter",
              left: {
                type: "Map",
                left: {
                  type: "Array",
                  elements: [
                    { type: "Number", value: "1" },
                    { type: "Number", value: "2" },
                    { type: "Number", value: "3" }
                  ]
                },
                right: {
                  type: "FunctionLambda",
                  parameters: {
                    positional: [{ name: "x", defaultValue: null }],
                    keyword: [],
                    conditionals: [],
                    metadata: {}
                  },
                  body: {
                    type: "BinaryOperation",
                    operator: "*",
                    left: { type: "UserIdentifier", name: "x" },
                    right: { type: "Number", value: "2" }
                  }
                }
              },
              right: {
                type: "FunctionLambda",
                parameters: {
                  positional: [{ name: "y", defaultValue: null }],
                  keyword: [],
                  conditionals: [],
                  metadata: {}
                },
                body: {
                  type: "BinaryOperation",
                  operator: ">",
                  left: { type: "UserIdentifier", name: "y" },
                  right: { type: "Number", value: "3" }
                }
              },
            },
          },
        ]);
      });

      test("pipe with system function", () => {
        const ast = parseCode("[1, 2, 3] |> SUM;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Pipe",
              left: {
                type: "Array",
                elements: [
                  { type: "Number", value: "1" },
                  { type: "Number", value: "2" },
                  { type: "Number", value: "3" }
                ]
              },
              right: {
                type: "SystemIdentifier",
                name: "SUM",
                systemInfo: { type: "identifier" }
              },
            },
          },
        ]);
      });
    });

    describe("Grouping", () => {
      test("parentheses override precedence", () => {
        const ast = parseCode("(2 + 3) * 4;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "BinaryOperation",
              operator: "*",
              left: {
                type: "Grouping",
                expression: {
                  type: "BinaryOperation",
                  operator: "+",
                  left: { type: "Number", value: "2" },
                  right: { type: "Number", value: "3" },
                },
              },
              right: { type: "Number", value: "4" },
            },
          },
        ]);
      });
    });

    describe("Tuples", () => {
      test("empty tuple", () => {
        const ast = parseCode("();");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Tuple",
              elements: [],
            },
          },
        ]);
      });

      test("single element without comma is grouped expression", () => {
        const ast = parseCode("(3);");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Grouping",
              expression: { type: "Number", value: "3" },
            },
          },
        ]);
      });

      test("singleton tuple with trailing comma", () => {
        const ast = parseCode("(3,);");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Tuple",
              elements: [{ type: "Number", value: "3" }],
            },
          },
        ]);
      });

      test("two-element tuple", () => {
        const ast = parseCode("(3, 4);");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Tuple",
              elements: [
                { type: "Number", value: "3" },
                { type: "Number", value: "4" },
              ],
            },
          },
        ]);
      });

      test("three-element tuple", () => {
        const ast = parseCode("(a, b, c);");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Tuple",
              elements: [
                { type: "UserIdentifier", name: "a" },
                { type: "UserIdentifier", name: "b" },
                { type: "UserIdentifier", name: "c" },
              ],
            },
          },
        ]);
      });

      test("tuple with underscore as null", () => {
        const ast = parseCode("(3, _, 2);");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Tuple",
              elements: [
                { type: "Number", value: "3" },
                { type: "NULL" },
                { type: "Number", value: "2" },
              ],
            },
          },
        ]);
      });

      test("tuple with multiple underscores", () => {
        const ast = parseCode("(_, 5, _);");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Tuple",
              elements: [
                { type: "NULL" },
                { type: "Number", value: "5" },
                { type: "NULL" },
              ],
            },
          },
        ]);
      });

      test("tuple with expressions", () => {
        const ast = parseCode("(a + b, x * y);");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Tuple",
              elements: [
                {
                  type: "BinaryOperation",
                  operator: "+",
                  left: { type: "UserIdentifier", name: "a" },
                  right: { type: "UserIdentifier", name: "b" },
                },
                {
                  type: "BinaryOperation",
                  operator: "*",
                  left: { type: "UserIdentifier", name: "x" },
                  right: { type: "UserIdentifier", name: "y" },
                },
              ],
            },
          },
        ]);
      });

      test("nested tuple", () => {
        const ast = parseCode("((1, 2), (3, 4));");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Tuple",
              elements: [
                {
                  type: "Tuple",
                  elements: [
                    { type: "Number", value: "1" },
                    { type: "Number", value: "2" },
                  ],
                },
                {
                  type: "Tuple",
                  elements: [
                    { type: "Number", value: "3" },
                    { type: "Number", value: "4" },
                  ],
                },
              ],
            },
          },
        ]);
      });

      test("tuple with trailing comma", () => {
        const ast = parseCode("(1, 2, 3,);");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Tuple",
              elements: [
                { type: "Number", value: "1" },
                { type: "Number", value: "2" },
                { type: "Number", value: "3" },
              ],
            },
          },
        ]);
      });

      test("consecutive commas should throw error", () => {
        expect(() => parseCode("(3,, 2);")).toThrow(
          /Consecutive commas not allowed in tuples/
        );
      });

      test("underscore is always null symbol", () => {
        const ast = parseCode("_ := 5;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "BinaryOperation",
              operator: ":=",
              left: { type: "NULL" },
              right: { type: "Number", value: "5" },
            },
          },
        ]);
      });
    });

    describe("Number and string preservation", () => {
      test("preserves number formats", () => {
        const ast = parseCode("3.14;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: { type: "Number", value: "3.14" },
          },
        ]);
      });

      test("preserves string types", () => {
        const ast = parseCode('"hello";');
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "String",
              value: "hello",
              kind: "quote",
            },
          },
        ]);
      });
    });

    describe("Multiple elements", () => {
      test("multiple elements with semicolons", () => {
        const ast = parseCode("x := 5; y := 10;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "BinaryOperation",
              operator: ":=",
              left: { type: "UserIdentifier", name: "x" },
              right: { type: "Number", value: "5" },
            },
          },
          {
            type: "Statement",
            expression: {
              type: "BinaryOperation",
              operator: ":=",
              left: { type: "UserIdentifier", name: "y" },
              right: { type: "Number", value: "10" },
            },
          },
        ]);
      });
    });

    describe("Metadata and Property Annotations", () => {
      test("simple metadata annotation", () => {
        const ast = parseCode('[obj, name := "foo"];');
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "WithMetadata",
              primary: { type: "UserIdentifier", name: "obj" },
              metadata: {
                name: { type: "String", value: "foo", kind: "quote" },
              },
            },
          },
        ]);
      });

      test("multiple metadata annotations", () => {
        const ast = parseCode(
          '[obj, name := "foo", version := 1.2, active := true];',
        );
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "WithMetadata",
              primary: { type: "UserIdentifier", name: "obj" },
              metadata: {
                name: { type: "String", value: "foo", kind: "quote" },
                version: { type: "Number", value: "1.2" },
                active: { type: "UserIdentifier", name: "true" },
              },
            },
          },
        ]);
      });

      test("metadata with expression values", () => {
        const ast = parseCode("[data, size := 2 + 3, factor := x * y];");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "WithMetadata",
              primary: { type: "UserIdentifier", name: "data" },
              metadata: {
                size: {
                  type: "BinaryOperation",
                  operator: "+",
                  left: { type: "Number", value: "2" },
                  right: { type: "Number", value: "3" },
                },
                factor: {
                  type: "BinaryOperation",
                  operator: "*",
                  left: { type: "UserIdentifier", name: "x" },
                  right: { type: "UserIdentifier", name: "y" },
                },
              },
            },
          },
        ]);
      });

      test("metadata with system identifier keys", () => {
        const ast = parseCode("[matrix, ROWS := 3, COLS := 4];");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "WithMetadata",
              primary: { type: "UserIdentifier", name: "matrix" },
              metadata: {
                ROWS: { type: "Number", value: "3" },
                COLS: { type: "Number", value: "4" },
              },
            },
          },
        ]);
      });

      test("metadata with string keys", () => {
        const ast = parseCode(
          '[obj, "display-name" := "My Object", "created-at" := timestamp];',
        );
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "WithMetadata",
              primary: { type: "UserIdentifier", name: "obj" },
              metadata: {
                "display-name": {
                  type: "String",
                  value: "My Object",
                  kind: "quote",
                },
                "created-at": { type: "UserIdentifier", name: "timestamp" },
              },
            },
          },
        ]);
      });

      test("metadata only (no primary element)", () => {
        const ast = parseCode('[name := "config", version := 2];');
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "WithMetadata",
              primary: {
                type: "Array",
                elements: [],
              },
              metadata: {
                name: { type: "String", value: "config", kind: "quote" },
                version: { type: "Number", value: "2" },
              },
            },
          },
        ]);
      });

      test("array as primary element with metadata", () => {
        const ast = parseCode('[[1, 2, 3], name := "numbers", count := 3];');
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "WithMetadata",
              primary: {
                type: "Array",
                elements: [
                  { type: "Number", value: "1" },
                  { type: "Number", value: "2" },
                  { type: "Number", value: "3" },
                ],
              },
              metadata: {
                name: { type: "String", value: "numbers", kind: "quote" },
                count: { type: "Number", value: "3" },
              },
            },
          },
        ]);
      });

      test("regular array without metadata still works", () => {
        const ast = parseCode("[1, 2, 3];");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "Array",
              elements: [
                { type: "Number", value: "1" },
                { type: "Number", value: "2" },
                { type: "Number", value: "3" },
              ],
            },
          },
        ]);
      });
    });

    describe("Comments", () => {
      test("line comment only", () => {
        const ast = parseCode("## This is a common line comment");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Comment",
            value: " This is a common line comment",
            kind: "comment",
          },
        ]);
      });

      test("block comment only", () => {
        const ast = parseCode("/* This is a block comment */");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Comment",
            value: " This is a block comment ",
            kind: "comment",
          },
        ]);
      });

      test("nested block comment", () => {
        const ast = parseCode("/**hi /* argh */ whatever**/");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Comment",
            value: "hi /* argh */ whatever",
            kind: "comment",
          },
        ]);
      });

      test("comment before expression", () => {
        const ast = parseCode("## Calculate sum\n2 + 3");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Comment",
            value: " Calculate sum",
            kind: "comment",
          },
          {
            type: "BinaryOperation",
            operator: "+",
            left: { type: "Number", value: "2" },
            right: { type: "Number", value: "3" },
          },
        ]);
      });

      test("simple expression with trailing comment", () => {
        const ast = parseCode("5\n## This is a comment");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Number",
            value: "5",
          },
          {
            type: "Comment",
            value: " This is a comment",
            kind: "comment",
          },
        ]);
      });

      test("multiple standalone comments", () => {
        const ast = parseCode("## First comment\n## Second comment");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Comment",
            value: " First comment",
            kind: "comment",
          },
          {
            type: "Comment",
            value: " Second comment",
            kind: "comment",
          },
        ]);
      });

      test("comment between numbers", () => {
        // With implicit multiplication, 5 ## comment ## 10 becomes 5 * 10
        // (the comment is skipped during parsing, but preserved in AST)
        const ast = parseCode("5\n## comment\n10");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "ImplicitMultiplication",
            left: {
              type: "Number",
              value: "5",
            },
            right: {
              type: "Number",
              value: "10",
            },
          },
          {
            type: "Comment",
            value: " comment",
            kind: "comment",
          },
        ]);
      });

      test("tag-based multi-line comment", () => {
        const ast = parseCode("##TAG## some nested /* comment */ ##TAG##");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Comment",
            value: " some nested /* comment */ ",
            kind: "comment",
          },
        ]);
      });

      test("multiline block comment", () => {
        const ast = parseCode("/* This is a\n   multiline\n   comment */");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Comment",
            value: " This is a\n   multiline\n   comment ",
            kind: "comment",
          },
        ]);
      });

      test("comment with special characters", () => {
        const ast = parseCode("## Comment with symbols: +*-/=<>{}[]()");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Comment",
            value: " Comment with symbols: +*-/=<>{}[]()",
            kind: "comment",
          },
        ]);
      });

      test("empty line comment", () => {
        const ast = parseCode("##");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Comment",
            value: "",
            kind: "comment",
          },
        ]);
      });

      test("empty block comment", () => {
        const ast = parseCode("/* */");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Comment",
            value: " ",
            kind: "comment",
          },
        ]);
      });

      test("comment with statement terminator", () => {
        const ast = parseCode("x := 5; ## assignment comment");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "BinaryOperation",
              operator: ":=",
              left: { type: "UserIdentifier", name: "x" },
              right: { type: "Number", value: "5" },
            },
          },
          {
            type: "Comment",
            value: " assignment comment",
            kind: "comment",
          },
        ]);
      });
    });

    describe("Error handling", () => {
      test("unmatched parenthesis throws error", () => {
        expect(() => parseCode("(2 + 3;")).toThrow(
          /Expected parameter name|Expected closing parenthesis/,
        );
      });

      test("unmatched bracket throws error", () => {
        expect(() => parseCode("[1, 2;")).toThrow(/Expected closing bracket/);
      });

      test("unmatched brace throws error", () => {
        expect(() => parseCode("{ a, b;")).toThrow(/Expected closing brace/);
      });

      test("invalid metadata key throws error", () => {
        expect(() => parseCode('[obj, (x + y) := "invalid"];')).toThrow(
          /Metadata key must be an identifier or string/,
        );
      });

      test("mixed array elements with metadata throws error", () => {
        expect(() => parseCode('[1, 2, 3, name := "invalid"];')).toThrow(
          /Cannot mix array elements with metadata/,
        );
      });

      test("matrix with metadata throws error", () => {
        expect(() => parseCode('[matrix, type := "sparse"; 1, 2];')).toThrow(
          /Cannot mix matrix\/tensor syntax with metadata/,
        );
      });

      test("tensor with metadata throws error", () => {
        expect(() => parseCode("[1, 2; 3, 4, key := value];")).toThrow(
          /Cannot mix matrix\/tensor syntax with metadata/,
        );
      });

      test("nested array with multiple elements works correctly", () => {
        const ast = parseCode('[[1, 2, 3, 4, 5], name := "numbers", size := 5];');
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "WithMetadata",
              primary: {
                type: "Array",
                elements: [
                  { type: "Number", value: "1" },
                  { type: "Number", value: "2" },
                  { type: "Number", value: "3" },
                  { type: "Number", value: "4" },
                  { type: "Number", value: "5" },
                ],
              },
              metadata: {
                name: { type: "String", value: "numbers", kind: "quote" },
                size: { type: "Number", value: "5" },
              },
            },
          },
        ]);
      });
    });

    describe("Embedded Languages", () => {
      test("polynomial with context", () => {
        const ast = parseCode("`P(x):x^2 + 3x + 5`;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "EmbeddedLanguage",
              language: "P",
              context: "x",
              body: "x^2 + 3x + 5"
            }
          }
        ]);
      });

      test("fraction without context", () => {
        const ast = parseCode("`F:6/8`;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "EmbeddedLanguage",
              language: "F",
              context: null,
              body: "6/8"
            }
          }
        ]);
      });

      test("javascript with multiple parameters", () => {
        const ast = parseCode("`JS(a, b): a[b] `;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "EmbeddedLanguage",
              language: "JS",
              context: "a, b",
              body: " a[b] "
            }
          }
        ]);
      });

      test("nested backticks", () => {
        const ast = parseCode("``RiX: `F:5/3` + `F:7/8` ``;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "EmbeddedLanguage",
              language: "RiX",
              context: null,
              body: " `F:5/3` + `F:7/8` "
            }
          }
        ]);
      });

      test("no colon - RiX-String", () => {
        const ast = parseCode("`NoColon`;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "EmbeddedLanguage",
              language: "RiX-String",
              context: null,
              body: "NoColon"
            }
          }
        ]);
      });

      test("empty context parentheses", () => {
        const ast = parseCode("`SQL():SELECT * FROM users`;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "EmbeddedLanguage",
              language: "SQL",
              context: "",
              body: "SELECT * FROM users"
            }
          }
        ]);
      });

      test("complex context with spaces", () => {
        const ast = parseCode("`Matrix(3, 4): [[1, 2], [3, 4]] `;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "EmbeddedLanguage",
              language: "Matrix",
              context: "3, 4",
              body: " [[1, 2], [3, 4]] "
            }
          }
        ]);
      });

      test("triple backticks", () => {
        const ast = parseCode("```Code: `hello` and ``world`` ```;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "EmbeddedLanguage",
              language: "Code",
              context: null,
              body: " `hello` and ``world`` "
            }
          }
        ]);
      });

      test("starts with colon - RiX-String", () => {
        const ast = parseCode("`:starts with colon`;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "EmbeddedLanguage",
              language: "RiX-String",
              context: null,
              body: "starts with colon"
            }
          }
        ]);
      });

      test("context with colons", () => {
        const ast = parseCode("`JS(a, b: string, c): a + b`;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "EmbeddedLanguage",
              language: "JS",
              context: "a, b: string, c",
              body: " a + b"
            }
          }
        ]);
      });

      test("nested parentheses in context", () => {
        const ast = parseCode("`Matrix(size(3, 4)): data`;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "EmbeddedLanguage",
              language: "Matrix",
              context: "size(3, 4)",
              body: " data"
            }
          }
        ]);
      });

      test("malformed parentheses throws error", () => {
        expect(() => {
          parseCode("`Function(a, b)(extra): body`;");
        }).toThrow("Invalid embedded language header format. Expected: LANGUAGE(CONTEXT):BODY");
      });

      test("unmatched opening parenthesis throws error", () => {
        expect(() => {
          parseCode("`Malformed(: broken`;");
        }).toThrow("Unmatched opening parenthesis in embedded language header");
      });

      test("unmatched closing parenthesis throws error", () => {
        expect(() => {
          parseCode("`Missing): body`;");
        }).toThrow("Unmatched closing parenthesis in embedded language header");
      });

      test("space before colon", () => {
        const ast = parseCode("`P (x):x^2 + 3x + 5`;");
        expect(stripMetadata(ast)).toEqual([
          {
            type: "Statement",
            expression: {
              type: "EmbeddedLanguage",
              language: "P",
              context: "x",
              body: "x^2 + 3x + 5"
            }
          }
        ]);
      });
    });

    describe("Position information", () => {
      test("all nodes have position information", () => {
        const ast = parseCode("x + y;");

        function checkPositions(node) {
          expect(node).toHaveProperty("pos");
          expect(Array.isArray(node.pos)).toBe(true);
          expect(node.pos).toHaveLength(3);
          expect(node).toHaveProperty("original");

          // Check child nodes
          Object.values(node).forEach((value) => {
            if (Array.isArray(value)) {
              value.forEach((item) => {
                if (item && typeof item === "object" && item.type) {
                  checkPositions(item);
                }
              });
            } else if (value && typeof value === "object" && value.type) {
              checkPositions(value);
            }
          });
        }

        ast.forEach(checkPositions);
      });
    });

    describe('Symbolic Calculus', () => {
      test('simple derivative function', () => {
        const ast = parseCode("f'");
        expect(stripMetadata(ast)).toEqual([{
          type: 'Derivative',
          function: { type: 'UserIdentifier', name: 'f' },
          order: 1,
          variables: null,
          evaluation: null,
          operations: null
        }]);
      });

      test('derivative evaluated at point', () => {
        const ast = parseCode("f'(x)");
        expect(stripMetadata(ast)).toEqual([{
          type: 'Derivative',
          function: { type: 'UserIdentifier', name: 'f' },
          order: 1,
          variables: null,
          evaluation: [{ type: 'UserIdentifier', name: 'x' }],
          operations: null
        }]);
      });

      test('second derivative', () => {
        const ast = parseCode("f''");
        expect(stripMetadata(ast)).toEqual([{
          type: 'Derivative',
          function: { type: 'UserIdentifier', name: 'f' },
          order: 2,
          variables: null,
          evaluation: null,
          operations: null
        }]);
      });

      test('derivative with variable specification', () => {
        const ast = parseCode("f'[x,y]");
        expect(stripMetadata(ast)).toEqual([{
          type: 'Derivative',
          function: { type: 'UserIdentifier', name: 'f' },
          order: 1,
          variables: [
            { name: 'x' },
            { name: 'y' }
          ],
          evaluation: null,
          operations: null
        }]);
      });

      test('simple indefinite integral', () => {
        const ast = parseCode("'f");
        expect(stripMetadata(ast)).toEqual([{
          type: 'Integral',
          function: { type: 'UserIdentifier', name: 'f' },
          order: 1,
          variables: null,
          evaluation: null,
          operations: null,
          metadata: { integrationConstant: 'c', defaultValue: 0 }
        }]);
      });

      test('integral evaluated at point', () => {
        const ast = parseCode("'f(x)");
        expect(stripMetadata(ast)).toEqual([{
          type: 'Integral',
          function: { type: 'UserIdentifier', name: 'f' },
          order: 1,
          variables: null,
          evaluation: [{ type: 'UserIdentifier', name: 'x' }],
          operations: null,
          metadata: { integrationConstant: 'c', defaultValue: 0 }
        }]);
      });

      test('double integral', () => {
        const ast = parseCode("''f");
        expect(stripMetadata(ast)).toEqual([{
          type: 'Integral',
          function: { type: 'UserIdentifier', name: 'f' },
          order: 2,
          variables: null,
          evaluation: null,
          operations: null,
          metadata: { integrationConstant: 'c', defaultValue: 0 }
        }]);
      });

      test('integral with variable specification', () => {
        const ast = parseCode("'f[x,y]");
        expect(stripMetadata(ast)).toEqual([{
          type: 'Integral',
          function: { type: 'UserIdentifier', name: 'f' },
          order: 1,
          variables: [
            { name: 'x' },
            { name: 'y' }
          ],
          evaluation: null,
          operations: null,
          metadata: { integrationConstant: 'c', defaultValue: 0 }
        }]);
      });

      test('mixed calculus operations - integrate then differentiate', () => {
        const ast = parseCode("'f'[x,y]('x,y')");
        expect(stripMetadata(ast)).toEqual([{
          type: 'Derivative',
          function: {
            type: 'Integral',
            function: { type: 'UserIdentifier', name: 'f' },
            order: 1,
            variables: null,
            evaluation: null,
            operations: null,
            metadata: { integrationConstant: 'c', defaultValue: 0 }
          },
          order: 1,
          variables: [
            { name: 'x' },
            { name: 'y' }
          ],
          evaluation: null,
          operations: [
            {
              type: 'Integral',
              function: { type: 'UserIdentifier', name: 'x' },
              order: 1,
              variables: null,
              evaluation: null,
              operations: null,
              metadata: { integrationConstant: 'c', defaultValue: 0 }
            },
            {
              type: 'Derivative',
              function: { type: 'UserIdentifier', name: 'y' },
              order: 1,
              variables: null,
              evaluation: null,
              operations: null
            }
          ]
        }]);
      });

      test('function call with derivative', () => {
        const ast = parseCode("SIN(x)'");
        expect(stripMetadata(ast)).toEqual([{
          type: 'Derivative',
          function: {
            type: 'FunctionCall',
            function: {
              type: 'SystemIdentifier',
              name: 'SIN',
              systemInfo: { type: 'function', arity: 1 }
            },
            arguments: {
              positional: [{ type: 'UserIdentifier', name: 'x' }],
              keyword: {}
            }
          },
          order: 1,
          variables: null,
          evaluation: null,
          operations: null
        }]);
      });

      test('derivative operation vs evaluation distinction', () => {
        // f'(x') should be operation, not evaluation
        const ast = parseCode("f'(x')");
        expect(stripMetadata(ast)).toEqual([{
          type: 'Derivative',
          function: { type: 'UserIdentifier', name: 'f' },
          order: 1,
          variables: null,
          evaluation: null,
          operations: [{
            type: 'Derivative',
            function: { type: 'UserIdentifier', name: 'x' },
            order: 1,
            variables: null,
            evaluation: null,
            operations: null
          }]
        }]);
      });
    });

    describe('Interval Manipulation', () => {
      describe('Basic Intervals', () => {
        test('simple interval creation', () => {
          const ast = parseCode('1:10;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'Number',
              value: '1:10'
            }
          }]);
        });

        test('decimal intervals', () => {
          const ast = parseCode('1.5:10.7;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'Number',
              value: '1.5:10.7'
            }
          }]);
        });
      });

      describe('Interval Stepping', () => {
        test('increment stepping', () => {
          const ast = parseCode('1:10 :+ 2;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalStepping',
              interval: {
                type: 'Number',
                value: '1:10'
              },
              step: { type: 'Number', value: '2' }
            }
          }]);
        });

        test('decrement stepping', () => {
          const ast = parseCode('10:1 :+ -3;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalStepping',
              interval: {
                type: 'Number',
                value: '10:1'
              },
              step: { type: 'Number', value: '-3' }
            }
          }]);
        });
      });

      describe('Interval Division', () => {
        test('equally spaced points', () => {
          const ast = parseCode('1:5::3;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalDivision',
              interval: {
                type: 'Number',
                value: '1:5'
              },
              count: { type: 'Number', value: '3' },
              type: 'equally_spaced'
            }
          }]);
        });

        test('partition into sub-intervals', () => {
          const ast = parseCode('1:5:/:2;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalPartition',
              interval: {
                type: 'Number',
                value: '1:5'
              },
              count: { type: 'Number', value: '2' }
            }
          }]);
        });
      });

      describe('Interval Mediants', () => {
        test('mediant calculation', () => {
          const ast = parseCode('1:2:~2;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalMediants',
              interval: {
                type: 'Number',
                value: '1:2'
              },
              levels: { type: 'Number', value: '2' }
            }
          }]);
        });

        test('mediant partition', () => {
          const ast = parseCode('1:2:~/2;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalMediantPartition',
              interval: {
                type: 'Number',
                value: '1:2'
              },
              levels: { type: 'Number', value: '2' }
            }
          }]);
        });

        test('colon semantic type after mediant operator points to ~: conversion', () => {
          expect(() => parseCode('7 :~ :Float;')).toThrow("For semantic conversion, use '~:'");
          expect(() => parseCode('7 :~/ :Float;')).toThrow("For semantic conversion, use '~:'");
        });
      });

      describe('Random Selection and Partitioning', () => {
        test('random point selection with count only', () => {
          const ast = parseCode('1:10:%3;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalRandom',
              interval: {
                type: 'Number',
                value: '1:10'
              },
              parameters: { type: 'Number', value: '3' }
            }
          }]);
        });

        test('random point selection with tuple parameters', () => {
          const ast = parseCode('1:10:%(3, 1);');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalRandom',
              interval: {
                type: 'Number',
                value: '1:10'
              },
              parameters: {
                type: 'Tuple',
                elements: [
                  { type: 'Number', value: '3' },
                  { type: 'Number', value: '1' }
                ]
              }
            }
          }]);
        });

        test('random partition', () => {
          const ast = parseCode('1:10:/%3;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalRandomPartition',
              interval: {
                type: 'Number',
                value: '1:10'
              },
              count: { type: 'Number', value: '3' }
            }
          }]);
        });
      });

      describe('Infinite Ranges', () => {
        test('infinite increment sequence', () => {
          const ast = parseCode('5::+2;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'InfiniteSequence',
              start: { type: 'Number', value: '5' },
              step: { type: 'Number', value: '2' }
            }
          }]);
        });

        test('infinite decrement sequence', () => {
          const ast = parseCode('10::+ -3;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'InfiniteSequence',
              start: { type: 'Number', value: '10' },
              step: { type: 'Number', value: '-3' }
            }
          }]);
        });
      });

      describe('Complex Interval Operations', () => {
        test('chained interval operations', () => {
          const ast = parseCode('1:10 :+ 2 :/%3;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalRandomPartition',
              interval: {
                type: 'IntervalStepping',
                interval: {
                  type: 'Number',
                  value: '1:10'
                },
                step: { type: 'Number', value: '2' }
              },
              count: { type: 'Number', value: '3' }
            }
          }]);
        });

        test('interval with variable bounds', () => {
          const ast = parseCode('a:b :+ n;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalStepping',
              interval: {
                type: 'BinaryOperation',
                operator: ':',
                left: { type: 'UserIdentifier', name: 'a' },
                right: { type: 'UserIdentifier', name: 'b' }
              },
              step: { type: 'UserIdentifier', name: 'n' }
            }
          }]);
        });

        test('interval with expression bounds', () => {
          const ast = parseCode('(x+1):(y*2) :: count;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalDivision',
              interval: {
                type: 'BinaryOperation',
                operator: ':',
                left: {
                  type: 'Grouping',
                  expression: {
                    type: 'BinaryOperation',
                    operator: '+',
                    left: { type: 'UserIdentifier', name: 'x' },
                    right: { type: 'Number', value: '1' }
                  }
                },
                right: {
                  type: 'Grouping',
                  expression: {
                    type: 'BinaryOperation',
                    operator: '*',
                    left: { type: 'UserIdentifier', name: 'y' },
                    right: { type: 'Number', value: '2' }
                  }
                }
              },
              count: { type: 'UserIdentifier', name: 'count' },
              type: 'equally_spaced'
            }
          }]);
        });
      });

      describe('Interval Operators with Identifiers', () => {
        test('stepping with identifier interval', () => {
          const ast = parseCode('a :+ 3;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalStepping',
              interval: { type: 'UserIdentifier', name: 'a' },
              step: { type: 'Number', value: '3' }
            }
          }]);
        });

        test('division with identifier interval', () => {
          const ast = parseCode('myinterval::5;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalDivision',
              interval: { type: 'UserIdentifier', name: 'myinterval' },
              count: { type: 'Number', value: '5' },
              type: 'equally_spaced'
            }
          }]);
        });

        test('partition with identifier interval', () => {
          const ast = parseCode('range:/:4;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalPartition',
              interval: { type: 'UserIdentifier', name: 'range' },
              count: { type: 'Number', value: '4' }
            }
          }]);
        });

        test('mediants with identifier interval', () => {
          const ast = parseCode('bounds:~2;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalMediants',
              interval: { type: 'UserIdentifier', name: 'bounds' },
              levels: { type: 'Number', value: '2' }
            }
          }]);
        });

        test('random selection with identifier interval', () => {
          const ast = parseCode('datarange:%10;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'IntervalRandom',
              interval: { type: 'UserIdentifier', name: 'datarange' },
              parameters: { type: 'Number', value: '10' }
            }
          }]);
        });

        test('infinite sequence with identifier start', () => {
          const ast = parseCode('start::+step;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'InfiniteSequence',
              start: { type: 'UserIdentifier', name: 'start' },
              step: { type: 'UserIdentifier', name: 'step' }
            }
          }]);
        });

        test('infinite sequence with negative step identifier', () => {
          const ast = parseCode('start::+ -step;');
          expect(stripMetadata(ast)).toEqual([{
            type: 'Statement',
            expression: {
              type: 'InfiniteSequence',
              start: { type: 'UserIdentifier', name: 'start' },
              step: { type: 'UnaryOperation', operator: '-', operand: { type: 'UserIdentifier', name: 'step' } }
            }
          }]);
        });
      });
    });
  });

  describe('Self reference', () => {
    test('bare $ parses as SelfRef', () => {
      const ast = parseCode('$;');
      expect(stripMetadata(ast)).toEqual([
        {
          type: 'Statement',
          expression: { type: 'SelfRef' }
        }
      ]);
    });

    test('$(...) parses as a call on SelfRef', () => {
      const ast = parseCode('f := x -> $(x - 1);');
      expect(stripMetadata(ast)[0].expression.right.body).toEqual({
        type: 'Call',
        target: { type: 'SelfRef' },
        arguments: {
          positional: [
            {
              type: 'BinaryOperation',
              operator: '-',
              left: { type: 'UserIdentifier', name: 'x' },
              right: { type: 'Number', value: '1' }
            }
          ],
          keyword: {}
        }
      });
    });

    test('$.prop and $.. use the ordinary meta access nodes', () => {
      const ast = parseCode('f := x -> ($.label, $..);');
      const body = stripMetadata(ast)[0].expression.right.body;
      expect(body).toEqual({
        type: 'Tuple',
        elements: [
          {
            type: 'DotAccess',
            object: { type: 'SelfRef' },
            property: 'label'
          },
          {
            type: 'ExternalAccess',
            object: { type: 'SelfRef' },
            property: null
          }
        ]
      });
    });
  });

  describe("Constructor capture syntax", () => {
    test("{.. 1, 2, 3 } parses as ArrayContainer", () => {
      const ast = stripMetadata(parseCode("{.. 1, 2, 3 };"))[0].expression;
      expect(ast.type).toBe("ArrayContainer");
      expect(ast.elements).toHaveLength(3);
    });

    test("{= /::=/ a = x, b == y } records constructor and entry capture modes", () => {
      const ast = stripMetadata(parseCode("{= /::=/ a = x, b == y };"))[0].expression;
      expect(ast.type).toBe("MapContainer");
      expect(ast.header.captureMode).toBe("deep_copy");
      expect(ast.elements[0]).toEqual({
        type: "MapEntry",
        key: { type: "UserIdentifier", name: "a" },
        value: { type: "UserIdentifier", name: "x" },
        captureMode: null,
      });
      expect(ast.elements[1]).toEqual({
        type: "MapEntry",
        key: { type: "UserIdentifier", name: "b" },
        value: { type: "UserIdentifier", name: "y" },
        captureMode: "alias",
      });
    });

    test("{:2x2: /::=/ a, b; c, d } parses as TensorLiteral with capture mode", () => {
      const ast = stripMetadata(parseCode("{:2x2: /::=/ a, b; c, d };"))[0].expression;
      expect(ast.type).toBe("TensorLiteral");
      expect(ast.header.captureMode).toBe("deep_copy");
      expect(ast.shape).toEqual([2, 2]);
    });

    test("{^ /#x ::Length :meters/ 7 } parses as ValueOutfit with header", () => {
      const ast = stripMetadata(parseCode("{^ /#x ::Length :meters/ 7 };"))[0].expression;
      expect(ast.type).toBe("ValueOutfit");
      expect(ast.header).toEqual({
        type: "SemanticHeader",
        captureMode: null,
        name: "x",
        typeName: "Length",
        traits: [
          { type: "HeaderTrait", name: "meters", checkMode: null, order: 0 },
        ],
      });
    });

    test("x ? :rational parses as SemanticHas", () => {
      const ast = stripMetadata(parseCode("x ? :rational;"))[0].expression;
      expect(ast).toEqual({
        type: "SemanticHas",
        expression: { type: "UserIdentifier", name: "x" },
        name: "rational",
      });
    });

    test("x ? y remains a normal membership BinaryOperation", () => {
      const ast = stripMetadata(parseCode("x ? y;"))[0].expression;
      expect(ast).toEqual({
        type: "BinaryOperation",
        operator: "?",
        left: { type: "UserIdentifier", name: "x" },
        right: { type: "UserIdentifier", name: "y" },
      });
    });

    test("x ~: :rational parses as SemanticConvertSoft", () => {
      const ast = stripMetadata(parseCode("x ~: :rational;"))[0].expression;
      expect(ast).toEqual({
        type: "SemanticConvertSoft",
        expression: { type: "UserIdentifier", name: "x" },
        typeName: "rational",
      });
    });

    test("x ~!: :rational parses as SemanticConvertStrict", () => {
      const ast = stripMetadata(parseCode("x ~!: :rational;"))[0].expression;
      expect(ast).toEqual({
        type: "SemanticConvertStrict",
        expression: { type: "UserIdentifier", name: "x" },
        typeName: "rational",
      });
    });

    test("semantic conversion rejects non-colon targets", () => {
      expect(() => parseCode("x ~: y;")).toThrow("Semantic conversion target must be a colon-string like :rational after '~:'");
      expect(() => parseCode("x ~!: y;")).toThrow("Semantic conversion target must be a colon-string like :rational after '~!:'");
    });
  });

  describe("Destructuring assignment", () => {
    test("array destructuring parses explicit target nodes", () => {
      const ast = stripMetadata(parseCode("[a, :=b, ...rest] := src;"))[0].expression;
      expect(ast).toEqual({
        type: "BinaryOperation",
        operator: ":=",
        left: {
          type: "DestructureArrayPattern",
          entries: [
            { type: "DestructureVariableTarget", name: "a" },
            {
              type: "DestructureBindingModeTarget",
              bindingMode: "copy",
              target: { type: "DestructureVariableTarget", name: "b" },
            },
          ],
          rest: {
            type: "DestructureRestTarget",
            target: { type: "DestructureVariableTarget", name: "rest" },
          },
        },
        right: { type: "UserIdentifier", name: "src" },
      });
    });

    test("map destructuring parses rename and nested entries", () => {
      const ast = stripMetadata(parseCode("{= b[:a], [:x] = [u, v], pair[:p] = [m, n] } = src;"))[0].expression;
      expect(ast.left.type).toBe("DestructureMapPattern");
      expect(ast.left.entries).toEqual([
        {
          type: "DestructureMapEntry",
          sourceKey: { type: "String", value: "a", kind: "colon" },
          wholeTarget: { type: "DestructureVariableTarget", name: "b" },
          nestedTarget: null,
        },
        {
          type: "DestructureMapEntry",
          sourceKey: { type: "String", value: "x", kind: "colon" },
          wholeTarget: null,
          nestedTarget: {
            type: "DestructureArrayPattern",
            entries: [
              { type: "DestructureVariableTarget", name: "u" },
              { type: "DestructureVariableTarget", name: "v" },
            ],
            rest: null,
          },
        },
        {
          type: "DestructureMapEntry",
          sourceKey: { type: "String", value: "p", kind: "colon" },
          wholeTarget: { type: "DestructureVariableTarget", name: "pair" },
          nestedTarget: {
            type: "DestructureArrayPattern",
            entries: [
              { type: "DestructureVariableTarget", name: "m" },
              { type: "DestructureVariableTarget", name: "n" },
            ],
            rest: null,
          },
        },
      ]);
    });

    test("tensor destructuring accepts nested row arrays", () => {
      const ast = stripMetadata(parseCode("{:2x2: [a, b], [c, d]} = m;"))[0].expression;
      expect(ast.left).toEqual({
        type: "DestructureTensorPattern",
        shape: [2, 2],
        rows: [
          [
            { type: "DestructureVariableTarget", name: "a" },
            { type: "DestructureVariableTarget", name: "b" },
          ],
          [
            { type: "DestructureVariableTarget", name: "c" },
            { type: "DestructureVariableTarget", name: "d" },
          ],
        ],
      });
    });

    test("indexed destructuring parses selector targets", () => {
      const ast = stripMetadata(parseCode("[a[1:3], b[2], [2:4] = [x, y]] = src;"))[0].expression;
      expect(ast.left).toEqual({
        type: "DestructureArrayPattern",
        entries: [
          {
            type: "DestructureIndexedTarget",
            wholeTarget: { type: "DestructureVariableTarget", name: "a" },
            specs: [
              {
                type: "SliceSpec",
                start: { type: "Number", value: "1" },
                end: { type: "Number", value: "3" },
              },
            ],
            nestedTarget: null,
          },
          {
            type: "DestructureIndexedTarget",
            wholeTarget: { type: "DestructureVariableTarget", name: "b" },
            specs: [{ type: "Number", value: "2" }],
            nestedTarget: null,
          },
          {
            type: "DestructureIndexedTarget",
            wholeTarget: null,
            specs: [
              {
                type: "SliceSpec",
                start: { type: "Number", value: "2" },
                end: { type: "Number", value: "4" },
              },
            ],
            nestedTarget: {
              type: "DestructureArrayPattern",
              entries: [
                { type: "DestructureVariableTarget", name: "x" },
                { type: "DestructureVariableTarget", name: "y" },
              ],
              rest: null,
            },
          },
        ],
        rest: null,
      });
    });

    test("tensor selector alias parses through destructuring instead of tensor literal rules", () => {
      const ast = stripMetadata(parseCode("{=:2x3: row2[2, 1:3]} = src;"))[0].expression;
      expect(ast.left).toEqual({
        type: "DestructureArrayPattern",
        entries: [
          {
            type: "DestructureIndexedTarget",
            wholeTarget: { type: "DestructureVariableTarget", name: "row2" },
            specs: [
              { type: "Number", value: "2" },
              { type: "Number", value: "1:3" },
            ],
            nestedTarget: null,
          },
        ],
        rest: null,
      });
    });
  });
});
