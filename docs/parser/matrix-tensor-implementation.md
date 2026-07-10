# Matrix and Tensor Implementation

## Overview

This document describes the implementation of matrix and tensor parsing in the RiX language parser. The feature extends the existing array syntax with semicolon separators to support multi-dimensional data structures.

## Syntax

### Basic Rules

- **Commas (`,`)** separate elements within a row
- **Single semicolon (`;`)** separates rows within a 2D matrix  
- **Multiple semicolons (`;;`, `;;;`, etc.)** indicate higher-dimensional separators
- **Spaces between semicolons** create separate separator tokens
- **Empty rows/slices** are preserved in the structure

### Examples

```javascript
// 2D Matrix
[1, 2; 3, 4]           // 2x2 matrix
[1, 2, 3; 4, 5, 6]     // 2x3 matrix
[1; 2; 3]              // 3x1 column vector

// 3D Tensor  
[1, 2; 3, 4 ;; 5, 6; 7, 8]    // 2x2x2 tensor

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

3. **New `parseMatrixOrArray()` method**:
   - Detects semicolon usage to determine if structure is matrix/tensor
   - Builds `matrixStructure` array with separator levels
   - Handles empty rows and edge cases
   - Supports both single semicolons and semicolon sequences

4. **New `buildMatrixTensor()` method**:
   - Determines if result should be Matrix (2D) or Tensor (3D+)
   - Creates appropriate AST nodes

5. **New `consumeSemicolonSequence()` method**:
   - Handles both `Symbol` (single `;`) and `SemicolonSequence` (multiple `;;+`) tokens
   - Returns the correct count for dimension detection

### AST Node Types

#### Matrix Node
```javascript
{
    type: "Matrix",
    rows: [[ASTNode]],      // Array of rows, each row is array of elements
    pos: [start, delim, end],
    original: string
}
```

#### Tensor Node
```javascript
{
    type: "Tensor", 
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

- **Matrix**: When `maxSeparatorLevel === 1`
- **Tensor**: When `maxSeparatorLevel > 1`
- **Array**: When no semicolons are present

### Error Handling

- **Metadata conflicts**: Matrix/tensor syntax cannot be mixed with `:=` metadata annotations
- **Proper error messages**: Clear error messages for invalid combinations

### Edge Case Handling

- **Empty rows**: Preserved as empty arrays in structure
- **Leading semicolons**: Create empty rows at the beginning
- **Trailing semicolons**: Create empty rows at the end
- **Only separators**: Create valid tensor structures with empty rows

## Testing

Comprehensive test suite in `tests/parser.test.js` covers:

- Basic 2D matrices
- 3D tensors with double semicolons
- 4D+ tensors with multiple semicolon levels
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

### Post-Processing

The parser creates the structural representation. Actual dimensional analysis and tensor operations are intended for post-processing stages.

### Performance

- Minimal impact on existing parsing performance
- Semicolon sequence detection is efficient with regex matching
- Single semicolons processed normally through existing symbol tokenization
- Parser complexity increased only for bracket expressions
- Tokenizer properly distinguishes between consecutive (`;;`) and separated (`; ;`) semicolons

## Future Enhancements

Potential areas for extension:

1. **Tensor algebra operations**: Matrix multiplication, element-wise operations
2. **Dimension validation**: Ensure consistent shapes within slices
3. **Sparse matrix support**: Special handling for sparse structures
4. **Broadcasting rules**: Define behavior for operations between different-sized tensors