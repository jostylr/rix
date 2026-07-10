# RiX Parser - Embedded Language Processing

## Overview

The RiX parser supports embedding other languages and formats within RiX expressions using backtick notation. This feature allows seamless integration of domain-specific languages, code snippets, and specialized data formats directly into RiX code.

## Syntax

Embedded languages use backtick delimiters with the following structure:

```
`[LANGUAGE[(CONTEXT)]]:BODY`
```

### Components

- **Backticks**: Single, double, triple, or more backticks as delimiters
- **LANGUAGE**: Optional identifier specifying the embedded language
- **CONTEXT**: Optional parenthetical containing parameters or configuration
- **Colon**: Separates the header (language + context) from the body
- **BODY**: The actual content in the specified language

## Basic Examples

### Simple Language Specification
```rix
`F:6/8`                    // Fraction without reduction
`P(x):x^2 + 3x + 5`        // Polynomial with variable x
`JS(a, b): a[b]`           // JavaScript with parameters
```

### No Language Specification
```rix
`Raw content without language`  // language: "RiX-String", body: "Raw content without language"
`:configuration setting`        // language: "RiX-String", body: "configuration setting"
```

## Nested Backticks

Multiple backticks handle nesting and avoid escaping issues:

```rix
``RiX: `F:5/3` + `P(x):x^2` ``           // Double backticks contain single backticks
```Code: `hello` and ``world`` ```       // Triple backticks contain double backticks
```

## AST Structure

Embedded languages are parsed into `EmbeddedLanguage` nodes:

```javascript
{
  type: "EmbeddedLanguage",
  language: "P",           // Language identifier ("RiX-String" for raw content)
  context: "x",            // Context parameters (null if not provided)
  body: "x^2 + 3x + 5"     // Body content as string
}
```

## Use Cases

### Mathematical Expressions
- **Polynomials**: `P(x):x^3 - 2x + 1`
- **Fractions**: `F:22/7` (exact representation)
- **Complex Numbers**: `C:3+4i`
- **Matrices**: `Matrix(rows, cols):[[1,2,3],[4,5,6],[7,8,9]]`
- **Raw Math**: `x^2 + 2x + 1` (becomes RiX-String for processing)

### Programming Languages
- **JavaScript**: `JS(data: array, fn: function): data.map(fn)`
- **Python**: `Python(items: list, condition: callable): [x for x in items if condition(x)]`
- **SQL**: `SQL(table: string, where: clause): SELECT * FROM table WHERE where`
- **Assembly**: `ASM(arch: x86): mov eax, 42; ret`
- **TypeScript**: `TS(param: T, generic: U): param as U`

### Markup and Data Formats
- **LaTeX**: `LaTeX: \\frac{a}{b} + \\sqrt{c}`
- **JSON**: `JSON: {"name": "value", "array": [1,2,3]}`
- **XML**: `XML: <element attr="value">content</element>`
- **CSV**: `CSV: name,age,city\nJohn,25,NYC`
- **Raw Text**: `Plain text content` (automatically becomes RiX-String)
- **Configuration**: `:key = value, other = setting` (RiX-String for config syntax)

### Regular Expressions
- **Patterns**: `Regex(ig): [a-z]+\\d+`
- **Email Validation**: `Regex(): [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}`

## Implementation Details

### Parser Behavior

1. **Tokenization**: Backtick strings are tokenized as `String` tokens with `kind: 'backtick'`
2. **Parsing**: The parser detects backtick strings and calls `parseEmbeddedLanguage()`
3. **Header Parsing**: The first colon separates header from body
4. **Context Extraction**: Parentheses in the header are parsed for context parameters

### Parsing Algorithm

The `parseEmbeddedLanguage()` method follows this algorithm:

1. Extract content from the backtick token
2. Find the first colon to separate header from body
3. If no colon found, treat entire content as body with `language: null`
4. Parse header using regex pattern: `/^([^(]+)\(([^)]*)\)$/`
5. If parentheses found, extract language and context separately
6. If no parentheses, entire header becomes the language identifier
7. Create `EmbeddedLanguage` AST node with parsed components

### Edge Cases

- **No Colon**: Entire content becomes the body with `language: "RiX-String"`
- **Starts with Colon**: Content after first colon becomes body with `language: "RiX-String"`
- **Empty Context**: `SQL():query` results in `context: ""`
- **Colons in Context**: `JS(a: string, b: number): code` preserves colons in context
- **Nested Parentheses**: `Matrix(size(3, 4)): data` correctly extracts nested structure
- **Multiple Colons**: First colon after balanced parentheses separates header from body
- **Whitespace**: Preserved in context and body, trimmed from language identifier

### Strict Validation Rules

