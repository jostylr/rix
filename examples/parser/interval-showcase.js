import { tokenize } from ../../src/parser/tokenizer.js';
import { parse } from ../../src/parser/parser.js';

// System lookup function for interval examples
function systemLookup(name) {
    const systemSymbols = {
        'PI': { type: 'constant', value: Math.PI },
        'E': { type: 'constant', value: Math.E },
        'SIN': { type: 'function', arity: 1 },
        'COS': { type: 'function', arity: 1 },
        'SQRT': { type: 'function', arity: 1 },
        'MAX': { type: 'function', arity: -1 },
        'MIN': { type: 'function', arity: -1 },
        'FLOOR': { type: 'function', arity: 1 },
        'CEIL': { type: 'function', arity: 1 }
    };
    return systemSymbols[name] || { type: 'identifier' };
}

// Helper to safely get interval description
function getIntervalDesc(intervalObj) {
    if (!intervalObj) return 'unknown';
    if (intervalObj.value) return intervalObj.value;
    if (intervalObj.name) return intervalObj.name;
    if (intervalObj.type === 'BinaryOperation' && intervalObj.operator === ':') {
        const left = intervalObj.left?.value || intervalObj.left?.name || 'unknown';
        const right = intervalObj.right?.value || intervalObj.right?.name || 'unknown';
        return `${left}:${right}`;
    }
    if (intervalObj.type) return `[${intervalObj.type}]`;
    return 'complex';
}

// Helper to safely get value description
function getValueDesc(valueObj) {
    if (!valueObj) return 'unknown';
    if (valueObj.value !== undefined) return valueObj.value;
    if (valueObj.name) return valueObj.name;
    if (valueObj.type === 'UnaryOperation' && valueObj.operator === '-') {
        const operand = getValueDesc(valueObj.operand);
        return `-${operand}`;
    }
    return `[${valueObj.type || 'unknown'}]`;
}

// Helper function to demonstrate interval parsing
function showcase(code, description, category = '') {
    if (category) {
        console.log(`\n${category.toUpperCase()}`);
        console.log('='.repeat(60));
    }
    
    console.log(`\n${description}`);
    console.log('-'.repeat(40));
    console.log(`Expression: ${code}`);
    
    try {
        const tokens = tokenize(code);
        const ast = parse(tokens, systemLookup);
        const expr = ast[0]?.expression || ast[0];
        
        // Show simplified token representation
        const tokenStr = tokens.slice(0, -1).map(t => {
            if (t.type === 'Number' && t.value.includes(':')) {
                return `Interval(${t.value})`;
            } else if (t.type === 'Symbol' && t.value.startsWith(':')) {
                return `Op(${t.value})`;
            } else {
                return t.value;
            }
        }).join(' ');
        console.log(`Tokens: ${tokenStr}`);
        
        // Show AST type and key properties
        console.log(`Result: ${expr.type}`);
        
        if (expr.type === 'Number' && expr.value.includes(':')) {
            console.log(`→ Basic interval: ${expr.value}`);
        } else if (expr.type === 'IntervalStepping') {
            const interval = getIntervalDesc(expr.interval);
            const step = getValueDesc(expr.step);
            console.log(`→ Step through [${interval}] by ${step}`);
        } else if (expr.type === 'IntervalDivision') {
            const interval = getIntervalDesc(expr.interval);
            const count = getValueDesc(expr.count);
            console.log(`→ Divide [${interval}] into ${count} equally spaced points`);
        } else if (expr.type === 'IntervalPartition') {
            const interval = getIntervalDesc(expr.interval);
            const count = getValueDesc(expr.count);
            console.log(`→ Partition [${interval}] into ${count} sub-intervals`);
        } else if (expr.type === 'IntervalMediants') {
            const interval = getIntervalDesc(expr.interval);
            const levels = getValueDesc(expr.levels);
            console.log(`→ Generate mediants for [${interval}] to level ${levels}`);
        } else if (expr.type === 'IntervalMediantPartition') {
            const interval = getIntervalDesc(expr.interval);
            const levels = getValueDesc(expr.levels);
            console.log(`→ Partition [${interval}] using level ${levels} mediants`);
        } else if (expr.type === 'IntervalRandom') {
            const interval = getIntervalDesc(expr.interval);
            if (expr.parameters.type === 'Tuple') {
                const [count, maxDenom] = expr.parameters.elements.map(e => getValueDesc(e));
                console.log(`→ Random sample ${count} points from [${interval}] (max denominator: ${maxDenom})`);
            } else {
                const count = getValueDesc(expr.parameters);
                console.log(`→ Random sample ${count} points from [${interval}]`);
            }
        } else if (expr.type === 'IntervalRandomPartition') {
            const interval = getIntervalDesc(expr.interval);
            const count = getValueDesc(expr.count);
            console.log(`→ Random partition [${interval}] into ${count} sub-intervals`);
        } else if (expr.type === 'InfiniteSequence') {
            const start = getValueDesc(expr.start);
            const step = getValueDesc(expr.step);
            const direction = expr.direction === 'increment' ? '+' : '-';
            console.log(`→ Infinite sequence: ${start}, ${start}${direction}${step}, ${start}${direction}${step}${direction}${step}, ...`);
        }
        
        console.log('✓ Parse successful');
        
    } catch (error) {
        console.log(`✗ Error: ${error.message}`);
    }
}

