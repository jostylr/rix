import { tokenize } from ../../src/parser/tokenizer.js';
import { parse } from ../../src/parser/parser.js';

function systemLookup(name) {
    const systemSymbols = {
        'SIN': { type: 'function', arity: 1 },
        'COS': { type: 'function', arity: 1 },
        'TAN': { type: 'function', arity: 1 },
        'LOG': { type: 'function', arity: 1 },
        'LN': { type: 'function', arity: 1 },
        'EXP': { type: 'function', arity: 1 },
        'SQRT': { type: 'function', arity: 1 },
        'POW': { type: 'function', arity: 2 },
        'ATAN': { type: 'function', arity: 1 },
        'SINH': { type: 'function', arity: 1 },
        'COSH': { type: 'function', arity: 1 },
        'PI': { type: 'constant', value: Math.PI },
        'E': { type: 'constant', value: Math.E }
    };
    return systemSymbols[name] || { type: 'identifier' };
}

function demonstrateMathematical(title, description, expression) {
    console.log(`\n${title}`);
    console.log(`${description}`);
    console.log(`Expression: ${expression}`);
    
    try {
        const tokens = tokenize(expression);
        const ast = parse(tokens, systemLookup);
        const result = ast[0];
        
        console.log(`✓ Successfully parsed as ${result.type}`);
        
        // Show mathematical interpretation
        if (result.type === 'Derivative') {
            let interpretation = `d`;
            if (result.order > 1) interpretation += `^${result.order}`;
            interpretation += `(${getFunctionDescription(result.function)})`;
            if (result.variables && result.variables.length > 0) {
                interpretation += ` / d${result.variables.map(v => v.name).join('d')}`;
                if (result.order > 1) interpretation += `^${result.order}`;
            } else {
                interpretation += ` / dx`;
                if (result.order > 1) interpretation += `^${result.order}`;
            }
            console.log(`Mathematical: ${interpretation}`);
        } else if (result.type === 'Integral') {
            let interpretation = `∫`;
            if (result.order > 1) interpretation = `${'∫'.repeat(result.order)}`;
            interpretation += ` ${getFunctionDescription(result.function)}`;
            if (result.variables && result.variables.length > 0) {
                interpretation += ` d${result.variables.map(v => v.name).join(' d')}`;
            } else {
                interpretation += ` dx`;
            }
            if (result.metadata) {
                interpretation += ` + ${result.metadata.integrationConstant}`;
            }
            console.log(`Mathematical: ${interpretation}`);
        }
        
    } catch (error) {
        console.log(`✗ Parse error: ${error.message}`);
    }
}

function getFunctionDescription(node) {
    if (!node) return '';
    
    switch (node.type) {
        case 'UserIdentifier':
        case 'SystemIdentifier':
            return node.name;
        case 'FunctionCall':
            const args = node.arguments.positional.map(getFunctionDescription).join(', ');
            return `${node.function.name}(${args})`;
        case 'BinaryOperation':
            return `(${getFunctionDescription(node.left)} ${node.operator} ${getFunctionDescription(node.right)})`;
        case 'Derivative':
            return `${getFunctionDescription(node.function)}${"'".repeat(node.order)}`;
        case 'Integral':
            return `${"'".repeat(node.order)}${getFunctionDescription(node.function)}`;
        default:
            return node.type;
    }
}

console.log('RiX Symbolic Calculus - Real Mathematical Examples');
console.log('=================================================');

// Classical Calculus Problems
demonstrateMathematical(
    'Power Rule',
    'Derivative of x^n using power rule',
    "POW(x, n)'[x]"
);

demonstrateMathematical(
    'Chain Rule Example',
    'Derivative of composite function sin(cos(x))',
    "SIN(COS(x))'[x]"
);

demonstrateMathematical(
    'Product Rule Setup',
    'Derivative of product f(x)g(x) - first factor derivative',
    "f'[x]"
);

demonstrateMathematical(
    'Logarithmic Differentiation',
    'Derivative of ln(x^2 + 1)',
    "LN(x^2 + 1)'[x]"
);

// Integration Examples
demonstrateMathematical(
    'Basic Antiderivative',
    'Indefinite integral of x^2',
    "'POW(x, 2)[x]"
);

demonstrateMathematical(
    'Trigonometric Integration',
    'Integral of sin(x)',
    "'SIN(x)[x]"
);

