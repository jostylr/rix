import { tokenize } from ../../src/parser/tokenizer.js";
import { parse } from ../../src/parser/parser.js";

function testSystemLookup(name) {
  const systemSymbols = {
    SIN: { type: "function", arity: 1 },
    COS: { type: "function", arity: 1 },
    TAN: { type: "function", arity: 1 },
    LOG: { type: "function", arity: 1 },
    SQRT: { type: "function", arity: 1 },
    ABS: { type: "function", arity: 1 },
    FLOOR: { type: "function", arity: 1 },
    CEIL: { type: "function", arity: 1 },
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

function demonstrateAdvanced(title, code, description, mathematicalNote = null) {
  console.log(`\n=== ${title} ===`);
  console.log(`Description: ${description}`);
  if (mathematicalNote) {
    console.log(`Mathematical Note: ${mathematicalNote}`);
  }
  console.log(`Code: ${code}`);
  
  try {
    const ast = parseCode(code);
    console.log('✓ Parsed successfully');
    
    // Extract and display generator information
    const stmt = ast[0];
    if (stmt.expression && stmt.expression.elements) {
      const generators = stmt.expression.elements.filter(el => el.type === 'GeneratorChain');
      console.log(`  Found ${generators.length} generator chain(s)`);
      
      generators.forEach((gen, idx) => {
        console.log(`  Chain ${idx + 1}: ${gen.operators.map(op => op.operator).join(' → ')}`);
        if (gen.start) {
          console.log(`    Starting value: ${gen.start.value || gen.start.type}`);
        }
        console.log(`    Operations: ${gen.operators.length}`);
      });
    }
  } catch (error) {
    console.log('✗ Parse error:', error.message);
  }
}

console.log("RiX Array Generators - Advanced Mathematical Examples");
console.log("=====================================================");

// Number Theory Sequences
demonstrateAdvanced(
  "Catalan Numbers",
  "[1 |: (i, a) -> a * (4 * i + 2) / (i + 2) |^ 10]",
  "Generate the famous Catalan numbers sequence",
  "C(n) = (1/(n+1)) * C(2n,n) = (2n)!/(n+1)!n!"
);

demonstrateAdvanced(
  "Triangular Numbers",
  "[1 |: (i, a) -> a + i + 1 |^ 15]",
  "Generate triangular numbers: 1, 3, 6, 10, 15, 21...",
  "T(n) = n(n+1)/2, the sum of first n natural numbers"
);

demonstrateAdvanced(
  "Pentagonal Numbers",
  "[1 |: (i, a) -> a + 3 * i + 2 |^ 12]",
  "Generate pentagonal numbers using recursive formula",
  "P(n) = n(3n-1)/2, related to Euler's pentagonal number theorem"
);

demonstrateAdvanced(
  "Perfect Numbers Check",
  "[6, 28 |: (i, a) -> a * 2 |? (i, a) -> LOG(a + 1) % 1 ?= 0 |^ 8]",
  "Sequence exploring perfect number patterns",
  "Perfect numbers are equal to sum of their proper divisors"
);

// Advanced Fibonacci Variants
demonstrateAdvanced(
  "Generalized Fibonacci",
  "[a, b |: (i, x, y) -> x + y |^ 20]",
  "Parameterized Fibonacci with arbitrary starting values",
  "F(n) = F(n-1) + F(n-2) with custom initial conditions"
);

demonstrateAdvanced(
  "Fibonacci Mod Sequence",
  "[1, 1 |: (i, a, b) -> (a + b) % 1000 |^ 30]",
  "Fibonacci sequence with modular arithmetic",
  "Explores Pisano periods and cyclic properties"
);

demonstrateAdvanced(
  "Lucas-Lehmer Test Sequence",
  "[4 |: (i, a) -> (a * a - 2) % ((2 ^ (i + 3)) - 1) |^ 10]",
  "Lucas-Lehmer primality test sequence",
  "Used to test primality of Mersenne numbers 2^p - 1"
);

// Transcendental and Approximation Sequences
demonstrateAdvanced(
  "Pi Approximation (Leibniz)",
  "[4 |: (i, a) -> a + (4 * (-1)^(i+1)) / (2 * i + 3) |^ 1000]",
  "Leibniz formula for π approximation",
  "π/4 = 1 - 1/3 + 1/5 - 1/7 + 1/9 - ..."
);

demonstrateAdvanced(
  "Golden Ratio Convergence",
  "[1, 1 |: (i, a, b) -> a + b |: (i, c) -> c / (c - a) |^ 20]",
  "Fibonacci ratios converging to golden ratio",
  "lim(F(n+1)/F(n)) = φ = (1 + √5)/2 ≈ 1.618..."
);

demonstrateAdvanced(
  "E Approximation Series",
  "[1 |: (i, a) -> a + 1 / (i + 1) |^ 20]",
  "Series approximation of Euler's number e",
  "e = 1 + 1/1! + 1/2! + 1/3! + ... = Σ(1/n!)"
);

// Chaotic and Dynamical Systems
demonstrateAdvanced(
  "Logistic Map",
  "[0.5 |: (i, x) -> 3.8 * x * (1 - x) |^ 50]",
  "Chaotic logistic map sequence",
  "x(n+1) = r*x(n)*(1-x(n)) with r=3.8 shows chaos"
);

demonstrateAdvanced(
  "Collatz Conjecture Analysis",
  "[27, |: (i, a) -> a % 2 ?= 0 ? a / 2 : 3 * a + 1, |^ (i, a) -> a ?= 1]",
  "Complete Collatz sequence until reaching 1",
  "3n+1 problem: does every positive integer eventually reach 1?"
);

demonstrateAdvanced(
  "Henon Map",
  "[[1, 1] |: (i, p) -> [1.4 - p[0] * p[0] + 0.3 * p[1], p[0]] |^ 100]",
  "2D chaotic Henon map sequence",
  "Famous strange attractor: x(n+1) = 1.4 - x²(n) + 0.3*y(n), y(n+1) = x(n)"
);

// Prime and Number Theory
demonstrateAdvanced(
  "Sieve of Eratosthenes Candidates",
  "[2, 3 |+ 2 |? (i, a) -> a % 6 ?= 1 OR a % 6 ?= 5 |^ 100]",
  "Prime candidates using 6k±1 pattern",
  "All primes > 3 are of form 6k±1"
);

demonstrateAdvanced(
  "Mersenne Number Candidates",
  "[3 |: (i, a) -> 2^(i+2) - 1 |? (i, a) -> isProbablePrime(a) |^ 20]",
  "Generate potential Mersenne primes",
  "Mersenne numbers: M(p) = 2^p - 1 where p is prime"
);

demonstrateAdvanced(
  "Fermat Number Sequence",
  "[3 |: (i, a) -> 2^(2^(i+1)) + 1 |^ 8]",
  "Fermat numbers F(n) = 2^(2^n) + 1",
  "Conjectured to be prime, but only F(0) through F(4) are known primes"
);

// Advanced Filtering and Conditions
demonstrateAdvanced(
  "Multi-Filter Prime-like",
  "[7 |+ 4 |? (i, a) -> a % 3 ?= 1 |? (i, a) -> a % 7 ?= 0 |? (i, a) -> a < 200 |^ 50]",
  "Multiple filtering conditions applied sequentially",
  "Demonstrates complex filtering chains with multiple predicates"
);

demonstrateAdvanced(
  "Conditional Branching Sequence",
  "[1 |: (i, a) -> i % 3 ?= 0 ? a * 2 : (i % 3 ?= 1 ? a + 1 : a * a) |^ 20]",
  "Sequence with conditional branching logic",
  "Different operations based on index modulo 3"
);

demonstrateAdvanced(
  "Adaptive Step Size",
  "[1 |: (i, a) -> a + (a < 10 ? 1 : (a < 100 ? 5 : 25)) |^ (i, a) -> a > 1000]",
  "Sequence with adaptive step sizes",
  "Step size adapts based on current value magnitude"
);

// Performance and Large-Scale Examples
demonstrateAdvanced(
  "Lazy Infinite Primes",
  "[2, 3 |: (i, a, b) -> nextPrime(b) |^: (i, a) -> a > 10000]",
  "Lazy evaluation for large prime sequences",
  "Demonstrates lazy evaluation for computationally expensive sequences"
);

demonstrateAdvanced(
  "Memory-Efficient Factorials",
  "[1 |: (i, a) -> a * (i + 1) |^: 100]",
  "Large factorial sequence with lazy evaluation",
  "Computes factorials on-demand to save memory"
);

demonstrateAdvanced(
  "Bounded Exponential Growth",
  "[1 |* 1.1 |^ (i, a) -> a > 1000000 OR i > 200]",
  "Exponential growth with multiple stop conditions",
  "Safety bounds prevent infinite computation"
);

// Complex Mathematical Applications
demonstrateAdvanced(
  "Newton's Method Approximation",
  "[2 |: (i, x) -> x - (x * x - 2) / (2 * x) |^ (i, x) -> ABS(x * x - 2) < 0.0001]",
  "Newton's method for finding √2",
  "Iterative root finding: x(n+1) = x(n) - f(x)/f'(x)"
);

demonstrateAdvanced(
  "Mandelbrot Iteration Count",
  "[0 |: (i, z) -> z * z + c |^ (i, z) -> ABS(z) > 2 OR i > 100]",
  "Mandelbrot set iteration counting",
  "z(n+1) = z(n)² + c, counts iterations until divergence"
);

demonstrateAdvanced(
  "Continued Fraction for φ",
  "[1 |: (i, a) -> 1 + 1/a |^ 20]",
  "Continued fraction convergents to golden ratio",
  "φ = [1; 1, 1, 1, ...] = 1 + 1/(1 + 1/(1 + ...))"
);

console.log("\n=== Performance and Safety Notes ===");
console.log("• Use |^: for lazy evaluation with large sequences");
console.log("• Always include termination conditions to prevent infinite loops");
console.log("• Filter operations may significantly impact performance");
console.log("• Complex function generators can be computationally expensive");
console.log("• Multiple conditions provide safety bounds for dynamic sequences");

console.log("\n=== Mathematical Applications ===");
console.log("• Number theory: primes, perfect numbers, Catalan numbers");
console.log("• Approximation: π, e, √2, golden ratio convergence");
console.log("• Chaos theory: logistic map, Henon map, strange attractors");
console.log("• Iterative methods: Newton's method, Mandelbrot sets");
console.log("• Sequence analysis: Fibonacci variants, Lucas numbers");
console.log("• Computational mathematics: continued fractions, series");