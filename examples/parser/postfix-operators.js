import { tokenize } from ../../src/parser/tokenizer.js";
import { parse } from ../../src/parser/parser.js";

// Test system lookup function
function testSystemLookup(name) {
  const systemSymbols = {
    SIN: { type: "function", arity: 1 },
    COS: { type: "function", arity: 1 },
    LOG: { type: "function", arity: 1 },
    PI: { type: "constant", value: Math.PI },
    E: { type: "constant", value: Math.E },
    SQRT2: { type: "constant", value: Math.sqrt(2) },
    THIRD: { type: "constant", value: 1/3 }
  };
  return systemSymbols[name] || { type: "identifier" };
}

function parseCode(code) {
  const tokens = tokenize(code);
  return parse(tokens, testSystemLookup);
}

console.log("=== RiX Postfix Operators Examples ===\n");

// AT operator (@) examples
console.log("--- AT Operator (@) Examples ---");
console.log("Purpose: Access precision/metadata properties on mathematical objects\n");

console.log("1. Get PI with specific precision:");
console.log("   PI@(1e-6)");
console.log("   AST:", JSON.stringify(parseCode("PI@(1e-6);"), null, 2));
console.log();

console.log("2. Get sqrt(2) with high precision:");
console.log("   SQRT2@(1e-10)");
console.log("   AST:", JSON.stringify(parseCode("SQRT2@(1e-10);"), null, 2));
console.log();

console.log("3. AT operation on complex expression:");
console.log("   (1/3)@(epsilon)");
console.log("   AST:", JSON.stringify(parseCode("(1/3)@(epsilon);"), null, 2));
console.log();

console.log("4. Chained AT operations for refinement:");
console.log("   PI@(1e-3)@(1e-6)");
console.log("   AST:", JSON.stringify(parseCode("PI@(1e-3)@(1e-6);"), null, 2));
console.log();

// ASK operator (?) examples
console.log("--- ASK Operator (?) Examples ---");
console.log("Purpose: Query membership/properties of mathematical objects\n");

console.log("1. Check if PI is in interval [3, 4]:");
console.log("   PI?(3:4)");
console.log("   AST:", JSON.stringify(parseCode("PI?(3:4);"), null, 2));
console.log();

console.log("2. Check if rational 1/3 is in decimal range:");
console.log("   THIRD?(0.333:0.334)");
console.log("   AST:", JSON.stringify(parseCode("THIRD?(0.333:0.334);"), null, 2));
console.log();

console.log("3. Query if x is in an interval:");
console.log("   interval?(x)");
console.log("   AST:", JSON.stringify(parseCode("interval?(x);"), null, 2));
console.log();

console.log("4. Chained ASK operations:");
console.log("   PI?(3:4)?(true)");
console.log("   AST:", JSON.stringify(parseCode("PI?(3:4)?(true);"), null, 2));
console.log();

// Enhanced CALL operator examples
console.log("--- Enhanced CALL Operator Examples ---");
console.log("Purpose: Universal function call/multiplication on any object\n");

console.log("1. Traditional function call (backward compatible):");
console.log("   SIN(PI)");
console.log("   AST:", JSON.stringify(parseCode("SIN(PI);"), null, 2));
console.log();

console.log("2. Number multiplication via call:");
console.log("   3(4)  // equivalent to 3 * 4");
console.log("   AST:", JSON.stringify(parseCode("3(4);"), null, 2));
console.log();

console.log("3. Tuple multiplication:");
console.log("   (2,3)(4,5)  // element-wise or cross product");
console.log("   AST:", JSON.stringify(parseCode("(2,3)(4,5);"), null, 2));
console.log();

console.log("4. Chained function calls:");
console.log("   f(x)(y)");
console.log("   AST:", JSON.stringify(parseCode("f(x)(y);"), null, 2));
console.log();

// Mixed operations examples
console.log("--- Mixed Postfix Operations ---");
console.log("Purpose: Combining multiple postfix operators\n");

console.log("1. AT followed by ASK:");
console.log("   PI@(1e-3)?(3.141:3.142)");
console.log("   AST:", JSON.stringify(parseCode("PI@(1e-3)?(3.141:3.142);"), null, 2));
console.log();

console.log("2. Function call followed by AT:");
console.log("   f(x)@(epsilon)");
console.log("   AST:", JSON.stringify(parseCode("f(x)@(epsilon);"), null, 2));
console.log();

console.log("3. All three operators chained:");
console.log("   f(x)@(1e-6)?(result)");
console.log("   AST:", JSON.stringify(parseCode("f(x)@(1e-6)?(result);"), null, 2));
console.log();

// Precedence examples
console.log("--- Precedence Examples ---");
console.log("Purpose: Demonstrating operator precedence\n");

console.log("1. Postfix binds tighter than binary operators:");
console.log("   x@(eps) + y");
console.log("   AST:", JSON.stringify(parseCode("x@(eps) + y;"), null, 2));
console.log();

console.log("2. Postfix ? vs infix ? precedence:");
console.log("   x?(test) ? y : z");
console.log("   AST:", JSON.stringify(parseCode("x?(test) ? y : z;"), null, 2));
console.log();

console.log("3. Property access vs postfix operator:");
console.log("   obj.prop@(eps)");
console.log("   AST:", JSON.stringify(parseCode("obj.prop@(eps);"), null, 2));
console.log();

// Practical mathematical examples
console.log("--- Practical Mathematical Examples ---");
console.log();

console.log("1. Interval arithmetic with precision control:");
console.log("   a := (1:2)@(1e-8);");
console.log("   AST:", JSON.stringify(parseCode("a := (1:2)@(1e-8);"), null, 2));
console.log();

console.log("2. Function composition with metadata:");
console.log("   result := SIN(PI)@(precision)?(expected_range);");
console.log("   AST:", JSON.stringify(parseCode("result := SIN(PI)@(precision)?(expected_range);"), null, 2));
console.log();

console.log("3. Matrix operations:");
console.log("   transform := matrix(data)(vector);");
console.log("   AST:", JSON.stringify(parseCode("transform := matrix(data)(vector);"), null, 2));
console.log();

console.log("4. Oracle queries with precision:");
console.log("   oracle_result := oracle@(tolerance)?(bounds);");
console.log("   AST:", JSON.stringify(parseCode("oracle_result := oracle@(tolerance)?(bounds);"), null, 2));
console.log();

console.log("\n=== Summary ===");
console.log("- AT (@): Access metadata/precision properties");
console.log("- ASK (?): Query membership/boolean properties");
console.log("- CALL (()):  Universal function call/multiplication");
console.log("- All operators can be chained and have highest precedence");
console.log("- Postfix ? must be followed by ( to distinguish from infix ?");