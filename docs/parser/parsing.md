# RiX Language Parser Documentation

## Overview

The RiX parser is a Pratt parser implementation that converts tokenized RiX code into Abstract Syntax Trees (ASTs). It handles the full spectrum of RiX language features including mathematical expressions, assignments, function calls, pipe operations, metadata annotations, comments, and more.

## Architecture

### Pratt Parser Design

The parser uses the Pratt parsing technique (also known as "Top Down Operator Precedence") which provides:

- **Elegant precedence handling**: Operators are assigned numeric precedence values
- **Extensible design**: New operators can be easily added to the symbol table
- **Left/right associativity**: Configurable associativity for each operator
- **Flexible syntax**: Supports prefix, infix, and postfix operators

### Core Components

1. **Symbol Table**: Defines operators, their precedence, and associativity
2. **Parser Class**: Main parsing logic with expression and statement parsing
3. **AST Nodes**: Structured representations of parsed code
4. **System Lookup**: Integration point for extending language semantics

## Usage

### Basic Usage

```javascript
import { tokenize } from './src/tokenizer.js';
import { parse } from './src/parser.js';

// Define system identifier lookup
function systemLookup(name) {
    const systemSymbols = {
        'SIN': { type: 'function', arity: 1 },
        'PI': { type: 'constant', value: Math.PI },
        'AND': { type: 'operator', precedence: 40, associativity: 'left', operatorType: 'infix' }
    };
    return systemSymbols[name] || { type: 'identifier' };
}

// Parse RiX code
const code = "x := SIN(PI / 2) + 1;";
const tokens = tokenize(code);
const ast = parse(tokens, systemLookup);
```

### System Lookup Function

The system lookup function is crucial for handling System identifiers (capitalized identifiers). It should return an object describing the identifier's role:

```javascript
function systemLookup(name) {
    return {
        type: 'function' | 'constant' | 'operator' | 'control' | 'special' | 'identifier',

        // For functions
        arity: number,          // Number of arguments (-1 for variadic)

        // For constants
        value: any,             // The constant value

        // For operators
        precedence: number,     // Operator precedence (0-200)
        associativity: 'left' | 'right',
        operatorType: 'infix' | 'prefix' | 'postfix',

        // Additional metadata
        description: string,
        // ... other properties
    };
}
```

## Operator Precedence

The parser uses the following precedence hierarchy (higher numbers bind tighter):

| Precedence | Operators | Description |
|------------|-----------|-------------|
| 130 | `.` | Property access |
| 120 | `@`, `?`, `()`, `[]`, `~[`, `~{` | Postfix operators, function calls, array access, unit operators |
| 110 | unary `+`, `-`, `NOT` | Unary operators |
| 100 | `^`, `**` | Exponentiation (right associative) |
| 90 | `*`, `/`, `//`, `%`, `/^`, `/~`, `/%` | Multiplication, division |
| 80 | `+`, `-` | Addition, subtraction |
| 70 | `:` | Interval operator |
| 60 | `<`, `>`, `<=`, `>=`, `?<`, `?>`, etc. | Comparison |
| 50 | `=`, `?=`, `!=`, `==` | Equality |
| 40 | `AND` | Logical AND |
| 30 | `OR` | Logical OR |
| 20 | `\|>`, `\|\|>`, `\|>>`, `\|>:`, `\|>?`, etc. | Pipe operations |
| 10 | `:=`, `:=:`, `:>:`, `:<:`, `->`, `=>` | Assignment, equations |
| 5 | `,` | Comma separator |
| 0 | `;` | Statement separator |

## AST Node Types

### Core Node Structure

All AST nodes have these base properties:

```javascript
{
    type: string,           // Node type identifier
    pos: [start, delim, end], // Position information [start, delimiter, end]
    original: string,       // Original source text
    // ... type-specific properties
}
```

### Node Types

#### Statement
Represents a complete statement ending with semicolon:
```javascript
{
    type: "Statement",
    expression: ASTNode,    // The statement's expression
    pos: [start, delim, end],
    original: string
}
```

#### BinaryOperation
Represents operations with two operands:
```javascript
{
    type: "BinaryOperation",
    operator: string,       // The operator symbol
    left: ASTNode,         // Left operand
    right: ASTNode,        // Right operand
    pos: [start, delim, end],
    original: string
}
```

#### UnaryOperation
Represents operations with one operand:
```javascript
{
    type: "UnaryOperation",
    operator: string,       // The operator symbol
    operand: ASTNode,      // The operand
    pos: [start, delim, end],
    original: string
}
```

#### FunctionCall
Represents function invocations:
```javascript
{
    type: "FunctionCall",
    function: ASTNode,      // Function identifier or expression
    arguments: [ASTNode],   // Array of argument expressions
    pos: [start, delim, end],
    original: string
}
```

#### UserIdentifier
Represents user-defined identifiers (lowercase):
```javascript
{
    type: "UserIdentifier",
    name: string,           // Normalized identifier name
    pos: [start, delim, end],
    original: string
}
```

#### SystemIdentifier
Represents system identifiers (uppercase):
```javascript
{
    type: "SystemIdentifier",
    name: string,           // Normalized identifier name
    systemInfo: object,     // Result from systemLookup function
    pos: [start, delim, end],
    original: string
}
```

#### Number
Represents numeric literals (preserved as-is):
```javascript
{
    type: "Number",
    value: string,          // Original number representation
    pos: [start, delim, end],
    original: string
}
```

#### String
Represents string literals (preserved as-is):
```javascript
{
    type: "String",
    value: string,          // String content
    kind: string,           // String type: 'quote', 'backtick', 'comment', etc.
    pos: [start, delim, end],
    original: string
}
```

#### Comment
Represents comment nodes in the AST. Comments are treated as standalone statements and are preserved in the parse tree:
```javascript
{
    type: "Comment",
    value: string,          // Comment content (without delimiters)
    kind: "comment",        // Always "comment"
    pos: [start, delim, end],
    original: string        // Original text including comment delimiters
}
```

**Comment Types:**
- **Line comments**: `# comment text` - extends to end of line
- **Block comments**: `/* comment text */` - can span multiple lines
- **Nested block comments**: `/**outer /* inner */ content**/` - supports nesting with matching star counts

**Parsing Behavior:**
- Comments are parsed as standalone statements in the AST
- Comments act as expression terminators, separating adjacent expressions
- Comments can appear before, after, or between other code constructs
- Empty comments (`#` or `/* */`) are preserved with empty value strings
- Comment content preserves original formatting including whitespace and newlines

**Examples:**
```javascript
// Input: "# This is a line comment"
{
    type: "Comment",
    value: " This is a line comment",
    kind: "comment",
    original: "# This is a line comment"
}

// Input: "/* Block comment */"
{
    type: "Comment",
    value: " Block comment ",
    kind: "comment",
    original: "/* Block comment */"
}

// Input: "/**nested /* inner */ comment**/"
{
    type: "Comment",
    value: "nested /* inner */ comment",
    kind: "comment",
    original: "/**nested /* inner */ comment**/"
}
```

#### Array
Represents array literals:
```javascript
{
    type: "Array",
    elements: [ASTNode],    // Array element expressions
    pos: [start, delim, end],
    original: string
}
```

#### Matrix
Represents 2D matrix literals using semicolon separators:
```javascript
{
    type: "Matrix",
    rows: [[ASTNode]],      // Array of rows, each row is array of elements
    pos: [start, delim, end],
    original: string
}
```

#### Tensor
Represents multi-dimensional tensor literals using multiple semicolon separators:
```javascript
{
    type: "Tensor",
    structure: [{
        row: [ASTNode],     // Array of elements in this row
        separatorLevel: number  // Number of semicolons that follow this row
    }],
    maxDimension: number,   // Highest dimension level (separatorLevel + 1)
    pos: [start, delim, end],
    original: string
}
```

#### Set
Represents set literals containing only literal values or expressions without special operators:
```javascript
{
    type: "Set",
    elements: [ASTNode],    // Set element expressions
    pos: [start, delim, end],
    original: string
}
```

#### Map
Represents map literals containing key-value pairs using the `:=` operator:
```javascript
{
    type: "Map",
    elements: [ASTNode],    // Array of BinaryOperation nodes with operator ":="
    pos: [start, delim, end],
    original: string
}
```

#### PatternMatch
Represents pattern-matching containers using the `:=>` operator:
```javascript
{
    type: "PatternMatch",
    elements: [ASTNode],    // Array of BinaryOperation nodes with operator ":=>"
    pos: [start, delim, end],
    original: string
}
```

#### System
Represents systems of equations using equation operators (`:=:`, `:>:`, etc.) separated by semicolons:
```javascript
{
    type: "System",
    elements: [ASTNode],    // Array of BinaryOperation nodes with equation operators
    pos: [start, delim, end],
    original: string
}
```

#### WithMetadata
Represents arrays with metadata annotations using `:=` syntax:
```javascript
{
    type: "WithMetadata",
    primary: ASTNode,       // Primary element (first non-metadata element)
    metadata: object,       // Key-value pairs of metadata
    pos: [start, delim, end],
    original: string
}
```

The `WithMetadata` node is created when an array contains any `:=` assignments. The `primary` field contains the first non-metadata element (or an empty Array node if only metadata is present). The `metadata` field is an object where keys are metadata property names and values are AST nodes representing the assigned expressions.

#### Grouping
Represents parenthesized expressions:
```javascript
{
    type: "Grouping",
    expression: ASTNode,    // The grouped expression
    pos: [start, delim, end],
    original: string
}
```

#### PropertyAccess
Represents property/array access:
```javascript
{
    type: "PropertyAccess",
    object: ASTNode,        // Object being accessed
    property: ASTNode,      // Property/index expression
    pos: [start, delim, end],
    original: string
}
```

