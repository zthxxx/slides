import{d as i,aJ as l,z as d,f as c,o as u,j as f}from"./modules/vue-Bu1UNUkS.js";import{u as m}from"./slidev/context-BdHLh7Qf.js";import{_ as g}from"./index-CMvRvqdx.js";function a(t){return t.startsWith("/")?"/present/git-operate-proposal/"+t.slice(1):t}const v=t=>t.startsWith("/")?`url(${a(t)})`:t.startsWith("http://")||t.startsWith("https://")?`url(${t})`:t.replace(/url\(\s*([^)]*?)\s*\)/g,(o,r)=>{let e=r.trim();return(e.startsWith('"')&&e.endsWith('"')||e.startsWith("'")&&e.endsWith("'"))&&(e=e.slice(1,-1)),`url(${a(e)})`});function s(t){if(!t)return{};if(typeof t=="string")return["#","rgb","hsl"].some(r=>t.indexOf(r)===0)?{backgroundColor:t}:s({image:t});if("color"in t&&t.color)return{backgroundColor:t.color,invertContent:t.invertContent};if("image"in t&&t.image){const o=v(t.image);return{backgroundImage:t.dim?`linear-gradient(#0005, #0008), ${o}`:o,invertContent:t.invertContent}}return{}}const p=["data-background-color","data-background-image"],h=i({__name:"default",props:{background:{default:""}},setup(t){l(e=>({"79d78d59":r.value.invertContent?"invert()":"none","7fbd2987":r.value.backgroundColor,ffdeb902:r.value.backgroundImage})),m();const o=t,r=d(()=>s(o.background));return(e,n)=>(u(),c("div",{class:"slidev-layout default","data-background-color":r.value.backgroundColor,"data-background-image":r.value.backgroundImage},[f(e.$slots,"default",{},void 0,!0)],8,p))}}),W=g(h,[["__scopeId","data-v-674ad0df"]]);export{W as I};
