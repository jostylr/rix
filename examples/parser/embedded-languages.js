import { parse } from ../../src/parser/parser.js';
import { tokenize } from ../../src/parser/tokenizer.js';

function parseExample(description, code) {
    console.log(`\n--- ${description} ---`);
    console.log(`Code: ${code}`);
    
    try {
        const tokens = tokenize(code);
        const ast = parse(tokens);
        
        if (ast.length > 0 && ast[0].expression && ast[0].expression.type === 'EmbeddedLanguage') {
            const embed = ast[0].expression;
            console.log(`✓ Parsed successfully`);
            console.log(`  Language: ${embed.language || 'none'}`);
            console.log(`  Context: ${embed.context || 'none'}`);
            console.log(`  Body: "${embed.body}"`);
        } else {
            console.log(`✓ Parsed as: ${ast[0]?.expression?.type || ast[0]?.type || 'unknown'}`);
        }
    } catch (error) {
        console.log(`✗ Error: ${error.message}`);
    }
}

console.log('RiX Embedded Language Examples');
console.log('==============================');

// Basic polynomial with variable context
parseExample(
    'Polynomial with variable context',
    '`P(x):x^2 + 3x + 5`;'
);

// Fraction without reduction
parseExample(
    'Fraction without context',
    '`F:6/8`;'
);

// JavaScript code with parameters
parseExample(
    'JavaScript with parameters',
    '`JS(a, b): a[b] `;'
);

// SQL query with empty context
parseExample(
    'SQL with empty context',
    '`SQL():SELECT * FROM users WHERE id > 10`;'
);

// Matrix with dimensions
parseExample(
    'Matrix with dimensions',
    '`Matrix(3, 4): [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]] `;'
);

// Nested backticks example
parseExample(
    'Nested backticks',
    '``RiX: `F:5/3` + `F:7/8` ``;'
);

// Triple backticks for complex nesting
parseExample(
    'Triple backticks',
    '```Code: `hello` and ``world`` ```;'
);

// Raw content without colon - becomes RiX-String
parseExample(
    'Raw content (no colon) - RiX-String',
    '`This is just raw content without language specification`;'
);

// Starts with colon - becomes RiX-String
parseExample(
    'Starts with colon - RiX-String',
    '`:This allows using colon at the start`;'
);

// Context with colons
parseExample(
    'Context with colons',
    '`JS(a, b: string, c: number): a + b + c`;'
);

// Nested parentheses in context
parseExample(
    'Nested parentheses in context',
    '`Matrix(size(3, 4)): [[1,2,3,4],[5,6,7,8],[9,10,11,12]]`;'
);

// Python function with multiple parameters
parseExample(
    'Python function',
    '`Python(x, y, z): lambda x, y, z: x**2 + y**2 + z**2 `;'
);

// LaTeX mathematical expression
parseExample(
    'LaTeX expression',
    '`LaTeX: \\\\frac{a}{b} + \\\\sqrt{c} `;'
);

// Regular expression pattern
parseExample(
    'Regular expression',
    '`Regex(flags): [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\.[a-zA-Z]{2,} `;'
);

// Assembly code
parseExample(
    'Assembly code',
    '`ASM(x86): mov eax, 42; ret `;'
);

console.log('\n--- Error Cases ---');
console.log('Demonstrating strict validation:');

// Error cases
parseExample(
    'Multiple parenthetical groups (ERROR)',
    '`Function(a, b)(extra): body`;'
);

parseExample(
    'Unmatched opening parenthesis (ERROR)',
    '`Malformed(: broken`;'
);

parseExample(
    'Unmatched closing parenthesis (ERROR)',
    '`Missing): body`;'
);

console.log('\n--- Complex Example ---');
console.log('Combining multiple embedded languages:');

const complexExample = `
polynomial := \`P(x):x^2 + 2x + 1\`;
fraction := \`F:3/4\`;
jsCode := \`JS(arr): arr.filter(x => x > 0) \`;
`;

try {
    const tokens = tokenize(complexExample);
    const ast = parse(tokens);
    
    console.log(`✓ Parsed ${ast.length} statements`);
    ast.forEach((stmt, i) => {
        if (stmt.expression && stmt.expression.type === 'BinaryOperation' && 
            stmt.expression.operator === ':=' && 
            stmt.expression.right.type === 'EmbeddedLanguage') {
            const embed = stmt.expression.right;
            const varName = stmt.expression.left.name;
            console.log(`  ${i + 1}. ${varName} = ${embed.language}(${embed.context || ''}): "${embed.body.trim()}"`);
        }
    });
} catch (error) {
    console.log(`✗ Error: ${error.message}`);
}

console.log('\n--- Use Case Scenarios ---');

console.log('\n1. Mathematical Expressions:');
console.log('   - Polynomials: `P(x):x^3 - 2x + 1`');
console.log('   - Fractions: `F:22/7` (keeps exact representation)');
console.log('   - Complex: `C:3+4i` (complex number notation)');

console.log('\n2. Code Integration with Complex Contexts:');
console.log('   - JavaScript: `JS(a: number, b: string): a + parseInt(b)`');
console.log('   - Python: `Python(items: list, func: callable): [func(x) for x in items]`');
console.log('   - SQL: `SQL(table: string, where: clause): SELECT * FROM table WHERE where`');
console.log('   - Note: Only ONE outer parenthetical allowed in header!');

console.log('\n3. RiX-String for Raw Content:');
console.log('   - No language: `Raw text content` → RiX-String');
console.log('   - Starts with colon: `:config = value` → RiX-String');
console.log('   - Special syntax: `:let x = 5; return x * 2` → RiX-String');

console.log('\n4. Advanced Context Handling:');
console.log('   - Nested structures: `Matrix(size(rows, cols)): data`');
console.log('   - Type annotations: `Function(param: type, other: type): body`');
console.log('   - Complex parameters: `Config(db: {host, port}, cache: bool): settings`');

console.log('\n5. Data Formats:');
console.log('   - JSON: `JSON: {"name": "value", "array": [1,2,3]}`');
console.log('   - XML: `XML: <element attr="value">content</element>`');
console.log('   - Raw strings: `Raw configuration data` (no colon needed)');

console.log('\nThe enhanced backtick system enforces strict validation:');
console.log('- Colons in context parameters are preserved');
console.log('- Nested parentheses within context are handled correctly');
console.log('- Raw content gets RiX-String language automatically');
console.log('- Starting with colon escapes to RiX-String mode');
console.log('- Malformed headers throw clear error messages');
console.log('- Only one outer parenthetical group allowed per header');