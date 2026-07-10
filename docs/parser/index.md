# ![RiX Logo](./rix-logo.png)
**RiX Language Parser & Tokenizer**

A comprehensive tokenizer and parser for the RiX (Rational Interval Expression Language) mathematical expression language, built in JavaScript. This library provides robust parsing capabilities for mathematical expressions with support for intervals, mixed numbers, units, algebraic extensions, and advanced mathematical notation.

---

## Features

- **Complete Tokenization:**
  - Numbers: integers, decimals, rationals, mixed numbers, intervals, scientific notation
  - Strings: flexible quote systems with N-delimiter support for embedding
  - Comments: single-line and multi-level block comments
  - **Operators:** comprehensive mathematical and functional operators with postfix support
  - Identifiers: Unicode support with system/user distinction

- **Comprehensive Parsing:**
  - Pratt parser with full operator precedence
  - Function definitions with advanced parameter handling
  - Pattern matching functions with conditions
  - Array generators and sequence notation
  - Matrix and tensor parsing
  - Metadata and property annotations
  - Symbolic calculus notation (derivatives, integrals)
  - Pipe operations and functional constructs
  - Postfix operators for precision control and queries
  - Operators as functions with universal call syntax

- **Rich Mathematical Notation:**
  - Interval arithmetic (`2:5`, `1.5:2.7`)
  - Mixed numbers (`1..3/4`)
  - Rational numbers (`3/4`)
  - Scientific units using postfix operators (`3.2~[m]`, `9.8~[m/s^2]`)
  - Mathematical units for algebraic extensions (`2~{i}`, `1+3~{sqrt2}`)
  - Repeating decimals (`0.12#45`)

- **Advanced Language Features:**
  - Code blocks and embedded languages
  - Multiple assignment operators (`:=`, `:=:`, `:>:`)
  - Comprehensive pipe operators (`|>`, `|>>`, `|>?`, `|>:`)
  - Array generators (`|+`, `|*`, `|:`, `|^`)
  - Pattern matching with metadata
  - Function self-reference with `$`, `$(...)`, `$.prop`, and `$..`
  - Tail-self-call optimization for direct tail `$(...)`
  - **Postfix operators (`@`, `?`, `()`, `~[...]`, `~{...}`) for precision, queries, universal calls, and units
  - Operator symbols as functions (`+(a,b,c)`, `*(x,y,z)`)
  - Ternary operator (`?? ?:`) for conditional expressions

---

## Language Overview

### Example Syntax

```plaintext
x := 3                          // Assignment
f := (x, n ?| 2) -> x^n + 1      // Function definition with optional parameter
y := 1..3/4                     // Mixed number: one and three quarters
z := 2:5                        // Interval from 2 to 5
2:3 ^ 2                         // Interval elementwise exponentiation: 4:9
a := 3.2~[m]                    // Number with scientific unit: 3.2 meters
b := 2~{i}                      // Number with mathematical unit: 2i
CONVERT(100~[m], "m", "ft")     // Unit conversion using CONVERT function
a:b:%4                          // Pick 4 random points in [a,b]
[[1,2;3,4], name:="matrix"]     // Matrix with metadata
SIN(x; n:=4)                    // System function with named argument
x ?= 3                          // Boolean test: is x equal to 3?
x^2 :<: 4                       // Inequality to solve
PI@(1e-10)                      // Get PI with precision 1e-10
result?(3.14:3.15)              // Check if result is in interval
3(4)                            // Universal call: 3 * 4
+(2, 3, 5)                      // Addition operator as function
x > 0 ?? x ?: -x                // Ternary operator: condition ?? true ?: false
CountDown := n -> n > 0 ?? $(n - 1) ?: 0
Fact := (n, acc ?| 1) -> n > 1 ?? $(n - 1, acc * n) ?: acc
```

### Tokenization Features
- **Identifiers:** Unicode letters, case-sensitive first letter determines system vs user scope
- **Numbers:** Full support for all mathematical number formats including intervals
- **Unit Operators:** Postfix operators `~[...]` for scientific units and `~{...}` for mathematical units
- **Symbols:** Maximal munch tokenization for complex operators
- **Strings:** N-delimiter quote system (`""hello""`, ```code```) for easy embedding
- **Comments:** Multiple levels (`//`, `/* */`, `/** **/`, `/*** ***/`)

### Parsing Features
- **AST Generation:** Complete Abstract Syntax Tree generation for all language constructs
- **Operator Precedence:** Full precedence table with proper associativity including postfix operators
- **Error Handling:** Comprehensive error reporting with position information
- **Extensibility:** Modular design for adding new operators and constructs
- **Universal Function Calls:** Any expression can be called as a function
- **Operator Functions:** Mathematical operators can be used as variadic functions

### Function Self-Reference

Inside a function body, bare `$` evaluates to the current callable object.

```rix
Named := x -> $.label
Named.label = 42
Named(0)        # => 42
```

- `$(args...)` calls the current callable.
- `$.prop` and `$..` use the ordinary meta/property access rules on that callable.
- `$` is invalid outside a function body.

### Tail Self Calls

RiX optimizes only direct self calls of the form `$(...)` when they are in tail position.

```rix
CountDown := n -> n > 0 ?? $(n - 1) ?: 0
Fact := (n, acc ?| 1) -> n > 1 ?? $(n - 1, acc * n) ?: acc
BadFact := n -> n > 1 ?? n * $(n - 1) ?: 1
```

- `CountDown` and accumulator-style `Fact` are optimized because the self call is returned directly.
- `BadFact` is not optimized because multiplication still happens after the recursive call returns.
- RiX does not implement general tail-call optimization or mutual tail recursion.

