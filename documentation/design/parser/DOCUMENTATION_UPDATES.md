# Documentation Updates for Postfix Operators

This document summarizes the documentation updates made to reflect the new postfix operators (@, ?, and ()) and enhanced operator functionality in the RiX language parser.

## Updated Files

### 1. `readme.md`
- **Features section**: Added postfix operators and operators as functions
- **Language Overview**: Added examples of new operators in example syntax
- **Parsing Features**: Documented universal function calls and operator functions
- **Advanced Features**: Added postfix operator examples
- **AST Node Types**: Added At and Ask node types
- **Language Specification**: Added postfix operations and operator functions

### 2. `docs/AST-brief.md`
- **Symbol section**: Updated to document postfix operators separately from punctuation
- **Postfix Operators section**: New section explaining @, ?, and enhanced () operators
- **AST Node Shapes**: Added At and Ask node structures
- **Section 4**: New comprehensive section on postfix operators with examples and precedence

### 3. `design/spec.md`
- **Function Definition and Calls**: New subsection on postfix operators and enhanced function calls
- **Comprehensive documentation**: AT (@), ASK (?), enhanced CALL (()), and operators as functions
- **Chaining examples**: Multiple postfix operators combined
- **Precedence rules**: Highest precedence (120) and left-associativity

## Features Documented

### AT Operator (@)
- **Purpose**: Access precision, tolerance, or metadata properties
- **Syntax**: `expression@(parameter)`
- **Examples**: `PI@(1e-10)`, `result@(tolerance)`, `(1/3)@(epsilon)`
- **AST Node**: At type with target and arg properties

### ASK Operator (?)
- **Purpose**: Query membership, bounds, or boolean properties
- **Syntax**: `expression?(parameter)`
- **Distinction**: Must be followed by parentheses to distinguish from infix ?
- **Examples**: `PI?(3.14:3.15)`, `result?(bounds)`, `interval?(x)`
- **AST Node**: Ask type with target and arg properties

### Enhanced CALL Operator (())
- **Purpose**: Universal function call on any expression
- **Behavior**: Works on identifiers (traditional), numbers (multiplication), and other expressions
- **Examples**: `3(4)`, `(2,3)(4,5)`, `matrix(vector)`, `f(x)(y)`
- **AST Node**: FunctionCall for identifiers, Call for other expressions

### Operators as Functions
- **Purpose**: Mathematical operators usable as function identifiers
- **Examples**: `+(2, 3, 5)`, `*(a, b, c)`, `<(x, y)`, `=(a, b)`
- **Variadic**: Support for multiple arguments where applicable

### Chaining and Precedence
- **Precedence**: All postfix operators have highest precedence (120)
- **Associativity**: Left-associative
- **Chaining**: `PI@(1e-6)?(3.14:3.15)`, `f(x)@(eps)?(bounds)`

## Implementation Status

All documented features are fully implemented in the parser:
- Postfix operators are defined in SYMBOL_TABLE with POSTFIX precedence
- parseAt() and parseAsk() methods create At and Ask AST nodes
- Enhanced function calls work on any expression type
- Operators can be treated as UserIdentifier nodes for function calls
- Comprehensive examples demonstrate all features working correctly

## Testing and Examples

Existing examples demonstrate the features:
- `examples/postfix-operators-demo.js`: Comprehensive demonstrations
- `examples/postfix-operators.js`: Detailed AST examples
- `examples/postfix-mathematical-showcase.js`: Mathematical use cases
- `docs/parsing.md`: Already contains comprehensive postfix operator documentation

## Backward Compatibility

All new features maintain backward compatibility:
- Traditional function calls remain unchanged
- Existing operator behavior preserved
- New postfix operators only activate with specific syntax patterns
- No breaking changes to existing language constructs