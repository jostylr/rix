import { test, expect, describe } from "bun:test";
import { SystemLoader } from "../../src/parser/system-loader.js";
import { parse, tokenize } from "../../src/parser/index.js";

describe("Functional Control Structures", () => {
  test("SystemLoader enables functional form for control keywords", () => {
    const systemLoader = new SystemLoader();

    // Register WHILE as control keyword
    systemLoader.registerKeyword("WHILE", {
      type: "control",
      structure: "loop",
      precedence: 5,
      category: "control",
    });

    // Lookup should return function-compatible info for control keywords
    const whileInfo = systemLoader.lookup("WHILE");
    expect(whileInfo.type).toBe("function");
    expect(whileInfo.functionalForm).toBe(true);
    expect(whileInfo.controlType).toBe("control");
    expect(whileInfo.arity).toBe(2); // condition, body
  });

  test("IF keyword supports variable arity for functional form", () => {
    const systemLoader = new SystemLoader();

    systemLoader.registerKeyword("IF", {
      type: "control",
      structure: "conditional",
      precedence: 5,
      category: "control",
    });

    const ifInfo = systemLoader.lookup("IF");
    expect(ifInfo.type).toBe("function");
    expect(ifInfo.arity).toBe(-1); // Variable args: condition, then, [else]
  });

  test("FOR keyword has correct arity for functional form", () => {
    const systemLoader = new SystemLoader();

    systemLoader.registerKeyword("FOR", {
      type: "control",
      structure: "loop",
      precedence: 5,
      category: "control",
    });

    const forInfo = systemLoader.lookup("FOR");
    expect(forInfo.type).toBe("function");
    expect(forInfo.arity).toBe(4); // init, condition, increment, body
  });

  test("parser recognizes WHILE as function call", () => {
    const systemLoader = new SystemLoader();

    systemLoader.registerKeyword("WHILE", {
      type: "control",
      structure: "loop",
      precedence: 5,
      category: "control",
    });

    const code = "WHILE(i < 5, i := i + 1)";
    const tokens = tokenize(code);
    const ast = parse(tokens, systemLoader.createParserLookup());

    expect(ast.length).toBe(1);
    expect(ast[0].type).toBe("FunctionCall");
    expect(ast[0].function.type).toBe("SystemIdentifier");
    expect(ast[0].function.name).toBe("WHILE");
    expect(ast[0].arguments.positional.length).toBe(2);
  });

  test("parser recognizes IF as function call with multiple arguments", () => {
    const systemLoader = new SystemLoader();

    systemLoader.registerKeyword("IF", {
      type: "control",
      structure: "conditional",
      precedence: 5,
      category: "control",
    });

    const code = "IF(x > 0, result := x, result := -x)";
    const tokens = tokenize(code);
    const ast = parse(tokens, systemLoader.createParserLookup());

    expect(ast.length).toBe(1);
    expect(ast[0].type).toBe("FunctionCall");
    expect(ast[0].function.name).toBe("IF");
    expect(ast[0].arguments.positional.length).toBe(3);
  });

  test("nested functional controls parse correctly", () => {
    const systemLoader = new SystemLoader();

    ["WHILE", "IF"].forEach((keyword) => {
      systemLoader.registerKeyword(keyword, {
        type: "control",
        structure: keyword === "WHILE" ? "loop" : "conditional",
        precedence: 5,
        category: "control",
      });
    });

    const code = "IF(n > 0, WHILE(i < n, i := i + 1), i := 0)";
    const tokens = tokenize(code);
    const ast = parse(tokens, systemLoader.createParserLookup());

    expect(ast.length).toBe(1);
    expect(ast[0].type).toBe("FunctionCall");
    expect(ast[0].function.name).toBe("IF");

    // Check nested WHILE in then branch
    const thenBranch = ast[0].arguments.positional[1];
    expect(thenBranch.type).toBe("FunctionCall");
    expect(thenBranch.function.name).toBe("WHILE");
  });

  test("mixed functional and traditional syntax tokens correctly", () => {
    const systemLoader = new SystemLoader();

    systemLoader.registerKeyword("WHILE", {
      type: "control",
      structure: "loop",
      precedence: 5,
      category: "control",
    });

    systemLoader.registerKeyword("DO", {
      type: "control",
      structure: "loop_body",
      precedence: 4,
      category: "control",
    });

    // Functional form
    const functionalCode = "WHILE(i < 5, i := i + 1)";
    const functionalTokens = tokenize(functionalCode);
    const systemTokens = functionalTokens.filter(
      (t) => t.type === "Identifier" && t.kind === "System",
    );
    expect(systemTokens.length).toBe(1);
    expect(systemTokens[0].value).toBe("WHILE");

    // Traditional form would have both WHILE and DO
    const traditionalCode = "WHILE i < 5 DO i := i + 1";
    const traditionalTokens = tokenize(traditionalCode);
    const traditionalSystemTokens = traditionalTokens.filter(
      (t) => t.type === "Identifier" && t.kind === "System",
    );
    expect(traditionalSystemTokens.length).toBe(2);
    expect(traditionalSystemTokens.map((t) => t.value)).toEqual([
      "WHILE",
      "DO",
    ]);
  });

  test("complex expressions as control arguments parse correctly", () => {
    const systemLoader = new SystemLoader();

    systemLoader.registerKeyword("WHILE", {
      type: "control",
      structure: "loop",
      precedence: 5,
      category: "control",
    });

    const code = "WHILE(x^2 + y^2 < radius^2, {; x := x + dx; y := y + dy })";
    const tokens = tokenize(code);
    const ast = parse(tokens, systemLoader.createParserLookup());

    expect(ast.length).toBe(1);
    expect(ast[0].type).toBe("FunctionCall");
    expect(ast[0].arguments.positional.length).toBe(2);

    // First argument should be a complex binary operation
    const condition = ast[0].arguments.positional[0];
    expect(condition.type).toBe("BinaryOperation");
    expect(condition.operator).toBe("<");
  });

  test("getControlArity returns correct values", () => {
    const systemLoader = new SystemLoader();

    const testCases = [
      { name: "WHILE", structure: "loop", expected: 2 },
      { name: "IF", structure: "conditional", expected: -1 },
      { name: "FOR", structure: "loop", expected: 4 }, // FOR has 4 args: init, condition, increment, body
      { name: "DO", structure: "loop_body", expected: 1 },
      { name: "CUSTOM", structure: "unknown", expected: -1 },
    ];

    testCases.forEach(({ name, structure, expected }) => {
      const arity = systemLoader.getControlArity(name, { structure });
      expect(arity).toBe(expected);
    });
  });

  test("functional controls integrate with assignment", () => {
    const systemLoader = new SystemLoader();

    systemLoader.registerKeyword("IF", {
      type: "control",
      structure: "conditional",
      precedence: 5,
      category: "control",
    });

    const code = "result := IF(x > 0, x, -x)";
    const tokens = tokenize(code);
    const ast = parse(tokens, systemLoader.createParserLookup());

    expect(ast.length).toBe(1);
    expect(ast[0].type).toBe("BinaryOperation");
    expect(ast[0].operator).toBe(":=");

    // Right side should be IF function call
    const rightSide = ast[0].right;
    expect(rightSide.type).toBe("FunctionCall");
    expect(rightSide.function.name).toBe("IF");
  });

  test("multiple control structures in sequence", () => {
    const systemLoader = new SystemLoader();

    ["WHILE", "IF", "FOR"].forEach((keyword) => {
      systemLoader.registerKeyword(keyword, {
        type: "control",
        structure: keyword === "IF" ? "conditional" : "loop",
        precedence: 5,
        category: "control",
      });
    });

    const code =
      "sum := 0; WHILE(i < n, sum := sum + i; i := i + 1); result := IF(sum > 0, sum, 0)";
    const tokens = tokenize(code);
    const ast = parse(tokens, systemLoader.createParserLookup());

    expect(ast.length).toBe(3); // Three statements

    // Helper function to get actual node (handle both Statement wrapped and direct)
    const getNode = (stmt) =>
      stmt.type === "Statement" ? stmt.expression : stmt;

    // Check each statement
    const stmt0 = getNode(ast[0]);
    expect(stmt0.type).toBe("BinaryOperation"); // sum := 0

    const stmt1 = getNode(ast[1]);
    expect(stmt1.type).toBe("FunctionCall"); // WHILE(...)
    expect(stmt1.function.name).toBe("WHILE");

    const stmt2 = getNode(ast[2]);
    expect(stmt2.type).toBe("BinaryOperation"); // result := IF(...)
    expect(stmt2.right.type).toBe("FunctionCall");
    expect(stmt2.right.function.name).toBe("IF");
  });

  test("browser integration functions work", () => {
    const systemLoader = new SystemLoader({ browserIntegration: false });

    // Test the defineControlFlow equivalent
    const controlKeywords = {
      IF: { structure: "conditional", precedence: 5 },
      WHILE: { structure: "loop", precedence: 5 },
      FOR: { structure: "loop", precedence: 5 },
    };

    Object.entries(controlKeywords).forEach(([keyword, config]) => {
      systemLoader.registerKeyword(keyword, {
        type: "control",
        structure: config.structure,
        precedence: config.precedence,
        category: "control",
        functionalForm: true,
      });
    });

    // Verify all keywords are functional
    ["IF", "WHILE", "FOR"].forEach((keyword) => {
      const info = systemLoader.lookup(keyword);
      expect(info.type).toBe("function");
      expect(info.functionalForm).toBe(true);
    });
  });

  test("error handling for malformed functional controls", () => {
    const systemLoader = new SystemLoader();

    systemLoader.registerKeyword("WHILE", {
      type: "control",
      structure: "loop",
      precedence: 5,
      category: "control",
    });

    // Test cases that should still parse but might not execute correctly
    const errorCases = [
      "WHILE()", // No arguments
      "WHILE(x)", // Too few arguments
      "WHILE(x, y, z)", // Too many arguments (but parser should still work)
    ];

    errorCases.forEach((code) => {
      const tokens = tokenize(code);
      // Should parse without throwing
      expect(() => {
        const ast = parse(tokens, systemLoader.createParserLookup());
        expect(ast.length).toBe(1);
        expect(ast[0].type).toBe("FunctionCall");
      }).not.toThrow();
    });
  });
});