#### Tuple
Represents tuple literals with zero or more elements:
```javascript
{
    type: "Tuple",
    elements: [ASTNode],    // Array of tuple elements
    pos: [start, delim, end],
    original: string
}
```

#### NULL
Represents null/missing values (underscore `_` symbol):
```javascript
{
    type: "NULL",
    pos: [start, delim, end],
    original: string
}
```

## Postfix Operators

RiX supports five postfix operators that provide metadata access, universal function call capabilities, and unit annotations on any expression. These operators have the highest precedence (120) and can be chained together.

### AT Operator (@)

The `@` operator provides access to precision and metadata properties of mathematical objects.

#### Syntax
```
expression@(argument)
```

#### Requirements
- Must be immediately followed by parentheses (no whitespace)
- Takes exactly one argument within the parentheses

#### Examples
```javascript
// Get PI with specific precision
PI@(1e-6)

// Precision control on expressions  
(1/3)@(epsilon)

// Chained precision refinement
PI@(1e-3)@(1e-6)
```

#### AST Structure
```javascript
{
    type: "At",
    target: expression,    // The expression being queried
    arg: expression,       // The precision/metadata argument
    pos: [start, delim, end],
    original: string
}
```

### ASK Operator (?)

The `?` operator provides boolean membership and query capabilities.

#### Syntax
```
expression?(argument)
```

#### Requirements
- Must be immediately followed by parentheses (no whitespace)
- Distinguishes from infix `?` (conditional operator) by requiring parentheses
- Takes exactly one argument within the parentheses

#### Examples
```javascript
// Check if PI is in interval [3,4]
PI?(3:4)

// Query membership
interval?(x)

// Range checking on expressions
(1/3)?(0.333:0.334)

// Chained queries
PI?(3:4)?(true)
```

#### AST Structure
```javascript
{
    type: "Ask", 
    target: expression,    // The expression being queried
    arg: expression,       // The query argument
    pos: [start, delim, end],
    original: string
}
```

### Enhanced CALL Operator (())

The enhanced call operator provides universal function call and multiplication semantics on any expression, not just identifiers.

#### Syntax
```
expression(arguments...)
```

#### Behavior
- **Identifiers**: Traditional function calls (backward compatible)
- **Numbers**: Multiplication semantics
- **Other expressions**: Universal call semantics

#### Examples
```javascript
// Traditional function call (backward compatible)
SIN(PI)

// Number multiplication via call
3(4)  // equivalent to 3 * 4

// Tuple operations
(2,3)(4,5)

// Chained function calls
f(x)(y)

// Operators as functions
+(3, 4, 7, 9)      // addition as variadic function
*(2, 3, 5)         // multiplication as function
<(x, y)            // comparison as function
*(+(2, 3), /(6, 2)) // nested operator functions
```

#### AST Structure

For identifiers (backward compatibility):
```javascript
{
    type: "FunctionCall",
    function: identifier,
    arguments: { positional: [...], keyword: {...} },
    pos: [start, delim, end],
    original: string
}
```

For other expressions:
```javascript
{
    type: "Call",
    target: expression,
    arguments: { positional: [...], keyword: {...} },
    pos: [start, delim, end], 
    original: string
}
```

### Chaining and Precedence

#### Operator Chaining
All three postfix operators can be chained together:

```javascript
// AT followed by ASK
PI@(1e-3)?(3.141:3.142)

// CALL followed by AT
f(x)@(epsilon)

// All three operators chained
g(x)@(tolerance)?(bounds)
```

#### Precedence Rules
- **Highest precedence**: Postfix operators bind tighter than all other operators
- **Left associative**: Operators are applied left-to-right
- **Property access**: @ and ? bind tighter than property access (`.`)

```javascript
// Postfix binds tighter than binary operators
x@(eps) + y        // parsed as (x@(eps)) + y

// Postfix ? vs infix ? precedence
x?(test) ? y : z   // parsed as (x?(test)) ? y : z

// Property access precedence
obj.prop@(eps)     // parsed as obj.(prop@(eps))
```

### Context Sensitivity

#### Distinguishing Postfix ? from Infix ?

The parser distinguishes between postfix `?` (ASK) and infix `?` (conditional) based on the immediate following token:

```javascript
// Postfix ASK operator (requires parentheses)
x?(test)

// Infix conditional operator
x ? y : z
```

#### Error Handling

```javascript
// Valid: @ as postfix operator
x@(eps)

// Valid: @ as infix operator (if defined)
x @ y

// Error: @ without proper arguments
x@y    // parsed as infix, may cause evaluation errors
```

### Default Behaviors

All objects have default behaviors for the postfix operators:

- **AT (@)**: Precision getter for oracles, intervals, irrationals
- **ASK (?)**: Boolean membership or query operations  
- **CALL (())**: Function call for identifiers, multiplication for numbers, variadic operations for operators

#### Operator-as-Function Behavior

Mathematical operators can be used as variadic functions when followed by parentheses:

- **Arithmetic**: `+(args...)`, `-(args...)`, `*(args...)`, `/(args...)`
- **Comparison**: `<(a,b)`, `>(a,b)`, `<=(a,b)`, `>=(a,b)`
- **Equality**: `=(a,b)`, `!=(a,b)`
- **Logic**: `AND(args...)`, `OR(args...)`

This enables functional programming styles and variadic operations.

These behaviors can be overridden via custom metadata properties.

### Scientific Unit Operator (~[)

The `~[` operator attaches scientific units to expressions.

#### Syntax
```
expression~[unit]
```

#### Requirements
- Opening `~[` must be immediately followed by unit content
- Unit content extends until matching closing `]`
- No nesting of brackets within units

#### Examples
```javascript
// Basic units
3~[m]              // 3 meters
5.2~[kg]           // 5.2 kilograms

// Complex units
9.8~[m/s^2]        // acceleration
2~[kg*m^2/s^2]     // energy unit

// Units on expressions
(a + b)~[m]        // sum with meters
SIN(x)~[rad]       // sine of x radians
```

#### AST Structure
```javascript
{
    type: "ScientificUnit",
    target: expression,    // The expression being annotated
    unit: string,          // The unit content between brackets
    pos: [start, delim, end],
    original: string
}
```

### Mathematical Unit Operator (~{)

The `~{` operator attaches mathematical units (like imaginary unit, algebraic extensions) to expressions.

#### Syntax
```
expression~{unit}
```

#### Requirements
- Opening `~{` must be immediately followed by unit content
- Unit content extends until matching closing `}`
- No nesting of braces within units

#### Examples
```javascript
// Mathematical units
2~{i}              // 2 times imaginary unit
1~{sqrt2}          // 1 times square root of 2
3~{pi}             // 3 times pi

// Units on expressions
(x + y)~{i}        // complex number
```

#### AST Structure
```javascript
{
    type: "MathematicalUnit",
    target: expression,    // The expression being annotated
    unit: string,          // The unit content between braces
    pos: [start, delim, end],
    original: string
}
```

### Integration Examples

```javascript
// Interval arithmetic with precision
result := (a + b)@(tolerance)

// Function composition with queries
validated := f(x)@(precision)?(expected_range)

// Matrix operations
transform := matrix(data)(vector)@(numerical_precision)

// Oracle queries
oracle_result := oracle@(tolerance)?(bounds)

// Functional arithmetic with precision
sum_result := +(a, b, c)@(numerical_precision)

// Complex functional expressions
equation := =(+(x, y), *(z, w))@(tolerance)?(bounds)

// Unit annotations
velocity := 5~[m/s]
complex := 3~{i}~[V]              // complex voltage
energy := (m * c^2)~[J]

// Unit conversion using CONVERT function
distance := CONVERT(100~[m], "m", "ft")
```

## Tuples

### Overview
Tuples in RiX are ordered collections of values enclosed in parentheses. They provide a way to group multiple values together while maintaining their order and allowing mixed data types.

### Syntax Rules

1. **Parentheses**: Tuples use parentheses `()` for delimitation
2. **Comma Separation**: Elements are separated by commas `,`
3. **Comma Detection**: Presence of at least one comma indicates a tuple
4. **Grouping vs Tuples**:
   - `(expression)` → Grouped expression (no comma)
   - `(expression,)` → Singleton tuple (with comma)
5. **Underscore as Null**: `_` symbol always represents `null`
6. **No Empty Slots**: Consecutive commas are syntax errors

### Examples

#### Empty Tuple
```rix
()
```
**AST:**
```javascript
{
    type: "Tuple",
    elements: []
}
```

#### Grouped Expression (Not a Tuple)
```rix
(42)
```
**AST:**
```javascript
{
    type: "Grouping",
    expression: {
        type: "Number",
        value: "42"
    }
}
```

#### Singleton Tuple
```rix
(42,)
```
**AST:**
```javascript
{
    type: "Tuple",
    elements: [
        { type: "Number", value: "42" }
    ]
}
```

#### Multi-Element Tuple
```rix
(1, 2, 3)
```
**AST:**
```javascript
{
    type: "Tuple",
    elements: [
        { type: "Number", value: "1" },
        { type: "Number", value: "2" },
        { type: "Number", value: "3" }
    ]
}
```

#### Tuple with Null Values
```rix
(x, _, y)
```
**AST:**
```javascript
{
    type: "Tuple",
    elements: [
        { type: "UserIdentifier", name: "x" },
        { type: "NULL" },
        { type: "UserIdentifier", name: "y" }
    ]
}
```

#### Underscore as Null Symbol
```rix
_ := 42
```
**AST:**
```javascript
{
    type: "BinaryOperation",
    operator: ":=",
    left: { type: "NULL" },
    right: { type: "Number", value: "42" }
}
```

#### Nested Tuples
```rix
((1, 2), (3, 4))
```
**AST:**
```javascript
{
    type: "Tuple",
    elements: [
        {
            type: "Tuple",
            elements: [
                { type: "Number", value: "1" },
                { type: "Number", value: "2" }
            ]
        },
        {
            type: "Tuple",
            elements: [
                { type: "Number", value: "3" },
                { type: "Number", value: "4" }
            ]
        }
    ]
}
```

