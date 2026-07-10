import { tokenize } from ../../src/parser/tokenizer.js";
import { parse } from ../../src/parser/parser.js";

function systemLookup(name) {
  const systemSymbols = {
    SIN: { type: "function", arity: 1 },
    COS: { type: "function", arity: 1 },
    TAN: { type: "function", arity: 1 },
    LOG: { type: "function", arity: 1 },
    EXP: { type: "function", arity: 1 },
    SQRT: { type: "function", arity: 1 },
    ATAN2: { type: "function", arity: 2 },
    POW: { type: "function", arity: 2 },
    PI: { type: "constant", value: Math.PI },
    E: { type: "constant", value: Math.E },
  };
  return systemSymbols[name] || { type: "identifier" };
}

function analyzeCalculusExpression(description, code) {
  console.log(`\n${description}:`);
  console.log(`Expression: ${code}`);

  try {
    const tokens = tokenize(code);
    const ast = parse(tokens, systemLookup);
    const result = ast[0];

    // Deep analysis of the calculus expression
    const analysis = analyzeNode(result, 0);
    console.log("Analysis:");
    console.log(analysis);
  } catch (error) {
    console.log(`✗ Parse error: ${error.message}`);
  }
}

function analyzeNode(node, depth) {
  const indent = "  ".repeat(depth);
  let analysis = "";

  if (!node || typeof node !== "object") {
    return `${indent}${node}`;
  }

  switch (node.type) {
    case "Derivative":
      analysis += `${indent}DERIVATIVE (order ${node.order}):\n`;
      analysis += `${indent}  Function: ${getFunctionName(node.function)}\n`;
      if (node.variables) {
        analysis += `${indent}  Variables: [${node.variables.map((v) => v.name).join(", ")}]\n`;
      }
      if (node.evaluation) {
        analysis += `${indent}  Evaluated at: [${node.evaluation.map((e) => getFunctionName(e)).join(", ")}]\n`;
      }
      if (node.operations) {
        analysis += `${indent}  Operation sequence:\n`;
        node.operations.forEach((op, i) => {
          analysis += `${indent}    ${i + 1}. ${analyzeNode(op, depth + 2).trim()}\n`;
        });
      }
      if (
        node.function.type === "Derivative" ||
        node.function.type === "Integral"
      ) {
        analysis += `${indent}  Base operation:\n`;
        analysis += analyzeNode(node.function, depth + 1);
      }
      break;

    case "Integral":
      analysis += `${indent}INTEGRAL (order ${node.order}):\n`;
      analysis += `${indent}  Function: ${getFunctionName(node.function)}\n`;
      if (node.variables) {
        analysis += `${indent}  Variables: [${node.variables.map((v) => v.name).join(", ")}]\n`;
      }
      if (node.evaluation) {
        analysis += `${indent}  Evaluated at: [${node.evaluation.map((e) => getFunctionName(e)).join(", ")}]\n`;
      }
      if (node.metadata) {
        analysis += `${indent}  Integration constant: ${node.metadata.integrationConstant} = ${node.metadata.defaultValue}\n`;
      }
      if (
        node.function.type === "Derivative" ||
        node.function.type === "Integral"
      ) {
        analysis += `${indent}  Base operation:\n`;
        analysis += analyzeNode(node.function, depth + 1);
      }
      break;

    case "FunctionCall":
      analysis += `${indent}${node.function.name}(${node.arguments.positional.map(getFunctionName).join(", ")})`;
      break;

    default:
      analysis += `${indent}${getFunctionName(node)}`;
  }

  return analysis;
}

function getFunctionName(node) {
  if (!node || typeof node !== "object") return String(node);

  switch (node.type) {
    case "UserIdentifier":
    case "SystemIdentifier":
      return node.name;
    case "FunctionCall":
      return `${node.function.name}(${node.arguments.positional.map(getFunctionName).join(", ")})`;
    case "Derivative":
      return `${getFunctionName(node.function)}${"'".repeat(node.order)}`;
    case "Integral":
      return `${"'".repeat(node.order)}${getFunctionName(node.function)}`;
    case "BinaryOperation":
      return `(${getFunctionName(node.left)} ${node.operator} ${getFunctionName(node.right)})`;
    default:
      return node.type;
  }
}

console.log("RiX Advanced Symbolic Calculus Analysis");
console.log("=====================================");

// Complex mixed calculus operations
analyzeCalculusExpression(
  "Mixed integration and differentiation sequence",
  "''f''[x, y, z]('x, y', 'z, x')",
);

analyzeCalculusExpression("Alternating calculus operations", "'f'('g')");

analyzeCalculusExpression("Nested function calculus", "SIN(COS(x))''");

// Path and parametric derivatives
analyzeCalculusExpression("Path derivative with parameter", "f'(r'(t))");

analyzeCalculusExpression("Multiple path derivatives", "g'(x'(t), y'(t))");

// Complex variable specifications
analyzeCalculusExpression(
  "Multi-variable partial derivatives",
  "f'''[x, y, z]",
);

analyzeCalculusExpression("Mixed partial with integration", "'f''[x, y](a, b)");

// Advanced function compositions
analyzeCalculusExpression(
  "Derivative of composed trigonometric functions",
  "SIN(COS(TAN(x)))'",
);

analyzeCalculusExpression("Logarithmic derivative", "LOG(x^2 + 1)'");

analyzeCalculusExpression("Exponential integral", "'EXP(x^2)");

// Multiple evaluation points
analyzeCalculusExpression(
  "Derivative at multiple evaluation points",
  "f'(a, b, c)",
);

analyzeCalculusExpression(
  "Double integral with boundaries",
  "''f[x, y](0, 1, 0, 2)",
);

// Complex operation sequences
analyzeCalculusExpression(
  "Five-step calculus sequence",
  "'''f'''('x, y', z', 'w, 'v)",
);

analyzeCalculusExpression("Integral-derivative chain", "''''f''''[w, x, y, z]");

// Function calculus with system functions
analyzeCalculusExpression(
  "Inverse trigonometric derivative",
  "ATAN2(y, x)'[x]",
);

analyzeCalculusExpression("Power function integral", "'POW(x, n)[x]");

// Edge cases and complex structures
analyzeCalculusExpression(
  "Evaluation containing calculus operations",
  "f'(g'(x), h''(y))",
);

analyzeCalculusExpression("Nested operation sequences", "f'('g'(h'('k)))");

console.log("\nAdvanced Calculus Analysis Complete!");
console.log("\nComplex Patterns Analyzed:");
console.log("• Deep nesting: f'('g'(h'('k)))");
console.log("• Multi-step sequences: '''f'''('x, y', z', 'w, 'v)");
console.log("• Path derivatives: f'(r'(t))");
console.log("• Mixed evaluation: f'(g'(x), h''(y))");
console.log("• Function composition: SIN(COS(TAN(x)))'");
console.log("• Multi-variable operations: f'''[x, y, z]");
console.log("• Integration constants: automatic metadata handling");
console.log("• Complex sequences: ''f''[x,y,z]('x,y',z','w,'v)");