---

## Installation

```bash
npm install rix-language-parser
```

## Usage

### Basic Parsing

```javascript
import { tokenize, parse } from 'rix-language-parser';

// Tokenize input
const tokens = tokenize('x := 2 + 3 * y');
console.log(tokens);

// Parse tokens into AST
const ast = parse(tokens);
console.log(ast);

// Or parse directly from string
const ast2 = parse('f(x) := x^2 + 1');
console.log(ast2);
```

### Advanced Features

```javascript
import { parse } from 'rix-language-parser';

// Function definitions
const funcDef = parse('power(x, n := 2) :-> x^n');

// Pattern matching
const patternFunc = parse('abs :=> [(x ? x >= 0) -> x, (x ? x < 0) -> -x]');

// Array generators
const generator = parse('[1 |+ 2 |^ 10]'); // Arithmetic sequence

// Matrix parsing
const matrix = parse('[[1, 2; 3, 4]]');

// Symbolic calculus
const derivative = parse("f'(x)");
const integral = parse("'f(x)");

// Postfix operators
const precision = parse("PI@(1e-10)");
const query = parse("result?(bounds)");
const universalCall = parse("3(4)");
const operatorFunction = parse("+(1, 2, 3)");

// Unit operators
const scientificUnit = parse("9.8~[m/s^2]");
const mathUnit = parse("2~{i}");
const unitConversion = parse('CONVERT(100~[m], "m", "ft")');
```

## API Reference

### `tokenize(input: string): Token[]`

Tokenizes a RiX language string into an array of tokens.

**Parameters:**
- `input`: String containing RiX language code

**Returns:** Array of token objects with properties:
- `type`: Token type ('Number', 'Identifier', 'Symbol', 'String', 'End')
- `value`: Processed token value
- `original`: Original text from input
- `pos`: Position information [start, valueStart, end]
- `kind`: Additional type information (for Identifiers and Strings)

### `parse(input: string | Token[], systemLookup?: Function): ASTNode`

Parses RiX language tokens or string into an Abstract Syntax Tree.

**Parameters:**
- `input`: String or array of tokens to parse
- `systemLookup`: Optional function to resolve system identifiers

**Returns:** AST node representing the parsed expression

## AST Node Types

The parser generates various AST node types:

- **Assignment:** `{ type: 'Assignment', operator: ':=', left: ..., right: ... }`
- **FunctionDefinition:** `{ type: 'FunctionDefinition', name: ..., parameters: ..., body: ... }`
- **BinaryOperation:** `{ type: 'BinaryOperation', operator: '+', left: ..., right: ... }`
- **Array:** `{ type: 'Array', elements: [...] }`
- **Matrix:** `{ type: 'Matrix', rows: [[...], [...]] }`
- **GeneratorChain:** `{ type: 'GeneratorChain', start: ..., operators: [...] }`
- **Number:** `{ type: 'Number', value: '3.14', format: 'decimal' }`
- **Identifier:** `{ type: 'UserIdentifier' | 'SystemIdentifier', name: 'x' }`
- **TernaryOperation:** `{ type: 'TernaryOperation', condition: ..., trueExpression: ..., falseExpression: ... }`
- **At:** `{ type: 'At', target: ..., arg: ... }`
- **Ask:** `{ type: 'Ask', target: ..., arg: ... }`

## Project Structure

```
├── src/
│   ├── tokenizer.js      — Complete tokenizer implementation
│   ├── parser.js         — Pratt parser with full language support
├── tests/
│   ├── tokenizer.test.js — Comprehensive tokenizer tests (129 tests)
│   ├── parser.test.js    — Complete parser tests (185 tests)
│   └── array-generators.test.js — Generator-specific tests
├── examples/             — 36+ example files demonstrating features
├── docs/                 — Feature-specific documentation
├── design/               — Language specification and design docs
└── index.js             — Main export file
```

## Language Specification

This parser implements the complete RiX language specification including:

- **Numbers:** All formats from integers to complex algebraic extensions
- **Operators:** 50+ mathematical and functional operators with proper precedence
- **Functions:** Multiple definition styles with advanced parameter handling
- **Collections:** Arrays, matrices, tensors, sets, maps with metadata support
- **Control Flow:** Pattern matching, conditional expressions, pipe operations
- **Syntax:** Flexible string systems, code blocks, embedded languages
- **Postfix Operations:** Precision control (@), queries (?), and universal calls (())
- **Operator Functions:** Mathematical operators usable as variadic functions

For complete language documentation, see the `design/` directory.

## Testing

```bash
npm test
```

The test suite includes:
- **314 total tests** across tokenizer and parser
- **Complete coverage** of language specification
- **Edge case handling** and error conditions
- **Position tracking** validation
- **AST structure** verification

## Related Projects

This parser is part of the RiX language ecosystem:

- **rix-language-evaluator** - Expression evaluation and mathematical computation
- **rix-language-repl** - Interactive REPL environment
- **rix-language-browser** - Web-based interface and visualization

## Contributing

Contributions are welcome! This repository focuses specifically on:
- Tokenization improvements and bug fixes
- Parser enhancements and new language features
- AST structure optimizations
- Test coverage expansion
- Documentation improvements

Please ensure all tests pass and add appropriate test coverage for new features.

## License

MIT

## Acknowledgments

This project was inspired by mathematical exploration and language experimentation, with special thanks to OpenAI's ChatGPT and Claude for AI-assisted design and development of the parsing infrastructure.
