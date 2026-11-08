// GET/HEAD-only OCI registry for a single exported test image. No push, login or Docker socket.
import http from 'node:http';import https from 'node:https';import{readFile,stat}from'node:fs/promises';import{createReadStream}from'node:fs';import{resolve}from'node:path';import{pathToFileURL}from'node:url';
export async function createLocalRegistry(directory,tls){
 const root=resolve(directory),index=JSON.parse(await readFile(resolve(root,'index.json'),'utf8'));const image=index.manifests[0];if(!image?.digest?.match(/^sha256:[a-f0-9]{64}$/))throw Error('Expected exported OCI image');
 return (tls?https:http).createServer(...(tls?[tls]:[]),async(req,res)=>{try{
  res.setHeader('Docker-Distribution-Api-Version','registry/2.0');if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  const path=new URL(req.url,'http://localhost').pathname;const json=value=>{res.setHeader('Content-Type','application/json');const body=JSON.stringify(value);res.setHeader('Content-Length',Buffer.byteLength(body));res.end(req.method==='HEAD'?undefined:body);};
  if(path==='/v2/'||path==='/v2')return json({});if(path==='/v2/_catalog')return json({repositories:['print-room']});if(path==='/v2/print-room/tags/list')return json({name:'print-room',tags:['cube-test']});
  const m=/^\/v2\/print-room\/(manifests|blobs)\/(cube-test|sha256:[a-f0-9]{64})$/.exec(path);if(!m){res.writeHead(404);return res.end();}
  const digest=m[2]==='cube-test'&&m[1]==='manifests'?image.digest:m[2];if(!digest.startsWith('sha256:')){res.writeHead(404);return res.end();}const file=resolve(root,'blobs','sha256',digest.slice(7)),info=await stat(file);
  let type='application/octet-stream';if(m[1]==='manifests'){const data=JSON.parse(await readFile(file,'utf8'));type=data.mediaType||'application/vnd.oci.image.manifest.v1+json';}
  res.writeHead(200,{'Content-Type':type,'Content-Length':info.size,'Docker-Content-Digest':digest});if(req.method==='HEAD')return res.end();const stream=createReadStream(file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
 }catch{if(!res.headersSent)res.writeHead(404);res.end();}});
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){const host=process.env.REGISTRY_HOST;if(!host)throw Error('Set an explicit REGISTRY_HOST interface');const tls=process.env.REGISTRY_TLS_CERT&&process.env.REGISTRY_TLS_KEY?{cert:await readFile(process.env.REGISTRY_TLS_CERT),key:await readFile(process.env.REGISTRY_TLS_KEY)}:undefined;const server=await createLocalRegistry(process.env.REGISTRY_IMAGE_DIR||'artifacts/install/oci',tls);if(process.env.REGISTRY_TRACE==='1'){server.on('request',r=>console.log(r.method,new URL(r.url,'http://localhost').pathname));server.on('tlsClientError',e=>console.log('TLS client error:',e.code||'unknown'));}server.listen(5050,host,()=>console.log(`Read-only test registry listening on ${host}:5050`));}
