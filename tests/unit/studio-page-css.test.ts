import {describe,expect,it} from "vitest";
import {cssString,studioPageCss} from "../../lib/studio/page-css";
import {DEFAULT_BRAND, type Layout} from "../../lib/studio/layout-schema";
import {SAMPLE_PRINT_DATA} from "../../lib/studio/sample";
import {SYSTEM_TEMPLATES} from "../../lib/studio/templates";
const decode=(s:string)=>s.slice(1,-1).replace(/\\([0-9a-f]{1,6}) |\\(.)/gs,(_,hex:string,c:string)=>hex?String.fromCodePoint(parseInt(hex,16)):c);
describe("paged-media CSS strings",()=>{
 it.each(['"; } body{background:url(https://evil)} /*','}; url(x);','</style><script>x</script>','\\"\n\r\t\u0000\u001f','é 😀 & < >','x'.repeat(2000),'😀'.repeat(250),...Array.from({length:32},(_,i)=>String.fromCharCode(i)+'09af')])("preserves bounded literal text: %s",value=>{const escaped=cssString(value);expect(decode(escaped)).toBe([...value].slice(0,200).join(""));expect(escaped).not.toMatch(/<\/style|[\u0000-\u001f]/i);});
 it.each(["none","x","x_of_y"] as const)("implements %s page numbers",mode=>{const layout:Layout={...SYSTEM_TEMPLATES[0].layout,blocks:[{id:"f",type:"footer",props:{text:"{{seller.name}}",pageNumbers:mode}}]};const css=studioPageCss(layout,{...DEFAULT_BRAND,footer_line:'</style>',registration_line:'"; url(x)'},{...SAMPLE_PRINT_DATA.tokens,"seller.name":"A"});expect(css).toContain("@bottom-center");expect(css.includes("counter(page)")).toBe(mode!=="none");expect(css.includes("counter(pages)")).toBe(mode==="x_of_y");expect(css).not.toContain("</style>");});
});