#### Tuple with Expressions
```rix
(a + b, SIN(x), _)
```
**AST:**
```javascript
{
    type: "Tuple",
    elements: [
        {
            type: "BinaryOperation",
            operator: "+",
            left: { type: "UserIdentifier", name: "a" },
            right: { type: "UserIdentifier", name: "b" }
        },
        {
            type: "FunctionCall",
            function: { type: "SystemIdentifier", name: "SIN" },
            arguments: { positional: [{ type: "UserIdentifier", name: "x" }], keyword: [] }
        },
        { type: "NULL" }
    ]
}
```

#### Trailing Commas
```rix
(1, 2, 3,)
```
Trailing commas are allowed and create the same AST as without them.

### Use Cases

#### Coordinate Representation
```rix
point := (x, y, z);
color := (red, green, blue, alpha);
```

#### Multiple Return Values
```rix
result := (status, data, error);
```

#### Sparse Data with Nulls
```rix
record := (name, _, email, _, phone);
value := _;  // Underscore is always null symbol
```

#### Function Arguments Grouping
```rix
args := (param1, param2, param3);
result := someFunction(args);
```

### Error Cases

#### Consecutive Commas (Syntax Error)
```rix
(1,, 2)     // Error: Consecutive commas not allowed
(a, , b)    // Error: Empty element not allowed
```

#### Empty Elements (Syntax Error)
```rix
(,)         // Error: Cannot start with comma
(1, 2,, 3)  // Error: Consecutive commas
```

### Distinction from Other Constructs

| Syntax | Type | Description |
|--------|------|-------------|
| `(expr)` | Grouping | Single expression, no comma |
| `(expr,)` | Tuple | Singleton tuple with comma |
| `(a, b)` | Tuple | Multi-element tuple |
| `[a, b]` | Array | Array literal |
| `{a, b}` | Set | Set literal |
| `(_, val)` | Tuple | Underscore as null symbol |

### Implementation Notes

- **Parser Logic**: Comma detection during parentheses scanning determines tuple vs grouping
- **Underscore Handling**: `_` is always parsed as a null symbol, regardless of context
- **Dynamic Access**: `_` between identifiers enables dynamic access (future feature)
- **Error Recovery**: Clear error messages for common mistakes like consecutive commas
- **Precedence**: Tuple creation has no precedence conflicts as it's delimiter-based
- **Memory**: Efficient representation with direct element array storage

## Metadata and Property Annotations

The parser supports metadata annotations within array syntax using the `:=` operator. When an array contains key-value pairs with `:=`, it creates a `WithMetadata` node instead of a regular `Array` node.

### Syntax

```javascript
[object, key := value, ...]
```

### Rules

1. **Metadata Detection**: If any `:=` assignment is found within array brackets, the entire construct becomes a `WithMetadata` node
2. **Primary Element**: The first non-metadata element becomes the `primary` property
3. **Single Primary**: Only one non-metadata element is allowed when metadata is present
4. **Metadata Keys**: Can be identifiers (user or system) or string literals
5. **Metadata Values**: Can be any valid expression
6. **Array Primary**: To use an array as primary, wrap it: `[[1,2,3], key := value]`

### Examples

#### Basic Metadata
```javascript
// Input: [obj, name := "foo"]
{
    type: "WithMetadata",
    primary: { type: "UserIdentifier", name: "obj" },
    metadata: {
        name: { type: "String", value: "foo", kind: "quote" }
    }
}
```

#### Multiple Metadata Properties
```javascript
// Input: [data, size := 10, active := true, version := 1.2]
{
    type: "WithMetadata",
    primary: { type: "UserIdentifier", name: "data" },
    metadata: {
        size: { type: "Number", value: "10" },
        active: { type: "UserIdentifier", name: "true" },
        version: { type: "Number", value: "1.2" }
    }
}
```

#### Array as Primary Element
```javascript
// Input: [[1, 2, 3], name := "numbers", count := 3]
{
    type: "WithMetadata",
    primary: {
        type: "Array",
        elements: [
            { type: "Number", value: "1" },
            { type: "Number", value: "2" },
            { type: "Number", value: "3" }
        ]
    },
    metadata: {
        name: { type: "String", value: "numbers", kind: "quote" },
        count: { type: "Number", value: "3" }
    }
}
```

#### String Keys
```javascript
// Input: [obj, "display-name" := "My Object", "created-at" := timestamp]
{
    type: "WithMetadata",
    primary: { type: "UserIdentifier", name: "obj" },
    metadata: {
        "display-name": { type: "String", value: "My Object", kind: "quote" },
        "created-at": { type: "UserIdentifier", name: "timestamp" }
    }
}
```

#### Metadata Only
```javascript
// Input: [name := "config", version := 2]
{
    type: "WithMetadata",
    primary: { type: "Array", elements: [] },
    metadata: {
        name: { type: "String", value: "config", kind: "quote" },
        version: { type: "Number", value: "2" }
    }
}
```

## Matrix and Tensor Syntax

The parser supports multi-dimensional matrix and tensor literals using semicolon separators with different levels indicating dimensionality.

### Syntax Rules

- **Commas (`,`)** separate elements within a row
- **Single semicolon (`;`)** separates rows within a 2D matrix
- **Double semicolon (`;;`)** separates 2D slices within a 3D tensor
- **Triple semicolon (`;;;`)** separates 3D blocks within a 4D tensor
- And so on for higher dimensions...

### Matrix Examples

#### 2D Matrix
```javascript
// Input: [1, 2; 3, 4];
{
    type: "Matrix",
    rows: [
        [
            { type: "Number", value: "1" },
            { type: "Number", value: "2" }
        ],
        [
            { type: "Number", value: "3" },
            { type: "Number", value: "4" }
        ]
    ]
}
```

#### Matrix with Variables
```javascript
// Input: [x, y; z, w];
{
    type: "Matrix",
    rows: [
        [
            { type: "UserIdentifier", name: "x" },
            { type: "UserIdentifier", name: "y" }
        ],
        [
            { type: "UserIdentifier", name: "z" },
            { type: "UserIdentifier", name: "w" }
        ]
    ]
}
```

#### Column Vector
```javascript
// Input: [1; 2; 3];
{
    type: "Matrix",
    rows: [
        [{ type: "Number", value: "1" }],
        [{ type: "Number", value: "2" }],
        [{ type: "Number", value: "3" }]
    ]
}
```

### Tensor Examples

#### 3D Tensor
```javascript
// Input: [1, 2; 3, 4 ;; 5, 6; 7, 8];
{
    type: "Tensor",
    structure: [
        {
            row: [
                { type: "Number", value: "1" },
                { type: "Number", value: "2" }
            ],
            separatorLevel: 1
        },
        {
            row: [
                { type: "Number", value: "3" },
                { type: "Number", value: "4" }
            ],
            separatorLevel: 2
        },
        {
            row: [
                { type: "Number", value: "5" },
                { type: "Number", value: "6" }
            ],
            separatorLevel: 1
        },
        {
            row: [
                { type: "Number", value: "7" },
                { type: "Number", value: "8" }
            ],
            separatorLevel: 0
        }
    ],
    maxDimension: 3
}
```

#### 4D Tensor
```javascript
// Input: [1; 2 ;; 3; 4 ;;; 5; 6 ;; 7; 8];
{
    type: "Tensor",
    structure: [
        // Structure with separatorLevel values ranging from 0 to 3
    ],
    maxDimension: 4
}
```

### Special Cases

#### Empty Rows
Empty rows are preserved in the structure:
```javascript
// Input: [1, 2; ; 3, 4];
{
    type: "Matrix",
    rows: [
        [
            { type: "Number", value: "1" },
            { type: "Number", value: "2" }
        ],
        [],  // Empty row
        [
            { type: "Number", value: "3" },
            { type: "Number", value: "4" }
        ]
    ]
}
```

#### Mixed with Expressions
Matrix elements can be any valid expressions:
```javascript
// Input: [a + b, sin(x); f(y), z^2];
{
    type: "Matrix",
    rows: [
        [
            { type: "BinaryOperation", operator: "+", ... },
            { type: "FunctionCall", function: { name: "sin" }, ... }
        ],
        [
            { type: "FunctionCall", function: { name: "f" }, ... },
            { type: "BinaryOperation", operator: "^", ... }
        ]
    ]
}
```

### Important Notes

- **Metadata incompatible**: Matrix/tensor syntax cannot be mixed with metadata annotations (`:=` syntax)
- **Spaces matter**: Spaces between semicolons create separate separator tokens
- **Post-processing**: Actual dimensional analysis is performed at post-processing level
- **Precedence**: Semicolon sequences have separator precedence and break expression parsing

## Extending the Parser

### Adding New Operators

To add a new operator, add it to the `SYMBOL_TABLE` in `parser.js`:

```javascript
const SYMBOL_TABLE = {
    // ... existing operators
    '@@': {
        precedence: PRECEDENCE.UNARY,
        associativity: 'right',
        type: 'prefix'
    },
    '<=>': {
        precedence: PRECEDENCE.COMPARISON,
        associativity: 'left',
        type: 'infix'
    }
};
```

### Adding System Identifiers

Extend your system lookup function:

```javascript
function systemLookup(name) {
    const systemSymbols = {
        // ... existing symbols
        'MATRIX': { type: 'function', arity: -1, description: 'Matrix constructor' },
        'TRANSPOSE': { type: 'operator', precedence: 120, operatorType: 'postfix' }
    };
    return systemSymbols[name] || { type: 'identifier' };
}
```

### Custom AST Node Types

For specialized constructs, you can create custom node types by modifying the parser's `createNode` method and adding appropriate parsing logic.

