/**
 * Basic RiX Parser Usage Examples
 * Demonstrates fundamental tokenization and parsing operations
 */

import { tokenize, parse } from "../../src/parser/index.js";

console.log("=== RiX Parser Basic Usage Examples ===\n");

// Example 1: Basic arithmetic
console.log("1. Basic Arithmetic:");
const expr1 = "2 + 3 * 4";
const tokens1 = tokenize(expr1);
const ast1 = parse(tokens1);
console.log(`Input: ${expr1}`);
console.log(`Tokens: ${tokens1.map((t) => t.value).join(", ")}`);
console.log(`AST Type: ${ast1.type}`);
console.log(`AST Structure:`, JSON.stringify(ast1, null, 2));
console.log();

// Example 2: Assignment
console.log("2. Variable Assignment:");
const expr2 = "x := 5 + 2";
const ast2 = parse(expr2);
console.log(`Input: ${expr2}`);
console.log(`AST Type: ${ast2.type}`);
console.log(`Variable: ${ast2.left.name}`);
console.log(`Operator: ${ast2.operator}`);
console.log();

// Example 3: Function definition
console.log("3. Function Definition:");
const expr3 = "f(x) := x^2 + 1";
const ast3 = parse(expr3);
console.log(`Input: ${expr3}`);
console.log(`AST Type: ${ast3.type}`);
console.log(`Function Name: ${ast3.left.function.name}`);
console.log(
  `Parameters:`,
  ast3.left.arguments.positional.map((p) => p.name),
);
console.log();

// Example 4: Complex numbers
console.log("4. Number Formats:");
const numbers = [
  "42", // Integer
  "3.14", // Decimal
  "3/4", // Rational
  "1..3/4", // Mixed number
  "2:5", // Interval
  "3.2~[m]", // Number with scientific unit
  "2~{i}", // Complex number with mathematical unit
  "0.12#34", // Repeating decimal
];

numbers.forEach((num) => {
  const tokens = tokenize(num);
  const ast = parse(tokens);
  console.log(`${num.padEnd(8)} → ${ast.type} (value: ${ast.value})`);
});
console.log();

// Example 5: Arrays and matrices
console.log("5. Collections:");
const expr5 = "[[1, 2; 3, 4]]";
const ast5 = parse(expr5);
console.log(`Input: ${expr5}`);
console.log(`AST Type: ${ast5.type}`);
console.log(`Dimensions: ${ast5.rows.length}×${ast5.rows[0].length}`);
console.log();

// Example 6: Array generators
console.log("6. Array Generators:");
const expr6 = "[1 |+ 2 |^ 5]";
const ast6 = parse(expr6);
console.log(`Input: ${expr6}`);
console.log(`AST Type: ${ast6.type}`);
console.log(`Element Type: ${ast6.elements[0].type}`);
console.log(
  `Generator Operations:`,
  ast6.elements[0].operators.map((op) => op.operator),
);
console.log();

// Example 7: Pipe operations
console.log("7. Pipe Operations:");
const expr7 = "x |> f |>> g";
const ast7 = parse(expr7);
console.log(`Input: ${expr7}`);
console.log(`AST Type: ${ast7.type}`);
console.log(`Pipe Chain:`, ast7.operator);
console.log();

// Example 8: Explicit multifunction literal
console.log("8. Multifunction Literal:");
const expr8 = "{> (x) ?- [x >= 0] -> x, (x) -> -x }";
const ast8 = parse(expr8);
console.log(`Input: ${expr8}`);
console.log(`AST Type: ${ast8[0].expression.type}`);
console.log(`Variant Count: ${ast8[0].expression.elements.length}`);
console.log();

// Example 9: Symbolic calculus
console.log("9. Symbolic Calculus:");
const expr9 = "f'(x)";
const ast9 = parse(expr9);
console.log(`Input: ${expr9}`);
console.log(`AST Type: ${ast9.type}`);
console.log(`Operation: ${ast9.operation}`);
console.log();

// Example 10: Error handling
console.log("10. Error Handling:");
try {
  const badExpr = "2 + + 3";
  parse(badExpr);
} catch (error) {
  console.log(`Input: 2 + + 3`);
  console.log(`Error: ${error.message}`);
  console.log(`This demonstrates parser error reporting`);
}
console.log();

// Example 11: Token inspection
console.log("11. Token Details:");
const expr11 = "x := 3.14~[m]";
const tokens11 = tokenize(expr11);
console.log(`Input: ${expr11}`);
console.log("Token Details:");
tokens11.forEach((token, i) => {
  if (token.type !== "End") {
    console.log(
      `  ${i}: ${token.type.padEnd(10)} | ${token.value.padEnd(6)} | pos: [${token.pos[0]}, ${token.pos[2]}]`,
    );
  }
});
console.log();

// Example 12: Complex expression
console.log("12. Complex Expression:");
const expr12 = "result := [1 |+ 2 |^ 10] |> SUM |> (x) -> x / 2";
const ast12 = parse(expr12);
console.log(`Input: ${expr12}`);
console.log(`AST Type: ${ast12.type}`);
console.log(`This combines assignment, generators, pipes, and lambdas`);
console.log();

console.log("=== Examples Complete ===");

// Export examples for use in other files
export const examples = {
  arithmetic: () => parse("2 + 3 * 4"),
  assignment: () => parse("x := 5"),
  function: () => parse("f(x) := x^2"),
  array: () => parse("[1, 2, 3]"),
  matrix: () => parse("[[1, 2; 3, 4]]"),
  generator: () => parse("[1 |+ 2 |^ 5]"),
  pipe: () => parse("x |> f"),
  calculus: () => parse("f'(x)"),
  complex: () => parse("result := [1 |+ 2 |^ 10] |> SUM"),
};
