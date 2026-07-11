import { tokenize } from "../../src/parser/tokenizer.js";
import { parse } from "../../src/parser/parser.js";

// Test system lookup function
function testSystemLookup(name) {
  const systemSymbols = {
    PI: { type: "constant", value: Math.PI },
    E: { type: "constant", value: Math.E },
    SIN: { type: "function", arity: 1 },
    COS: { type: "function", arity: 1 },
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
    const { pos, original, ...rest } = obj;
    const result = {};
    for (const [key, value] of Object.entries(rest)) {
      result[key] = stripMetadata(value);
    }
    return result;
  }
  return obj;
}

describe("RiX Parser - Unit Operators", () => {
  describe("Scientific unit operator ~[", () => {
    test("simple scientific unit", () => {
      const ast = parseCode("3~[m];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "ScientificUnit",
            target: { type: "Number", value: "3" },
            unit: "m",
          },
        },
      ]);
    });

    test("complex scientific unit", () => {
      const ast = parseCode("5~[kg/s^2];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "ScientificUnit",
            target: { type: "Number", value: "5" },
            unit: "kg/s^2",
          },
        },
      ]);
    });

    test("scientific unit with multiplication", () => {
      const ast = parseCode("9.8~[m*s^-2];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "ScientificUnit",
            target: { type: "Number", value: "9.8" },
            unit: "m*s^-2",
          },
        },
      ]);
    });

    test("scientific unit on expression", () => {
      const ast = parseCode("(x + y)~[m];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "ScientificUnit",
            target: {
              type: "Grouping",
              expression: {
                type: "BinaryOperation",
                operator: "+",
                left: { type: "UserIdentifier", name: "x" },
                right: { type: "UserIdentifier", name: "y" },
              },
            },
            unit: "m",
          },
        },
      ]);
    });

    test("chained scientific units", () => {
      const ast = parseCode("3~[m]~[s^-1];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "ScientificUnit",
            target: {
              type: "ScientificUnit",
              target: { type: "Number", value: "3" },
              unit: "m",
            },
            unit: "s^-1",
          },
        },
      ]);
    });
  });

  describe("Mathematical unit operator ~{", () => {
    test("simple mathematical unit", () => {
      const ast = parseCode("2~{i};");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "MathematicalUnit",
            target: { type: "Number", value: "2" },
            unit: "i",
          },
        },
      ]);
    });

    test("mathematical unit with sqrt", () => {
      const ast = parseCode("1~{sqrt2};");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "MathematicalUnit",
            target: { type: "Number", value: "1" },
            unit: "sqrt2",
          },
        },
      ]);
    });

    test("mathematical unit with pi", () => {
      const ast = parseCode("3~{pi};");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "MathematicalUnit",
            target: { type: "Number", value: "3" },
            unit: "pi",
          },
        },
      ]);
    });

    test("mathematical unit on expression", () => {
      const ast = parseCode("(a * b)~{i};");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "MathematicalUnit",
            target: {
              type: "Grouping",
              expression: {
                type: "BinaryOperation",
                operator: "*",
                left: { type: "UserIdentifier", name: "a" },
                right: { type: "UserIdentifier", name: "b" },
              },
            },
            unit: "i",
          },
        },
      ]);
    });
  });

  describe("Mixed unit operations", () => {
    test("scientific and mathematical units together", () => {
      const ast = parseCode("3~{i}~[m];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "ScientificUnit",
            target: {
              type: "MathematicalUnit",
              target: { type: "Number", value: "3" },
              unit: "i",
            },
            unit: "m",
          },
        },
      ]);
    });

    test("units in arithmetic expressions", () => {
      const ast = parseCode("2~[m] + 3~[m];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BinaryOperation",
            operator: "+",
            left: {
              type: "ScientificUnit",
              target: { type: "Number", value: "2" },
              unit: "m",
            },
            right: {
              type: "ScientificUnit",
              target: { type: "Number", value: "3" },
              unit: "m",
            },
          },
        },
      ]);
    });

    test("units with function calls", () => {
      const ast = parseCode("SIN(x)~[rad];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "ScientificUnit",
            target: {
              type: "FunctionCall",
              function: {
                type: "SystemIdentifier",
                name: "SIN",
                systemInfo: { type: "function", arity: 1 },
              },
              arguments: {
                positional: [{ type: "UserIdentifier", name: "x" }],
                keyword: {},
              },
            },
            unit: "rad",
          },
        },
      ]);
    });
  });

  describe(".ConvertUnit system capability usage", () => {
    test("the source unit is carried and the target is a unit value", () => {
      const ast = parseCode('.ConvertUnit(5~[m], .Units[:ft]);');
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "SystemCall",
            name: "CONVERTUNIT",
            arguments: {
              positional: [
                {
                  type: "ScientificUnit",
                  target: { type: "Number", value: "5" },
                  unit: "m",
                },
                {
                  type: "PropertyAccess",
                  object: { type: "SystemAccess", property: "UNITS" },
                  property: { type: "KeyLiteral", name: "ft" },
                },
              ],
              keyword: {},
            },
            viaSystemContext: true,
          },
        },
      ]);
    });
  });

  describe("Edge cases and complex expressions", () => {
    test("nested brackets in scientific units should error", () => {
      expect(() => parseCode("x~[m[2]];")).toThrow(
        "Nested '[' not allowed inside scientific unit",
      );
    });

    test("different bracket types in scientific units", () => {
      const ast = parseCode("x~[m{2}];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "ScientificUnit",
            target: { type: "UserIdentifier", name: "x" },
            unit: "m{2}",
          },
        },
      ]);
    });

    test("nested braces in mathematical units should error", () => {
      expect(() => parseCode("y~{sqrt{2};")).toThrow(
        "Nested '{' not allowed inside mathematical unit",
      );
    });

    test("different bracket types in mathematical units", () => {
      const ast = parseCode("y~{sqrt[2]};");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "MathematicalUnit",
            target: { type: "UserIdentifier", name: "y" },
            unit: "sqrt[2]",
          },
        },
      ]);
    });

    test("units with metadata", () => {
      const ast = parseCode("[[3~[m], 4~[m]], units := true];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "WithMetadata",
            primary: {
              type: "Array",
              elements: [
                {
                  type: "ScientificUnit",
                  target: { type: "Number", value: "3" },
                  unit: "m",
                },
                {
                  type: "ScientificUnit",
                  target: { type: "Number", value: "4" },
                  unit: "m",
                },
              ],
            },
            metadata: {
              units: { type: "UserIdentifier", name: "true" },
            },
          },
        },
      ]);
    });

    test("units in array generators", () => {
      const ast = parseCode("[1~[m] |+ 1~[m] |^ 5];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Array",
            elements: [
              {
                type: "GeneratorChain",
                start: {
                  type: "ScientificUnit",
                  target: { type: "Number", value: "1" },
                  unit: "m",
                },
                operators: [
                  {
                    type: "GeneratorAdd",
                    operator: "|+",
                    operand: {
                      type: "ScientificUnit",
                      target: { type: "Number", value: "1" },
                      unit: "m",
                    },
                  },
                  {
                    type: "GeneratorLimit",
                    operator: "|^",
                    operand: { type: "Number", value: "5" },
                  },
                ],
              },
            ],
          },
        },
      ]);
    });

    test("units with postfix operators", () => {
      const ast = parseCode("3~[m]@(0.001);");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "At",
            target: {
              type: "ScientificUnit",
              target: { type: "Number", value: "3" },
              unit: "m",
            },
            arg: { type: "Number", value: "0.001" },
          },
        },
      ]);
    });

    test("complex expression with multiple units", () => {
      const ast = parseCode("a := 2~{i}~[V] * 3~[A];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BinaryOperation",
            operator: ":=",
            left: { type: "UserIdentifier", name: "a" },
            right: {
              type: "BinaryOperation",
              operator: "*",
              left: {
                type: "ScientificUnit",
                target: {
                  type: "MathematicalUnit",
                  target: { type: "Number", value: "2" },
                  unit: "i",
                },
                unit: "V",
              },
              right: {
                type: "ScientificUnit",
                target: { type: "Number", value: "3" },
                unit: "A",
              },
            },
          },
        },
      ]);
    });
  });

  describe("Backwards compatibility", () => {
    test("tilde without brackets is just a symbol", () => {
      const ast = parseCode("3 ~ m;");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "BinaryOperation",
            operator: "~",
            left: { type: "Number", value: "3" },
            right: { type: "UserIdentifier", name: "m" },
          },
        },
      ]);
    });

    test("scientific unit with spaces preserved", () => {
      const ast = parseCode("5~[m / s];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "ScientificUnit",
            target: { type: "Number", value: "5" },
            unit: "m / s",
          },
        },
      ]);
    });

    test("numbers no longer parse with units", () => {
      const tokens = tokenize("3~m~");
      expect(tokens[0].type).toBe("Number");
      expect(tokens[0].value).toBe("3");
      expect(tokens[1].type).toBe("Symbol");
      expect(tokens[1].value).toBe("~");
    });
  });
});
