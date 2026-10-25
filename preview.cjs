'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const port=Number(process.argv[2]||4173);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Port musí být celé číslo 1024–65535.');
const root=__dirname,types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
http.createServer((req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(relative==='/'?'/index.html':relative));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end('Nenalezeno');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);});}catch{res.writeHead(400).end();}}).listen(port,'127.0.0.1',()=>console.log('Vytah Lab: http://127.0.0.1:'+port));
