import { tokenize } from ../../src/parser/tokenizer.js";
import { parse } from ../../src/parser/parser.js";

// System lookup function for interval examples
function systemLookup(name) {
  const systemSymbols = {
    PI: { type: "constant", value: Math.PI },
    E: { type: "constant", value: Math.E },
    SIN: { type: "function", arity: 1 },
    COS: { type: "function", arity: 1 },
    SQRT: { type: "function", arity: 1 },
    MAX: { type: "function", arity: -1 },
    MIN: { type: "function", arity: -1 },
  };
  return systemSymbols[name] || { type: "identifier" };
}

// Helper function to demonstrate interval parsing
function demonstrateInterval(code, description) {
  console.log(`\n${description}`);
  console.log("=".repeat(50));
  console.log(`Expression: ${code}`);

  try {
    const tokens = tokenize(code);
    console.log(
      `Tokens: ${tokens
        .slice(0, -1)
        .map((t) => `${t.type}:${t.value}`)
        .join(" ")}`,
    );

    const ast = parse(tokens, systemLookup);
    const expr = ast[0]?.expression || ast[0];

    console.log(`AST Type: ${expr.type}`);

    // Display key properties based on operation type
    if (expr.type === "Number" && expr.value.includes(":")) {
      // Handle interval number tokens like "1:10"
      console.log(`Interval: [${expr.value}]`);
    } else if (expr.type === "BinaryOperation" && expr.operator === ":") {
      console.log(
        `Interval: [${expr.left.value || expr.left.name} : ${expr.right.value || expr.right.name}]`,
      );
    } else if (expr.type === "IntervalStepping") {
      const interval = expr.interval;
      if (interval && interval.value && interval.value.includes(":")) {
        console.log(`Interval: [${interval.value}]`);
      } else if (interval && interval.left && interval.right) {
        console.log(
          `Interval: [${interval.left.value || interval.left.name} : ${interval.right.value || interval.right.name}]`,
        );
      }
      console.log(`Step: ${expr.step.value || expr.step.name}`);
    } else if (
      expr.type === "IntervalDivision" ||
      expr.type === "equally_spaced"
    ) {
      const interval = expr.interval;
      if (interval && interval.value && interval.value.includes(":")) {
        console.log(`Interval: [${interval.value}]`);
      } else if (interval && interval.left && interval.right) {
        console.log(
          `Interval: [${interval.left.value || interval.left.name} : ${interval.right.value || interval.right.name}]`,
        );
      }
      console.log(
        `Points: ${expr.count.value || expr.count.name}, Type: equally_spaced`,
      );
    } else if (expr.type === "IntervalPartition") {
      const interval = expr.interval;
      if (interval && interval.value && interval.value.includes(":")) {
        console.log(`Interval: [${interval.value}]`);
      } else if (interval && interval.left && interval.right) {
        console.log(
          `Interval: [${interval.left.value || interval.left.name} : ${interval.right.value || interval.right.name}]`,
        );
      }
      console.log(`Sub-intervals: ${expr.count.value || expr.count.name}`);
    } else if (expr.type === "IntervalMediants") {
      const interval = expr.interval;
      if (interval && interval.value && interval.value.includes(":")) {
        console.log(`Interval: [${interval.value}]`);
      } else if (interval && interval.left && interval.right) {
        console.log(
          `Interval: [${interval.left.value || interval.left.name} : ${interval.right.value || interval.right.name}]`,
        );
      }
      console.log(`Levels: ${expr.levels.value || expr.levels.name}`);
    } else if (expr.type === "IntervalMediantPartition") {
      const interval = expr.interval;
      if (interval && interval.value && interval.value.includes(":")) {
        console.log(`Interval: [${interval.value}]`);
      } else if (interval && interval.left && interval.right) {
        console.log(
          `Interval: [${interval.left.value || interval.left.name} : ${interval.right.value || interval.right.name}]`,
        );
      }
      console.log(`Mediant Levels: ${expr.levels.value || expr.levels.name}`);
    } else if (expr.type === "IntervalRandom") {
      const interval = expr.interval;
      if (interval && interval.value && interval.value.includes(":")) {
        console.log(`Interval: [${interval.value}]`);
      } else if (interval && interval.left && interval.right) {
        console.log(
          `Interval: [${interval.left.value || interval.left.name} : ${interval.right.value || interval.right.name}]`,
        );
      }
      if (expr.parameters?.type === "Tuple") {
        console.log(
          `Parameters: (${expr.parameters.elements.map((e) => e.value || e.name).join(", ")})`,
        );
      } else {
        console.log(
          `Count: ${expr.parameters?.value || expr.parameters?.name || "unknown"}`,
        );
      }
    } else if (expr.type === "IntervalRandomPartition") {
      const interval = expr.interval;
      if (interval && interval.value && interval.value.includes(":")) {
        console.log(`Interval: [${interval.value}]`);
      } else if (interval && interval.left && interval.right) {
        console.log(
          `Interval: [${interval.left.value || interval.left.name} : ${interval.right.value || interval.right.name}]`,
        );
      }
      console.log(`Random Partitions: ${expr.count.value || expr.count.name}`);
    } else if (expr.type === "InfiniteSequence") {
      console.log(`Start: ${expr.start.value || expr.start.name}`);
      console.log(`Step: ${expr.step.value || expr.step.name}`);
    }

    console.log("✓ Parse successful");
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
  }
}

console.log("RiX Language: Interval Manipulation Examples");
console.log("=============================================");

