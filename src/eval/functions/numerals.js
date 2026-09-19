/** Bounded Core numeral arithmetic; labels and parser objects remain RiX-owned. */
import { NumeralSystem, Integer, Rational } from '@ratmath/core';
const text=value=>typeof value==='string'?value:value?.value;
function plain(value,depth=0,budget={nodes:0}) {
 if(++budget.nodes>8192)throw new Error("Numeral option node budget exceeded");
 if(depth>16)throw new Error('Numeral option depth exceeded');
 if(value===null||value===undefined)return null;
 if(value instanceof Integer){const n=Number(value.value);if(!Number.isSafeInteger(n))throw new Error('Numeral option requires safe integer');return n;}
 if(value.type==='string'||value.type==='symbol')return value.value;
 if(value.entries instanceof Map && value.entries.size>32)throw new Error("Numeral option field budget exceeded");
 if(value.entries instanceof Map)return Object.fromEntries([...value.entries].map(([key,item])=>[key,plain(item,depth+1,budget)]));
 if(Array.isArray(value.values)){if(value.values.length>4096)throw new Error('Numeral option array exceeded');return value.values.map(item=>plain(item,depth+1,budget));}
 throw new Error('Numeral options must be inert records');
}
export function numeralValue(value) {
 if(value===null||value===undefined)return null;
 if(value instanceof Rational||value instanceof Integer)return value;
 if(typeof value==='bigint')return new Integer(value);
 if(typeof value==='number')return new Integer(BigInt(value));
 if(typeof value==='boolean')return value?new Integer(1n):null;
 if(typeof value==='string')return {type:'string',value};
 if(Array.isArray(value))return {type:'sequence',values:value.map(numeralValue)};
 return {type:'map',entries:new Map(Object.entries(value).map(([key,item])=>[key.toLowerCase(),numeralValue(item)]))};
}
function system(value) {return new NumeralSystem(plain(value));}
function options(value) {const result=plain(value)||{};return {...result,...(result.maxdigits===undefined?{}:{maxDigits:result.maxdigits}),...(result.groupsize===undefined?{}:{groupSize:result.groupsize})};}
const operation=(name,min,max,run)=>({pure:true,doc:`Bounded exact numeral system ${name}`,impl(args){if(args.length<min||args.length>max)throw new Error(`${name} expects ${min}..${max} arguments`);return numeralValue(run(args));}});
export const numeralFunctions={
 NUMERAL_SYSTEM:operation('NumeralSystem',1,1,args=>system(args[0]).toJSON()),
 NUMERAL_PARSE:operation('NumeralParse',2,2,args=>system(args[0]).parse(text(args[1]))),
 NUMERAL_FORMAT:operation('NumeralFormat',2,3,args=>system(args[0]).format(args[1],options(args[2]))),
 NUMERAL_PLACES:operation('NumeralPlaces',2,2,args=>system(args[0]).places(text(args[1]))),
 NUMERAL_LOCALE:operation('NumeralLocale',3,4,args=>system(args[0]).locale(text(args[1]),options(args[2]),text(args[3])??'format')),
};
