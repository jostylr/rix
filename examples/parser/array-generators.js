import { tokenize } from ../../src/parser/tokenizer.js";
import { parse } from ../../src/parser/parser.js";

function testSystemLookup(name) {
  const systemSymbols = {
    SIN: { type: "function", arity: 1 },
    COS: { type: "function", arity: 1 },
    PI: { type: "constant", value: Math.PI },
    E: { type: "constant", value: Math.E },
  };
  return systemSymbols[name] || { type: "identifier" };
}

function parseCode(code) {
  const tokens = tokenize(code);
  return parse(tokens, testSystemLookup);
}

function demonstrateExample(title, code) {
  console.log(`\n=== ${title} ===`);
  console.log(`Code: ${code}`);
  try {
    const ast = parseCode(code);
    console.log('✓ Parsed successfully');
    if (ast && ast[0] && ast[0].expression && ast[0].expression.elements) {
      console.log('AST Structure:', JSON.stringify(ast[0].expression.elements[0], null, 2));
    } else {
      console.log('AST Structure:', JSON.stringify(ast, null, 2));
    }
  } catch (error) {
    console.log('✗ Parse error:', error.message);
  }
}

console.log("RiX Array Generator Examples");
console.log("============================");

// Basic arithmetic sequences
demonstrateExample(
  "Arithmetic Sequence", 
  "[1 |+ 2 |^ 5]"
);

demonstrateExample(
  "Arithmetic with Start Value", 
  "[10 |+ 3 |^ 7]"
);

// Geometric sequences
demonstrateExample(
  "Geometric Sequence", 
  "[2 |* 3 |^ 4]"
);

demonstrateExample(
  "Powers of Two", 
  "[1 |* 2 |^ 8]"
);

// Function generators
demonstrateExample(
  "Fibonacci Sequence", 
  "[1, 1 |: (i, a, b) -> a + b |^ 10]"
);

demonstrateExample(
  "Factorial Sequence", 
  "[1 |: (i, a) -> a * (i + 1) |^ 6]"
);

demonstrateExample(
  "Squares", 
  "[|: (i) -> i * i |^ 10]"
);

// Filtering
demonstrateExample(
  "Even Numbers Only", 
  "[1 |+ 1 |? (i, a) -> a % 2 == 0 |^ 5]"
);

demonstrateExample(
  "Multiples of 3 less than 20", 
  "[3 |+ 3 |? (i, a) -> a < 20 |^ 10]"
);

// Lazy generators
demonstrateExample(
  "Lazy Arithmetic Sequence", 
  "[1 |+ 2 |^ 1000]"
);

demonstrateExample(
  "Lazy with Function Limit", 
  "[1 |+ 2 |^ (a, i) -> a > 100]"
);

// Complex chaining
demonstrateExample(
  "Multiple Chains in Array", 
  "[1, 1 |: (i, a, b) -> a + b |^ 5, |* 2 |^ 3, 100]"
);

demonstrateExample(
  "Chain Without Start Value", 
  "[5, |+ 3 |^ 4, 20]"
);

// Advanced examples
demonstrateExample(
  "Prime-like Filter", 
  "[2 |+ 1 |? (i, a) -> a % 2 ?= 1 |^ 8]"
);

demonstrateExample(
  "Collatz-like Sequence", 
  "[7 |: (i, a) -> a % 2 == 0 ? a / 2 : 3 * a + 1 |^ 10]"
);

// Error cases
console.log("\n=== Error Cases ===");

try {
  parseCode("[1 |+ |^ 5]");
} catch (error) {
  console.log("✓ Expected error for invalid syntax:", error.message);
}

try {
  parseCode("[1 |+ 2 |^ 5");
} catch (error) {
  console.log("✓ Expected error for unmatched bracket:", error.message);
}

console.log("\n=== Summary ===");
console.log("Array generators support:");
console.log("• |+ n    : Arithmetic sequences (add n each step)");
console.log("• |* n    : Geometric sequences (multiply by n each step)");
console.log("• |: fn   : Custom function generators");
console.log("• |? fn   : Filtering with predicates");
console.log("• |^ n/fn : Eager stopping conditions");
console.log("• |^ n/fn: Lazy stopping conditions");
console.log("• Chaining: Multiple operations can be chained together");
console.log("• Arrays can contain multiple generator chains separated by commas");
