import{a as n,e as r,f as d,l as g}from"./Mermaid.vue_vue_type_script_setup_true_lang-D2hbTV2B.js";var m=n((e,t)=>{let o;return t==="sandbox"&&(o=r("#i"+e)),(t==="sandbox"?r(o.nodes()[0].contentDocument.body):r("body")).select(`[id="${e}"]`)},"getDiagramElement"),b=n((e,t,o,a)=>{e.attr("class",o);const{width:i,height:s,x:h,y:x}=l(e,t);d(e,s,i,a);const c=u(h,x,i,s,t);e.attr("viewBox",c),g.debug(`viewBox configured: ${c} with padding: ${t}`)},"setupViewPortForSVG"),l=n((e,t)=>{var a;const o=((a=e.node())==null?void 0:a.getBBox())||{width:0,height:0,x:0,y:0};return{width:o.width+t*2,height:o.height+t*2,x:o.x,y:o.y}},"calculateDimensionsWithPadding"),u=n((e,t,o,a,i)=>`${e-i} ${t-i} ${o} ${a}`,"createViewBox");export{m as g,b as s};
