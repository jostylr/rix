import { parse } from ../../src/parser/parser.js';
import { tokenize } from ../../src/parser/tokenizer.js';

console.log('RiX Backtick Processing Demo');
console.log('============================\n');

function demoBacktick(description, code) {
    console.log(`${description}:`);
    console.log(`Input: ${code}`);
    
    try {
        // Step 1: Tokenization
        const tokens = tokenize(code);
        const backtickToken = tokens.find(t => t.kind === 'backtick');
        
        if (backtickToken) {
            console.log(`Tokenized: "${backtickToken.value}" (kind: ${backtickToken.kind})`);
            
            // Step 2: Parsing
            const ast = parse(tokens);
            const embeddedNode = ast[0]?.expression?.type === 'EmbeddedLanguage' 
                ? ast[0].expression 
                : ast[0];
                
            if (embeddedNode && embeddedNode.type === 'EmbeddedLanguage') {
                console.log(`Parsed:`);
                console.log(`  Language: ${embeddedNode.language || '(none)'}`);
                console.log(`  Context: ${embeddedNode.context || '(none)'}`);
                console.log(`  Body: "${embeddedNode.body}"`);
            }
        } else {
            console.log('No backtick token found');
        }
    } catch (error) {
        console.log(`Error: ${error.message}`);
    }
    
    console.log('');
}

// Basic Examples
demoBacktick('Simple polynomial', '`P(x):x^2 + 3x + 5`;');
demoBacktick('Fraction notation', '`F:6/8`;');
demoBacktick('JavaScript function', '`JS(a, b): return a + b;`;');

// Context variations
demoBacktick('Empty context', '`SQL():SELECT * FROM users`;');
demoBacktick('Multiple parameters', '`Matrix(3, 4): [[1,2,3,4],[5,6,7,8],[9,10,11,12]]`;');
demoBacktick('Complex context', '`Config(host, port, ssl): {"host": host, "port": port, "ssl": ssl}`;');

// No colon cases
demoBacktick('Raw content (no colon)', '`This is just plain text`;');
demoBacktick('Just a language name', '`Python`;');

// Nested backticks
demoBacktick('Double backticks', '``Code: `hello world` ``;');
demoBacktick('Triple backticks', '```Deep: `single` and ``double`` ```;');

// Real-world examples
console.log('Real-world Integration Examples:');
console.log('================================\n');

const examples = [
    {
        name: 'Mathematical polynomial assignment',
        code: 'quadratic := `P(x):x^2 - 4x + 4`;'
    },
    {
        name: 'Exact fraction storage',
        code: 'pi_approx := `F:22/7`;'
    },
    {
        name: 'LaTeX equation embedding',
        code: 'formula := `LaTeX: \\\\sum_{i=1}^{n} \\\\frac{1}{i^2} = \\\\frac{\\\\pi^2}{6}`;'
    },
    {
        name: 'SQL query with parameters',
        code: 'user_query := `SQL(table, id): SELECT * FROM {table} WHERE user_id = {id}`;'
    },
    {
        name: 'JavaScript array processing',
        code: 'mapper := `JS(arr, fn): arr.map(fn)`;'
    }
];

examples.forEach(example => {
    console.log(`${example.name}:`);
    console.log(`  ${example.code}`);
    
    try {
        const tokens = tokenize(example.code);
        const ast = parse(tokens);
        
        // Find the embedded language node
        let embeddedNode = null;
        const traverse = (node) => {
            if (node && typeof node === 'object') {
                if (node.type === 'EmbeddedLanguage') {
                    embeddedNode = node;
                    return;
                }
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
        
        if (embeddedNode) {
            console.log(`  → Language: ${embeddedNode.language}`);
            console.log(`  → Context: ${embeddedNode.context || 'none'}`);
            console.log(`  → Body: "${embeddedNode.body.trim()}"`);
        }
    } catch (error) {
        console.log(`  → Error: ${error.message}`);
    }
    
    console.log('');
});

console.log('Escaping Demo:');
console.log('==============\n');

const escapingExamples = [
    {
        description: 'Single backticks (normal)',
        code: '`Simple:content`'
    },
    {
        description: 'Double backticks (escape single)',
        code: '``Contains: `inner backticks` ``'
    },
    {
        description: 'Triple backticks (escape double)',
        code: '```Complex: `single` and ``double`` backticks```'
    }
];

escapingExamples.forEach(example => {
    console.log(`${example.description}:`);
    console.log(`  Input: ${example.code}`);
    
    try {
        const tokens = tokenize(example.code);
        const backtickToken = tokens.find(t => t.kind === 'backtick');
        
        if (backtickToken) {
            console.log(`  Extracted: "${backtickToken.value}"`);
            console.log(`  Original: "${backtickToken.original}"`);
        }
    } catch (error) {
        console.log(`  Error: ${error.message}`);
    }
    
    console.log('');
});