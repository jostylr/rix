# Ternary Operator in RiX Language

The RiX language parser now supports a ternary operator using the syntax `condition ?? trueExpression ?: falseExpression`. This provides a clean, conflict-free way to express conditional logic in mathematical expressions.

## Syntax

```
condition ?? trueExpression ?: falseExpression
```

Where:
- `condition` is any boolean expression
- `trueExpression` is evaluated and returned if condition is true
- `falseExpression` is evaluated and returned if condition is false

## Design Rationale

### Why `??` and `?:`?

The traditional ternary operator `condition ? trueExpr : falseExpr` would conflict with existing RiX operators:

- `?` is already used for postfix query operations: `result?(3.14:3.15)`
- `:` is already used for interval notation: `1:5` or `a:b`

Using `??` and `?:` as distinct tokens eliminates these conflicts while maintaining intuitive conditional syntax.

### Precedence

The ternary operator has `CONDITION` precedence (45), making it:
- Lower precedence than comparison operators (`<`, `>`, `>=`, etc.)
- Lower precedence than arithmetic operators (`+`, `-`, `*`, `/`)
- Higher precedence than assignment operators (`:=`, `:=:`, etc.)
- Right-associative for natural nesting

## Examples

### Basic Usage

```javascript
// Absolute value function
x > 0 ?? x ?: -x

// Safe division
denominator != 0 ?? numerator / denominator ?: 0

// Temperature classification
temp < 0 ?? "frozen" ?: "normal"
```

### Code Block Integration

The ternary operator fully supports RiX's `{; }` code block syntax, enabling complex multi-statement conditional logic:

```javascript
// Basic code block in true branch
result := x > 0 ?? {; a := SIN(5); a + b } ?: 7

// Code blocks in both branches
value := flag ?? {; 
    x := 10; 
    y := 20; 
    x * y 
} ?: {; 
    z := -5; 
    z^2 
}

// Mathematical computation with intermediate variables
physics := energy > threshold ?? {; 
    v := SQRT(2 * energy / mass); 
    momentum := mass * v; 
    momentum 
} ?: 0

// Nested ternary inside code block
complex := x > 0 ?? {; 
    temp := SIN(x); 
    temp > 0.5 ?? temp^2 ?: temp/2 
} ?: 0
```

### Complex Expressions

```javascript
// With arithmetic operations
a + b > threshold ?? c * d ?: e / f

// With function calls
angle > PI/2 ?? SIN(angle) ?: COS(angle)

// With intervals (no conflict)
safe ?? 1:10 ?: -10:-1
```

### Nested Ternary Operations

```javascript
// Explicit grouping with parentheses
temp < 0 ?? "frozen" ?: (temp > 100 ?? "boiling" ?: "normal")

// Grade classification
grade >= 90 ?? "A" ?: (grade >= 80 ?? "B" ?: (grade >= 70 ?? "C" ?: "F"))
```

### Integration with RiX Features

```javascript
// With assignment
result := x > 0 ?? x ?: -x

// With pipe operations
data |> (valid ?? NORMALIZE ?: SANITIZE) |> ANALYZE

// With matrix operations
det > 0 ?? [[1,0],[0,1]] ?: [[0,1],[1,0]]

// With system functions
x > 0 ?? LOG(x) ?: LOG(-x)

// Code blocks with array operations
arrayResult := flag ?? {; 
    a := [1,2,3]; 
    b := [4,5,6]; 
    a + b 
} ?: [0,0,0]

// Code blocks with pipe operations
processed := valid ?? {; 
    raw := getData(); 
    clean := raw |> sanitize |> normalize; 
    clean 
} ?: empty_data
```

## AST Structure

The ternary operator generates a `TernaryOperation` AST node:

```javascript
{
  type: 'TernaryOperation',
  condition: { /* AST node for condition */ },
  trueExpression: { /* AST node for true branch */ },
  falseExpression: { /* AST node for false branch */ },
  pos: [start, valueStart, end],
  original: 'original text'
}
```

## Compatibility

### No Conflicts

The ternary operator is designed to coexist with existing RiX operators:

- **Query operator**: `x?(y)` still works for postfix queries
- **Interval operator**: `1:5` still works for intervals
- **Conditional operator**: Existing `?` usage in pattern matching is preserved

### Precedence Integration

The ternary operator integrates naturally with RiX's precedence hierarchy:

```javascript
// Arithmetic operators bind tighter
x + y > z ?? a * b ?: c / d
// Parsed as: (x + y) > z ?? (a * b) ?: (c / d)

// Assignment operators bind looser
result := x > 0 ?? x ?: -x
// Parsed as: result := (x > 0 ?? x ?: -x)
```

## Current Limitations

1. **Right-associative nesting**: Automatic parsing of `a ?? b ?? c ?: d ?: e` requires explicit parentheses for complex cases
2. **Error recovery**: Parse errors in ternary expressions may not provide optimal recovery suggestions

## Code Block Support

The ternary operator seamlessly integrates with RiX's code block syntax:

- **Multi-statement blocks**: Both true and false branches can contain `{; }` code blocks with multiple semicolon-separated statements
- **Complex computations**: Code blocks enable intermediate variable assignments and complex mathematical calculations
- **Nested ternary**: Ternary operations can be nested within code blocks for sophisticated conditional logic
- **Full RiX support**: Code blocks support all RiX language features including functions, arrays, pipes, and system calls
- **Natural evaluation**: The final expression in a code block becomes the result of that branch

## Implementation Details

### Tokenizer Changes

- Added `??` and `?:` to the symbols list with proper maximal munch ordering
- Both tokens are recognized as single `Symbol` tokens

### Parser Changes

- Added `??` and `?:` to `SYMBOL_TABLE` with `CONDITION` precedence and right associativity
- Special handling in `parseInfix()` for `??` operator
- Precedence adjustment to prevent `?:` consumption during true expression parsing

### Test Coverage

Comprehensive test suite covers:
- Basic ternary operations
- Complex expressions in all branches
- Nested operations with parentheses
- Integration with existing RiX features
- Error cases and edge conditions
- Precedence verification

## Future Enhancements

Potential improvements for future versions:

1. **Enhanced right-associativity**: Better automatic parsing of nested ternary chains
2. **Short-circuit evaluation**: Documentation of evaluation semantics
3. **Pattern matching integration**: Combining ternary with pattern matching functions
4. **N-ary conditional expressions**: Extended conditional syntax for multiple conditions

## Usage Recommendations

1. **Use parentheses for clarity** in nested ternary expressions
2. **Prefer ternary for simple conditions** over complex pattern matching when appropriate
3. **Combine with existing RiX features** like pipes and function calls for expressive code
4. **Maintain readability** by avoiding overly complex nested conditions
5. **Leverage code blocks** for multi-step conditional computations that require intermediate variables
6. **Use code blocks for side effects** when conditional logic needs to perform multiple operations before returning a result