describe("Real-world functional control usage", () => {
  test("mathematical computation with functional WHILE", () => {
    const systemLoader = new SystemLoader();

    systemLoader.registerKeyword("WHILE", {
      type: "control",
      structure: "loop",
      precedence: 5,
      category: "control",
    });

    // Computing factorial using functional WHILE
    const code =
      "n := 5; result := 1; i := 1; WHILE(i <= n, {; result := result * i; i := i + 1 })";
    const tokens = tokenize(code);
    const ast = parse(tokens, systemLoader.createParserLookup());

    expect(ast.length).toBe(4);

    // Find the WHILE statement
    const whileStmt = ast.find(
      (stmt) =>
        (stmt.type === "FunctionCall" && stmt.function?.name === "WHILE") ||
        (stmt.type === "Statement" &&
          stmt.expression?.type === "FunctionCall" &&
          stmt.expression.function?.name === "WHILE"),
    );

    // Get the actual function call node
    const actualWhileCall =
      whileStmt.type === "Statement" ? whileStmt.expression : whileStmt;

    expect(whileStmt).toBeDefined();
    expect(actualWhileCall.arguments.positional.length).toBe(2);
  });

  test("conditional logic with functional IF", () => {
    const systemLoader = new SystemLoader();

    systemLoader.registerKeyword("IF", {
      type: "control",
      structure: "conditional",
      precedence: 5,
      category: "control",
    });

    // Absolute value using functional IF
    const code = "abs := IF(x >= 0, x, -x)";
    const tokens = tokenize(code);
    const ast = parse(tokens, systemLoader.createParserLookup());

    expect(ast.length).toBe(1);

    // Handle both Statement wrapped and direct nodes
    const stmt = ast[0].type === "Statement" ? ast[0].expression : ast[0];
    expect(stmt.type).toBe("BinaryOperation");
    expect(stmt.operator).toBe(":=");

    const ifCall = stmt.right;
    expect(ifCall.type).toBe("FunctionCall");
    expect(ifCall.function.name).toBe("IF");
    expect(ifCall.arguments.positional.length).toBe(3);
  });

  test("mixed functional and mathematical operations", () => {
    const systemLoader = new SystemLoader();

    ["WHILE", "IF"].forEach((keyword) => {
      systemLoader.registerKeyword(keyword, {
        type: "control",
        structure: keyword === "WHILE" ? "loop" : "conditional",
        precedence: 5,
        category: "control",
      });
    });

    // Complex expression mixing math and control
    const code = "result := SIN(x) + IF(x > 0, WHILE(i < x, i := i + 1), 0)";
    const tokens = tokenize(code);
    const ast = parse(tokens, systemLoader.createParserLookup());

    expect(ast.length).toBe(1);
    expect(ast[0].type).toBe("BinaryOperation");

    // Should find both SIN function and IF function in the expression
    const rightSide = ast[0].right;
    expect(rightSide.type).toBe("BinaryOperation");
    expect(rightSide.operator).toBe("+");
  });
});
