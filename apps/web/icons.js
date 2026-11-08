// Original outline icons; no CUBE brand or proprietary image assets are bundled.
const paths={
 printer:['M5 3h14v7H5z','M5 14H3V9h18v5h-2','M5 12h14v9H5z','M8 16h8M8 18.5h6'],
 overview:['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
 setup:['M4 6h16M4 12h16M4 18h16','M8 3v6M16 9v6M10 15v6'],
 preview:['M3 4h18v16H3z','M3 9h18M9 9v11']
};
export function icon(name,size=24){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 for(const [key,value]of Object.entries({viewBox:'0 0 24 24',width:String(size),height:String(size),fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,value);
 for(const d of paths[name]||paths.printer){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}
 return svg;
}
