import { parse } from ../../src/parser/parser.js';
import { tokenize } from ../../src/parser/tokenizer.js';

console.log('Practical Embedded Language Usage');
console.log('=================================\n');

// Example 1: Mathematical Expression System
console.log('1. Mathematical Expression System');
console.log('----------------------------------');

const mathExpressions = [
    'polynomial := `P(x):x^3 - 2x^2 + x - 1`;',
    'fraction := `F:355/113`;',
    'complex := `C:3+4i`;',
    'matrix := `Matrix(2,2):[[1,2],[3,4]]`;'
];

mathExpressions.forEach(expr => {
    console.log(`   ${expr}`);
    const tokens = tokenize(expr);
    const ast = parse(tokens);
    
    if (ast[0] && ast[0].expression.right && ast[0].expression.right.type === 'EmbeddedLanguage') {
        const embed = ast[0].expression.right;
        console.log(`   → ${embed.language}${embed.context ? `(${embed.context})` : ''}: ${embed.body.trim()}`);
    }
});

console.log('\n');

// Example 2: Multi-language Code Generation
console.log('2. Multi-language Code Generation');
console.log('----------------------------------');

const codeTemplates = [
    'jsMapper := `JS(arr, fn): arr.map(fn)`;',
    'pyListComp := `Python(items, condition): [x for x in items if condition(x)]`;',
    'sqlQuery := `SQL(table, conditions): SELECT * FROM table WHERE conditions`;',
    'regexEmail := `Regex(flags): [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+.[a-zA-Z]{2,}`;'
];

codeTemplates.forEach(template => {
    console.log(`   ${template}`);
    try {
        const tokens = tokenize(template);
        const ast = parse(tokens);
        
        const findEmbedded = (node) => {
            if (node && node.type === 'EmbeddedLanguage') return node;
            if (node && typeof node === 'object') {
                for (const value of Object.values(node)) {
                    if (Array.isArray(value)) {
                        for (const item of value) {
                            const found = findEmbedded(item);
                            if (found) return found;
                        }
                    } else {
                        const found = findEmbedded(value);
                        if (found) return found;
                    }
                }
            }
            return null;
        };
        
        const embed = findEmbedded(ast[0]);
        if (embed) {
            console.log(`   → Language: ${embed.language}`);
            console.log(`   → Parameters: ${embed.context || 'none'}`);
            console.log(`   → Template: ${embed.body.trim()}`);
        }
    } catch (error) {
        console.log(`   → Error: ${error.message}`);
    }
    console.log('');
});

// Example 3: Configuration and Data Formats
console.log('3. Configuration and Data Formats');
console.log('----------------------------------');

const dataFormats = [
    'config := `JSON: {"database": {"host": "localhost", "port": 5432}`;',
    'xmlData := `XML: <user id="123"><name>John</name><email>john@example.com</email></user>`;',
    'csvData := `CSV: name,age,city`;',
    'yamlConfig := `YAML: server: localhost`;'
];

dataFormats.forEach(format => {
    console.log(`   ${format}`);
    const tokens = tokenize(format);
    const ast = parse(tokens);
    
    const traverse = (node) => {
        if (node && node.type === 'EmbeddedLanguage') {
            console.log(`   → Format: ${node.language}`);
            console.log(`   → Content: ${node.body.substring(0, 50)}${node.body.length > 50 ? '...' : ''}`);
        } else if (node && typeof node === 'object') {
            Object.values(node).forEach(value => {
                if (Array.isArray(value)) {
                    value.forEach(traverse);
                } else {
                    traverse(value);
                }
            });
        }
    };
    
    ast.forEach(traverse);
    console.log('');
});

// Example 4: Nested Embedded Languages
console.log('4. Nested Embedded Languages');
console.log('-----------------------------');

const nestedExamples = [
    'htmlWithJS := ``HTML: <script>`JS: console.log("Hello")`</script>``;',
    'templateWithMultiple := ``Template: `SQL: SELECT * FROM users` and `JS: users.filter(u => u.active)` ``;'
];

nestedExamples.forEach(example => {
    console.log(`   ${example}`);
    const tokens = tokenize(example);
    const ast = parse(tokens);
    
    const findEmbedded = (node) => {
        if (node && node.type === 'EmbeddedLanguage') {
            console.log(`   → Outer: ${node.language || 'none'}`);
            console.log(`   → Content: ${node.body.trim()}`);
        } else if (node && typeof node === 'object') {
            Object.values(node).forEach(value => {
                if (Array.isArray(value)) {
                    value.forEach(findEmbedded);
                } else {
                    findEmbedded(value);
                }
            });
        }
    };
    
    ast.forEach(findEmbedded);
    console.log('');
});

// Example 5: Function Definitions with Embedded Languages
console.log('5. Function Definitions with Embedded Languages');
console.log('------------------------------------------------');

const functionExamples = [
    'compile := (source) -> `JS: eval(source.body)`;',
    'format := (data, style) -> `CSS: .class { color: red; }`;',
    'query := (table, filters) -> `SQL: SELECT * FROM users`;'
];

functionExamples.forEach(func => {
    console.log(`   ${func}`);
    try {
        const tokens = tokenize(func);
        const ast = parse(tokens);
        console.log(`   → Parsed as function with embedded language in body`);
    } catch (error) {
        console.log(`   → Error: ${error.message}`);
    }
    console.log('');
});

// Example 6: Real-world Integration Scenarios
console.log('6. Real-world Integration Scenarios');
console.log('------------------------------------');

console.log('Mathematical Computing:');
console.log('   polynomial := `P(x):x^4 - 2x^3 + x^2 - x + 1`;');
console.log('   derivative := differentiate(polynomial);');
console.log('   roots := solve(polynomial);');
console.log('');

console.log('Web Development:');
console.log('   template := `HTML: <div class="user">name</div>`;');
console.log('   styles := `CSS: .user { color: blue; font-weight: bold; }`;');
console.log('   behavior := `JS(element): element.addEventListener("click", handleClick)`;');
console.log('');

console.log('Data Analysis:');
console.log('   dataset := loadCSV(`CSV: name,age,score`);');
console.log('   analysis := `Python(data): pandas.DataFrame(data).describe()`;');
console.log('   visualization := `R: ggplot(data, aes(x=age, y=score)) + geom_point()`;');
console.log('');

console.log('Database Operations:');
console.log('   schema := `SQL: CREATE TABLE users (id INT, name VARCHAR(50))`;');
console.log('   migration := `SQL: ALTER TABLE users ADD COLUMN created_at TIMESTAMP`;');
console.log('   query := `SQL: SELECT u.name, p.title FROM users u JOIN posts p ON u.id = p.user_id`;');

console.log('\nThe embedded language system provides seamless integration');
console.log('of multiple programming paradigms within RiX expressions!');