# Shaped Literal Implementation

## Overview

This document describes rectangular Shaped parsing in RiX. Semicolon separators
extend array notation to rank-N component storage. Bare results have semantic
type `Shaped`; explicit `/Matrix/` and linalg slot headers add stronger meaning.

## Syntax

### Basic Rules

- **Commas (`,`)** separate elements within a row
- **Single semicolon (`;`)** separates rows within a 2D matrix  
- **Multiple semicolons (`;;`, `;;;`, etc.)** indicate higher-dimensional separators
- **Spaces between semicolons** create separate separator tokens
- **Empty rows/slices** are preserved in the structure

### Examples

```javascript
// Rank-2 Shaped
[1, 2; 3, 4]           // shape 2x2
[1, 2, 3; 4, 5, 6]     // 2x3 matrix
[1; 2; 3]              // 3x1 column vector

// Rank-3 Shaped
[1, 2; 3, 4 ;; 5, 6; 7, 8]    // shape 2x2x2

// 4D Tensor
[1; 2 ;; 3; 4 ;;; 5; 6 ;; 7; 8]   // 4D structure

// Edge Cases
[; 1, 2]               // Matrix starting with empty row
[1, 2; ]               // Matrix ending with empty row
[;;]                   // Empty tensor structure
```

## Implementation Details

### Tokenizer Changes

Modified `src/tokenizer.js` to recognize consecutive semicolons as single tokens:

- Added `tryMatchSemicolonSequence()` function
- Creates `SemicolonSequence` tokens with `count` property only for multiple consecutive semicolons (`;;`, `;;;`, etc.)
- Single semicolons (`;`) remain as regular `Symbol` tokens
- Preserves backward compatibility with existing semicolon usage

### Parser Changes

Modified `src/parser.js` with several key changes:

1. **New token handling in `getSymbolInfo()`**:
   - `SemicolonSequence` tokens get `type: 'separator'`
   - Prevents them from being treated as binary operators

2. **Enhanced `parseExpression()`**:
   - Breaks on both `Symbol` semicolons and `SemicolonSequence` tokens
   - Treats separators like statement terminators

3. **`parseMatrixOrArray()` method**:
   - Detects semicolon usage to determine whether the result is Array or Shaped
   - Builds a structure array with separator levels
   - Handles empty rows and edge cases
   - Supports both single semicolons and semicolon sequences

4. **`consumeSemicolonSequence()` method**:
   - Handles both `Symbol` (single `;`) and `SemicolonSequence` (multiple `;;+`) tokens
   - Returns the correct count for dimension detection

### AST node

Both rank-2 and higher inferred literals use `Shaped`:

```javascript
{
    type: "Shaped",
    structure: [{
        row: [ASTNode],         // Array of elements in this row
        separatorLevel: number  // Number of semicolons that follow this row
    }],
    maxDimension: number,       // Highest dimension level (separatorLevel + 1)
    pos: [start, delim, end],
    original: string
}
```

## Key Features

### Dimension Detection

- **Rank-2 Shaped**: When `maxSeparatorLevel === 1`
- **Rank-N Shaped**: When `maxSeparatorLevel > 1`
- **Array**: When no semicolons are present

### Error Handling

- **Metadata conflicts**: Shaped semicolon syntax cannot be mixed with `:=` metadata annotations
- **Proper error messages**: Clear error messages for invalid combinations

### Edge Case Handling

- **Empty rows**: Preserved as empty arrays in structure
- **Leading semicolons**: Create empty rows at the beginning
- **Trailing semicolons**: Create empty rows at the end
- **Only separators**: Create valid tensor structures with empty rows

## Testing

Comprehensive test suite in `tests/parser.test.js` covers:

- Basic rank-2 Shaped values
- Rank-3 Shaped values with double semicolons
- Rank-4+ Shaped values with multiple semicolon levels
- Edge cases (empty rows, leading/trailing semicolons)
- Error conditions (metadata mixing)
- Complex expressions within matrices
- Position tracking

## Examples

Three example files demonstrate usage:

1. **`examples/simple-matrices.js`**: Basic usage examples
2. **`examples/matrix-tensor-demo.js`**: Comprehensive demonstration
3. **`examples/matrix-error-cases.js`**: Edge cases and error handling

## Integration Notes

### Backward Compatibility

- Regular arrays `[1, 2, 3]` remain unchanged
- Single semicolons in statements (`a := 1; b := 2;`) work as before
- System expressions with semicolons (`{x :=: 1; y :=: 2}`) work as before
- Existing functionality is fully preserved
- Only affects bracket expressions containing semicolons

### Lowering and evaluation

The parser retains the separator structure in `Matrix`/`Tensor` AST nodes.
Lowering infers a rectangular shape, reorders higher-axis display slices into
the runtime's row-major axis order, and emits the same `SHAPED_LITERAL` IR used
by an explicit `{:d1xd2x...: ...}` constructor. Consequently
`[1,2;3,4]` evaluates as a shaped `2x2` tensor rather than a separate matrix
record. Ragged rows or higher-axis groups are rejected during lowering.

### Performance

- Minimal impact on existing parsing performance
- Semicolon sequence detection is efficient with regex matching
- Single semicolons processed normally through existing symbol tokenization
- Parser complexity increased only for bracket expressions
- Tokenizer properly distinguishes between consecutive (`;;`) and separated (`; ;`) semicolons

## Future Enhancements

Potential areas for extension:

1. **Element-wise operations**: Define explicit tensor arithmetic separately from contraction
2. **Sparse matrix support**: Special handling for sparse structures
3. **Broadcasting rules**: Define behavior for operations between different-sized tensors
