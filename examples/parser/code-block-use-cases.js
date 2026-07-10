import { tokenize } from ../../src/parser/tokenizer.js';
import { parse } from ../../src/parser/parser.js';

function systemLookup(name) {
    const systemSymbols = {
        'SIN': { type: 'function', arity: 1 },
        'COS': { type: 'function', arity: 1 },
        'TAN': { type: 'function', arity: 1 },
        'LOG': { type: 'function', arity: 1 },
        'EXP': { type: 'function', arity: 1 },
        'SQRT': { type: 'function', arity: 1 },
        'ABS': { type: 'function', arity: 1 },
        'MAX': { type: 'function', arity: -1 },
        'MIN': { type: 'function', arity: -1 },
        'PI': { type: 'constant', value: Math.PI },
        'E': { type: 'constant', value: Math.E }
    };
    return systemSymbols[name] || { type: 'identifier' };
}

function demonstrateUseCase(code, title, description) {
    console.log(`\n=== ${title} ===`);
    console.log(description);
    console.log(`Code: ${code}`);
    
    try {
        const tokens = tokenize(code);
        const ast = parse(tokens, systemLookup);
        const codeBlock = ast[0].expression;
        
        console.log(`✓ Parsed successfully as ${codeBlock.type}`);
        console.log(`  Contains ${codeBlock.statements.length} statement(s)`);
        
        // Show the structure briefly
        if (codeBlock.statements.length > 0) {
            console.log('  Statements:');
            codeBlock.statements.forEach((stmt, i) => {
                let desc = '';
                if (stmt.type === 'BinaryOperation') {
                    desc = `Assignment: ${stmt.left.name || stmt.left.value} ${stmt.operator} ...`;
                } else if (stmt.type === 'FunctionCall') {
                    desc = `Function call: ${stmt.name}(...)`;
                } else {
                    desc = `Expression: ${stmt.type}`;
                }
                console.log(`    ${i + 1}. ${desc}`);
            });
        }
    } catch (error) {
        console.error(`✗ Parse error: ${error.message}`);
    }
}

console.log('RiX Code Block Use Cases');
console.log('========================');
console.log('Demonstrating practical applications of {; } code blocks\n');

// 1. Variable Initialization Block
demonstrateUseCase(
    '{;x := 0; y := 0; z := 1; initialized := true};',
    'Variable Initialization',
    'Initialize multiple related variables in a single block'
);

// 2. Mathematical Computation Pipeline
demonstrateUseCase(
    '{;input := 45; radians := input * PI / 180; sin_val := SIN(radians); cos_val := COS(radians); tan_val := TAN(radians)};',
    'Trigonometric Computation Pipeline',
    'Convert degrees to radians and compute trigonometric functions'
);

// 3. Data Processing Steps
demonstrateUseCase(
    '{;raw_data := [1, 4, 9, 16, 25]; count := 5; sum := raw_data[0] + raw_data[1] + raw_data[2] + raw_data[3] + raw_data[4]; mean := sum / count; processed := true};',
    'Data Processing Pipeline',
    'Process array data through multiple transformation steps'
);

// 4. Configuration Setup
demonstrateUseCase(
    '{;width := 800; height := 600; aspect_ratio := width / height; area := width * height; config_ready := true};',
    'Configuration Setup',
    'Set up related configuration values with computed properties'
);

// 5. Physics Calculations
demonstrateUseCase(
    '{;mass := 10; velocity := 25; kinetic_energy := 0.5 * mass * velocity^2; momentum := mass * velocity; force := mass * 9.81};',
    'Physics Calculations',
    'Compute related physics quantities from basic parameters'
);

// 6. Financial Calculations
demonstrateUseCase(
    '{;principal := 1000; rate := 0.05; time := 3; simple_interest := principal * rate * time; compound_base := principal * 1.05^time; compound_interest := compound_base - principal};',
    'Financial Interest Calculations',
    'Calculate both simple and compound interest from the same parameters'
);

// 7. Geometric Calculations
demonstrateUseCase(
    '{;radius := 5; diameter := 2 * radius; circumference := 2 * PI * radius; area := PI * radius^2; volume := 4 * PI * radius^3 / 3};',
    'Circle and Sphere Geometry',
    'Compute all geometric properties of a circle and sphere from radius'
);

// 8. Statistical Measures
demonstrateUseCase(
    '{;data := [2, 4, 6, 8, 10]; n := 5; sum := 30; mean := sum / n; variance_sum := 16 + 4 + 0 + 4 + 16; variance := variance_sum / n};',
    'Statistical Calculations',
    'Compute mean and variance for a dataset'
);

// 9. Algorithm State Updates
demonstrateUseCase(
    '{;iteration := 0; current := 1; previous := 0; next := current + previous; fibonacci := [0, 1, 1]; converged := false};',
    'Algorithm State Management',
    'Manage state variables for iterative algorithms'
);

// 10. Coordinate Transformations
demonstrateUseCase(
    '{;x_cart := 3; y_cart := 4; r_polar := SQRT(x_cart^2 + y_cart^2); theta_calc := y_cart / x_cart; x_new := r_polar * COS(theta_calc); y_new := r_polar * SIN(theta_calc)};',
    'Coordinate System Transformation',
    'Convert between Cartesian and polar coordinates'
);

// 11. Chemical Calculations
demonstrateUseCase(
    '{;moles := 2; molecular_weight := 18; mass := moles * molecular_weight; avogadro := 6.022 * 10^23; molecules := moles * avogadro; density := 1; volume := mass / density};',
    'Chemistry Calculations',
    'Compute chemical quantities from moles and molecular weight'
);

// 12. Engineering Design
demonstrateUseCase(
    '{;load := 1000; safety_factor := 2; design_load := load * safety_factor; material_strength := 250; required_area := design_load / material_strength; beam_width := 10; beam_height := required_area / beam_width};',
    'Engineering Design Calculations',
    'Size a structural beam based on load and material properties'
);

console.log('\n=== Code Block vs Other Constructs ===');
console.log('Showing when to use {; } vs other bracket types:\n');

console.log('USE {; } FOR: Assignable code blocks, computation pipelines, variable scoping');
console.log('Code: {;temp := celsius * 9/5 + 32; result := temp};');

console.log('\nUSE { } FOR: Sets of values, mathematical collections');
console.log('Code: {1, 2, 3, 4, 5};');

console.log('\nUSE { } FOR: Maps with key-value assignments');
console.log('Code: {name := "Alice", age := 30, city := "NYC"};');

console.log('\nUSE [ ] FOR: Arrays, matrices, ordered sequences');
console.log('Code: [1, 2, 3; 4, 5, 6];');

console.log('\nUSE ( ) FOR: Function calls, grouping expressions');
console.log('Code: SIN(PI/4) * (x + y);');

console.log('\n=== Best Practices ===');
console.log('1. Use {; } when you need to group related computations');
console.log('2. Use {; } for setting up computation contexts');
console.log('3. Use {; } when order of operations matters across multiple statements');
console.log('4. Remember: spaces matter! {;} ≠ { {} }');
console.log('5. Use semicolons to separate statements within {; }');
console.log('6. Code blocks can contain any valid RiX expressions and assignments');

console.log('\nCode block use cases demonstration completed!');