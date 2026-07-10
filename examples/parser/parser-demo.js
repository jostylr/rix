import { tokenize } from ../../src/parser/tokenizer.js";
import { parse } from ../../src/parser/parser.js";

// Comprehensive system lookup function for RiX language
function systemLookup(name) {
  const systemSymbols = {
    // Mathematical functions
    SIN: { type: "function", arity: 1 },
    COS: { type: "function", arity: 1 },
    TAN: { type: "function", arity: 1 },
    LOG: { type: "function", arity: 1 },
    EXP: { type: "function", arity: 1 },
    SQRT: { type: "function", arity: 1 },
    ABS: { type: "function", arity: 1 },
    MAX: { type: "function", arity: -1 }, // variable arity
    MIN: { type: "function", arity: -1 },

    // Constants
    PI: { type: "constant", value: Math.PI },
    E: { type: "constant", value: Math.E },
    INFINITY: { type: "constant", value: Infinity },
    I: { type: "constant", description: "imaginary unit" },

    // Logical operators
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
    XOR: {
      type: "operator",
      precedence: 35,
      associativity: "left",
      operatorType: "infix",
    },

    // Set operations
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
    INTERSECT: {
      type: "operator",
      precedence: 50,
      associativity: "left",
      operatorType: "infix",
    },

    // Control structures
    IF: { type: "control", structure: "conditional" },
    ELSE: { type: "control", structure: "conditional" },
    FOR: { type: "control", structure: "loop" },
    WHILE: { type: "control", structure: "loop" },

    // Special forms
    SELF: { type: "special", form: "self-reference" },
    PRIMARY: { type: "special", form: "primary-operation" },
    UNIT: { type: "function", purpose: "unit-conversion" },
    LOAD: { type: "function", purpose: "module-loading" },
    HELP: { type: "function", purpose: "documentation" },
  };

  return systemSymbols[name] || { type: "identifier" };
}

// Test cases demonstrating various RiX language features
const testCases = [
  // Basic arithmetic with precedence
  {
    name: "Basic Arithmetic",
    code: "2 + 3 * 4 ^ 2 - 1;",
    description:
      "Tests operator precedence: addition, multiplication, exponentiation",
  },

  // Assignment
  {
    name: "Assignment",
    code: "x := 5 + 3 * 2;",
    description: "Variable assignment with expression",
  },

  // Function calls
  {
    name: "Function Calls",
    code: "SIN(PI / 2) + COS(0);",
    description: "System function calls with constants",
  },

  // Equations to solve
  {
    name: "Equation Solving",
    code: "x^2 + 2*x - 3 :=: 0;",
    description: "Equation to solve using :=: operator",
  },

  // Inequalities
  {
    name: "Inequality",
    code: "2*x + 1 :>: 5;",
    description: "Inequality to solve using :>: operator",
  },

  // Pipe operations
  {
    name: "Pipe Operations",
    code: "data |> filter |> map |> reduce;",
    description: "Chained pipe operations for data processing",
  },

  // Advanced piping
  {
    name: "Advanced Piping",
    code: "numbers ||> SIN |>> square |>: sum;",
    description: "Different pipe operators: explicit, map, reduce",
  },

  // Intervals
  {
    name: "Intervals",
    code: "x IN 1:10 AND y IN 0:PI;",
    description: "Interval definitions with logical operators",
  },

  // Arrays and sets
  {
    name: "Collections",
    code: "[1, 2, 3] UNION {4, 5, 6};",
    description: "Array and set operations",
  },

  // Function definitions
  {
    name: "Function Definition",
    code: "f := x -> x^2 + 2*x + 1;",
    description: "Function definition using arrow operator",
  },

  // Pattern matching function
  {
    name: "Pattern Matching",
    code: "factorial := n :=> n == 0 -> 1; n -> n * factorial(n-1);",
    description: "Pattern matching function definition",
  },

  // Complex expressions with grouping
  {
    name: "Complex Expression",
    code: "(a + b) * (c - d) / (e ^ f);",
    description: "Complex expression with grouping",
  },

  // Property access
  {
    name: "Property Access",
    code: "object.property.subproperty;",
    description: "Nested property access",
  },

  // Mixed number and unit operations
  {
    name: "Numbers with Units",
    code: "distance := 3.5~[m] + 2..1/2~[ft];",
    description: "Numbers with units and mixed numbers",
  },

  // Multiple statements
  {
    name: "Multiple Statements",
    code: "x := 5; y := 10; result := x + y;",
    description: "Multiple statements separated by semicolons",
  },

  // Metadata annotations
  {
    name: "Simple Metadata",
    code: "[matrix, rows := 3, cols := 4];",
    description: "Object with metadata annotations using := syntax",
  },

  {
    name: "Complex Metadata",
    code: '[dataset, name := "users", size := count(records), version := 1.2];',
    description: "Metadata with string keys and expression values",
  },

  {
    name: "Metadata Only",
    code: '[config := "production", debug := false, port := 8080];',
    description: "Pure metadata configuration without primary element",
  },
];

console.log("RiX Language Parser Demonstration\n");
console.log("=".repeat(50));

testCases.forEach((testCase, index) => {
  console.log(`\n${index + 1}. ${testCase.name}`);
  console.log("-".repeat(30));
  console.log(`Code: ${testCase.code}`);
  console.log(`Description: ${testCase.description}`);

  try {
    // Tokenize
    const tokens = tokenize(testCase.code);
    console.log(`\nTokens (${tokens.length}):`);
    tokens.slice(0, -1).forEach((token) => {
      // Skip End token for cleaner output
      if (token.type === "Identifier" && token.kind === "System") {
        const systemInfo = systemLookup(token.value);
        console.log(
          `  ${token.type}(${token.kind}):${token.value} [${systemInfo.type}]`,
        );
      } else {
        console.log(`  ${token.type}:${token.value}`);
      }
    });

    // Parse
    const ast = parse(tokens, systemLookup);
    console.log(`\nAST Structure:`);
    console.log(
      JSON.stringify(
        ast,
        (key, value) => {
          // Simplify output by hiding position and original fields for readability
          if (key === "pos" || key === "original") return undefined;
          return value;
        },
        2,
      ),
    );
  } catch (error) {
    console.error(`\nError: ${error.message}`);
  }

  console.log("\n" + "=".repeat(50));
});

console.log("\nParser Features Demonstrated:");
console.log("• Operator precedence and associativity");
console.log("• System identifier lookup and classification");
console.log("• Function calls with arguments");
console.log("• Assignment and equation operators");
console.log("• Pipe operations for data flow");
console.log("• Arrays, sets, and collections");
console.log("• Property access chains");
console.log("• Metadata and property annotations");
console.log("• Statement parsing with semicolons");
console.log("• Extensible symbol table");
console.log("• Position tracking for debugging");