## Brace Container Types

The parser distinguishes between different types of brace containers based on their syntax and contents:

### Code Blocks `{; }`

Code blocks use double braces and contain executable statements or expressions:
```javascript
// Input: "{;x := 1; y := 2};"
{
    type: "BlockContainer",
    statements: [
        {
            type: "BinaryOperation",
            operator: ":=",
            left: { type: "UserIdentifier", name: "x" },
            right: { type: "Number", value: "1" }
        },
        {
            type: "BinaryOperation",
            operator: ":=",
            left: { type: "UserIdentifier", name: "y" },
            right: { type: "Number", value: "2" }
        }
    ]
}
```

**Important**: Spaces between braces matter! `{;}` is a code block, while `{ {} }` is a set containing an empty set.

#### Code Block Rules:
- Use `{;` and `}` delimiters (double braces)
- Can contain any valid RiX expressions or statements
- Statements can be separated by semicolons
- Always produces a `BlockContainer` AST node regardless of statement count
- Supports assignments, function calls, expressions, and nested structures

#### Code Block Examples:
```javascript
// Empty code block
{;}

// Single expression
{;x + y}

// Single assignment
{;result := calculation()}

// Multiple statements
{;a := 1; b := 2; sum := a + b}

// Complex computation pipeline
{;input := 45; radians := input * PI / 180; result := SIN(radians)}

// Nested code blocks
{; a := {; 3 } }

// Multi-level nesting
{; x := {; y := {; z := 42 } } }

// Complex nested with multiple statements
{; outer := 1; inner := {; nested := 2; nested + 1 }; result := outer + inner }
```

### Brace Containers `{ }`

The parser distinguishes between four different types of single brace containers `{}` based on their contents:

### Set Containers
Contains only literal values or expressions without special assignment operators:
```javascript
// Input: "{3, 5, 6};"
{
    type: "Set",
    elements: [
        { type: "Number", value: "3" },
        { type: "Number", value: "5" },
        { type: "Number", value: "6" }
    ]
}
```

### Map Containers
Contains key-value pairs using the `:=` operator:
```javascript
// Input: "{a := 4, b := 5};"
{
    type: "Map",
    elements: [
        {
            type: "BinaryOperation",
            operator: ":=",
            left: { type: "UserIdentifier", name: "a" },
            right: { type: "Number", value: "4" }
        },
        {
            type: "BinaryOperation",
            operator: ":=",
            left: { type: "UserIdentifier", name: "b" },
            right: { type: "Number", value: "5" }
        }
    ]
}
```

### Pattern-Match Containers
Contains pattern-match pairs using the `:=>` operator:
```javascript
// Input: "{(x) :=> x + 1};"
{
    type: "PatternMatch",
    elements: [{
        type: "BinaryOperation",
        operator: ":=>",
        left: {
            type: "Grouping",
            expression: { type: "UserIdentifier", name: "x" }
        },
        right: {
            type: "BinaryOperation",
            operator: "+",
            left: { type: "UserIdentifier", name: "x" },
            right: { type: "Number", value: "1" }
        }
    }]
}
```

### System Containers
Contains equations using equation operators (`:=:`, `:>:`, etc.) separated by semicolons:
```javascript
// Input: "{x :=: 3*x + 2; y :=: x};"
{
    type: "System",
    elements: [
        {
            type: "BinaryOperation",
            operator: ":=:",
            left: { type: "UserIdentifier", name: "x" },
            right: {
                type: "BinaryOperation",
                operator: "+",
                left: {
                    type: "BinaryOperation",
                    operator: "*",
                    left: { type: "Number", value: "3" },
                    right: { type: "UserIdentifier", name: "x" }
                },
                right: { type: "Number", value: "2" }
            }
        },
        {
            type: "BinaryOperation",
            operator: ":=:",
            left: { type: "UserIdentifier", name: "y" },
            right: { type: "UserIdentifier", name: "x" }
        }
    ]
}
```

### Type Validation Rules

The parser enforces type homogeneity within brace containers:

1. **Set containers**: Can contain any expressions that don't use special operators
2. **Map containers**: Must contain only `:=` assignments
3. **Pattern-match containers**: Must contain only `:=>` pattern matches
4. **System containers**: Must contain only equation operators (`:=:`, `:>:`, `:<:`, `:<=:`, `:>=:`) and use semicolons as separators

Mixing different types within the same container will result in a parse error.

## Code Block vs Brace Container Distinction

It's crucial to understand the difference between code blocks `{; }` and brace containers `{ }`:

| Construct | Syntax | Purpose | Example |
|-----------|--------|---------|---------|
| Code Block | `{; }` | Assignable code execution | `{;x := 1; y := x + 1}` |
| **Tuple** | **`{: }`** | **Explicit tuple literal** | **`{: 1, 2, 3}`** |
| Set | `{ }` | Mathematical set | `{1, 2, 3}` |
| Map | `{= }` | Key-value pairs | `{= name := "Alice", age := 30}` |
| Pattern Match | `{ }` | Pattern matching | `{(0) :=> "zero", (1) :=> "one"}` |
| System | `{ }` | Equation systems | `{x :=: 2*y; y :>: 0}` |

### `{: }` Tuple Container vs `( )` Grouping

`{: 1, 2, 3}` and `(1, 2, 3)` both produce a 3-element tuple and are equivalent. However, there is an important difference when the content is itself a tuple expression:

```rix
{: 1, 2, 3}      // TupleContainer with 3 comma-separated elements → tuple (1,2,3)
(1, 2, 3)        // Tuple literal → tuple (1,2,3)
// These two are equivalent ✓

{: (1, 2, 3)}    // TupleContainer with ONE element: the inner tuple (1,2,3)
                 // → a 1-element tuple containing (1,2,3), i.e. ((1,2,3),)
((1, 2, 3))      // Outer parens are just grouping — same as (1,2,3)
// These two are NOT equivalent!
```

The reason: `{: }` uses commas as **element separators at the block level**. When you write `{: (1,2,3)}`, the inner commas belong to the inner tuple expression — the `{:` container sees only one element (the tuple `(1,2,3)`), which it wraps in an outer tuple. By contrast, `((1,2,3))` is just parenthetical grouping around an already-complete tuple expression.

This distinction matters for piping:

```rix
{: (1, 2, 3)} |> F    // callArgs = [(1,2,3)] — F receives the inner tuple as one arg
                       // because the outer 1-element tuple unpacks to a single element
(1, 2, 3) |> F        // callArgs = [1, 2, 3] — F receives three separate args

// If you want to pipe a tuple as a single argument, use _0:
(1, 2, 3) ||> F(_0)   // F receives (1,2,3) as one arg — cleaner than {: (1,2,3)}
```

### Spacing Examples:
```javascript
{;3}        // Code block containing number 3
{ {3} }      // Set containing a set that contains 3
{;}         // Empty code block
{ {} }       // Set containing an empty set
{; {a := 1} } // Code block containing a map
{ {;a := 1} } // Set containing a code block (nested)

// Nested code block examples
{; a := {; 3 } }                    // Code block with nested code block
{; x := {; y := 2; y * 3 } }         // Assignment to nested computation
{; compute := {; base := 10; base^2 }; result := compute + 5 } // Multi-level
```

## Examples

### Basic Arithmetic
```javascript
// Input: "2 + 3 * 4;"
{
    type: "Statement",
    expression: {
        type: "BinaryOperation",
        operator: "+",
        left: { type: "Number", value: "2" },
        right: {
            type: "BinaryOperation",
            operator: "*",
            left: { type: "Number", value: "3" },
            right: { type: "Number", value: "4" }
        }
    }
}
```

### Function Call
```javascript
// Input: "SIN(PI / 2);"
{
    type: "Statement",
    expression: {
        type: "FunctionCall",
        function: {
            type: "SystemIdentifier",
            name: "SIN",
            systemInfo: { type: "function", arity: 1 }
        },
        arguments: [{
            type: "BinaryOperation",
            operator: "/",
            left: {
                type: "SystemIdentifier",
                name: "PI",
                systemInfo: { type: "constant", value: 3.14159... }
            },
            right: { type: "Number", value: "2" }
        }]
    }
}
```

### Assignment with Function Definition
```javascript
// Input: "f := x -> x^2 + 1;"
{
    type: "Statement",
    expression: {
        type: "BinaryOperation",
        operator: ":=",
        left: { type: "UserIdentifier", name: "f" },
        right: {
            type: "BinaryOperation",
            operator: "->",
            left: { type: "UserIdentifier", name: "x" },
            right: {
                type: "BinaryOperation",
                operator: "+",
                left: {
                    type: "BinaryOperation",
                    operator: "^",
                    left: { type: "UserIdentifier", name: "x" },
                    right: { type: "Number", value: "2" }
                },
                right: { type: "Number", value: "1" }
            }
        }
    }
}
```

### Metadata Annotation
```javascript
// Input: "[matrix, rows := 3, cols := 4, name := \"transformation\"];"
{
    type: "Statement",
    expression: {
        type: "WithMetadata",
        primary: { type: "UserIdentifier", name: "matrix" },
        metadata: {
            rows: { type: "Number", value: "3" },
            cols: { type: "Number", value: "4" },
            name: { type: "String", value: "transformation", kind: "quote" }
        }
    }
}
```

## Comments

The RiX parser includes comprehensive support for comments, treating them as first-class AST nodes rather than discarding them during parsing. This allows tools to preserve documentation, implement preprocessing directives, or perform comment-based analysis.

### Comment Syntax

The parser supports two types of comments:

**Line Comments (`#`)**
```javascript
# This is a line comment
x = 5  # Inline comment
```

**Block Comments (`/* */`)**
```javascript
/* This is a block comment */
/* Multi-line
   block comment
   spanning several lines */
```

