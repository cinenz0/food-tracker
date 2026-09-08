// Run with: Get-Content test_portions.js -Raw | node
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('ui/app.js', 'utf8');
const helpers = source.slice(source.indexOf('function parseFoodDescription'), source.indexOf('function reuseFood'));
vm.runInThisContext(helpers);
const pasta = {id:'pasta',name:'Macarrão cozido',base:100,unit:'g',kcal:150,protein:5};
for(const quantity of [100,150,200]){
 const parsed=parseFoodDescription(`${quantity}g de macarrao cozido`);
 assert.equal(parsed.quantity,quantity);
 assert.equal(sameFood({name:parsed.name,unit:parsed.unit},[pasta]),pasta);
 assert.equal(pasta.kcal*parsed.quantity/pasta.base,quantity*1.5);
}
assert.equal(parseFoodDescription('macarrão cozido 150 g').quantity,150);
assert.equal(parseFoodDescription('0,2 kg de macarrão cozido').quantity,200);
assert.equal(sameFood({name:'Macarrão cru',unit:'g'},[pasta]),undefined);
assert.equal(sameFood({name:'Macarrão cozido marca X',unit:'g'},[pasta]),undefined);
assert.equal(sameFood({name:'Macarrão cozido',unit:'ml'},[pasta]),undefined);
const normalized=normalizeFoodReference({...pasta,name:'200 g de Macarrão cozido',base:200,kcal:300,protein:null});
assert.equal(normalized.base,100);
assert.equal(normalized.kcal,150);
assert.equal(normalized.protein,null);
assert.equal(normalized.name,'Macarrão cozido');
assert.equal(pasta.base,100);
console.log('OK: reutilização, proporção, unidades, preparos e proteína desconhecida.');
