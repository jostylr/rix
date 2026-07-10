import { parse } from ../../src/parser/parser.js';
import { tokenize } from ../../src/parser/tokenizer.js';

console.log('Simple Embedded Language Demo');
console.log('=============================\n');

// Basic examples
const examples = [
    '`P(x):x^2 + 3x + 5`;',
    '`F:6/8`;', 
    '`JS(a, b): a + b`;',
    '`SQL():SELECT * FROM users`;',
    '`NoColon`;'
];

examples.forEach(code => {
    console.log(`Input: ${code}`);
    
    try {
        const tokens = tokenize(code);
        const ast = parse(tokens);
        const embed = ast[0].expression;
        
        console.log(`  Language: ${embed.language || 'none'}`);
        console.log(`  Context: ${embed.context || 'none'}`);
        console.log(`  Body: "${embed.body}"`);
    } catch (error) {
        console.log(`  Error: ${error.message}`);
    }
    
    console.log('');
});

// Practical usage
console.log('Practical Usage:');
console.log('----------------');

const practical = [
    'polynomial := `P(x):x^3 - 2x + 1`;',
    'fraction := `F:22/7`;',
    'jsCode := `JS(arr): arr.filter(x => x > 0)`;'
];

practical.forEach(code => {
    console.log(code);
    
    const tokens = tokenize(code);
    const ast = parse(tokens);
    
    // Find embedded language in assignment
    const assignment = ast[0].expression;
    if (assignment.right && assignment.right.type === 'EmbeddedLanguage') {
        const embed = assignment.right;
        const varName = assignment.left.name;
        console.log(`  → ${varName} contains ${embed.language}${embed.context ? `(${embed.context})` : ''} code`);
    }
    
    console.log('');
});