// Basic Intervals
demonstrateInterval("1:10;", "Basic Integer Interval");
demonstrateInterval("0.5:3.7;", "Decimal Interval");
demonstrateInterval("a:b;", "Variable Bounds Interval");

// Interval Stepping
demonstrateInterval("1:10 :+ 2;", "Increment Stepping: 1, 3, 5, 7, 9");
demonstrateInterval("10:1 :+ -3;", "Decrement Stepping: 10, 7, 4, 1");
demonstrateInterval("0:PI :+ 0.5;", "Decimal Stepping with Constants");

// Interval Division
demonstrateInterval("1:5::3;", "Equally Spaced Points: 1, 3, 5");
demonstrateInterval(
  "0:10::5;",
  "Five Equally Spaced Points: 0, 2.5, 5, 7.5, 10",
);
demonstrateInterval("1:5:/:2;", "Partition into 2 Sub-intervals: [1:3, 3:5]");
demonstrateInterval("0:12:/:4;", "Partition into 4 Sub-intervals");

// Interval Mediants
demonstrateInterval("1:2:~1;", "Level 1 Mediants: [3/2]");
demonstrateInterval(
  "1:2:~2;",
  "Level 2 Mediants: [[1/1, 2/1], [3/2], [4/3, 5/3]]",
);
demonstrateInterval("1:2:~/2;", "Mediant Partition with 2 Levels");

// Random Selection and Partitioning
demonstrateInterval("1:10:%3;", "Random Selection: 3 points from interval");
demonstrateInterval(
  "1:10:%(5, 1);",
  "Random Selection: 5 integers (max denominator 1)",
);
demonstrateInterval(
  "0:1:%(3, 10);",
  "Random Selection: 3 points (max denominator 10)",
);
demonstrateInterval("1:10:/%3;", "Random Partition into 3 Sub-intervals");
demonstrateInterval("0:100:/%5;", "Random Partition into 5 Sub-intervals");

// Infinite Ranges
demonstrateInterval("5::+2;", "Infinite Increment: 5, 7, 9, 11, ...");
demonstrateInterval("10::+ -3;", "Infinite Decrement: 10, 7, 4, 1, ...");
demonstrateInterval("0::+PI;", "Infinite with PI Step: 0, π, 2π, 3π, ...");

// Complex Examples
demonstrateInterval("(x+1):(y*2) :+ n;", "Variable Expression Bounds");
demonstrateInterval(
  "0:360 :+ 30 ::12;",
  "Chained Operations: Step then Divide",
);
demonstrateInterval("MIN(a,b):MAX(a,b) :~3;", "Function Bounds with Mediants");

// Mathematical Use Cases
console.log("\n\nMathematical Use Cases");
console.log("======================");

const useCases = [
  {
    title: "Numerical Integration Points",
    code: "0:1::100;",
    description: "Generate 100 equally spaced points for numerical integration",
  },
  {
    title: "Monte Carlo Sampling",
    code: "-1:1:%(1000, 100);",
    description: "Generate 1000 random rational points with denominator ≤ 100",
  },
  {
    title: "Continued Fraction Approximations",
    code: "0:1:~5;",
    description: "Generate mediant approximations down to 5 levels",
  },
  {
    title: "Subdivision Mesh",
    code: "0:10:/:8;",
    description: "Create 8 sub-intervals for mesh subdivision",
  },
  {
    title: "Arithmetic Progression",
    code: "2::+3;",
    description: "Infinite arithmetic sequence: 2, 5, 8, 11, ...",
  },
  {
    title: "Geometric Grid Points",
    code: "0:2*PI :+ PI/6;",
    description: "Angle increments for geometric calculations",
  },
  {
    title: "Random Walk Steps",
    code: "-5:5:/%10;",
    description: "Random partition for modeling random walk intervals",
  },
  {
    title: "Farey Sequence Generation",
    code: "0:1:~/4;",
    description: "Generate Farey-like sequence using mediants",
  },
];

useCases.forEach((useCase, index) => {
  console.log(`\n${index + 1}. ${useCase.title}`);
  console.log("-".repeat(40));
  console.log(`Code: ${useCase.code}`);
  console.log(`Use: ${useCase.description}`);

  try {
    const tokens = tokenize(useCase.code);
    const ast = parse(tokens, systemLookup);
    console.log("✓ Valid syntax");
  } catch (error) {
    console.log(`✗ Syntax error: ${error.message}`);
  }
});

console.log("\n\nOperator Precedence Notes");
console.log("=========================");
console.log(
  "• All interval operators have the same precedence as basic interval (:)",
);
console.log("• Operations are left-associative");
console.log("• Interval operators require interval operands; generated point sequences are not intervals");
console.log("• Variable expressions in bounds: (expr1):(expr2) :+ step");

console.log("\n\nSemantic Interpretations");
console.log("========================");
console.log("• a:b :+ n → [a, a+n, a+2n, ...] until > b");
console.log("• a:b :+ -n → [b, b-n, b-2n, ...] until < a");
console.log("• a:b::n → n equally spaced points including endpoints");
console.log("• a:b:/:n → n sub-intervals with equal width");
console.log("• a:b:~n → mediant tree to level n");
console.log("• a:b:~/n → intervals partitioned by level n mediants");
console.log("• a:b:%(m,d) → m random points with max denominator d");
console.log("• a:b:/%n → n random sub-intervals");
console.log("• a::+n → infinite sequence a, a+n, a+2n, ...");
console.log("• a::+ -n → infinite sequence a, a-n, a-2n, ...");
