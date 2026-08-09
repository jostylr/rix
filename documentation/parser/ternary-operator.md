# Decision Conditionals in RiX

RiX uses a three-state decision conditional. Truth is handled by `?:`, null by
`?_`, and undecided by `??`.

## Syntax

```
condition ?: truthExpression ?_ nullExpression ?? undecidedExpression
```

Where:
- `condition` is any decision expression
- `truthExpression` is required
- `nullExpression` and `undecidedExpression` are independently optional and
  may occur in either order
- omitted branches return `_` and `?`, respectively

## Design Rationale

### Why `?:` and `?_`?

The traditional ternary operator `condition ? trueExpr : falseExpr` would conflict with existing RiX operators:

- `?` is already used for postfix query operations: `result?(3.14:3.15)`
- `:` is already used for interval notation: `1:5` or `a:b`

Using `?:` and `?_` as distinct tokens eliminates these conflicts while maintaining intuitive conditional syntax.

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
x > 0 ?: x ?_ -x

// Safe division
denominator != 0 ?: numerator / denominator ?_ 0

// Temperature classification
temp < 0 ?: "frozen" ?_ "normal"
```

### Code Block Integration

The ternary operator fully supports RiX's `{; }` code block syntax, enabling complex multi-statement conditional logic:

```javascript
// Basic code block in true branch
result := x > 0 ?: {; a := x^2; a + b } ?_ 7

// Code blocks in both branches
value := flag ?: {;
    x := 10;
    y := 20;
    x * y
} ?_ {;
    z := -5;
    z^2
}

// Mathematical computation with intermediate variables
physics := energy > threshold ?: {;
    v := (2 * energy / mass)^(1/2);
    momentum := mass * v;
    momentum
} ?_ 0

// Nested ternary inside code block
complex := x > 0 ?: {;
    temp := x^2;
    temp > 0.5 ?: temp^2 ?_ temp/2
} ?_ 0
```

### Complex Expressions

```javascript
// With arithmetic operations
a + b > threshold ?: c * d ?_ e / f

// With function calls
angle > threshold ?: angle^2 ?_ -angle

// With intervals (no conflict)
safe ?: 1:10 ?_ -10:-1
```

### Nested Ternary Operations

```javascript
// Explicit grouping with parentheses
temp < 0 ?: "frozen" ?_ (temp > 100 ?: "boiling" ?_ "normal")

// Grade classification
grade >= 90 ?: "A" ?_ (grade >= 80 ?: "B" ?_ (grade >= 70 ?: "C" ?_ "F"))
```

### Integration with RiX Features

```javascript
// With assignment
result := x > 0 ?: x ?_ -x

// With pipe operations
data |> (valid ?: NORMALIZE ?_ SANITIZE) |> ANALYZE

// With matrix operations
det > 0 ?: [[1,0],[0,1]] ?_ [[0,1],[1,0]]

// With system functions
x > 0 ?: x^2 ?_ (-x)^2

// Code blocks with array operations
arrayResult := flag ?: {;
    a := [1,2,3];
    b := [4,5,6];
    a + b
} ?_ [0,0,0]

// Code blocks with pipe operations
processed := valid ?: {;
    raw := getData();
    clean := raw |> sanitize |> normalize;
    clean
} ?_ empty_data
```

## AST Structure

The ternary operator generates a `TernaryOperation` AST node:

```javascript
{
  type: 'TernaryOperation',
  condition: { /* AST node for condition */ },
  trueExpression: { /* AST node for true branch */ },
  nullExpression: { /* AST node for ?_ branch, or null */ },
  undecidedExpression: { /* AST node for ?? branch, or null */ },
  pos: [start, valueStart, end],
  original: 'original text'
}
```

## Compatibility

### No Conflicts

The ternary operator is designed to coexist with existing RiX operators:

- **Query operator**: `x?(y)` still works for postfix queries
- **Interval operator**: `1:5` still works for intervals
- **Conditional operator**: Existing `?` usage in multifunction dispatch is preserved

### Precedence Integration

The ternary operator integrates naturally with RiX's precedence hierarchy:

```javascript
// Arithmetic operators bind tighter
x + y > z ?: a * b ?_ c / d
// Parsed as: (x + y) > z ?: (a * b) ?_ (c / d)

// Assignment operators bind looser
result := x > 0 ?: x ?_ -x
// Parsed as: result := (x > 0 ?: x ?_ -x)
```

## Current Limitations

1. **Right-associative nesting**: Automatic parsing of `a ?: b ?: c ?_ d ?_ e` requires explicit parentheses for complex cases
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

- Added `?:`, `?_`, and `??` to the symbols list with proper maximal munch ordering
- Both tokens are recognized as single `Symbol` tokens

### Parser Changes

- Added all three markers to `SYMBOL_TABLE` with `CONDITION` precedence and right associativity
- `?:` starts the conditional; `?_` and `??` are branch markers only
- Duplicate branches and missing expressions are parse errors

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
2. **Structured partial-order results**: richer alternatives to returning `?`
3. **Provider refinement**: bounded refinement before choosing `??`

## Usage Recommendations

1. **Use parentheses for clarity** in nested ternary expressions
2. **Prefer ternary for simple conditions** over complex multifunction dispatch when appropriate
3. **Combine with existing RiX features** like pipes and function calls for expressive code
4. **Maintain readability** by avoiding overly complex nested conditions
5. **Leverage code blocks** for multi-step conditional computations that require intermediate variables
6. **Use code blocks for side effects** when conditional logic needs to perform multiple operations before returning a result