- **Single Parenthetical Group**: Only one outer `(...)` allowed in header
- **Balanced Parentheses**: Unmatched `(` or `)` throws parsing error
- **Clean Header Format**: `LANGUAGE(CONTEXT):BODY` - no extra content after `)`
- **Error Messages**: Clear feedback for malformed headers

## Integration with RiX

Embedded languages can be used anywhere expressions are valid:

```rix
// Variable assignment
polynomial := `P(x):x^2 + 2x + 1`;

// Function arguments
result := evaluate(`F:3/4`, precision := 10);

// Array elements
languages := [`JS: console.log('hello')`, `Python: print('world')`];

// Pattern matching
process :=> [
  (code ? code.language = "JS") -> executeJS(code.body),
  (code ? code.language = "Python") -> executePython(code.body)
];
```

## Error Handling

The parser handles malformed embedded languages gracefully:

- **Unmatched Backticks**: Tokenizer throws delimiter mismatch error
- **Invalid Context**: Malformed parentheses are treated as part of language name
- **Empty Content**: Valid, results in empty body string

### Common Error Scenarios

```rix
// Error: Unmatched backticks
invalid := `P(x):x^2 + 1;  // Missing closing backtick

// Error: Wrong backtick count
mixed := ``Code: `inner` `; // Mismatched backtick levels

// Error: Multiple parenthetical groups
multi := `Function(a, b)(extra): body`;  // Only one outer parenthetical allowed

// Error: Unmatched opening parenthesis
broken := `Malformed(: syntax`;  // Missing closing parenthesis

// Error: Unmatched closing parenthesis
missing := `Invalid): body`;  // Missing opening parenthesis

// Error: Content after closing parenthesis
extra := `Lang(context) extra: body`;  // No content allowed after )

// Valid: RiX-String for raw content
raw := `Configuration data`;  // language: "RiX-String", body: "Configuration data"

// Valid: RiX-String for colon-prefixed content
config := `:server = localhost`;  // language: "RiX-String", body: "server = localhost"
```

### Debugging Tips

1. **Check Backtick Balance**: Ensure opening and closing backtick counts match
2. **Escape Nested Backticks**: Use higher-level backticks to contain lower-level ones
3. **Validate Header Format**: Follow strict `LANGUAGE(CONTEXT):BODY` pattern
4. **Single Parenthetical**: Only one outer `(...)` group allowed in header
5. **Balance Parentheses**: Every `(` must have matching `)`
6. **Clean Headers**: No extra content after closing `)` in header
7. **Test Edge Cases**: Verify behavior with empty content, no colons, etc.

## Advanced Usage Patterns

### Conditional Processing

```rix
processor :=> [
  (code ? code.language = "JS") -> executeJS(code.body, code.context),
  (code ? code.language = "Python") -> executePython(code.body, code.context),
  (code ? code.language = "SQL") -> executeQuery(code.body, code.context),
  (code ? code.language = "RiX-String") -> processRawContent(code.body),
  (code) -> handleUnknown(code.body)
];
```

### Template Systems

```rix
// Web component template with type annotations
component := (name, props) -> `HTML(tag: string, attrs: object): <div class="${name}">${props}</div>`;

// Code generation with parameter types  
apiEndpoint := (method, path) -> `JS(method: string, path: string): 
  app.${method}('${path}', (req, res) => { /* handler */ });
`;

// Configuration templates
dbConfig := (host, port) -> `Config(host: string, port: number): 
  host=${host}&port=${port}&ssl=true
`;

// Note: Each header must follow LANGUAGE(CONTEXT):BODY format exactly
// Multiple parenthetical groups like LANG(a)(b):body will throw errors
```

### Data Transformation Pipelines

```rix
// Transform data through multiple languages
result := data 
  |> `SQL: SELECT * FROM data WHERE active = 1`
  |> `Python(df): df.groupby('category').sum()`
  |> `R(data): ggplot(data, aes(x=category, y=value)) + geom_bar()`;
```

## Performance Considerations

- **Parsing Overhead**: Embedded languages are parsed as strings, not compiled
- **Memory Usage**: Full content is stored in AST nodes
- **Nested Complexity**: Multiple backtick levels increase parsing time
- **Recommended Limits**: Avoid deeply nested (>3 levels) embedded languages

## Future Extensions

The embedded language system is designed for extensibility:

- **Type Validation**: Language-specific syntax validation
- **Compilation**: Direct compilation of embedded code
- **Interpolation**: Variable substitution within embedded content
- **Caching**: Parsed representation caching for performance
- **Language Plugins**: Extensible language handler system
- **IDE Integration**: Syntax highlighting and completion for embedded languages
- **Hot Reloading**: Dynamic recompilation of embedded code during development