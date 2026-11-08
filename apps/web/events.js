// Native EventSource stops retrying after a fatal HTTP response (e.g. a relay's 502).
// Let it own transient retries; recreate only CLOSED streams with bounded backoff.
export function subscribeEvents({onSnapshot,onOpen=()=>{},onError=()=>{},EventSourceClass=globalThis.EventSource,schedule=setTimeout,cancel=clearTimeout}) {
 let current,timer,stopped=false,delay=1000;
 function connect(){if(stopped)return;const stream=current=new EventSourceClass('/api/v1/events');
  stream.addEventListener('snapshot',event=>{if(!stopped&&current===stream)onSnapshot(event);});
  stream.onopen=()=>{if(stopped||current!==stream)return;delay=1000;onOpen();};
  stream.onerror=()=>{if(stopped||current!==stream)return;onError();if(stream.readyState===2&&timer===undefined){stream.close();const wait=delay;delay=Math.min(delay*2,30000);timer=schedule(()=>{timer=undefined;connect();},wait);}};
 }
 connect();return{close(){stopped=true;if(timer!==undefined)cancel(timer);current?.close();}};
}