console.log('RiX INTERVAL MANIPULATION SHOWCASE');
console.log('==================================');
console.log('Comprehensive demonstration of all interval operations');

// Basic Intervals
showcase('1:10;', 'Integer interval', 'Basic Intervals');
showcase('0.5:3.14159;', 'Decimal interval');
showcase('-5:5;', 'Symmetric interval around zero');
showcase('1/3:2/3;', 'Rational number interval');

// Interval Stepping  
showcase('1:10 :+ 2;', 'Increment by 2: generates 1, 3, 5, 7, 9', 'Stepping Operations');
showcase('10:1 :+ -3;', 'Decrement by 3: generates 10, 7, 4, 1');
showcase('0:PI :+ PI/6;', 'Angular steps: 0°, 30°, 60°, 90°, 120°, 150°, 180°');
showcase('0:1 :+ 0.1;', 'Decimal increments: 0.0, 0.1, 0.2, ..., 1.0');

// Interval Division
showcase('1:5::3;', 'Three equally spaced points: 1, 3, 5', 'Division Operations');
showcase('0:10::6;', 'Six equally spaced points: 0, 2, 4, 6, 8, 10');
showcase('-1:1::11;', 'Eleven points from -1 to 1');
showcase('0:2*PI::8;', 'Eight angular divisions for octagon');

// Partition Operations
showcase('1:10:/:4;', 'Four equal sub-intervals: [1:3.25], [3.25:5.5], [5.5:7.75], [7.75:10]', 'Partition Operations');
showcase('0:100:/:10;', 'Ten percentage bands');
showcase('start_time:end_time:/:sessions;', 'Variable session partitioning');

// Mediant Operations
showcase('1:2:~2;', 'Level 2 mediants: rational approximations', 'Mediant Operations');
showcase('0:1:~3;', 'Deep mediant tree for unit interval');
showcase('1:2:~/3;', 'Partition using level 3 mediant endpoints');
showcase('golden_low:golden_high:~depth;', 'Golden ratio approximation mediants');

// Random Operations
showcase('1:100:%10;', 'Ten random integers from 1 to 100', 'Random Operations');
showcase('0:1:%(50, 1000);', 'Fifty random rationals with denominator ≤ 1000');
showcase('-1:1:%(5, 1);', 'Five random integers from -1 to 1');
showcase('data_min:data_max:/%bins;', 'Random histogram binning');

// Random Partitioning  
showcase('1:1000:/%5;', 'Five random sub-ranges for sampling');
showcase('experiment_start:experiment_end:/%trials;', 'Random trial intervals');

// Infinite Sequences
showcase('1::+1;', 'Natural numbers: 1, 2, 3, 4, 5, ...', 'Infinite Sequences');
showcase('2::+2;', 'Even numbers: 2, 4, 6, 8, 10, ...');
showcase('1::+2;', 'Odd numbers: 1, 3, 5, 7, 9, ...');
showcase('5::+3;', 'Arithmetic progression: 5, 8, 11, 14, ...');
showcase('100::+ -10;', 'Countdown sequence: 100, 90, 80, 70, ...');
showcase('PI::+ -PI/4;', 'Angular countdown: π, 3π/4, π/2, π/4, 0, ...');

