import { tokenize } from ../../src/parser/tokenizer.js";
import { parse } from ../../src/parser/parser.js";

function testSystemLookup(name) {
  const systemSymbols = {
    SIN: { type: "function", arity: 1 },
    COS: { type: "function", arity: 1 },
    LOG: { type: "function", arity: 1 },
    SQRT: { type: "function", arity: 1 },
    PI: { type: "constant", value: Math.PI },
    E: { type: "constant", value: Math.E },
  };
  return systemSymbols[name] || { type: "identifier" };
}

function parseCode(code) {
  const tokens = tokenize(code);
  return parse(tokens, testSystemLookup);
}

function showExample(title, code, description) {
  console.log(`\n=== ${title} ===`);
  console.log(`Description: ${description}`);
  console.log(`Code: ${code}`);
  try {
    const ast = parseCode(code);
    console.log('✓ Parsed successfully');
    
    // Show the generator chain structure
    let elements = null;
    
    // Try to extract elements from different AST structures
    if (ast && ast.length > 0) {
      const firstNode = ast[0];
      if (firstNode.type === 'Statement' && firstNode.expression && firstNode.expression.elements) {
        elements = firstNode.expression.elements;
      } else if (firstNode.type === 'Array' && firstNode.elements) {
        elements = firstNode.elements;
      }
    }
    
    if (elements) {
      elements.forEach((element, index) => {
        if (element.type === 'GeneratorChain') {
          console.log(`  Element ${index}: Generator Chain`);
          console.log(`    Start: ${element.start ? element.start.value || element.start.type : 'none'}`);
          console.log(`    Operations: ${element.operators.map(op => op.operator).join(' ')}`);
        } else {
          console.log(`  Element ${index}: ${element.type} (${element.value || element.name || 'complex'})`);
        }
      });
    } else {
      console.log('  Could not extract elements from AST');
    }
  } catch (error) {
    console.log('✗ Parse error:', error.message);
  }
}

console.log("RiX Array Generators - Practical Examples");
console.log("==========================================");

// Mathematical sequences
showExample(
  "Natural Numbers",
  "[1 |+ 1 |^ 10]",
  "Generate first 10 natural numbers"
);

showExample(
  "Even Numbers",
  "[2 |+ 2 |^ 8]",
  "Generate first 8 even numbers"
);

showExample(
  "Powers of 2",
  "[1 |* 2 |^ 12]",
  "Generate powers of 2: 2^0, 2^1, 2^2, ..."
);

showExample(
  "Factorial Sequence",
  "[1 |: (i, a) -> a * (i + 1) |^ 8]",
  "Generate factorials: 1!, 2!, 3!, ..."
);

// Fibonacci variations
showExample(
  "Classic Fibonacci",
  "[1, 1 |: (i, a, b) -> a + b |^ 15]",
  "Standard Fibonacci sequence starting with 1, 1"
);

showExample(
  "Lucas Numbers",
  "[2, 1 |: (i, a, b) -> a + b |^ 12]",
  "Lucas sequence (Fibonacci-like starting with 2, 1)"
);

showExample(
  "Tribonacci",
  "[1, 1, 2 |: (i, a, b, c) -> a + b + c |^ 10]",
  "Three-term Fibonacci where each term is sum of previous three"
);

// Filtered sequences
showExample(
  "Prime-like Candidates",
  "[3 |+ 2 |? (i, a) -> a % 3 ?= 1 |^ 10]",
  "Odd numbers that give remainder 1 when divided by 3"
);

showExample(
  "Perfect Squares under 100",
  "[1 |: (i) -> (i + 1) * (i + 1) |? (i, a) -> a < 100 |^ 20]",
  "Generate perfect squares less than 100"
);

showExample(
  "Collatz Steps",
  "[27 |: (i, a) -> a % 2 ?= 0 ? a / 2 : 3 * a + 1 |^ 15]",
  "Collatz conjecture sequence starting from 27"
);

// Practical data generation
showExample(
  "Compound Interest",
  "[1000 |: (i, a) -> a * 1.05 |^ 10]",
  "Investment growth at 5% annual interest"
);

showExample(
  "Temperature Conversion Scale",
  "[0 |+ 10 |: (i, a) -> [a, a * 9 / 5 + 32] |^ 10]",
  "Celsius to Fahrenheit conversion table (every 10 degrees)"
);

// Complex chaining examples
showExample(
  "Mixed Sequence Array",
  "[1, 1 |: (i, a, b) -> a + b |^ 8, 100, |* 2 |^ 5, 1000]",
  "Array with Fibonacci, constant, geometric sequence, and final constant"
);

showExample(
  "Filtered Fibonacci",
  "[1, 1 |: (i, a, b) -> a + b |? (i, a) -> a % 2 ?= 0 |^ 10]",
  "Even Fibonacci numbers only"
);

showExample(
  "Bounded Arithmetic",
  "[5 |+ 7 |^ (i, a) -> a > 50]",
  "Arithmetic sequence that stops when value exceeds 50"
);

// Lazy evaluation examples
showExample(
  "Large Lazy Sequence",
  "[1 |+ 1 |^ 10000]",
  "Lazy sequence that could generate up to 10,000 elements"
);

showExample(
  "Conditional Lazy Stop",
  "[2 |* 2 |^ (a, i) -> a > 1000000]",
  "Lazy powers of 2 until exceeding one million"
);

// Error demonstration
console.log("\n=== Error Handling Examples ===");

try {
  parseCode("[1 |+ |^ 5]");
} catch (error) {
  console.log("✓ Caught expected error (missing operand):", error.message);
}

try {
  parseCode("[1 |+ 2 |^ ]");
} catch (error) {
  console.log("✓ Caught expected error (missing limit):", error.message);
}

console.log("\n=== Use Case Summary ===");
console.log("• Mathematical sequences: arithmetic, geometric, factorial");
console.log("• Recursive sequences: Fibonacci, Lucas, Tribonacci");
console.log("• Filtered data: primes, evens, bounds checking");
console.log("• Real-world modeling: compound interest, conversions");
console.log("• Complex arrays: mixing generators with constants");
console.log("• Performance: lazy evaluation for large datasets");
console.log("• Safety: automatic termination conditions");