**Nested Block Comments**
```javascript
/**outer /* nested inner */ content**/
/***deeply /* nested /* comment */ structure */ content***/
```

### Comment Parsing Behavior

1. **Standalone Statements**: Comments are parsed as independent `Comment` nodes in the AST
2. **Expression Separators**: Comments act as implicit statement terminators, breaking expression parsing
3. **Content Preservation**: All comment content is preserved exactly as written (including whitespace)
4. **Position Tracking**: Comments include precise source position information

### Comment AST Structure

Each comment produces a dedicated AST node:
```javascript
{
    type: "Comment",
    value: string,          // Comment content without delimiters
    kind: "comment",        // Always "comment"
    pos: [start, delim, end],
    original: string        // Original text including delimiters
}
```

### Parsing Examples

**Simple Line Comment**
```javascript
// Input: "# Calculate result"
// AST:
[{
    type: "Comment",
    value: " Calculate result",
    kind: "comment",
    original: "# Calculate result"
}]
```

**Comment Between Expressions**
```javascript
// Input: "x = 5\n# Set variable\ny = 10"
// AST:
[
    { type: "BinaryOperation", operator: "=", ... },
    { type: "Comment", value: " Set variable", ... },
    { type: "BinaryOperation", operator: "=", ... }
]
```

**Nested Block Comment**
```javascript
// Input: "/**outer /* inner */ content**/"
// AST:
[{
    type: "Comment",
    value: "outer /* inner */ content",
    kind: "comment",
    original: "/**outer /* inner */ content**/"
}]
```

### Integration with Code

Comments integrate seamlessly with all RiX language constructs:

- **Before expressions**: `# comment\nexpression`
- **After expressions**: `expression\n# comment`
- **Between statements**: `stmt1; # comment\nstmt2`
- **In function definitions**: Comments preserve documentation
- **With metadata**: Comments can document complex annotations

This comment support enables rich documentation workflows and tooling that can process both code and its associated documentation in a unified manner.

## Error Handling

The parser provides detailed error messages with position information:

```javascript
try {
    const ast = parse(tokens, systemLookup);
} catch (error) {
    console.error(`Parse error at position ${error.position}: ${error.message}`);
}
```

Common error scenarios:
- **Unmatched delimiters**: Missing closing parentheses, brackets, or braces
- **Unexpected tokens**: Invalid syntax or token sequences
- **Expression termination**: Incomplete expressions at statement boundaries
- **Mixed metadata**: Cannot mix multiple array elements with metadata assignments
- **Mixed container types**: Cannot mix different assignment operators within brace containers
- **Invalid system syntax**: System containers require semicolon separators

## Position Tracking

Each AST node includes position information in the format `[start, delimiter, end]`:

- **start**: Character position where the construct begins
- **delimiter**: Position of the primary delimiter (for strings/operators)
- **end**: Character position where the construct ends

This enables precise error reporting and source mapping for debugging and tooling.

## Performance Considerations

- **Linear complexity**: The parser processes each token once with O(n) complexity
- **Memory efficient**: AST nodes are created incrementally without backtracking
- **Extensible**: Adding operators doesn't affect parsing performance of existing code
- **Position preservation**: Full source position tracking with minimal overhead

## Piping and Sequence Operators

The RiX parser supports a comprehensive family of piping and sequence operators for functional data processing and transformation. These operators enable elegant composition of operations and data flow patterns.

### Overview

Piping operators allow data to flow from left to right through a sequence of transformations. All pipe operators are **left-associative**, meaning `a |> f |> g` is parsed as `(a |> f) |> g`, allowing natural left-to-right data flow through the pipeline.

### Operator Types

| Operator | AST Node | Precedence | Associativity | Description |
|----------|----------|------------|---------------|-------------|
| `\|>` | `Pipe` | 20 | left | Simple pipe - auto-feeds left as arguments to right function |
| `\|\|>` | `ExplicitPipe` | 20 | left | Explicit pipe with placeholders for argument rearrangement |
| `\|>>` | `Map` | 20 | left | Map function over each element of iterable |
| `\|>?` | `Filter` | 20 | left | Filter elements where predicate returns true |
| `\|>:` | `Reduce` | 20 | left | Reduce iterable to single value using binary function |

### Simple Pipe (`|>`)

The simple pipe operator feeds the left operand as arguments to the right function. **Tuples are automatically unpacked as positional arguments; arrays and all other values are passed as a single argument.**

#### Syntax
```
value |> function
tuple |> function
```

#### Tuple unpacking vs. single-value passing

| Left operand | How it arrives at the function |
|---|---|
| Tuple `(a, b, c)` | Unpacked — `f(a, b, c)` |
| Array `[a, b, c]` | Single arg — `f([a, b, c])` |
| Scalar `x` | Single arg — `f(x)` |

#### Examples
```rix
3 |> F                    // F(3)
(3, 4) |> F              // F(3, 4) — tuple unpacked into two positional args
(1, 2) |> SUB            // SUB(1, 2) — where SUB(x,y) :-> x - y gives -1
[1, 2, 3] |> Sum         // Sum([1, 2, 3]) — array passed as one arg
x |> Sqrt |> Abs         // Abs(Sqrt(x)) — left associative
```

#### AST Structure
```javascript
{
  type: "Pipe",
  left: { /* left operand */ },
  right: { /* right function */ }
}
```

### Explicit Pipe (`||>`)

The explicit pipe operator is a **general IR-template substitution operator**. It evaluates the left side into a tuple, then replaces every placeholder (`_1`, `_2`, …) anywhere in the right-side expression with the corresponding tuple element, and evaluates the result. The right side does **not** have to be a function call — it can be any expression.

#### Syntax
```
tuple ||> AnyExpression
```

#### How it works

`PIPE_EXPLICIT` recursively walks the entire IR of the right-hand expression before evaluation, substituting `PLACEHOLDER` nodes with already-evaluated tuple values. Because substitution happens at the IR level, the right side can be a function call, a tuple, an array literal, a map/record literal, or any compound expression — whatever you write, the placeholders are filled in first, then it evaluates normally.

#### Placeholder Rules
- **`_0`** — the entire left-hand value, passed as a single argument (the whole tuple, not unpacked)
- **`_1`, `_2`, `_3`, …** — individual tuple elements, 1-based
- Placeholders can be reordered: `_2, _1` swaps arguments
- Placeholders can be duplicated: `_1, _1` repeats the first element
- Placeholders can be skipped: `_3, _1` uses only the first and third elements
- A scalar left side is treated as a one-element tuple (`_1` and `_0` both refer to it)
- Out-of-range placeholders (e.g. `_5` on a 2-element tuple) raise a runtime error

#### Examples — piping into a function
```rix
(1, 2) ||> SUB(_2, _1)         // SUB(2, 1) = 1  (compare: (1,2) |> SUB = -1)
(3, 4) ||> SUB(_1, _2)         // SUB(3, 4) = -1 (same order as |>)
(5, 2) ||> SUB(_1, _1)         // SUB(5, 5) = 0  (duplicate first)
(1, 2, 3) ||> G(_3, _2, _1)    // G(3, 2, 1) — reversed
(a, b, c, d) ||> H(_4, _1, _3) // H(d, a, c) — selective
(1, 2, 3) ||> F(_0)            // F receives the whole tuple (1,2,3) as one arg
```

#### Examples — restructuring without a function

Because `||>` substitutes placeholders in *any* right-side expression, it doubles as a compact restructuring / projection operator:

```rix
(1, 2, 3) ||> (_2, _1, _3)           // (2, 1, 3)  — reorder into a new tuple
(1, 2, 3) ||> [_2, _1, _3]           // [2, 1, 3]  — reorder into an array
(1, 2, 3) ||> {= a=_2, b=_1, c=_3}  // {= a=2, b=1, c=3 } — project into a record
(x, y)    ||> (_1 + _2, _1 - _2)     // (x+y, x-y) — compute multiple results
(1, 2, 3) ||> [_0]                   // [(1,2,3)] — wrap whole tuple as one array element
```

No helper function needed — `||>` with a literal on the right is equivalent to an anonymous structural mapping.

#### AST Structure
```javascript
{
  type: "ExplicitPipe",
  left: { /* tuple operand */ },
  right: { /* any expression containing PlaceHolder nodes */ }
}
```

### Map Operator (`|>>`)

The map operator applies a function to each element of an iterable, producing a new iterable with transformed elements.

#### Syntax
```
iterable |>> function
iterable |>> lambda_expression
```

#### Examples
```rix
[1, 2, 3] |>> f                    // [f(1), f(2), f(3)]
[1, 2, 3] |>> (x) -> x^2          // [1, 4, 9]
words |>> (w) -> w.toUpperCase()   // uppercase each word
matrix |>> (row) -> row |> sum     // sum each row
```

#### AST Structure
```javascript
{
  type: "Map",
  left: { /* iterable operand */ },
  right: { /* function or lambda */ }
}
```

### Filter Operator (`|>?`)

The filter operator keeps only elements where the predicate function returns true.

#### Syntax
```
iterable |>? predicate_function
iterable |>? lambda_expression
```

#### Examples
```rix
[1, 2, 3, 4] |>? (x) -> x > 2     // [3, 4]
[1, 2, 3, 4] |>? (x) -> x % 2 == 0 // [2, 4] - even numbers
words |>? (w) -> w.length > 3      // words longer than 3 chars
data |>? isValid                   // filter using named predicate
```

#### AST Structure
```javascript
{
  type: "Filter",
  left: { /* iterable operand */ },
  right: { /* predicate function */ }
}
```

### Reduce Operator (`|>:`)

The reduce operator accumulates elements of an iterable into a single value using a binary function.

#### Syntax
```
iterable |>: binary_function
iterable |>: lambda_expression
```

