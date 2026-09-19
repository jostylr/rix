import { expect, test } from "bun:test";
import { Fraction, Integer, Rational, RationalInterval } from "@ratmath/core";
import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate, formatValue } from "../../src/index.js";
import { encodeOutputJSON, decodeOutputJSON } from "../../src/runtime/output-json.js";
import { renderOutputHtml, formatOutputText } from "../../src/runtime/output.js";
const field=(v,k)=>v.entries.get(k.toLowerCase()), scalar=v=>v?.value;
function setup(extra="") {const state={context:new Context(),registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()};parseAndEvaluate(`.Plugin.Load("fraction");${extra}`,state);return state;}
function check(candidate,state) {state.context.setFresh("candidate",candidate);return field(parseAndEvaluate('.fraction.CheckDerivation(candidate)',state),"accepted");}
function copy(v) {if(v?.type==='map')return {...v,entries:new Map([...v.entries].map(([k,x])=>[k,copy(x)]))};if(Array.isArray(v?.values))return {...v,values:v.values.map(copy)};return v;}
test("mediants and signed parentage replay written pairs and the explicit zero convention",()=>{
 const s=setup(),records=parseAndEvaluate('[.fraction.Derivation(:mediant,[.frac(6,8),.frac(1,2)]),.fraction.Derivation(:parentage,.frac(6,8)),.fraction.Derivation(:parentage,.frac(-3,5)),.fraction.Derivation(:parentage,.frac(0,1)),.fraction.Derivation(:parentage,.frac(0,4))]',s).values;
 expect(records.map(r=>String(field(r,'value')))).toEqual(['7/10','6/8','-3/5','0','0/4']);
 for(const r of records)expect(scalar(check(r,s))).toBe(1n);
 expect(scalar(field(field(records[3],'details'),'rule'))).toBe('signedRootConvention');
 const bad=copy(records[1]);bad.entries.set('value',new Fraction(3,4));expect(check(bad,s)).toBeNull();
 expect(()=>parseAndEvaluate('.fraction.Derivation(:mediant,[.frac(-1,0),.frac(1,0)])',s)).toThrow();
});
test("bounded Farey paths retain unresolved targets and replay every candidate and boundary",()=>{
 const s=setup(),records=parseAndEvaluate('[.fraction.Derivation(:fareyPath,.frac(3,5)),.fraction.Derivation(:fareyPath,.frac(3,5),{= maxSteps=0 }),.fraction.Derivation(:fareyPath,.frac(-3,5),{= maxDenominator=2 })]',s).values;
 expect(records.map(r=>scalar(field(r,'status')))).toEqual(['found','budgetExhausted','denominatorLimit']);
 expect(field(field(records[0],'details'),'path').values.map(scalar)).toEqual(['R','L','R','L']);
 for(const r of records){expect(String(field(r,'input'))).toContain('3/5');expect(scalar(check(r,s))).toBe(1n);s.context.setFresh('record',r);const view=parseAndEvaluate('.fraction.DerivationView(record)',s);const saved=decodeOutputJSON(encodeOutputJSON(view)).value;expect(scalar(check(saved.metadata.get('source'),s))).toBe(1n);}
 s.context.setFresh('record',records[0]);expect(formatOutputText(parseAndEvaluate('.fraction.DerivationView(record)',s),formatValue)).toContain('fareyMediant');
 for(const mutate of [r=>field(r,'steps').values[0].entries.set('candidate',new Fraction(1,2)),r=>r.entries.set('status',{type:'symbol',value:'found'}),r=>field(field(r,'details'),'work').entries.set('steps',new Integer(500))]){const bad=copy(records[2]);mutate(bad);expect(check(bad,s)).toBeNull();}
});
test("convergents agree with an independent integer recurrence and exact errors for signed and truncated sources",()=>{
 const s=setup();
 for(const source of ['355/113','-355/113','0/1','1000000/1','710/226']){
   const r=parseAndEvaluate(`.fraction.Derivation(:convergents,.frac(${source.replace('/',',')}),{= maxTerms=2 })`,s);
   let p0=0n,p1=1n,q0=1n,q1=0n;const target=new Rational(...source.split('/').map(BigInt));
   for(const row of field(r,'steps').values){const a=scalar(field(row,'coefficient')),p=a*p1+p0,q=a*q1+q0;
     expect(String(field(row,'value'))).toBe(String(new Fraction(p,q)));expect(field(row,'rational')).toEqual(new Rational(p,q));
     expect(field(row,'error')).toEqual(target.subtract(new Rational(p,q)));expect(scalar(field(row,'determinant'))).toBe(p*q1-p1*q);p0=p1;p1=p;q0=q1;q1=q;
   }
   expect(scalar(check(r,s))).toBe(1n);expect(String(field(r,'input'))).toBe(String(new Fraction(...source.split('/').map(BigInt))));
 }
 const partial=parseAndEvaluate('.fraction.Derivation(:convergents,.frac(355,113),{= maxTerms=2 })',s);
 expect(scalar(field(partial,'status'))).toBe('termBudgetExhausted');expect(String(field(partial,'error'))).toBe('-1/791');
 const bad=copy(partial);field(bad,'steps').values[1].entries.set('errorinterval',new RationalInterval(0,1));expect(check(bad,s)).toBeNull();
 expect(()=>parseAndEvaluate('.fraction.Derivation(:convergents,.frac(1,2),{= maxTerms=257 })',s)).toThrow('limits');
 expect(()=>parseAndEvaluate('.fraction.Derivation(:coefficients,[1,0])',s)).toThrow('positive');
 expect(()=>parseAndEvaluate('.fraction.Derivation(:parentage,.frac(2^16384,1))',s)).toThrow('16384 bits');
 const exhausted=parseAndEvaluate('.fraction.Derivation(:coefficients,[2^16000,2^16000,1])',s);
 expect(scalar(field(exhausted,'status'))).toBe('componentBudgetExhausted');expect(field(exhausted,'steps').values).toHaveLength(1);expect(field(exhausted,'input').values).toHaveLength(3);expect(scalar(check(exhausted,s))).toBe(1n);
});
test("continued-fraction snapshots separate exact errors from assumed positive-tail bounds and replay inertly",()=>{
 const s=setup('.Plugin.Load("continued-fraction");'),[finite,lazy,one]=parseAndEvaluate('[.cf.Finite([3,7,16]).Derivation(2),.cf.Sqrt2().Derivation(4),.cf.Sqrt2().Derivation(1)]',s).values;
 expect(scalar(field(finite,'status'))).toBe('exact');expect(scalar(field(finite,'certified'))).toBe(1n);expect(String(field(finite,'errors').values[1])).toBe('-1/791:-1/791');
 expect(scalar(field(lazy,'status'))).toBe('conditional');expect(field(lazy,'certified')).toBeNull();expect(scalar(field(lazy,'premise'))).toContain('source identity is not checked');expect(field(lazy,'enclosure')).toEqual(new RationalInterval(new Rational(7,5),new Rational(17,12)));
 expect(scalar(field(one,'status'))).toBe('unresolved');expect(field(one,'enclosure')).toBeNull();for(const r of [finite,lazy,one])expect(scalar(check(r,s))).toBe(1n);
 const bad=copy(lazy);bad.entries.set('certified',new Integer(1));expect(check(bad,s)).toBeNull();
 const reversed=copy(lazy);reversed.entries.set('enclosure',new RationalInterval(new Rational(17,12),new Rational(7,5)));expect(check(reversed,s)).toBeNull();
 expect(()=>parseAndEvaluate('.cf.Sqrt2().Derivation()',s)).toThrow('explicit');
 const replay=parseAndEvaluate('calls:=0;stream=.cf.Lazy((n)->{; @calls+=1;n==0 ?: 1 ?_ 2;});evidence=stream.Derivation(4);before=calls;checked=.cf.CheckDerivation(evidence);[before,calls,checked[:accepted]];',s).values;
 expect(replay[0]).toEqual(replay[1]);expect(scalar(replay[2])).toBe(1n);
 const restored=decodeOutputJSON(encodeOutputJSON(parseAndEvaluate('.fraction.DerivationView(.cf.Sqrt2().Derivation(4))',s))).value;
 expect(scalar(check(restored.metadata.get('source'),s))).toBe(1n);expect(formatOutputText(restored,formatValue)).toContain('source identity is not checked');
});
test("static views and symbolic adapters preserve checked evidence and claim only the exact retained result",()=>{
 const s=setup('.Plugin.Load("symbolic");'),[view,symbolic]=parseAndEvaluate('d=.fraction.Derivation(:convergents,.frac(355,113),{= maxTerms=2 });[.fraction.DerivationView(d),.symbolic.FractionDerivation(d)]',s).values;
 expect(String(field(symbolic,'representation'))).toBe('22/7');expect(scalar(field(symbolic,'relation'))).toBe('exactRetainedResult');expect(field(symbolic,'sourceequalityclaim')).toBeNull();
 const restored=decodeOutputJSON(encodeOutputJSON(view)).value;expect(scalar(check(restored.metadata.get('source'),s))).toBe(1n);expect(renderOutputHtml(restored,formatValue)).toContain('termBudgetExhausted');expect(formatOutputText(restored,formatValue)).toContain('-1/791');
 const bad=copy(restored.metadata.get('source'));bad.entries.set('error',new Rational(0));s.context.setFresh('bad',bad);expect(()=>parseAndEvaluate('.fraction.DerivationView(bad)',s)).toThrow('unchecked');expect(()=>parseAndEvaluate('.symbolic.FractionDerivation(bad)',s)).toThrow('checked evidence');
});
