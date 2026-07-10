import { tokenize } from ../../src/parser/tokenizer.js";
import { parse } from ../../src/parser/parser.js";

// Basic system lookup
function systemLookup(name) {
  const symbols = {
    PI: { type: "constant", value: Math.PI },
    SIN: { type: "function", arity: 1 },
    COS: { type: "function", arity: 1 }
  };
  return symbols[name] || { type: "identifier" };
}

function demo(code, description) {
  console.log(`\n${description}:`);
  console.log(`  ${code}`);
  try {
    const tokens = tokenize(code);
    const ast = parse(tokens, systemLookup);
    console.log(`  ✓ Parsed successfully`);
    console.log(`  AST: ${ast[0].expression.type}`);
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}`);
  }
}

console.log("=== RiX Postfix Operators Demo ===");

// AT operator (@) - precision/metadata access
demo("PI@(1e-6);", "AT: Get PI with precision 1e-6");
demo("sqrt2@(epsilon);", "AT: Variable precision control");
demo("(1/3)@(1e-10);", "AT: Precision on expressions");
demo("x@(tol)@(refined_tol);", "AT: Chained precision refinement");

// ASK operator (?) - membership/query
demo("PI?(3:4);", "ASK: Check if PI is in interval [3,4]");
demo("interval?(x);", "ASK: Query membership");
demo("(1/3)?(0.333:0.334);", "ASK: Range checking");
demo("result?(expected);", "ASK: Boolean queries");

// Enhanced CALL operator - universal function call
demo("SIN(PI);", "CALL: Traditional function (backward compatible)");
demo("3(4);", "CALL: Number multiplication (3 * 4)");
demo("(2,3)(4,5);", "CALL: Tuple operations");
demo("f(x)(y);", "CALL: Chained function calls");

// Operators as functions
demo("+(3, 4, 7, 9);", "CALL: Addition operator as function");
demo("*(2, 3, 5);", "CALL: Multiplication operator as function");
demo("<(x, y);", "CALL: Comparison operator as function");
demo("*(+(2, 3), /(6, 2));", "CALL: Nested operator functions");

// Mixed operations
demo("PI@(1e-3)?(3.141:3.142);", "MIXED: AT then ASK");
demo("f(x)@(eps);", "MIXED: CALL then AT");
demo("g(x)@(tol)?(bounds);", "MIXED: All three operators");

// Precedence demonstrations
demo("x@(eps) + y;", "PRECEDENCE: Postfix binds tighter than +");
demo("x?(test) ? y : z;", "PRECEDENCE: Postfix ? vs infix ?");
demo("obj.prop@(eps);", "PRECEDENCE: Property access vs AT");

// Error cases
console.log("\n--- Error Cases ---");
demo("x@y;", "ERROR: @ without parentheses (becomes infix)");
demo("x?(;", "ERROR: Unclosed parentheses");

console.log("\n=== Key Features ===");
console.log("• AT (@): Precision/metadata access - requires @(arg)");
console.log("• ASK (?): Boolean queries - requires ?(arg)");  
console.log("• CALL (()):  Universal function call on any expression");
console.log("• Highest precedence: binds tighter than all other operators");
console.log("• Chainable: Can combine multiple postfix operators");
console.log("• Context-sensitive: Postfix ? differs from infix ?");