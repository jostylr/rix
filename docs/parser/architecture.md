# RiX Parser & Tokenizer Architecture

## Overview

The RiX Language Parser & Tokenizer is a comprehensive parsing library that transforms RiX mathematical expressions into Abstract Syntax Trees (ASTs). The architecture follows a clean separation between lexical analysis (tokenization) and syntactic analysis (parsing).

## System Architecture

```
Input String
     │
     ▼
┌─────────────┐
│  Tokenizer  │ ──► Token Stream
└─────────────┘
     │
     ▼
┌─────────────┐
│   Parser    │ ──► Abstract Syntax Tree (AST)
└─────────────┘
     │
     ▼
External Systems
(Evaluator, REPL, etc.)
```

## Components

### 1. Tokenizer (`src/tokenizer.js`)

**Purpose:** Lexical analysis - converts raw input text into structured tokens

**Key Features:**
- **Maximal Munch:** Always matches the longest possible token
- **Unicode Support:** Full Unicode identifier support with normalization
- **Complex Number Formats:** Handles 11+ different number formats
- **Flexible Strings:** N-delimiter quote system for embedding
- **Position Tracking:** Maintains exact source positions for error reporting

**Token Types:**
- `Number`: All mathematical number formats
- `Identifier`: Variables and function names (System vs User)
- `Symbol`: Operators and punctuation (50+ symbols)
- `String`: Quoted literals, backticks, comments
- `End`: Marks end of input

**Architecture Pattern:** State machine with regex-based pattern matching

### 2. Parser (`src/parser.js`)

**Purpose:** Syntactic analysis - converts token stream into structured AST

**Key Features:**
- **Pratt Parser:** Operator precedence parsing with precedence climbing
- **Left/Right Associativity:** Proper handling of operator associativity
- **Extensible:** Modular design for adding new language constructs
- **Error Recovery:** Comprehensive error reporting with position information

**Parser Architecture:**

```
Parser Class
├── Token Management
│   ├── advance()
│   ├── peek()
│   └── error()
├── Expression Parsing
│   ├── parseExpression(precedence)
│   ├── parsePrefix()
│   └── parseInfix()
├── Specialized Parsers
│   ├── parseArray()
│   ├── parseMatrix()
│   ├── parseFunctionDefinition()
│   ├── parseGeneratorChain()
│   └── parseBlockContainer()
└── AST Construction
    └── createNode()
```

## Data Flow

### 1. Tokenization Process

```
Input: "f(x) := x^2 + 1"
   │
   ▼ tryMatchIdentifier()
   ├─► Token{type: 'Identifier', value: 'f', kind: 'User'}
   │
   ▼ tryMatchSymbol()
   ├─► Token{type: 'Symbol', value: '('}
   │
   ▼ tryMatchIdentifier()
   ├─► Token{type: 'Identifier', value: 'x', kind: 'User'}
   │
   ▼ tryMatchSymbol()
   ├─► Token{type: 'Symbol', value: ')'}
   │
   ▼ tryMatchSymbol() [maximal munch: := not : and =]
   ├─► Token{type: 'Symbol', value: ':='}
   │
   ... continues for remaining tokens
```

### 2. Parsing Process

```
Tokens → Parser.parseExpression()
          │
          ▼ Check precedence and associativity
          ├─► parsePrefix() for initial token
          │   └─► Creates base AST node
          │
          ▼ parseInfix() for operators
          ├─► Handles operator precedence
          ├─► Recursive descent for operands
          └─► Builds binary operation trees
          │
          ▼ Specialized parsing for constructs
          ├─► Function definitions
          ├─► Array generators
          ├─► Matrix notation
          └─► Metadata annotations
```

## AST Node Structure

### Base Node Structure
```javascript
{
  type: string,           // Node type identifier
  pos?: [number, number], // Source position [start, end]
  // ... type-specific properties
}
```

### Core Node Types

**Assignment:**
```javascript
{
  type: 'Assignment',
  operator: ':=' | ':=:' | ':<:' | ':>:' | ...,
  left: ASTNode,
  right: ASTNode
}
```

**Function Definition:**
```javascript
{
  type: 'FunctionDefinition',
  name: IdentifierNode,
  parameters: ParameterList,
  body: ASTNode,
  definitionType: 'standard' | 'pattern'
}
```

**Binary Operation:**
```javascript
{
  type: 'BinaryOperation',
  operator: string,
  left: ASTNode,
  right: ASTNode,
  precedence: number
}
```

## Precedence System

The parser uses a comprehensive precedence table:

| Level | Precedence | Operators | Associativity |
|-------|------------|-----------|---------------|
| 0 | STATEMENT | `;` | Left |
| 10 | ASSIGNMENT | `:=`, `:=:`, `:>:` | Right |
| 20 | PIPE | `\|>`, `\|>>`, `\|>?` | Left |
| 25 | ARROW | `->`, `=>` | Right |
| 50 | EQUALITY | `=`, `?=`, `!=` | Left |
| 60 | COMPARISON | `<`, `>`, `<=`, `>=` | Left |
| 70 | INTERVAL | `:` | Left |
| 80 | ADDITION | `+`, `-` | Left |
| 90 | MULTIPLICATION | `*`, `/`, `%` | Left |
| 100 | EXPONENTIATION | `^`, `**` | Right |
| 110 | UNARY | `-`, `+` | Right |
| 120 | POSTFIX | `()`, `[]` | Left |
| 130 | PROPERTY | `.` | Left |

## Extension Points

### Adding New Operators

1. **Update Tokenizer:**
   ```javascript
   // Add to symbols array in tokenizer.js
   const symbols = [
     'new_operator',  // Add in correct position for maximal munch
     // ... existing symbols
   ];
   ```

2. **Update Parser:**
   ```javascript
   // Add to SYMBOL_TABLE in parser.js
   const SYMBOL_TABLE = {
     'new_operator': { 
       precedence: PRECEDENCE.LEVEL, 
       associativity: 'left',
       type: 'infix' 
     }
   };
   ```

3. **Add Parsing Logic:**
   ```javascript
   // Handle in parseInfix() method
   case 'new_operator':
     return this.createNode('NewOperatorNode', {
       operator: token.value,
       left: left,
       right: this.parseExpression(precedence + 1)
     });
   ```

### Adding New Node Types

1. **Define AST Structure:** Document the new node type structure
2. **Add Parser Method:** Create specialized parsing method if needed
3. **Update Factory:** Add to `createNode()` method
4. **Add Tests:** Comprehensive test coverage for new functionality

## Error Handling

### Position Tracking
Every token and AST node maintains position information:
```javascript
pos: [startIndex, endIndex]  // Character indices in source
```

### Error Types
- **Tokenization Errors:** Invalid character sequences, unmatched delimiters
- **Parsing Errors:** Unexpected tokens, malformed expressions
- **Semantic Errors:** Invalid operator usage, type mismatches

### Error Recovery
The parser provides detailed error messages with:
- Exact source position
- Expected vs actual tokens
- Context information
- Suggested fixes where possible

## Performance Characteristics

### Tokenizer
- **Time Complexity:** O(n) where n is input length
- **Space Complexity:** O(n) for token storage
- **Optimizations:** Regex compilation, maximal munch caching

### Parser
- **Time Complexity:** O(n) for typical expressions, O(n²) worst case for deeply nested structures
- **Space Complexity:** O(d) where d is maximum nesting depth
- **Optimizations:** Precedence climbing, specialized parsers for common patterns

## Thread Safety

The parser is **stateless** and **thread-safe**:
- No global state modification
- Immutable token structures
- Pure function design for core parsing logic

## Memory Management

- **Token Reuse:** Tokens are lightweight objects
- **AST Sharing:** Nodes can be safely shared between trees
- **Garbage Collection:** No circular references in generated ASTs

## Testing Strategy

### Unit Tests
- **Tokenizer:** 129 tests covering all token types and edge cases
- **Parser:** 185 tests covering all language constructs
- **Integration:** Cross-component testing with real expressions

### Test Categories
- **Specification Compliance:** Ensures adherence to language spec
- **Error Conditions:** Validates error handling and reporting
- **Performance:** Benchmarks for large expressions
- **Edge Cases:** Boundary conditions and malformed input

## Integration Patterns

### External System Integration

```javascript
// Basic usage pattern
import { tokenize, parse } from 'rix-language-parser';

const tokens = tokenize(sourceCode);
const ast = parse(tokens, systemLookupFunction);

// Pass AST to evaluator, compiler, etc.
```

### System Identifier Resolution

```javascript
// Custom system identifier lookup
function systemLookup(identifier) {
  return {
    type: 'function' | 'constant' | 'operator',
    precedence?: number,
    associativity?: 'left' | 'right',
    // ... additional metadata
  };
}
```

## Future Architecture Considerations

### Planned Enhancements
- **Incremental Parsing:** For IDE integration and large files
- **Parallel Parsing:** Multi-threaded parsing for complex expressions
- **AST Transformation:** Built-in optimization passes
- **Source Maps:** Enhanced debugging support

### Extension Architecture
- **Plugin System:** For domain-specific language extensions
- **Custom Operators:** Runtime operator definition
- **Syntax Macros:** Compile-time code generation

This architecture provides a solid foundation for mathematical expression parsing while maintaining flexibility for future enhancements and integration with the broader RiX language ecosystem.