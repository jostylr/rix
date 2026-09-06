/** Reinstall trusted receiver sugar on constructed and inertly decoded contexts. */
export function attachMathContextMethods(value) {
    if (value?.entries?.get('schema')?.value!=='rix.math.context@1') return value;
    const entries=new Map();
    for (const [name,capability] of [['Eval','MathEvaluate'],['Substitute','MathSubstitute'],['Instantiate','MathInstantiate']]) {
        entries.set(name.toUpperCase(),{type:'method_builtin',name,
            impl:(args,context,evaluate)=>evaluate({fn:'SYS_CALL',args:[capability,...args]},context)});
    }
    value._ext.set('_proto',{type:'map',entries});
    return value;
}
