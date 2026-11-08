import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import{createCardRelay}from'../../../deploy/card-relay.mjs';
test('LAN card relay permits read-only resources, strips cookies and blocks management and mutations',async()=>{
 const upstream=http.createServer((req,res)=>{assert.equal(req.headers.cookie,undefined);assert.equal(req.headers.authorization,undefined);res.setHeader('Set-Cookie','private=do-not-forward');res.end('card');});await new Promise(done=>upstream.listen(0,'127.0.0.1',done));
 const relay=createCardRelay({port:upstream.address().port});await new Promise(done=>relay.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+relay.address().port;
 try{for(const path of ['/card?layout=detail','/cube-url.js','/api/v1/events','/api/v1/printers/h2c-1/snapshot']){const r=await fetch(base+path,{headers:{Cookie:'private=x',Authorization:'Bearer ignored'}});assert.equal(r.status,200);assert.equal(r.headers.get('set-cookie'),null);}
 for(const path of ['/setup','/api/v1/setup/status','/admin.js','/','/api/v1/demo/scenario'])assert.equal((await fetch(base+path)).status,403);
 assert.equal((await fetch(base+'/card',{method:'POST'})).status,403);
 }finally{relay.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(r=>relay.close(r)),new Promise(r=>upstream.close(r))]);}
});
