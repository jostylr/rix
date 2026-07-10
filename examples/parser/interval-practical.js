import { tokenize } from ../../src/parser/tokenizer.js';
import { parse } from ../../src/parser/parser.js';

// System lookup for mathematical functions
function systemLookup(name) {
    const systemSymbols = {
        'PI': { type: 'constant', value: Math.PI },
        'E': { type: 'constant', value: Math.E },
        'SIN': { type: 'function', arity: 1 },
        'COS': { type: 'function', arity: 1 },
        'LOG': { type: 'function', arity: 1 },
        'SQRT': { type: 'function', arity: 1 }
    };
    return systemSymbols[name] || { type: 'identifier' };
}

// Helper to parse and display results
function demo(code, description) {
    console.log(`\n${description}`);
    console.log(`Code: ${code}`);
    try {
        const tokens = tokenize(code);
        const ast = parse(tokens, systemLookup);
        console.log('✓ Parsed successfully');
        return ast;
    } catch (error) {
        console.log(`✗ Error: ${error.message}`);
        return null;
    }
}

console.log('Practical Interval Examples for RiX Language');
console.log('============================================');

// Scientific Computing
console.log('\n📊 SCIENTIFIC COMPUTING');
demo('0:1::100;', 'Integration points: 100 equally spaced values from 0 to 1');
demo('0:2*PI :+ PI/12;', 'Angle steps: every 15 degrees from 0 to 2π');
demo('-3:3::50;', 'Plot points: 50 values for graphing functions');
demo('1:1000:~8;', 'Precision approximations: mediant fractions to level 8');

// Data Analysis
console.log('\n📈 DATA ANALYSIS');
demo('data_min:data_max:/:10;', 'Histogram bins: divide range into 10 equal intervals');
demo('0:100:%(500, 1);', 'Random sampling: 500 integer samples from 0-100');
demo('confidence_low:confidence_high::21;', 'Confidence interval: 21 points for smooth curve');
demo('threshold:max_value:/%5;', 'Outlier detection: 5 random sub-ranges');

// Game Development
console.log('\n🎮 GAME DEVELOPMENT');
demo('0:screen_width :+ tile_size;', 'Tile positions: grid points across screen width');
demo('level_min:level_max::difficulty_levels;', 'Difficulty scaling: equal steps between min/max');
demo('spawn_area_start:spawn_area_end:/%enemy_groups;', 'Enemy spawning: random zones for groups');
demo('1::+fibonacci_step;', 'Infinite progression: Fibonacci-like advancement');

// Financial Modeling
console.log('\n💰 FINANCIAL MODELING');
demo('start_price:target_price :+ daily_increment;', 'Price trajectory: daily increments to target');
demo('risk_low:risk_high:~portfolio_depth;', 'Risk assessment: mediant analysis of portfolio');
demo('min_investment:max_investment:%(monte_carlo_runs, 100);', 'Monte Carlo: random investment amounts');
demo('market_open:market_close:/:trading_sessions;', 'Trading windows: divide day into sessions');

// Engineering Simulations
console.log('\n⚙️ ENGINEERING');
demo('0:max_stress::safety_checkpoints;', 'Stress testing: checkpoints from 0 to maximum');
demo('operating_temp_min:operating_temp_max :+ temp_step;', 'Temperature sweep: increment through range');
demo('frequency_start:frequency_end:~harmonic_levels;', 'Harmonic analysis: mediant frequency decomposition');
demo('time_start::+sampling_rate;', 'Signal sampling: infinite time series at fixed rate');

// Art and Graphics
console.log('\n🎨 GRAPHICS & ART');
demo('0:canvas_width :+ pixel_size;', 'Pixel grid: discrete positions across canvas');
demo('hue_min:hue_max::color_palette_size;', 'Color palette: equally spaced hues');
demo('animation_start:animation_end:/:keyframes;', 'Animation timing: divide timeline into keyframes');
demo('noise_min:noise_max:%(texture_samples, 256);', 'Procedural texture: random noise values');

// Machine Learning
console.log('\n🤖 MACHINE LEARNING');
demo('learning_rate_min:learning_rate_max:~hyperparameter_search;', 'Hyperparameter tuning: mediant search space');
demo('epoch_start::+batch_size;', 'Training schedule: infinite epochs with batch increments');
demo('validation_split_start:validation_split_end:/%cross_validation_folds;', 'Cross-validation: random data splits');
demo('feature_min:feature_max::normalization_buckets;', 'Feature scaling: quantization buckets');

// Music and Audio
console.log('\n🎵 MUSIC & AUDIO');
demo('fundamental_freq:harmonic_limit :+ fundamental_freq;', 'Harmonic series: musical overtones');
demo('tempo_min:tempo_max::tempo_variations;', 'Tempo changes: smooth transitions between speeds');
demo('note_start:note_end:~microtonal_divisions;', 'Microtonal music: mediant pitch subdivisions');
demo('beat_start::+beat_duration;', 'Rhythm generation: infinite beat sequence');

// Practical Tips
console.log('\n💡 PRACTICAL TIPS');
console.log('================');
console.log('• Use ::n for exact point counts (includes endpoints)');
console.log('• Use :/:n for sub-interval partitioning');
console.log('• Use :+/:- for arithmetic progressions');
console.log('• Use :~/:~/ for fractal-like mediant structures');
console.log('• Use :%/:/%for randomized sampling and partitioning');
console.log('• Use ::+/::-for infinite sequences');
console.log('• Combine operations: (0:1 :+ 0.1) :: 5 for complex patterns');
console.log('• Variable bounds: min_val:max_val allows dynamic intervals');

console.log('\nThese examples show how interval manipulation can replace');
console.log('complex loops and array generation in many common scenarios.');