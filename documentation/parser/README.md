# RiX Parser & Tokenizer Documentation

This directory contains comprehensive documentation for the RiX Language Parser & Tokenizer library.

## Documentation Index

### Core Architecture
- **[architecture.md](architecture.md)** - Complete system architecture, data flow, and design patterns
- **[array-generators-implementation.md](array-generators-implementation.md)** - Array generator parsing implementation details
- **[function-definitions-summary.md](function-definitions-summary.md)** - Function definition parsing features
- **[parsing.md](parsing.md)** - Array generator parsing behavior and examples

### Language Features
- **[brace-containers-README.md](brace-containers-README.md)** - Code blocks and container parsing
- **[embedded-parsing.md](embedded-parsing.md)** - Embedded language support
- **[matrix-tensor-implementation.md](matrix-tensor-implementation.md)** - Matrix and tensor parsing

## Quick Reference

### Getting Started
```javascript
import { tokenize, parse } from 'rix-language-parser';

// Basic usage
const tokens = tokenize('x := 2 + 3');
const ast = parse(tokens);
```

### Key Features Documented

#### Tokenization
- **Number Formats**: Integers, decimals, rationals, mixed numbers, intervals, scientific notation
- **String Systems**: Multi-delimiter quotes, backticks, comments
- **Operators**: 50+ mathematical and functional operators
- **Identifiers**: Unicode support with system/user distinction

#### Parsing
- **Expression Parsing**: Pratt parser with full precedence handling
- **Function Definitions**: Multiple syntax styles with advanced parameters
- **Collections**: Arrays, matrices, tensors with metadata support
- **Generators**: Sequence generation with filters and limits
- **Pattern Matching**: Conditional function definitions

### AST Node Types

The parser generates structured AST nodes for all language constructs:

- `Assignment` - Variable and function assignments
- `BinaryOperation` - Mathematical and logical operations
- `FunctionDefinition` - Function declarations with parameters
- `Array` - Collection literals and generators
- `Matrix` - Mathematical matrices and tensors
- `GeneratorChain` - Sequence generation expressions
- `Number` - All mathematical number formats
- `Identifier` - Variables and function names

### Error Handling

The parser provides comprehensive error reporting with:
- Exact source position information
- Expected vs actual token details
- Context-aware error messages
- Recovery suggestions

## Examples

The `../examples/` directory contains 36+ example files demonstrating:

- Basic parsing operations (`parser-basic-usage.js`)
- Advanced features (`function-showcase.js`)
- Real-world use cases (`interval-practical.js`)
- Integration patterns (`container-integration-test.js`)

## Testing

Comprehensive test suite with 314+ tests covering:
- Complete language specification compliance
- Edge cases and error conditions
- Performance benchmarks
- Integration scenarios

Run tests with:
```bash
npm test                    # All tests
npm run test:tokenizer     # Tokenizer only
npm run test:parser        # Parser only
npm run test:generators    # Array generators
```

## Language Specification

Complete language specification available in `../design/`:
- `spec.md` - Full language specification
- `tokenizing-spec.txt` - Tokenization rules
- `parsing-spec.txt` - Parser implementation guide
- `syntax.txt` - Operator and symbol reference

## Integration

This parser is designed to integrate with:
- **rix-language-evaluator** - Expression evaluation
- **rix-language-repl** - Interactive environments
- **rix-language-browser** - Web interfaces
- Custom mathematical computing systems

## Contributing

Documentation contributions are welcome! Please ensure:
- Clear examples with expected outputs
- Complete coverage of new features
- Consistent formatting and style
- Updated cross-references

## Architecture Overview

```
Input String → Tokenizer → Token Stream → Parser → AST → External Systems
```

The library provides a clean separation between lexical analysis (tokenization) and syntactic analysis (parsing), enabling flexible integration with various mathematical computing environments.

For detailed architecture information, see [architecture.md](architecture.md).