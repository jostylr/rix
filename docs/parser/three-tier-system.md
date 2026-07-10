# Three-Tier System Architecture for RiX Language

## Overview

The RiX language implements a **three-tier architecture** that separates concerns and enables controlled extensibility:

1. **Language Maintainers** - Core RiX language and parser
2. **System Tinkerers** - JavaScript extensions and custom keywords
3. **Users** - Pure RiX language usage

This architecture provides security, maintainability, and flexibility while preventing users from executing arbitrary code.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    RiX Three-Tier System                   │
├─────────────────────────────────────────────────────────────┤
│ Tier 1: Language Maintainers                               │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │   Tokenizer     │ │     Parser      │ │  Core Symbols   │ │
│ │                 │ │                 │ │  SIN, COS, PI   │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Tier 2: System Tinkerers (JavaScript)                      │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │ System Loader   │ │   Custom        │ │   Configurable  │ │
│ │                 │ │  Keywords       │ │   Operators     │ │
│ │                 │ │  AND, OR, WHILE │ │   <<, >>, ++    │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Tier 3: Users (Pure RiX)                                   │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │  Mathematical   │ │   Control Flow  │ │   Data Types    │ │
│ │  Expressions    │ │   IF/WHILE/FOR  │ │  Arrays, Sets   │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Tier 1: Language Maintainers

**Responsibility:** Core language design, parser implementation, and fundamental symbols.

### Core Components
- **Tokenizer:** Recognizes System vs User identifiers by capitalization
- **Parser:** Implements operator precedence and AST generation
- **Core Registry:** Built-in mathematical functions and constants

### Core Symbols
```javascript
// Mathematical functions
SIN, COS, TAN, LOG, EXP, SQRT, ABS, MAX, MIN, SUM

// Constants
PI, EX, INFINITY, IM

// Type constructors
LIST, SET, MAP, TUPLE

// Meta functions
TYPE, HELP, INFO
```

### Key Features
- **System/User Distinction:** Capital first letter = System, lowercase = User
- **Immutable Core:** Cannot be overridden by System Tinkerers
- **Universal Parser:** Handles all RiX language constructs

## Tier 2: System Tinkerers (JavaScript Extensions)

**Responsibility:** Extend RiX with domain-specific functionality while maintaining user safety.

### System Loader API

```javascript
import { SystemLoader } from 'rix-language-parser/system-loader';

const systemLoader = new SystemLoader({
    strictMode: false,           // Allow core symbol extension
    allowUserOverrides: false,   // Prevent user modifications
    browserIntegration: true     // Enable web integration
});
```

### Registering Keywords

```javascript
// Logical operators
systemLoader.registerKeyword('AND', {
    type: 'operator',
    precedence: 40,
    associativity: 'left',
    operatorType: 'infix',
    category: 'logical'
});

// Control flow
systemLoader.registerKeyword('WHILE', {
    type: 'control',
    structure: 'loop',
    precedence: 5,
    category: 'control'
});
```

### Registering System Functions

```javascript
// Custom mathematical functions
systemLoader.registerSystem('FACTORIAL', {
    type: 'function',
    arity: 1,
    category: 'mathematical'
});

// Utility functions
systemLoader.registerSystem('RANDOM', {
    type: 'function',
    arity: -1,  // Variable arguments
    category: 'utility'
});
```

### Custom Operators

```javascript
// Add new symbolic operators
systemLoader.registerOperator('<<', {
    type: 'operator',
    precedence: 70,
    associativity: 'left',
    operatorType: 'infix'
});
```

### Browser Integration

```html
<!DOCTYPE html>
<html>
<head>
    <script type="module">
        import { createWebPageSystemLoader } from 'rix-language-parser/system-loader';

        // Easy setup for web pages
        const loader = createWebPageSystemLoader();

        // Define logical operators for this page
        window.RiX.defineLogicalOperators('AND', 'OR', 'NOT');

        // Define control flow
        window.RiX.defineControlFlow();
    </script>
</head>
<body>
    <!-- RiX system extensions can be defined in script tags -->
    <script type="text/rix-system">
        registerKeyword('BETWEEN', {
            type: 'operator',
            precedence: 60,
            operatorType: 'ternary'
        });
    </script>
</body>
</html>
```

### Extension Hooks

```javascript
// Monitor system changes
systemLoader.registerHook('system-registered', (data) => {
    console.log(`New system symbol: ${data.name}`);
});

systemLoader.registerHook('keyword-registered', (data) => {
    console.log(`New keyword: ${data.name}`);
});
```

## Tier 3: Users (Pure RiX)

**Responsibility:** Write mathematical expressions and algorithms using available language features.

### Basic Usage

```rix
# Mathematical expressions
result := SIN(PI/2) + COS(0)

# Variable assignment
x := 42
y := x^2 + 1

# Function definitions
f(x) := x^2 + 2*x + 1
```

### Using System Extensions

```rix
# If logical operators are loaded
condition := x > 0 AND y < 10

# If control flow is loaded
result := IF x > 0 THEN x ELSE -x

# While loops (if implemented)
i := 1
WHILE i < 10 DO
    sum := sum + i
    i := i + 1
END
```

### Advanced Features

```rix
# Arrays and generators
sequence := [1 |+ 2 |^ 10]     # Arithmetic sequence
matrix := [[1, 2; 3, 4]]       # 2x2 matrix

# Pattern matching functions
abs :=> [
    (x ? x >= 0) -> x,
    (x ? x < 0) -> -x
]

# Pipe operations
data |> filter |> transform |> reduce
```

## Security Model

