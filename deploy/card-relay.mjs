// Temporary LAN card-only gateway. Login and mutation routes remain loopback-only.
import http from 'node:http';
import {pathToFileURL} from 'node:url';
const assets = new Set(['cast-model.js','cast-cards.js','cast-cards.css','events.js','cube-url.js','app.js','i18n.js','messages.js','display.js','model.js','admin-shell.js','icons.js','tiles.js','preview.js','preview-sizes.js','theme.css','styles.css','tiles.css','admin-shell.css','cube-surfaces.css','favicon.ico']);
export function allowedCardPath(path) {
 return path==='/card'||path==='/card/'||assets.has(path.slice(1))||path==='/api/v1/printers'||path==='/api/v1/events'||/^\/api\/v1\/printers\/[^/]+\/(snapshot|cover)$/.test(path)||path==='/assets/demo-cover.svg';
}
export function createCardRelay({host='127.0.0.1',port=3031}={}) {
 return http.createServer((req,res)=>{
  const url=new URL(req.url||'/', 'http://localhost');
  if(req.method!=='GET'||!allowedCardPath(url.pathname)){res.writeHead(403,{'Content-Type':'text/plain'});return res.end('Card access only');}
  const upstream=http.request({hostname:host,port,path:url.pathname+url.search,method:'GET',headers:{Accept:req.headers.accept||'*/*'}},incoming=>{
   const headers={...incoming.headers};delete headers['set-cookie'];res.writeHead(incoming.statusCode||502,headers);incoming.pipe(res);
  });
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Card backend unavailable');});
  res.on('close',()=>upstream.destroy());upstream.end();
 });
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){
 const bind=process.env.CARD_RELAY_HOST;if(!bind)throw Error('Set CARD_RELAY_HOST to the explicit LAN interface address');
 const upstreamPort=Number(process.env.CARD_RELAY_UPSTREAM_PORT||3031);if(!Number.isInteger(upstreamPort)||upstreamPort<1||upstreamPort>65535)throw Error('Invalid CARD_RELAY_UPSTREAM_PORT');
 createCardRelay({port:upstreamPort}).listen(3032,bind,()=>console.log(`Card-only relay ready: http://${bind}:3032/card`));
}
