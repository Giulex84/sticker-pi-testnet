// This project is static HTML + native ESM endpoints; there is no bundler.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
let scripts=0,modules=0;
for(const file of ['index.html','admin.html','privacy.html','terms.html']){
  const html=fs.readFileSync(file,'utf8');
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=/.test(match[1])&&match[2].trim()){new vm.Script(match[2],{filename:file});scripts++;}
}
for(const dir of ['api','lib'])for(const name of fs.readdirSync(dir))if(name.endsWith('.js')){execFileSync(process.execPath,['--check',path.join(dir,name)]);modules++;}
JSON.parse(fs.readFileSync('vercel.json','utf8'));JSON.parse(fs.readFileSync('package.json','utf8'));
console.log(`Static build checks passed: ${scripts} inline scripts, ${modules} ESM endpoints/modules and deployment JSON. No framework bundle is required.`);