demonstrateMathematical(
    'Exponential Integration',
    'Integral of e^x',
    "'EXP(x)[x]"
);

demonstrateMathematical(
    'Double Integration',
    'Double integral over rectangular region',
    "''f[x, y]"
);

// Multivariable Calculus
demonstrateMathematical(
    'Partial Derivative',
    'First partial derivative with respect to x',
    "f'[x]"
);

demonstrateMathematical(
    'Mixed Partial Derivative',
    'Second partial: d²f/dxdy',
    "f''[x, y]"
);

demonstrateMathematical(
    'Gradient Component',
    'x-component of gradient vector',
    "f'[x]"
);

demonstrateMathematical(
    'Laplacian Setup',
    'Second partial derivatives for Laplacian',
    "f''[x] + f''[y]"
);

// Vector Calculus
demonstrateMathematical(
    'Directional Derivative',
    'Derivative along vector field direction',
    "f'(v'[t])"
);

demonstrateMathematical(
    'Path Integral Setup',
    'Line integral parameterization derivative',
    "r'[t]"
);

// Differential Equations
demonstrateMathematical(
    'Second Order ODE',
    'Second derivative in differential equation',
    "y''[t]"
);

demonstrateMathematical(
    'System of ODEs',
    'First derivatives in coupled system',
    "x'[t]"
);

// Physics Applications
demonstrateMathematical(
    'Velocity from Position',
    'Time derivative of position gives velocity',
    "s'[t]"
);

demonstrateMathematical(
    'Acceleration from Velocity',
    'Second time derivative gives acceleration',
    "s''[t]"
);

demonstrateMathematical(
    'Work Integral',
    'Line integral for work calculation',
    "'F[x]"
);

// Economics Applications
demonstrateMathematical(
    'Marginal Cost',
    'Derivative of cost function',
    "C'[q]"
);

demonstrateMathematical(
    'Consumer Surplus',
    'Integral for economic surplus calculation',
    "'D[p](0, p_max)"
);

// Engineering Applications
demonstrateMathematical(
    'Heat Equation',
    'Partial derivative in heat conduction',
    "T'[t]"
);

demonstrateMathematical(
    'Wave Equation Component',
    'Second spatial derivative in wave equation',
    "u''[x]"
);

demonstrateMathematical(
    'Fourier Transform Setup',
    'Integral transform preparation',
    "'f[t]"
);

// Advanced Calculus
demonstrateMathematical(
    'Fundamental Theorem Setup',
    'Antiderivative for fundamental theorem',
    "'f'[x]"
);

demonstrateMathematical(
    'Integration by Parts',
    'Repeated derivative for integration by parts',
    "u'[x]"
);

demonstrateMathematical(
    'Taylor Series Derivative',
    'Higher order derivatives for Taylor expansion',
    "f'''[a]"
);

demonstrateMathematical(
    'Optimization Critical Point',
    'First derivative equals zero for extrema',
    "f'[x]"
);

demonstrateMathematical(
    'Second Derivative Test',
    'Concavity test using second derivative',
    "f''[x]"
);

// Complex Analysis Preparation
demonstrateMathematical(
    'Cauchy-Riemann Condition',
    'Partial derivative for complex differentiability',
    "u'[x]"
);

// Statistical Applications
demonstrateMathematical(
    'Probability Density Normalization',
    'Integral of PDF equals 1',
    "'pdf[x](-inf, inf)"
);

demonstrateMathematical(
    'Maximum Likelihood',
    'Derivative of log-likelihood',
    "L'[theta]"
);

console.log('\n=================================================');
console.log('Mathematical Applications Summary:');
console.log('• Classical Calculus: Power rule, chain rule, product rule');
console.log('• Integration: Antiderivatives, definite integrals');
console.log('• Multivariable: Partial derivatives, gradients, Laplacians');
console.log('• Vector Calculus: Directional derivatives, line integrals');
console.log('• Differential Equations: ODEs, PDEs, systems');
console.log('• Physics: Kinematics, dynamics, field theory');
console.log('• Economics: Optimization, marginal analysis');
console.log('• Engineering: Heat transfer, wave propagation, signals');
console.log('• Advanced: Fourier analysis, complex variables');
console.log('• Statistics: Maximum likelihood, probability theory');