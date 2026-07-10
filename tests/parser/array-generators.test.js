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
  if (obj && typeof obj === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key !== 'pos' && key !== 'original') {
        if (key === 'prep' && value === null) continue;
        if (key === 'prepStrict' && value === false) continue;
        cleaned[key] = stripMetadata(value);
      }
    }
    return cleaned;
  }
  return obj;
}

describe("RiX Array Generators", () => {
  describe("Basic Generator Operators", () => {
    test("|+ arithmetic sequence", () => {
      const ast = parseCode("[1 |+ 2 |^ 5];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Array",
            elements: [
              {
                type: "GeneratorChain",
                start: { type: "Number", value: "1" },
                operators: [
                  {
                    type: "GeneratorAdd",
                    operator: "|+",
                    operand: { type: "Number", value: "2" }
                  },
                  {
                    type: "GeneratorLimit",
                    operator: "|^",
                    operand: { type: "Number", value: "5" }
                  }
                ]
              }
            ]
          }
        }
      ]);
    });

    test("|* geometric sequence", () => {
      const ast = parseCode("[2 |* 3 |^ 4];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Array",
            elements: [
              {
                type: "GeneratorChain",
                start: { type: "Number", value: "2" },
                operators: [
                  {
                    type: "GeneratorMultiply",
                    operator: "|*",
                    operand: { type: "Number", value: "3" }
                  },
                  {
                    type: "GeneratorLimit",
                    operator: "|^",
                    operand: { type: "Number", value: "4" }
                  }
                ]
              }
            ]
          }
        }
      ]);
    });

    test("|: function generator", () => {
      const ast = parseCode("[1, 1 |: (i, a, b) -> a + b |^ 10];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Array",
            elements: [
              { type: "Number", value: "1" },
              {
                type: "GeneratorChain",
                start: { type: "Number", value: "1" },
                operators: [
                  {
                    type: "GeneratorFunction",
                    operator: "|:",
                    operand: {
                      type: "FunctionLambda",
                      parameters: {
                        conditionals: [],
                        keyword: [],
                        metadata: {},
                        positional: [
                          { name: "i", defaultValue: null },
                          { name: "a", defaultValue: null },
                          { name: "b", defaultValue: null }
                        ]
                      },
                      body: {
                        type: "BinaryOperation",
                        operator: "+",
                        left: { type: "UserIdentifier", name: "a" },
                        right: { type: "UserIdentifier", name: "b" }
                      }
                    }
                  },
                  {
                    type: "GeneratorLimit",
                    operator: "|^",
                    operand: { type: "Number", value: "10" }
                  }
                ]
              }
            ]
          }
        }
      ]);
    });
  });

  describe("Filter Operators", () => {
    test("|? filter with predicate", () => {
      const ast = parseCode("[1 |+ 1 |? (i, a) -> a % 2 == 0 |^ 5];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Array",
            elements: [
              {
                type: "GeneratorChain",
                start: { type: "Number", value: "1" },
                operators: [
                  {
                    type: "GeneratorAdd",
                    operator: "|+",
                    operand: { type: "Number", value: "1" }
                  },
                  {
                    type: "GeneratorFilter",
                    operator: "|?",
                    operand: {
                      type: "FunctionLambda",
                      parameters: {
                        conditionals: [],
                        keyword: [],
                        metadata: {},
                        positional: [
                          { name: "i", defaultValue: null },
                          { name: "a", defaultValue: null }
                        ]
                      },
                      body: {
                        type: "BinaryOperation",
                        operator: "==",
                        left: {
                          type: "BinaryOperation",
                          operator: "%",
                          left: { type: "UserIdentifier", name: "a" },
                          right: { type: "Number", value: "2" }
                        },
                        right: { type: "Number", value: "0" }
                      }
                    }
                  },
                  {
                    type: "GeneratorLimit",
                    operator: "|^",
                    operand: { type: "Number", value: "5" }
                  }
                ]
              }
            ]
          }
        }
      ]);
    });
  });

  describe("Stop Conditions", () => {
    test("|^ with number limit", () => {
      const ast = parseCode("[1 |+ 2 |^ 5];");
      expect(stripMetadata(ast)[0].expression.elements[0].operators[1]).toEqual({
        type: "GeneratorLimit",
        operator: "|^",
        operand: { type: "Number", value: "5" }
      });
    });

    test("|^ with function condition", () => {
      const ast = parseCode("[1 |+ 2 |^ (i, a) -> a > 10];");
      expect(stripMetadata(ast)[0].expression.elements[0].operators[1]).toEqual({
        type: "GeneratorLimit",
        operator: "|^",
        operand: {
          type: "FunctionLambda",
          parameters: {
            conditionals: [],
            keyword: [],
            metadata: {},
            positional: [
              { name: "i", defaultValue: null },
              { name: "a", defaultValue: null }
            ]
          },
          body: {
            type: "BinaryOperation",
            operator: ">",
            left: { type: "UserIdentifier", name: "a" },
            right: { type: "Number", value: "10" }
          }
        }
      });
    });

    test("|^: lazy limit with number", () => {
      const ast = parseCode("[1 |+ 2 |^: 5];");
      expect(stripMetadata(ast)[0].expression.elements[0].operators[1]).toEqual({
        type: "GeneratorLazyLimit",
        operator: "|^:",
        operand: { type: "Number", value: "5" }
      });
    });

    test("|^: lazy limit with function", () => {
      const ast = parseCode("[1 |+ 2 |^: (i, a) -> a > 10];");
      expect(stripMetadata(ast)[0].expression.elements[0].operators[1]).toEqual({
        type: "GeneratorLazyLimit",
        operator: "|^:",
        operand: {
          type: "FunctionLambda",
          parameters: {
            conditionals: [],
            keyword: [],
            metadata: {},
            positional: [
              { name: "i", defaultValue: null },
              { name: "a", defaultValue: null }
            ]
          },
          body: {
            type: "BinaryOperation",
            operator: ">",
            left: { type: "UserIdentifier", name: "a" },
            right: { type: "Number", value: "10" }
          }
        }
      });
    });
  });

  describe("Complex Chaining", () => {
    test("multiple comma-separated chains", () => {
      const ast = parseCode("[1, |+ 2 |^ 5];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Array",
            elements: [
              { type: "Number", value: "1" },
              {
                type: "GeneratorChain",
                start: null,
                operators: [
                  {
                    type: "GeneratorAdd",
                    operator: "|+",
                    operand: { type: "Number", value: "2" }
                  },
                  {
                    type: "GeneratorLimit",
                    operator: "|^",
                    operand: { type: "Number", value: "5" }
                  }
                ]
              }
            ]
          }
        }
      ]);
    });

    test("fibonacci then multiply chain", () => {
      const ast = parseCode("[1, 1 |: (i, a, b) -> a + b |^ 10, |* 3 |^ 5, 100, 112];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Array",
            elements: [
              { type: "Number", value: "1" },
              {
                type: "GeneratorChain",
                start: { type: "Number", value: "1" },
                operators: [
                  {
                    type: "GeneratorFunction",
                    operator: "|:",
                    operand: {
                      type: "FunctionLambda",
                      parameters: {
                        conditionals: [],
                        keyword: [],
                        metadata: {},
                        positional: [
                          { name: "i", defaultValue: null },
                          { name: "a", defaultValue: null },
                          { name: "b", defaultValue: null }
                        ]
                      },
                      body: {
                        type: "BinaryOperation",
                        operator: "+",
                        left: { type: "UserIdentifier", name: "a" },
                        right: { type: "UserIdentifier", name: "b" }
                      }
                    }
                  },
                  {
                    type: "GeneratorLimit",
                    operator: "|^",
                    operand: { type: "Number", value: "10" }
                  }
                ]
              },
              {
                type: "GeneratorChain",
                start: null,
                operators: [
                  {
                    type: "GeneratorMultiply",
                    operator: "|*",
                    operand: { type: "Number", value: "3" }
                  },
                  {
                    type: "GeneratorLimit",
                    operator: "|^",
                    operand: { type: "Number", value: "5" }
                  }
                ]
              },
              { type: "Number", value: "100" },
              { type: "Number", value: "112" }
            ]
          }
        }
      ]);
    });

    test("complex filter with multiple operations", () => {
      const ast = parseCode("[3 |+ 3 |? (i, a) -> a < 10 |^ 10];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Array",
            elements: [
              {
                type: "GeneratorChain",
                start: { type: "Number", value: "3" },
                operators: [
                  {
                    type: "GeneratorAdd",
                    operator: "|+",
                    operand: { type: "Number", value: "3" }
                  },
                  {
                    type: "GeneratorFilter",
                    operator: "|?",
                    operand: {
                      type: "FunctionLambda",
                      parameters: {
                        conditionals: [],
                        keyword: [],
                        metadata: {},
                        positional: [
                          { name: "i", defaultValue: null },
                          { name: "a", defaultValue: null }
                        ]
                      },
                      body: {
                        type: "BinaryOperation",
                        operator: "<",
                        left: { type: "UserIdentifier", name: "a" },
                        right: { type: "Number", value: "10" }
                      }
                    }
                  },
                  {
                    type: "GeneratorLimit",
                    operator: "|^",
                    operand: { type: "Number", value: "10" }
                  }
                ]
              }
            ]
          }
        }
      ]);
    });
  });

  describe("Edge Cases", () => {
    test("generator chain without start value", () => {
      const ast = parseCode("[|+ 2 |^ 5];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Array",
            elements: [
              {
                type: "GeneratorChain",
                start: null,
                operators: [
                  {
                    type: "GeneratorAdd",
                    operator: "|+",
                    operand: { type: "Number", value: "2" }
                  },
                  {
                    type: "GeneratorLimit",
                    operator: "|^",
                    operand: { type: "Number", value: "5" }
                  }
                ]
              }
            ]
          }
        }
      ]);
    });

    test("single generator operator", () => {
      const ast = parseCode("[1 |+ 2];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Array",
            elements: [
              {
                type: "GeneratorChain",
                start: { type: "Number", value: "1" },
                operators: [
                  {
                    type: "GeneratorAdd",
                    operator: "|+",
                    operand: { type: "Number", value: "2" }
                  }
                ]
              }
            ]
          }
        }
      ]);
    });

    test("multiple generators without limits", () => {
      const ast = parseCode("[1 |+ 2 |* 3];");
      expect(stripMetadata(ast)).toEqual([
        {
          type: "Statement",
          expression: {
            type: "Array",
            elements: [
              {
                type: "GeneratorChain",
                start: { type: "Number", value: "1" },
                operators: [
                  {
                    type: "GeneratorAdd",
                    operator: "|+",
                    operand: { type: "Number", value: "2" }
                  },
                  {
                    type: "GeneratorMultiply",
                    operator: "|*",
                    operand: { type: "Number", value: "3" }
                  }
                ]
              }
            ]
          }
        }
      ]);
    });
  });

  describe("Error Cases", () => {
    test("invalid generator syntax", () => {
      expect(() => parseCode("[1 |+ |^ 5];")).toThrow();
    });

    test("mismatched brackets", () => {
      expect(() => parseCode("[1 |+ 2 |^ 5")).toThrow();
    });
  });
});