// Complex Chained Operations
showcase('0:360 :+ 30 :: 12;', 'Angular steps then equal spacing', 'Chained Operations');
showcase('1:1000 :+ 100 :/%3;', 'Step then random partition');
showcase('base:limit :+ increment :: resolution;', 'Variable stepping with resolution');

// Mathematical Applications
showcase('0:1::integration_points;', 'Numerical integration grid', 'Mathematical Applications');
showcase('-bound:bound:%(monte_carlo_samples, precision);', 'Monte Carlo sampling');
showcase('freq_min:freq_max:~harmonic_levels;', 'Harmonic frequency analysis');
showcase('error_min:error_max:/:tolerance_bands;', 'Error analysis intervals');

// Advanced Expressions
showcase('(a + offset):(b * scale) :+ step_size;', 'Expression bounds with stepping', 'Advanced Expressions');
showcase('MIN(data):MAX(data)::plot_points;', 'Dynamic bounds from data');
showcase('FLOOR(min_val):CEIL(max_val):/%random_bins;', 'Rounded bounds with random partition');

// Scientific Computing Examples  
showcase('0:experiment_duration :+ sampling_rate;', 'Time series sampling', 'Scientific Computing');
showcase('wavelength_min:wavelength_max::spectral_resolution;', 'Spectral analysis grid');
showcase('temp_ambient:temp_critical :+ temp_increment;', 'Temperature sweep protocol');
showcase('pH_low:pH_high:%(buffer_samples, 100);', 'Chemical buffer sampling');

// Engineering Applications
showcase('0:max_load :+ load_increment :: safety_checkpoints;', 'Structural load testing', 'Engineering Applications');
showcase('operating_freq:resonant_freq:~stability_analysis;', 'Frequency stability mediants');
showcase('min_pressure:max_pressure:/%test_chambers;', 'Pressure test distribution');

// Data Science Examples
showcase('feature_min:feature_max::normalization_buckets;', 'Feature normalization', 'Data Science');
showcase('confidence_low:confidence_high::curve_smoothing;', 'Confidence interval smoothing');
showcase('outlier_threshold:data_max:%(anomaly_samples, 1);', 'Anomaly detection sampling');

console.log('\n\nINTERVAL OPERATION SUMMARY');
console.log('==========================');
console.log('Basic Interval:     a:b                  → interval from a to b');
console.log('Stepping:           a:b :+ n             → a, a+n, a+2n, ... (while ≤ b)');
console.log('Equal Division:     a:b::n               → n equally spaced points');
console.log('Partitioning:       a:b:/:n              → n equal sub-intervals');
console.log('Mediants:           a:b:~n               → mediant tree to level n');
console.log('Mediant Partition:  a:b:~/n              → partition by level n mediants');
console.log('Random Sample:      a:b:%(m,d)           → m random points (max denom d)');
console.log('Random Partition:   a:b:/%n              → n random sub-intervals');
console.log('Infinite Increment: a::+n                → a, a+n, a+2n, ... (infinite)');
console.log('Infinite Decrement: a::+ -n              → a, a-n, a-2n, ... (infinite)');

console.log('\n\nKEY FEATURES');
console.log('============');
console.log('• Numeric intervals (1:10) tokenized as single units');
console.log('• Variable intervals (a:b) parsed as binary operations');
console.log('• Expression intervals ((x+1):(y*2)) supported');
console.log('• Left-associative chaining: a:b :+ n :: m');
console.log('• Negative steps via :+ -n (no :- operator)');
console.log('• All operations preserve mathematical semantics');
console.log('• Infinite sequences for algorithmic generation');
console.log('• Random operations for stochastic methods');
console.log('• Mediant operations for rational approximation');

console.log('\n\nUSE CASE DOMAINS');
console.log('================');
console.log('• Scientific Computing: integration, simulation, analysis');
console.log('• Data Science: sampling, binning, normalization');  
console.log('• Engineering: testing protocols, safety margins');
console.log('• Mathematics: number theory, approximation, sequences');
console.log('• Graphics: pixel grids, color palettes, animations');
console.log('• Audio: frequency analysis, rhythm generation');
console.log('• Finance: risk modeling, portfolio analysis');
console.log('• Game Development: procedural generation, difficulty scaling');