# RiX Brace Container Examples

This directory contains examples demonstrating the four different types of brace containers (`{}`) supported by the RiX parser.

## Container Types

### 1. Set Containers
Contains only literal values or expressions without special assignment operators.
```
{1, 2, 3}           // Set of numbers
{a, b, c}           // Set of identifiers  
{x + 1, y * 2}      // Set of expressions
{}                  // Empty set
```

### 2. Map Containers
Contains key-value pairs using the `:=` operator.
```
{name := "John", age := 30}        // Map with mixed types
{x := 5, y := x * 2}               // Map with expressions
{key1 := value1, key2 := value2}   // Map with identifiers
```

### 3. Pattern-Match Containers
Contains pattern-match pairs using the `:=>` operator.
```
{(0) :=> "zero", (1) :=> "one"}    // Pattern match with literals
{(x) :=> x + 1, (y) :=> y * 2}     // Pattern match with expressions
{(n) :=> n^2, (m) :=> SIN(m)}      // Pattern match with functions
```

### 4. System Containers
Contains equations using equation operators (`:=:`, `:>:`, etc.) separated by semicolons.
```
{x :=: 3*x + 2; y :=: x}           // System of equations
{a :>: 0; b :<: 10; c :=: a + b}   // System with inequalities
```

## Type Detection Rules

The parser automatically detects the container type based on its contents:

1. **Set**: Default type for expressions without special operators
2. **Map**: Detected when `:=` assignments are present
3. **Pattern-Match**: Detected when `:=>` operators are present
4. **System**: Detected when equation operators (`:=:`, `:>:`, etc.) are present AND semicolons are used as separators

## Type Validation

The parser enforces homogeneity within containers:
- Maps must contain only `:=` assignments
- Pattern-matches must contain only `:=>` operators
- Systems must contain only equation operators with semicolon separators
- Mixing different operator types within the same container results in a parse error

## Examples Files

- `brace-containers.js` - Comprehensive examples with full AST output
- `brace-types-demo.js` - Concise demo showing type detection
- `container-integration-test.js` - Automated test suite validating all functionality

## Usage

Run any example file:
```bash
node examples/brace-types-demo.js
node examples/container-integration-test.js
```

## Error Cases

Common errors when mixing container types:
```
{a := 1, b, c := 3}          // Error: Mixed map and set elements
{(x) :=> x + 1, a := 2}      // Error: Mixed pattern and assignment
{x :=: 3, a := 2}            // Error: Mixed equation and assignment  
{x :=: 3*x + 2, y :=: x}     // Error: System without semicolons
```