#### Examples
```rix
[1, 2, 3, 4] |>: (a, b) -> a + b  // 10 - sum
[1, 2, 3, 4] |>: (acc, x) -> acc * x // 24 - product
[5, 2, 8, 1] |>: (max, x) -> x > max ? x : max // 8 - maximum
words |>: (acc, w) -> acc + " " + w // concatenate with spaces
```

#### AST Structure
```javascript
{
  type: "Reduce",
  left: { /* iterable operand */ },
  right: { /* binary function */ }
}
```

### Operator Composition

Pipe operators can be chained together to create complex data processing pipelines:

#### Examples
```rix
// Map then filter
[1, 2, 3, 4, 5] |>> (x) -> x^2 |>? (y) -> y > 10
// Result: [16, 25]

// Filter then reduce
numbers |>? (x) -> x > 0 |>: (a, b) -> a + b
// Sum positive numbers

// Complex pipeline
data |>> normalize |>? (x) -> x > threshold |>: average
// Normalize, filter, then compute average

// Explicit pipe in pipeline
(matrix, vector) ||> multiply(_1, _2) |> validate
// Matrix-vector multiplication with validation
```

### Left Associativity

All pipe operators are left-associative, which means:

```rix
a |> f |> g |> h
// Parsed as: (((a |> f) |> g) |> h)
// Evaluated as: h(g(f(a)))

[1,2,3] |>> double |>? positive |>: sum
// Parsed as: (([1,2,3] |>> double) |>? positive) |>: sum
```

This associativity enables natural left-to-right data flow through the pipeline, where each operation processes the result of the previous operation.

### Precedence Rules

Pipe operators have precedence level 20, which means they:
- Bind looser than arithmetic and function calls
- Bind tighter than assignment operators
- Allow natural expression of data flow patterns

```rix
x + y |> f        // (x + y) |> f
x |> f + 1        // (x |> f) + 1
result := x |> f  // result := (x |> f)
```

### Integration Examples

#### With Function Definitions
```rix
processData := (input) -> input |>> clean |>? validate |>: combine;
```

#### With Assignment
```rix
result := rawData |>> normalize |>? (x) -> x > 0.5 |>: average;
```

#### With System Functions
```rix
numbers |> SUM;
matrix |>> (row) -> row |> MAX;
```

#### Mathematical Processing
```rix
measurements |>> (x) -> x - MEAN(measurements) |>> (x) -> x^2 |>: sum;
// Compute sum of squared deviations
```

### Error Handling

The parser validates:
- Placeholder syntax in explicit pipes (`_1`, `_2`, etc.)
- Proper function syntax on the right side of operators
- Correct AST node generation for each operator type

Invalid examples that will produce parse errors:
```rix
x ||> f(_0, _1)     // Invalid: placeholders start from _1
x |>                // Invalid: missing right operand
|> f                // Invalid: missing left operand
```

## Function Definitions

The RiX parser supports comprehensive function definition syntax with multiple paradigms.

### Standard Function Definitions

Standard functions use the `:->` operator and support positional and keyword-only parameters:

```javascript
// Basic function
f(x) :-> x + 1

// Function with default parameters
f(x, n := 5) :-> x^n

// Function with keyword-only parameters (after semicolon)
f(x, n := 5; a := 0) :-> (x-a)^n + 1

// Function with conditional parameters
h(x, y; n := 2 ? x^2 + y^2 = 1) :-> COS(x; n) * SIN(y; n)
```

#### Parameter Types

1. **Positional Parameters**: `x` - required parameters with no default
2. **Positional with Defaults**: `n := 5` - optional parameters with default values
3. **Keyword-Only Parameters**: Parameters after `;` that must have defaults and be called by name
4. **Conditional Parameters**: `n := 2 ? condition` - parameters with conditions that must be satisfied

#### AST Structure

```javascript
{
  type: 'FunctionDefinition',
  name: { type: 'UserIdentifier', name: 'f' },
  parameters: {
    positional: [
      { name: 'x', defaultValue: null, condition: null, isKeywordOnly: false },
      { name: 'n', defaultValue: {...}, condition: null, isKeywordOnly: false }
    ],
    keyword: [
      { name: 'a', defaultValue: {...}, condition: {...}, isKeywordOnly: true }
    ],
    metadata: {}
  },
  body: {...},
  type: 'standard'
}
```

### Pattern Matching Functions

Pattern matching functions use `:=>` and allow multiple function definitions under one name:

```javascript
// Array syntax
g :=> [ (x ? x < 0) -> -x, (x) -> x ]

// Array with global metadata
g :=> [ [(x ? x < 0) -> -x+n, (x) -> x-n] , n := 4]

// Separate statements (equivalent to array syntax)
g :=> (x ? x < 0) -> -x;
g :=> (x) -> x
```

#### Pattern Matching Rules

1. Patterns are evaluated in order of definition
2. First matching pattern with successful execution is used
3. Conditions use `?` operator: `(x ? x < 0)`
4. Global metadata applies to all patterns in array form
5. Local metadata applies only to specific patterns

#### AST Structure

```javascript
{
  type: 'PatternMatchingFunction',
  name: { type: 'UserIdentifier', name: 'g' },
  parameters: {...},
  patterns: [
    {
      type: 'BinaryOperation',
      operator: '->',
      left: { /* parameter with condition */ },
      right: { /* function body */ }
    }
  ],
  metadata: { /* global metadata */ }
}
```

### Function Calls with Enhanced Syntax

Function calls support semicolon separators for keyword arguments:

```javascript
// Mixed positional and keyword arguments
f(2, 3; a := 4)

// Shorthand keyword arguments (n := n)
f(2; n)

// Multiple keyword arguments
f(1; a := 2, b := 3)
```

#### Function Call AST

```javascript
{
  type: 'FunctionCall',
  function: { type: 'UserIdentifier', name: 'f' },
  arguments: {
    positional: [
      { type: 'Number', value: '2' },
      { type: 'Number', value: '3' }
    ],
    keyword: {
      a: { type: 'Number', value: '4' }
    }
  }
}
```

### Assignment-Style Function Definitions

Alternative syntax using standard assignment operators:

```javascript
// Equivalent to f(x, n := 5; a := 0) :-> (x-a)^n + 1
f := (x, n := 5; a := 0) -> (x-a)^n + 1

// Pattern matching with assignment
g := [ (x ? x < 0) -> -x, (x) -> x ]
```

### Condition Operator

The `?` operator is used for conditional expressions in parameters and patterns:

- **Precedence**: Same as comparison operators (`<`, `>`, etc.)
- **Associativity**: Left associative
- **Usage**: `parameter ? condition` or `(args ? condition) -> body`

### Metadata Integration

Function definitions integrate with the existing metadata system:

```javascript
// Function with parameter metadata
f(x; a := 0, metadata := "description") :-> x + a

// Pattern matching with global metadata
g :=> [ patterns, n := 4, description := "absolute value function" ]
```

### Comprehensive Examples

#### Basic Function Definitions

```javascript
// Simple function
square(x) :-> x^2

// Multi-parameter function
add(x, y) :-> x + y

// Function with system calls
hypotenuse(a, b) :-> SQRT(a^2 + b^2)
```

#### Default Parameters

```javascript
// Single default parameter
power(x, n := 2) :-> x^n

// Multiple default parameters
line(x, m := 1, b := 0) :-> m*x + b

// Mixed parameters
poly(x, a, b := 1, c := 0) :-> a*x^2 + b*x + c
```

#### Keyword-Only Parameters

```javascript
// Basic keyword-only parameters
trig(x; precision := 10, angleUnit := "radians") :-> SIN(x; precision)

// Complex parameter mix
func(x, y, scale := 1; offset := 0, normalize := false) :-> (x + y) * scale + offset

// Function with unit annotations
physics(m~[kg], v~[m/s]) :-> (1/2) * m * v^2
```

#### Conditional Parameters

```javascript
// Simple condition
safeDivide(x, y; check := true ? y != 0) :-> x / y

// Complex condition
constrainedPower(x, n := 2 ? x > 0 AND n >= 0) :-> x^n

// Multiple conditions
constrainedFunc(x, y; a := 1 ? x^2 + y^2 <= 1, b := 0 ? a > 0) :-> a*x + b*y
```

#### Pattern Matching Functions

```javascript
// Basic pattern matching
abs :=> [ (x ? x >= 0) -> x, (x ? x < 0) -> -x ]

// Multiple patterns
sign :=> [ (x ? x > 0) -> 1, (x ? x < 0) -> -1, (x ? x = 0) -> 0 ]

// Pattern with global metadata
normalize :=> [ [(x ? x != 0) -> x / scale, (x) -> 0], scale := 100 ]

// Pattern with multiple metadata
transform :=> [ [(x) -> a*x + b, (x ? x < 0) -> a*(-x) + b], a := 2, b := 5 ]
```

#### Function Calls with Enhanced Syntax

```javascript
// Basic function call
result := func(5, 10)

// Function call with keywords
result := transform(x; scale := 2, offset := 5)

// Mixed argument call
result := poly(x, 3; b := 2, c := 1)

// Shorthand keywords (n := n)
result := process(data; verbose, debug)
```

#### Assignment-Style Definitions

```javascript
// Lambda assignment
double := (x) -> 2 * x

// Lambda with keywords
adjust := (x; offset := 0, scale := 1) -> x * scale + offset

// Complex lambda
polynomial := (x, coeffs; degree := 2) -> coeffs[0] + coeffs[1]*x + coeffs[2]*x^degree
```

#### Real-World Mathematical Examples

```javascript
// Distance function
distance(p1, p2; metric := "euclidean") :-> SQRT((p1[0] - p2[0])^2 + (p1[1] - p2[1])^2)

// Newton method step
newtonStep(f, df, x; tolerance := 1e-6 ? df(x) != 0) :-> x - f(x) / df(x)

// Piecewise function
piecewise :=> [
  (x ? x < -1) -> -x - 1,
  (x ? x >= -1 AND x <= 1) -> x^2,
  (x ? x > 1) -> x + 1
]

// Matrix operation with validation
matmul(A, B; validate := true ? A.cols = B.rows) :-> A * B
```