### User Limitations
- **No JavaScript Access:** Users cannot execute arbitrary JavaScript
- **Symbol Scoping:** Only System symbols (capitalized) can access extensions
- **Read-Only Extensions:** Users cannot modify system configuration
- **Sandboxed Execution:** All RiX code runs in controlled environment

### System Tinkerer Controls
- **Controlled Extension:** Can only add new symbols, not modify core language
- **Validation:** All definitions must pass type and structure validation
- **Hook System:** Can monitor but not prevent core language operations
- **Context Isolation:** Extensions are scoped to specific contexts/pages

### Language Maintainer Guarantees
- **Core Immutability:** Core language features cannot be broken by extensions
- **Backwards Compatibility:** User code remains valid across system updates
- **Parser Integrity:** System extensions cannot corrupt parsing logic

## Implementation Examples

### Example 1: Adding WHILE Loops

**System Tinkerer Code:**
```javascript
// Define WHILE keyword
systemLoader.registerKeyword('WHILE', {
    type: 'control',
    structure: 'loop',
    precedence: 5
});

// Define DO keyword
systemLoader.registerKeyword('DO', {
    type: 'control',
    structure: 'loop_body',
    precedence: 4
});

// Custom AST visitor for execution
class WhileLoopExecutor {
    executeWhile(condition, body) {
        while (this.evaluate(condition)) {
            this.execute(body);
        }
    }
}
```

**User Code:**
```rix
i := 1
sum := 0
WHILE i <= 10 DO
    sum := sum + i
    i := i + 1
```

### Example 2: Custom Mathematical Domain

**System Tinkerer Code:**
```javascript
// Statistics functions
['MEAN', 'MEDIAN', 'MODE', 'STDDEV'].forEach(func => {
    systemLoader.registerSystem(func, {
        type: 'function',
        arity: -1,  // Variable arguments
        category: 'statistics'
    });
});

// Statistical operators
systemLoader.registerOperator('~', {
    type: 'operator',
    precedence: 75,
    operatorType: 'infix',
    meaning: 'distributed_as'
});
```

**User Code:**
```rix
# Statistical analysis
data := [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
average := MEAN(data)
spread := STDDEV(data)

# Distribution notation
X ~ NORMAL(mean := 0, std := 1)
```

### Example 3: Domain-Specific Language

**System Tinkerer Code:**
```javascript
// Chemistry notation
systemLoader.registerOperator('->', {
    precedence: 25,
    operatorType: 'infix',
    meaning: 'chemical_reaction'
});

systemLoader.registerSystem('BALANCE', {
    type: 'function',
    arity: 1,
    category: 'chemistry'
});
```

**User Code:**
```rix
# Chemical equations
reaction := H2 + O2 -> H2O
balanced := BALANCE(reaction)
```

## Configuration and Deployment

### Node.js Environment

```javascript
import { createNodeSystemLoader } from 'rix-language-parser/system-loader';

const loader = createNodeSystemLoader({
    strictMode: true,
    allowUserOverrides: false
});

// Add domain-specific extensions
loader.registerSystem('DATABASE_QUERY', {
    type: 'function',
    arity: -1,
    category: 'database'
});
```

### Browser Environment

```javascript
import { createWebPageSystemLoader } from 'rix-language-parser/system-loader';

// Automatic setup with reasonable defaults
const loader = createWebPageSystemLoader();

// Page-specific customizations
document.addEventListener('DOMContentLoaded', () => {
    // Load extensions from script tags
    // Register event handlers
    // Set up user interface
});
```

### Configuration Export/Import

```javascript
// Export current configuration
const config = systemLoader.exportConfig();
localStorage.setItem('rix-config', JSON.stringify(config));

// Import saved configuration
const savedConfig = JSON.parse(localStorage.getItem('rix-config'));
systemLoader.importConfig(savedConfig);
```

## Best Practices

### For System Tinkerers

1. **Namespace Management:** Use descriptive, non-conflicting symbol names
2. **Precedence Care:** Set operator precedence thoughtfully to avoid parsing issues
3. **Category Organization:** Group related symbols with consistent categories
4. **Documentation:** Provide clear documentation for custom extensions
5. **Testing:** Thoroughly test extensions with various RiX expressions

### For Language Maintainers

1. **Core Stability:** Never break existing parser or tokenizer behavior
2. **Extension Points:** Provide clear, documented extension mechanisms
3. **Validation:** Implement robust validation for system extensions
4. **Performance:** Ensure system lookup doesn't degrade parsing performance
5. **Security:** Maintain isolation between tiers

### For Users

1. **Symbol Awareness:** Understand which symbols are available in your environment
2. **Case Sensitivity:** Remember System symbols are capitalized
3. **Extension Discovery:** Use help functions to discover available extensions
4. **Error Handling:** Write defensive code that handles missing extensions gracefully

## Future Extensions

### Planned Features

- **Module System:** Load extensions from external modules
- **Scoped Contexts:** Different symbol sets for different contexts
- **Runtime Introspection:** Query available symbols and their capabilities
- **Symbol Versioning:** Handle different versions of system extensions
- **Performance Optimizations:** Cache system lookups for better performance

### Possible Extensions

- **Plugin Architecture:** More sophisticated extension loading
- **Visual Symbol Builder:** GUI for creating system extensions
- **Symbol Dependencies:** Extensions that depend on other extensions
- **Execution Tracing:** Debug and profile RiX code execution
- **Interactive Documentation:** In-context help and examples

This three-tier architecture provides a robust foundation for extending RiX while maintaining security, performance, and ease of use across all user levels.
