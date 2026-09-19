import {expect,test} from 'bun:test';
import {Context,createDefaultRegistry,createDefaultSystemContext,parseAndEvaluate,formatValue} from '../../src/index.js';
import {encodeOutputJSON,decodeOutputJSON} from '../../src/runtime/output-json.js';
import {formatOutputText} from '../../src/runtime/output.js';
const field=(v,k)=>v.entries.get(k.toLowerCase());
function runtime(){const s={context:new Context(),registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()};parseAndEvaluate('.Plugin.Load("radix");',s);return s;}
test('explicit named parsers use the existing labeled-backtick protocol and roundtrip exact values',()=>{
 const s=runtime();
 const result=parseAndEvaluate('n=.radix.System("negTwo",{= kind="negative",radix=-2,tokens=["0","1"] });.radix.Define(n);[`.negTwo:110.1`,.radix.Format(n,-7/3),.radix.Parse(n,"10.#1")];',s).values;
 expect(String(result[0])).toBe('3/2');expect(String(result[2])).toBe('-7/3');
 const literal=field(result[1],'literal').value;expect(literal).toBe('`.negTwo:10.#1`');expect(String(parseAndEvaluate(literal,s))).toBe('-7/3');
 expect(()=>parseAndEvaluate('.radix.Define(n)',s)).toThrow('already registered');
 expect(()=>parseAndEvaluate('`.negTwo.Unknown:10`',s)).toThrow('modifiers');
 expect(()=>parseAndEvaluate('.radix.System("NegTwo",{= radix=2,tokens=["0","1"] })',s)).toThrow('lowercase');
 expect(()=>parseAndEvaluate('.radix.System("bad`label",{= radix=2,tokens=["0","1"] })',s)).toThrow('label');
});
test('portable view and locale adapters retain exact data without importing parser registrations',()=>{
 const s=runtime();
 const [view,localized,partial]=parseAndEvaluate('s=.radix.System("decimalPlaces",{= radix=10,tokens="0123456789".Split() });[.radix.View(s,"123.25"),.radix.Locale(s,"12345.6#7",{= point=",",group=" " }),.radix.Format(s,1/97,{= maxDigits=3 })]',s).values;
 const restored=decodeOutputJSON(encodeOutputJSON(view)).value;expect(formatOutputText(restored,formatValue)).toContain('123..1/4');expect(localized.value).toBe('12 345,6#7');expect(field(partial,'literal')).toBeNull();expect(field(partial,'status').value).toBe('budgetExhausted');
 expect(()=>parseAndEvaluate('`.decimalPlaces:1`',s)).toThrow('Unknown backtick parser');
 s.context.setFresh('saved',restored.metadata.get('system'));expect(String(parseAndEvaluate('.radix.Parse(saved,"0.#3")',s))).toBe('1/3');
});
test('balanced and multi-token systems diagnose ambiguous alphabets and retain grammar parity',()=>{
 const s=runtime();
 const result=parseAndEvaluate('b=.radix.System("balanced",{= kind="balanced",radix=3,tokens=["T","0","1"] });m=.radix.System("words",{= kind="multiToken",radix=3,tokens=["zero","one","two"] });[.radix.Parse(b,"1T.1T"),.radix.Parse(m,"onezero.two"),.radix.Places(b,"1T.1T")[:places]]',s).values;
 expect(String(result[0])).toBe('20/9');expect(String(result[1])).toBe('11/3');expect(result[2].values).toHaveLength(4);
 expect(()=>parseAndEvaluate('.radix.System("bad",{= kind="multiToken",radix=2,tokens=["a","ab"] })',s)).toThrow('prefix-free');
 expect(()=>parseAndEvaluate('.radix.Parse({= schema="future" },"0")',s)).toThrow('descriptor');
});