## Symbolic Calculus

### Overview

RiX provides comprehensive support for symbolic calculus operations including derivatives and indefinite integrals. The notation follows mathematical conventions while supporting advanced features like variable specification, mixed sequences, and operation vs evaluation distinction.

### Derivative Notation (Postfix Quotes)

#### Basic Derivatives
- `f'` - First derivative of function f
- `f''` - Second derivative of function f
- `f'''` - Third derivative of function f

#### Variable Specification
- `f'[x]` - Partial derivative with respect to x
- `f'[x, y]` - Specify variables for partial derivatives
- `f''[x, y, z]` - Higher-order partial derivatives

#### Evaluation vs Operations
- `f'(x)` - Derivative evaluated at point x
- `f'(x')` - Derivative operation (x' means derivative of x)
- `f'(a, b)` - Derivative evaluated at multiple points

### Integral Notation (Leading Quotes)

#### Basic Integrals
- `'f` - Indefinite integral of function f
- `''f` - Double integral of function f
- `'''f` - Triple integral of function f

#### Variable Specification
- `'f[x]` - Integral with respect to x
- `''f[x, y]` - Double integral over x and y
- `'''f[x, y, z]` - Triple integral over x, y, and z

#### Evaluation and Integration Constants
- `'f(x)` - Integral evaluated at point x
- Integration constants are automatically included in metadata as `c` with default value 0

### Mixed Calculus Operations

#### Sequential Operations
- `'f'` - Integrate f, then differentiate the result
- `f''` - Second derivative of f
- `''f''` - Double integral followed by double derivative

#### Complex Sequences with Variables
- `'f'[x, y]` - Integrate f, then take partial derivative with variables [x, y]
- `''f''[x, y, z]('x, y', 'z, x')` - Complex sequence with operation specification

### Function Calculus

#### System Functions
- `SIN(x)'` - Derivative of sine function
- `'EXP(x^2)` - Integral of exponential function
- `LOG(x^2 + 1)'[x]` - Derivative with respect to x

#### Composed Functions
- `SIN(COS(x))'` - Derivative of composed trigonometric functions
- `'POW(x, n)[x]` - Integral of power function with respect to x

### Path Derivatives

For parametric and path derivatives:
- `f'(r'(t))` - Derivative along path r(t)
- `g'(x'(t), y'(t))` - Multiple path derivatives

### AST Structure

#### Derivative Node
```
{
  type: 'Derivative',
  function: <function_node>,
  order: <number>,
  variables: [<variable_list>] | null,
  evaluation: [<evaluation_points>] | null,
  operations: [<operation_sequence>] | null
}
```

#### Integral Node
```
{
  type: 'Integral',
  function: <function_node>,
  order: <number>,
  variables: [<variable_list>] | null,
  evaluation: [<evaluation_points>] | null,
  operations: [<operation_sequence>] | null,
  metadata: {
    integrationConstant: 'c',
    defaultValue: 0
  }
}
```

### Examples

#### Simple Derivatives
```rix
f'          // First derivative function
f''(x)      // Second derivative evaluated at x
f'[x, y]    // Partial derivative with variables
```

#### Simple Integrals
```rix
'f          // Indefinite integral
''f[x, y]   // Double integral over x, y
'f(a)       // Integral evaluated at point a
```

#### Mixed Operations
```rix
'f'                    // Integrate then differentiate
''f''[x, y]           // Double integral then double derivative
'f'[x, y]('x, y')     // Complex sequence with operations
```

#### Function Calculus
```rix
SIN(x)'               // Derivative of sine
'EXP(x^2)[x]          // Integral of exponential
LOG(SIN(x))'          // Derivative of composition
```

### Parsing Rules

1. **Precedence**: Calculus operations have high precedence (115), between unary (110) and postfix (120)

2. **Associativity**: Derivatives are left-associative postfix operations

3. **Variable Specification**: Brackets `[x, y]` immediately after derivatives/integrals specify variables

4. **Evaluation vs Operations**: Parentheses content determines behavior:
   - Simple identifiers → evaluation points
   - Calculus operations (containing quotes) → operation sequences

5. **Integration Constants**: Automatically added to integral metadata

6. **Mixed Sequences**: Operations are parsed left-to-right maintaining mathematical order

## Interval Manipulation

### Overview

RiX provides comprehensive interval manipulation operations that extend the basic interval operator `:` with powerful stepping, division, mediant, and random sampling capabilities. These operations are designed for mathematical computing, data analysis, and scientific applications.

### Basic Intervals

The fundamental interval operator `:` creates a range between two values:

```rix
a:b    // Basic interval from a to b
1:10   // Integer interval
0.5:3.7 // Decimal interval
```

### Interval Stepping

Stepping operations generate arithmetic sequences within intervals:

#### Increment Stepping (`:+`)
```rix
a:b :+ n    // Start at a, add n each time until > b
1:10 :+ 2   // → 1, 3, 5, 7, 9
0:PI :+ 0.5 // → 0, 0.5, 1.0, 1.5, ..., 3.0
```

#### Decrement Stepping (`:+ -n`)
```rix
a:b :+ -n   // Start at b, subtract n each time until < a
1:10 :+ -3  // → 10, 7, 4, 1
1:10 :+ -4 // 10, 6, 2
0:360 :+ -45 // → 360, 315, 270, ..., 45, 0
```

### Interval Division

Division operations split intervals into points or sub-intervals:

#### Equally Spaced Points (`::`)
```rix
a:b::n      // Divide into n equally spaced points (including endpoints)
1:5::3      // → 1, 3, 5
0:10::5     // → 0, 2.5, 5, 7.5, 10
-1:1::9     // → -1, -0.75, -0.5, ..., 1
```

#### Sub-interval Partition (`:/:`)
```rix
a:b:/:n     // Partition into n sub-intervals
1:5:/:2     // → [1:3, 3:5]
0:12:/:4    // → [0:3, 3:6, 6:9, 9:12]
a:b:/:1     // → [a:b] (identity)
```

### Interval Mediants

Mediant operations generate fractional approximations using the mediant of fractions:

#### Mediant Tree (`:~`)
```rix
a:b:~n      // Generate mediant tree to level n
1:2:~1      // → [[1/1, 2/1], [3/2]]
1:2:~2      // → [[1/1, 2/1], [3/2], [4/3, 5/3]]
0:1:~3      // → Deep mediant approximations
```

#### Mediant Partition (`:~/`)
```rix
a:b:~/n     // Partition using mediant endpoints
1:2:~/2     // → [1/1:4/3, 4/3:3/2, 3/2:5/3, 5/3:2/1]
0:1:~/1     // → Partition using level 1 mediants
```

### Random Selection and Partitioning

Random operations provide stochastic sampling and partitioning:

#### Random Point Selection (`:%`)
```rix
a:b:%(n, m)  // Choose n points, max denominator m
a:b:%n       // Choose n points (default max denominator)
1:10:%5      // → 5 random numbers in [1, 10]
0:1:%(100, 1000) // → 100 rational points with denom ≤ 1000
```

#### Random Partitioning (`:/%`)
```rix
a:b:/%n     // Partition into n random sub-intervals
1:10:/%3    // → 3 randomly-sized sub-intervals
0:1:/%5     // → 5 random partitions of unit interval
```

### Infinite Ranges

Infinite sequences extend beyond bounded intervals:

#### Infinite Increment (`::+`)
```rix
a::+n       // Infinite sequence from a, stepping by +n (or -n for decrement)
5::+2       // → 5, 7, 9, 11, 13, ...
0::+PI      // → 0, π, 2π, 3π, 4π, ...
10::+ -3    // → 10, 7, 4, 1, -2, -5, ...
```

#### Infinite Decrement (`::+ -n`)
```rix
a::+ -n     // Infinite sequence from a, stepping by -n
10::+ -3    // → 10, 7, 4, 1, -2, -5, ...
PI::+ -0.1  // → π, π-0.1, π-0.2, π-0.3, ...
```

### Complex Operations

Interval operations can be chained and combined:

```rix
(a:b :+ n) :: m          // Step then divide
min_val:max_val :~depth  // Variable bounds with mediants
0:360 :+ 30 :/%5         // Angular steps then random partition
(expr1):(expr2) :+ step  // Expression bounds
```

### AST Structure

Interval operations generate specific AST node types:

#### IntervalStepping
```JSON
{
  "type": "IntervalStepping",
  "interval": { /* BinaryOperation with operator ":" */ },
  "step": { /* Number or expression */ },
  "direction": "increment" | "decrement"
}
```

#### IntervalDivision
```JSON
{
  "type": "IntervalDivision",
  "interval": { /* BinaryOperation with operator ":" */ },
  "count": { /* Number or expression */ },
  "type": "equally_spaced"
}
```

#### IntervalMediants
```JSON
{
  "type": "IntervalMediants",
  "interval": { /* BinaryOperation with operator ":" */ },
  "levels": { /* Number or expression */ }
}
```

#### InfiniteSequence
```JSON
{
  "type": "InfiniteSequence",
  "start": { /* Number or expression */ },
  "step": { /* Number or expression */ },
  "direction": "increment" | "decrement"
}
```

### Operator Precedence

All interval operators share the same precedence level as the basic interval operator (`:`) with left associativity:

1. Expressions are evaluated left-to-right: `a:b :+ n :: m`
2. Use parentheses to override: `a:(b :+ n) :: m`
3. Function calls and property access have higher precedence

### Use Cases

#### Scientific Computing
```rix
0:1::100                 // Integration points
-3:3::plot_resolution   // Function plotting
data_min:data_max:/:bins // Histogram binning
```

#### Monte Carlo Methods
```rix
-1:1:%(samples, precision)  // Random sampling
bounds_low:bounds_high:/%trials // Random partitioning
0::+step_size              // Infinite walk sequence
```

#### Musical Applications
```rix
fundamental:overtone_limit :+ fundamental // Harmonic series
tempo_min:tempo_max::variations          // Tempo scaling
note_start:note_end:~microtonal_depth   // Microtonal divisions
```

### Implementation Notes

1. **Type Safety**: Interval bounds can be any numeric expression
2. **Lazy Evaluation**: Infinite sequences are represented symbolically
3. **Rational Arithmetic**: Mediant operations preserve exact fractions
4. **Random Seeding**: Random operations use system or specified seeds
5. **Error Handling**: Invalid parameters (e.g., zero step) generate parse errors

### Mathematical Semantics

- **Mediants**: For fractions a/b and c/d, mediant is (a+c)/(b+d)
- **Stepping**: Continues while within interval bounds
- **Division**: Includes both endpoints in equally spaced points
- **Partitioning**: Creates touching sub-intervals covering full range
- **Random**: Uses uniform distribution unless otherwise specified
- **Infinite sequences**: Use ::+ with positive or negative step values

## Integration Notes
The parser is designed to integrate seamlessly with:

1. **Tokenizer**: Consumes token arrays from the RiX tokenizer
2. **Evaluator**: Produces ASTs suitable for interpretation or compilation
3. **Type checker**: AST structure supports static analysis
4. **Code generators**: Can be traversed for transpilation or optimization
5. **IDE tools**: Position information enables syntax highlighting and error reporting


# RiX Array Generator Parsing Documentation

## Overview

RiX supports powerful array generator syntax that allows you to create sequences, apply filters, and set termination conditions using a chainable operator syntax. This document describes how the parser handles these constructs.

## Generator Operators

### Basic Generator Operations

#### `|+` - Arithmetic Sequence
Repeatedly adds a value to generate the next element.
```
[1 |+ 2 |^ 5]  // [1, 3, 5, 7, 9]
```

#### `|*` - Geometric Sequence
Repeatedly multiplies by a value to generate the next element.
```
[2 |* 3 |^ 4]  // [2, 6, 18, 54]
```

#### `|:` - Function Generator
Uses a custom function to generate the next element.
```
[1, 1 |: (i, a, b) -> a + b |^ 10]  // Fibonacci sequence
```

Function signature: `(index, previous_1, previous_2, ...)` where:
- `index`: Current generation index (0-based)
- `previous_1`: Most recent value
- `previous_2`: Second most recent value (if available)

### Filtering Operations

#### `|?` - Filter
Only includes elements that satisfy a predicate function.
```
[1 |+ 1 |? (i, a) -> a % 2 == 0 |^ 5]  // Even numbers only
```

### Termination Operations

#### `|^` - Eager Limit
Stops generation after N elements or when condition is met.
```
[1 |+ 2 |^ 5]                    // Stop after 5 elements
[1 |+ 2 |^ (i, a) -> a > 10]     // Stop when value > 10
```

#### `|^:` - Lazy Limit
Creates a lazy generator that only produces values when requested.
```
[1 |+ 2 |^: 1000]                // Up to 1000 elements on demand
[1 |+ 2 |^: (i, a) -> a > 100]   // Lazy until condition met
```

## Parsing Behavior

### AST Structure

Generator chains are parsed into `GeneratorChain` nodes with the following structure:

```javascript
{
  type: "GeneratorChain",
  start: <initial_value_node> | null,
  operators: [
    {
      type: "GeneratorAdd" | "GeneratorMultiply" | "GeneratorFunction" | "GeneratorFilter" | "GeneratorLimit" | "GeneratorLazyLimit",
      operator: "|+" | "|*" | "|:" | "|?" | "|^" | "|^:",
      operand: <operand_node>
    }
  ]
}
```

### Operator Precedence

Generator operators have the same precedence as pipe operations (`PRECEDENCE.PIPE = 20`) and are left-associative.

### Chaining Rules

1. **Start Value**: Can be explicit (`[1 |+ 2]`) or implicit (`[|+ 2]`)
2. **Operator Order**: Generators → Filters → Limits
3. **Multiple Chains**: Separated by commas in arrays
4. **Context**: Generator chains are only recognized within array literals

### Examples

#### Single Chain
```
[1 |+ 2 |^ 5]
```
AST: Array with one GeneratorChain element

#### Multiple Chains
```
[1, 1 |: (i, a, b) -> a + b |^ 10, |* 3 |^ 3, 100]
```
AST: Array with four elements:
1. Number(1)
2. GeneratorChain (Fibonacci)
3. GeneratorChain (multiply by 3)
4. Number(100)

#### Chain without Start Value
```
[5, |+ 3 |^ 4, 20]
```
The second element references the previous element (5) as its starting value.

## Parser Implementation Details

### Detection Logic
The parser identifies generator chains by:
1. Parsing expressions normally within arrays
2. Detecting binary operations with generator operators
3. Converting binary operation trees to GeneratorChain nodes

### Conversion Process
When a binary operation tree contains generator operators, the parser:
1. Traverses the tree to extract operators in order
2. Identifies the start value (leftmost non-generator operand)
3. Creates a GeneratorChain node with proper structure

### Error Handling
Common parsing errors:
- Missing operands: `[1 |+ |^ 5]`
- Unmatched brackets: `[1 |+ 2 |^ 5`
- Invalid function syntax in generators

## Function Expression Parsing

Generator functions are parsed as `FunctionLambda` nodes with the structure:
```javascript
{
  type: "FunctionLambda",
  parameters: {
    positional: [
      { name: "i", defaultValue: null },
      { name: "a", defaultValue: null }
    ],
    keyword: [],
    conditionals: [],
    metadata: {}
  },
  body: <expression_node>
}
```

## Compatibility

Generator syntax is fully compatible with:
- Regular array elements
- Metadata annotations
- Nested arrays
- Matrix/tensor syntax (when not mixed)

Generator syntax is NOT compatible with:
- Metadata mixed with generators in same array
- Matrix semicolon separators in generator arrays

## Performance Considerations

- Generator chains are parsed eagerly during syntax analysis
- Lazy generators (`|^:`) create deferred evaluation nodes
- Filter operations may require iteration limits to prevent infinite loops
- Complex function generators may impact parsing performance

### MAX_ITERATIONS Constant

To prevent infinite loops in filter operations, implementations should enforce a `MAX_ITERATIONS` global or per-generator setting. Recommended default: 10,000 iterations.

```javascript
// Example safety implementation
const MAX_ITERATIONS = 10000;
if (iterations > MAX_ITERATIONS) {
  throw new Error("Generator exceeded maximum iterations - possible infinite loop");
}
```

### Memory Management

- Eager generators (`|^`) pre-compute entire sequences
- Lazy generators (`|^:`) compute values on-demand
- Use lazy evaluation for large datasets (>1000 elements)
- Complex filters may require significant CPU resources

## Advanced Features

### Complex Mathematical Sequences

#### Recursive Sequences with Multiple Previous Values
```
[1, 1, 2 |: (i, a, b, c) -> a + b + c |^ 10]  // Tribonacci
```

#### Conditional Branching in Generators
```
[1 |: (i, a) -> i % 2 == 0 ? a * 2 : a + 1 |^ 20]
```

#### Multiple Filter Chains
```
[2 |+ 2 |? (i, a) -> a % 3 == 1 |? (i, a) -> a < 100 |^ 50]
```

### Dynamic Termination Conditions

#### Value-Based Stopping
```
[1 |+ 2 |^ (i, a) -> a > 1000]
```

#### Index-Based Stopping
```
[1 |* 2 |^ (i, a) -> i >= 20]
```

#### Complex Conditions
```
[1 |+ 1 |^ (i, a) -> a > 100 OR i > 50]
```

### Real-World Applications

#### Mathematical Series
```
[1 |: (i, a) -> a + 1/(i+1) |^ 20]  // e approximation
[4 |: (i, a) -> a + 4*(-1)^(i+1)/(2*i+3) |^ 1000]  // π approximation
```

#### Financial Modeling
```
[1000 |: (i, a) -> a * 1.05 |^ 10]  // Compound interest
[100 |: (i, a) -> a * (1 + market_volatility()) |^ 252]  // Stock simulation
```

#### Scientific Computing
```
[2 |: (i, x) -> x - (x*x - 2)/(2*x) |^ (i, x) -> abs(x*x - 2) < 0.0001]  // Newton's method
[0.5 |: (i, x) -> 3.8 * x * (1 - x) |^ 50]  // Logistic map (chaos theory)
```

## Error Handling and Edge Cases

### Common Parsing Errors

1. **Missing Operands**
   ```
   [1 |+ |^ 5]  // Error: Missing operand for |+
   ```

2. **Invalid Function Syntax**
   ```
   [1 |: -> x + 1 |^ 5]  // Error: Missing parameter list
   ```

3. **Unmatched Brackets**
   ```
   [1 |+ 2 |^ 5  // Error: Expected closing bracket
   ```

### Safety Mechanisms

- Parser validates operator sequences
- Function parameter validation
- Termination condition type checking
- Prevents nested generator chains within single expressions

## Optimization Guidelines

### When to Use Each Operator

- **`|+`, `|*`**: Simple arithmetic/geometric progressions
- **`|:`**: Complex recurrence relations, mathematical sequences
- **`|?`**: Data filtering, conditional selection
- **`|^`**: Known finite sequences, batch processing
- **`|^:`**: Large datasets, streaming data, unknown sequence length

### Performance Tips

1. Place filters after generators for efficiency
2. Use specific termination conditions to avoid over-computation
3. Consider lazy evaluation for sequences > 1000 elements
4. Avoid complex nested function calls in hot paths
5. Use multiple simple filters rather than one complex filter
