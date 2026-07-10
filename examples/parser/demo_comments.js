import { tokenize } from ../../src/parser/tokenizer.js";
import { parse } from ../../src/parser/parser.js";

console.log("=== Math Oracle Parser - Comment Node Demo ===\n");

// Example inputs showing different comment types
const examples = [
  {
    title: "Line Comment Only",
    input: "# This is a simple line comment",
  },
  {
    title: "Block Comment Only",
    input: "/* This is a block comment */",
  },
  {
    title: "Comment Before Expression",
    input: "# Calculate sum\n2 + 3",
  },
  {
    title: "Comment After Expression",
    input: "x * y\n# Multiply variables",
  },
  {
    title: "Multiple Comments",
    input:
      "# Start calculation\n5 + 10\n/* intermediate comment */\n# End of calculation",
  },
  {
    title: "Nested Block Comment",
    input: "/**hi /* argh */ whatever**/",
  },
  {
    title: "Simple Number with Comment",
    input: "42\n# The answer to everything",
  },

  {
    title: "Edge Case: Empty Comments",
    input: "#\n/* */",
  },
];

examples.forEach((example, index) => {
  console.log(`${index + 1}. ${example.title}`);
  console.log(`Input: ${JSON.stringify(example.input)}`);

  try {
    const tokens = tokenize(example.input);
    const ast = parse(tokens);

    console.log("AST Nodes:");
    ast.forEach((node, i) => {
      if (node.type === "Comment") {
        console.log(`  [${i}] Comment: "${node.value.trim()}" (${node.kind})`);
      } else {
        console.log(`  [${i}] ${node.type}`);
      }
    });

    // Show comment-specific details
    const comments = ast.filter((node) => node.type === "Comment");
    if (comments.length > 0) {
      console.log(`✓ Successfully parsed ${comments.length} comment node(s)`);
    }
  } catch (error) {
    console.log(`✗ Parse Error: ${error.message}`);
  }

  console.log();
});

console.log("=== Comment Node Structure ===");
console.log("Each comment in the AST has the following structure:");
console.log("{");
console.log('  type: "Comment",');
console.log('  value: "comment text content",');
console.log('  kind: "comment",');
console.log('  original: "original token text",');
console.log("  pos: [start, delimiter_end, end]");
console.log("}\n");

console.log("=== Summary ===");
console.log("✓ Line comments (# text) are parsed as Comment nodes");
console.log("✓ Block comments (/* text */) are parsed as Comment nodes");
console.log("✓ Comments can appear before, after, or between expressions");
console.log("✓ Comments are treated as standalone statements in the AST");
console.log('✓ Comment content is preserved in the "value" field');
console.log('✓ Original text including delimiters is in "original" field');
