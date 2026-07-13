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
        cleaned[key] = stripMetadata(value);
      }
    }
    return cleaned;
  }
  return obj;
}

describe("RiX Array Generators Integration Tests", () => {
  describe("Mathematical Sequences", () => {
    test("natural numbers sequence", () => {
      const ast = parseCode("[1 |+ 1 |^ 10];");
      const chain = stripMetadata(ast)[0].expression.elements[0];
      
      expect(chain.type).toBe("GeneratorChain");
      expect(chain.start.value).toBe("1");
      expect(chain.operators).toHaveLength(2);
      expect(chain.operators[0].type).toBe("GeneratorAdd");
      expect(chain.operators[0].operand.value).toBe("1");
      expect(chain.operators[1].type).toBe("GeneratorLimit");
      expect(chain.operators[1].operand.value).toBe("10");
    });

    test("even numbers sequence", () => {
      const ast = parseCode("[2 |+ 2 |^ 8];");
      const chain = stripMetadata(ast)[0].expression.elements[0];
      
      expect(chain.type).toBe("GeneratorChain");
      expect(chain.start.value).toBe("2");
      expect(chain.operators[0].operand.value).toBe("2");
      expect(chain.operators[1].operand.value).toBe("8");
    });

    test("powers of two sequence", () => {
      const ast = parseCode("[1 |* 2 |^ 12];");
      const chain = stripMetadata(ast)[0].expression.elements[0];
      
      expect(chain.type).toBe("GeneratorChain");
      expect(chain.start.value).toBe("1");
      expect(chain.operators[0].type).toBe("GeneratorMultiply");
      expect(chain.operators[0].operand.value).toBe("2");
    });

    test("factorial sequence with function generator", () => {
      const ast = parseCode("[1 |: (i, a) -> a * (i + 1) |^ 8];");
      const chain = stripMetadata(ast)[0].expression.elements[0];
      
      expect(chain.type).toBe("GeneratorChain");
      expect(chain.start.value).toBe("1");
      expect(chain.operators[0].type).toBe("GeneratorFunction");
      expect(chain.operators[0].operand.type).toBe("FunctionLambda");
      expect(chain.operators[0].operand.parameters.positional).toHaveLength(2);
    });
  });

  describe("Fibonacci Variations", () => {
    test("classic fibonacci sequence", () => {
      const ast = parseCode("[1, 1 |: (i, a, b) -> a + b |^ 15];");
      const elements = stripMetadata(ast)[0].expression.elements;
      
      expect(elements).toHaveLength(2);
      expect(elements[0].type).toBe("Number");
      expect(elements[0].value).toBe("1");
      
      const chain = elements[1];
      expect(chain.type).toBe("GeneratorChain");
      expect(chain.start.value).toBe("1");
      expect(chain.operators[0].operand.parameters.positional).toHaveLength(3);
    });

    test("lucas numbers", () => {
      const ast = parseCode("[2, 1 |: (i, a, b) -> a + b |^ 12];");
      const elements = stripMetadata(ast)[0].expression.elements;
      
      expect(elements[0].value).toBe("2");
      expect(elements[1].start.value).toBe("1");
    });

    test("tribonacci sequence", () => {
      const ast = parseCode("[1, 1, 2 |: (i, a, b, c) -> a + b + c |^ 10];");
      const elements = stripMetadata(ast)[0].expression.elements;
      
      expect(elements).toHaveLength(3);
      expect(elements[2].operators[0].operand.parameters.positional).toHaveLength(4);
    });
  });

  describe("Filtered Sequences", () => {
    test("even fibonacci numbers", () => {
      const ast = parseCode("[1, 1 |: (i, a, b) -> a + b |? (i, a) -> a % 2 ?= 0 |^ 10];");
      const chain = stripMetadata(ast)[0].expression.elements[1];
      
      expect(chain.operators).toHaveLength(3);
      expect(chain.operators[0].type).toBe("GeneratorFunction");
      expect(chain.operators[1].type).toBe("GeneratorFilter");
      expect(chain.operators[2].type).toBe("GeneratorLimit");
    });

    test("perfect squares under 100", () => {
      const ast = parseCode("[1 |: (i) -> (i + 1) * (i + 1) |? (i, a) -> a < 100 |^ 20];");
      const chain = stripMetadata(ast)[0].expression.elements[0];
      
      expect(chain.operators[0].operand.parameters.positional).toHaveLength(1);
      expect(chain.operators[1].operand.parameters.positional).toHaveLength(2);
    });

    test("conditional arithmetic sequence", () => {
      const ast = parseCode("[3 |+ 2 |? (i, a) -> a % 3 ?= 1 |^ 10];");
      const chain = stripMetadata(ast)[0].expression.elements[0];
      
      expect(chain.start.value).toBe("3");
      expect(chain.operators[0].operand.value).toBe("2");
      expect(chain.operators[1].type).toBe("GeneratorFilter");
    });
  });

  describe("Lazy Evaluation", () => {
    test("lazy arithmetic sequence", () => {
      const ast = parseCode("[1 |+ 1 |^ 10000];");
      const chain = stripMetadata(ast)[0].expression.elements[0];
      
      expect(chain.operators[1].type).toBe("GeneratorLimit");
      expect(chain.operators[1].operator).toBe("|^");
      expect(chain.operators[1].operand.value).toBe("10000");
    });

    test("lazy with function condition", () => {
      const ast = parseCode("[2 |* 2 |^ (a, i) -> a > 1000000];");
      const chain = stripMetadata(ast)[0].expression.elements[0];
      
      expect(chain.operators[1].type).toBe("GeneratorLimit");
      expect(chain.operators[1].operand.type).toBe("FunctionLambda");
    });
  });

  describe("Complex Chaining", () => {
    test("mixed sequence array", () => {
      const ast = parseCode("[1, 1 |: (i, a, b) -> a + b |^ 8, 100, |* 2 |^ 5, 1000];");
      const elements = stripMetadata(ast)[0].expression.elements;
      
      expect(elements).toHaveLength(5);
      expect(elements[0].type).toBe("Number");
      expect(elements[0].value).toBe("1");
      expect(elements[1].type).toBe("GeneratorChain");
      expect(elements[2].type).toBe("Number");
      expect(elements[2].value).toBe("100");
      expect(elements[3].type).toBe("GeneratorChain");
      expect(elements[3].start).toBeNull(); // References previous element
      expect(elements[4].type).toBe("Number");
      expect(elements[4].value).toBe("1000");
    });

    test("chained operations without limits", () => {
      const ast = parseCode("[1 |+ 2 |* 3];");
      const chain = stripMetadata(ast)[0].expression.elements[0];
      
      expect(chain.operators).toHaveLength(2);
      expect(chain.operators[0].type).toBe("GeneratorAdd");
      expect(chain.operators[1].type).toBe("GeneratorMultiply");
    });

    test("function generator with multiple filters", () => {
      const ast = parseCode("[1 |: (i) -> i * i |? (i, a) -> a % 2 ?= 0 |? (i, a) -> a < 50 |^ 10];");
      const chain = stripMetadata(ast)[0].expression.elements[0];
      
      expect(chain.operators).toHaveLength(4);
      expect(chain.operators[0].type).toBe("GeneratorFunction");
      expect(chain.operators[1].type).toBe("GeneratorFilter");
      expect(chain.operators[2].type).toBe("GeneratorFilter");
      expect(chain.operators[3].type).toBe("GeneratorLimit");
    });
  });

  describe("Edge Cases and Error Handling", () => {
    test("generator without start value", () => {
      const ast = parseCode("[|+ 2 |^ 5];");
      const chain = stripMetadata(ast)[0].expression.elements[0];
      
      expect(chain.start).toBeNull();
      expect(chain.operators[0].type).toBe("GeneratorAdd");
    });

    test("single generator operation", () => {
      const ast = parseCode("[1 |+ 2];");
      const chain = stripMetadata(ast)[0].expression.elements[0];
      
      expect(chain.operators).toHaveLength(1);
      expect(chain.operators[0].type).toBe("GeneratorAdd");
    });

    test("empty array still works", () => {
      const ast = parseCode("[];");
      const array = stripMetadata(ast)[0].expression;
      
      expect(array.type).toBe("Array");
      expect(array.elements).toHaveLength(0);
    });

    test("mixed generators and regular expressions", () => {
      const ast = parseCode("[x + y, 1 |+ 2 |^ 5, SIN(z)];");
      const elements = stripMetadata(ast)[0].expression.elements;
      
      expect(elements).toHaveLength(3);
      expect(elements[0].type).toBe("BinaryOperation");
      expect(elements[1].type).toBe("GeneratorChain");
      expect(elements[2].type).toBe("FunctionCall");
    });
  });

  describe("Function Expression Variations", () => {
    test("simple single parameter function", () => {
      const ast = parseCode("[1 |: (i) -> i * 2 |^ 5];");
      const func = stripMetadata(ast)[0].expression.elements[0].operators[0].operand;
      
      expect(func.parameters.positional).toHaveLength(1);
      expect(func.parameters.positional[0].name).toBe("i");
    });

    test("complex function with arithmetic", () => {
      const ast = parseCode("[1 |: (i, a) -> a * (i + 1) + i |^ 5];");
      const func = stripMetadata(ast)[0].expression.elements[0].operators[0].operand;
      
      expect(func.body.type).toBe("BinaryOperation");
      expect(func.body.operator).toBe("+");
    });

    test("nested function calls in generator", () => {
      const ast = parseCode("[1 |: (i, a) -> MAX(a, i) |^ 5];");
      const func = stripMetadata(ast)[0].expression.elements[0].operators[0].operand;
      
      expect(func.body.type).toBe("FunctionCall");
      expect(func.body.function.name).toBe("MAX");
    });
  });

  describe("Compatibility with Existing Features", () => {
    test("generators work with regular arrays", () => {
      const ast = parseCode("[1, 2, 3];");
      const elements = stripMetadata(ast)[0].expression.elements;
      
      expect(elements).toHaveLength(3);
      elements.forEach(el => expect(el.type).toBe("Number"));
    });

    test("generators work in nested structures", () => {
      const ast = parseCode("[[1 |+ 1 |^ 3], [2 |* 2 |^ 3]];");
      const outerElements = stripMetadata(ast)[0].expression.elements;
      
      expect(outerElements).toHaveLength(2);
      expect(outerElements[0].type).toBe("Array");
      expect(outerElements[0].elements[0].type).toBe("GeneratorChain");
      expect(outerElements[1].elements[0].type).toBe("GeneratorChain");
    });

    test("generators with tuple syntax", () => {
      const ast = parseCode("(1 |+ 2 |^ 5,);");
      const tuple = stripMetadata(ast)[0].expression;
      
      expect(tuple.type).toBe("Tuple");
      expect(tuple.elements[0].type).toBe("BinaryOperation"); // Generators only work in arrays
    });
  });

  describe("Real-world Use Cases", () => {
    test("compound interest calculation", () => {
      const ast = parseCode("[1000 |: (i, a) -> a * 1.05 |^ 10];");
      const chain = stripMetadata(ast)[0].expression.elements[0];
      
      expect(chain.start.value).toBe("1000");
      expect(chain.operators[0].operand.body.right.value).toBe("1.05");
    });

    test("temperature conversion table", () => {
      const ast = parseCode("[0 |+ 10 |: (i, a) -> a * 9 / 5 + 32 |^ 10];");
      const chain = stripMetadata(ast)[0].expression.elements[0];
      
      expect(chain.operators).toHaveLength(3);
      expect(chain.operators[0].type).toBe("GeneratorAdd");
      expect(chain.operators[1].type).toBe("GeneratorFunction");
      expect(chain.operators[2].type).toBe("GeneratorLimit");
    });

    test("bounded sequence with dynamic stopping", () => {
      const ast = parseCode("[5 |+ 7 |^ (i, a) -> a > 50];");
      const chain = stripMetadata(ast)[0].expression.elements[0];
      
      expect(chain.operators[1].operand.type).toBe("FunctionLambda");
      expect(chain.operators[1].operand.body.operator).toBe(">");
    });
  });
});
