// Independent test oracle: unmodified supplied algorithm and physics.
// Only used by Node tests, never by the web application's JSON imports.
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/vytah.html','utf8');
const algorithm=html.match(/<script id="algoritmus">([\s\S]*?)<\/script>/)[1];
const core=html.slice(html.indexOf('  var DT = 0.05'),html.indexOf('\n  /* ---',html.indexOf('  function runInner(scn, logs, clock)')));
module.exports=scenario=>{
 const context=vm.createContext({console:{log(){},warn(){},error(){},info(){}},scenario});
 return JSON.parse(vm.runInContext(algorithm+'\n'+core+'\nJSON.stringify(run(scenario));',context,{timeout:30000}));
};
