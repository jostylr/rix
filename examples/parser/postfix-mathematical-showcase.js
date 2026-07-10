import { tokenize } from ../../src/parser/tokenizer.js";
import { parse } from ../../src/parser/parser.js";

// Mathematical system lookup
function mathSystemLookup(name) {
  const mathSymbols = {
    PI: { type: "constant", value: Math.PI },
    E: { type: "constant", value: Math.E },
    SQRT2: { type: "constant", value: Math.sqrt(2) },
    PHI: { type: "constant", value: (1 + Math.sqrt(5)) / 2 },
    SIN: { type: "function", arity: 1 },
    COS: { type: "function", arity: 1 },
    LOG: { type: "function", arity: 1 },
    EXP: { type: "function", arity: 1 },
    SQRT: { type: "function", arity: 1 },
    ABS: { type: "function", arity: 1 },
    MAX: { type: "function", arity: -1 },
    MIN: { type: "function", arity: -1 }
  };
  return mathSymbols[name] || { type: "identifier" };
}

function parseAndShow(code, description) {
  console.log(`\n${description}:`);
  console.log(`  Code: ${code}`);
  try {
    const tokens = tokenize(code);
    const ast = parse(tokens, mathSystemLookup);
    console.log(`  ✓ AST Type: ${ast[0].expression.type}`);
    
    // Show the structure for interesting cases
    if (ast[0].expression.type === 'At' || ast[0].expression.type === 'Ask') {
      const expr = ast[0].expression;
      console.log(`    Target: ${expr.target.type === 'SystemIdentifier' ? expr.target.name : expr.target.type}`);
      console.log(`    Argument: ${expr.arg.type === 'Number' ? expr.arg.value : expr.arg.type}`);
    } else if (ast[0].expression.type === 'Call') {
      const expr = ast[0].expression;
      console.log(`    Target: ${expr.target.type === 'Number' ? expr.target.value : expr.target.type}`);
      console.log(`    Args: ${expr.arguments.positional.length} positional`);
    }
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}`);
  }
}

console.log("=== RiX Mathematical Postfix Operators Showcase ===");
console.log("\nDemonstrating precision control, queries, and universal function calls");
console.log("in mathematical contexts using AT (@), ASK (?), and CALL (()) operators.");

console.log("\n--- Mathematical Constants with Precision ---");
parseAndShow("PI@(1e-15);", "Ultra-high precision PI");
parseAndShow("E@(machine_epsilon);", "Natural constant E with machine precision");
parseAndShow("SQRT2@(tolerance);", "Square root of 2 with custom tolerance");
parseAndShow("PHI@(golden_precision);", "Golden ratio with specified precision");

console.log("\n--- Interval and Range Queries ---");
parseAndShow("PI?(3.14159:3.14160);", "Check if PI is in tight interval");
parseAndShow("E?(2:3);", "Verify E is between 2 and 3");
parseAndShow("SQRT2?(1.41:1.42);", "Range check for square root of 2");
parseAndShow("(1/3)?(0.333:0.334);", "Rational approximation verification");

console.log("\n--- Function Evaluations with Precision ---");
parseAndShow("SIN(PI)@(numerical_precision);", "Sine of PI with precision control");
parseAndShow("LOG(E)@(1e-12);", "Natural log of E (should be 1) with high precision");
parseAndShow("SQRT(2)@(eps)?(1.41:1.42);", "Square root with precision and range check");
parseAndShow("COS(PI/2)@(tolerance)?(0:0.001);", "Cosine near zero with verification");

console.log("\n--- Mathematical Operations as Function Calls ---");
parseAndShow("2(3);", "Scalar multiplication: 2 * 3");
parseAndShow("(2,3)(4,5);", "Vector/tuple operation");
parseAndShow("matrix(vector);", "Matrix-vector multiplication");
parseAndShow("polynomial(x);", "Polynomial evaluation at x");

console.log("\n--- Operators as Mathematical Functions ---");
parseAndShow("+(3, 4, 7, 9);", "Addition operator as variadic function");
parseAndShow("*(2, 3, 5);", "Multiplication operator as function");
parseAndShow("-(10, 3);", "Subtraction operator as function");
parseAndShow("/(12, 3, 2);", "Division operator as function");
parseAndShow("^(2, 8);", "Exponentiation operator as function");
parseAndShow("MAX(1, 5, 3, 9, 2);", "Maximum using operator syntax");
parseAndShow("MIN(4, 2, 8, 1, 6);", "Minimum using operator syntax");

console.log("\n--- Complex Mathematical Expressions ---");
parseAndShow("(a + b)@(error_bound)?(expected_range);", "Sum with error analysis");
parseAndShow("derivative(f)(x)@(h);", "Derivative evaluation with step size");
parseAndShow("integral(g)(a, b)@(quadrature_precision);", "Numerical integration with precision");
parseAndShow("solver(equation)@(convergence_tol)?(solution_bounds);", "Equation solving with tolerance and bounds");

console.log("\n--- Functional Mathematical Composition ---");
parseAndShow("+(*(2, 3), /(8, 2), ^(2, 3));", "Complex arithmetic: (2*3) + (8/2) + (2^3)");
parseAndShow("*(+(1, 2, 3), -(10, 4));", "Nested operations: (1+2+3) * (10-4)");
parseAndShow("=(+(a, b), *(c, d));", "Equation using operator functions: (a+b) = (c*d)");
parseAndShow("<(+(x, y), *(z, w));", "Inequality using operators: (x+y) < (z*w)");

console.log("\n--- Chained Mathematical Operations ---");
parseAndShow("PI@(1e-10)?(3.1415:3.1416);", "High-precision PI with range verification");
parseAndShow("SIN(x)@(precision)?(output_range);", "Function evaluation with precision and output validation");
parseAndShow("optimization(objective)@(tolerance)?(feasible_region);", "Optimization with precision and constraint checking");
parseAndShow("monte_carlo(samples)@(confidence)?(error_bounds);", "Monte Carlo simulation with confidence and error analysis");

console.log("\n--- Nested and Complex Expressions ---");
parseAndShow("f(g(x)@(inner_tol))@(outer_tol);", "Nested function composition with tolerances");
parseAndShow("series(n)@(convergence_rate)?(sum_bounds);", "Infinite series with convergence control");
parseAndShow("matrix(data)(transform)@(numerical_stability);", "Matrix operations with stability analysis");
parseAndShow("interpolant(points)(query_point)@(approximation_error);", "Interpolation with error estimation");

console.log("\n--- Scientific Computing Examples ---");
parseAndShow("finite_difference(f, h)@(truncation_error);", "Numerical differentiation with error control");
parseAndShow("ode_solver(system, t0, tf)@(step_size)?(stability_region);", "ODE solving with step control and stability");
parseAndShow("fft(signal)@(precision)?(frequency_bounds);", "Fast Fourier Transform with precision and frequency analysis");
parseAndShow("eigenvalues(matrix)@(numerical_precision)?(spectrum_bounds);", "Eigenvalue computation with precision and spectral bounds");

console.log("\n--- Probabilistic and Statistical Operations ---");
parseAndShow("random_variable?(confidence_interval);", "Statistical confidence checking");
parseAndShow("distribution(parameters)@(sampling_precision);", "Probability distribution with sampling control");
parseAndShow("hypothesis_test(data)@(significance_level)?(p_value_range);", "Statistical testing with significance and p-value bounds");
parseAndShow("regression(data)@(fit_tolerance)?(residual_bounds);", "Regression analysis with fit quality and residual analysis");

console.log("\n=== Mathematical Semantics ===");
console.log("• AT (@): Controls numerical precision, error bounds, and computational tolerances");
console.log("• ASK (?): Verifies mathematical properties, range membership, and constraint satisfaction");
console.log("• CALL (()): Enables universal mathematical operations on any mathematical object");
console.log("• Operators as Functions: +, -, *, /, ^, <, >, = can be used as variadic functions");
console.log("• Chaining: Allows complex mathematical workflows with precision propagation");
console.log("• Applications: Numerical analysis, scientific computing, mathematical verification");
console.log("• Functional Style: Enables functional programming approaches to mathematical computation");