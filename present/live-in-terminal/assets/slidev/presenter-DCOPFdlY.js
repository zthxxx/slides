import{aj as Q,z as b,d as z,b as f,C as s,n as w,o,ak as Y,Q as T,f as m,ag as I,i as C,al as W,g as e,ac as M,a7 as E,r as L,E as V,Y as J,L as K,P as X,am as Z,e as c,an as ee,w as y,k as B,t as te,F as se}from"../modules/vue-BBOBpKtP.js";import{a as oe,u as ne,c as le,h as re,j as ie,k as ae,l as ce,m as ue,s as de,d as ve,n as me,_ as fe}from"../index-DRmyyDPn.js";import{b as pe,c as xe,a as P,S as _e}from"./SlideWrapper-Pe424LWd.js";import{r as ke,u as ge,a as ye,_ as be,o as we,b as Ce,S as Se,G as he,c as $e,d as Me}from"./shortcuts-Dbbxru-C.js";import{_ as Te,C as ze}from"./NoteDisplay.vue_vue_type_style_index_0_lang-gu4ys1su.js";import{_ as Ne}from"./DrawingControls.vue_vue_type_style_index_0_lang-BCaN3sgg.js";import{_ as R}from"./IconButton.vue_vue_type_script_setup_true_lang-BmrboZUR.js";import"../modules/shiki-VKOH5Xxe.js";import"./context-TqtW0wuB.js";import"../modules/unplugin-icons-D2Clhvlv.js";function Fe(){const{counter:p,isActive:n,reset:r,pause:l,resume:u}=Q(1e3,{controls:!0});return{timer:b(()=>{const a=p.value,S=Math.floor(a%60).toString().padStart(2,"0");return`${Math.floor(a/60).toString().padStart(2,"0")}:${S}`}),isTimerActive:n,resetTimer:r,toggleTimer:()=>n.value?l():u()}}const je=z({__name:"NoteStatic",props:{no:{},class:{},clicksContext:{}},setup(p){const n=p,{info:r}=pe(n.no);return(l,u)=>{var d,a;return o(),f(Te,{class:w(n.class),note:(d=s(r))==null?void 0:d.note,"note-html":(a=s(r))==null?void 0:a.noteHTML,"clicks-context":l.clicksContext},null,8,["class","note","note-html","clicks-context"])}}}),De={"h-full":"","w-full":""},Ee={key:0,"w-full":"","h-full":"",flex:"~ col gap-4 items-center justify-center"},Le=z({__name:"ScreenCaptureMirror",setup(p){const n=Y("video"),r=T(null),l=T(!1);async function u(){r.value=await navigator.mediaDevices.getDisplayMedia({video:{cursor:"always"},audio:!1,selfBrowserSurface:"include",preferCurrentTab:!1}),n.value.srcObject=r.value,n.value.play(),l.value=!0,r.value.addEventListener("inactive",()=>{n.value.srcObject=null,l.value=!1}),r.value.addEventListener("ended",()=>{n.value.srcObject=null,l.value=!1})}return(d,a)=>(o(),m("div",De,[I(e("video",{ref_key:"video",ref:n,class:"w-full h-full object-contain"},null,512),[[W,l.value]]),l.value?C("v-if",!0):(o(),m("div",Ee,[a[0]||(a[0]=e("div",{op50:""},[M(" Use screen capturing to mirror your main screen back to presenter view."),e("br"),M(" Click the button below and "),e("b",null,"select your other monitor or window"),M(". ")],-1)),e("button",{class:"slidev-form-button",onClick:u}," Start Screen Mirroring ")]))]))}}),Ve={class:"bg-main h-full slidev-presenter","pt-2px":""},Be={flex:"~ gap-4 items-center",border:"b main",p1:""},Pe={class:"relative grid-section next flex flex-col p-2 lg:p-4"},Re={key:1,class:"h-full flex justify-center items-center"},Ie={key:0,class:"grid-section note of-auto"},We={key:1,class:"grid-section note grid grid-rows-[1fr_min-content] overflow-hidden"},Ae={class:"grid-section bottom flex"},Oe={class:"group flex items-center justify-center pl-4 select-none"},Ge={class:"w-22px cursor-pointer"},He={class:"group-not-hover:hidden flex flex-col items-center"},Ue={key:0,class:"i-carbon:pause text-lg"},qe={key:1,class:"i-carbon:play"},Qe={class:"text-2xl px-3 my-auto tabular-nums"},Ye={class:"progress-bar"},Je=z({__name:"presenter",setup(p){const n=E(),r=L();ke(),ge(r),ye();const{clicksContext:l,currentSlideNo:u,currentSlideRoute:d,hasNext:a,nextRoute:S,slides:N,getPrimaryClicks:A,total:O}=oe(),{isDrawing:G}=xe();ne({title:`Presenter - ${de}`}),L(!1);const{timer:H,isTimerActive:U,resetTimer:F,toggleTimer:j}=Fe(),q=b(()=>N.value.map(_=>le(_))),v=b(()=>l.value.current<l.value.total?[d.value,l.value.current+1]:a.value?[S.value,0]:null),k=b(()=>v.value&&q.value[v.value[0].no-1]);V(v,()=>{k.value&&v.value&&(k.value.current=v.value[1])},{immediate:!0});const x=J("slidev-presenter-main-slide-mode","slides"),D=T();return K(()=>{const _=r.value.querySelector("#slide-content"),t=X(Z()),g=E();V(()=>{if(!g.value||G.value||!me.value||!_)return;const i=_.getBoundingClientRect(),h=(t.x-i.left)/i.width*100,$=(t.y-i.top)/i.height*100;if(!(h<0||h>100||$<0||$>100))return{x:h,y:$}},i=>{ve.cursor=i})}),(_,t)=>{var g;return o(),m(se,null,[e("div",Ve,[e("div",{class:w(["grid-container",`layout${s(re)}`])},[e("div",{ref_key:"main",ref:r,class:"relative grid-section main flex flex-col"},[e("div",Be,[t[5]||(t[5]=e("span",{op50:"",px2:""},"Current",-1)),t[6]||(t[6]=e("div",{"flex-auto":""},null,-1)),c(be,{modelValue:s(x),"onUpdate:modelValue":t[0]||(t[0]=i=>ee(x)?x.value=i:null),options:[{label:"Slides",value:"slides"},{label:"Screen Mirror",value:"mirror"}]},null,8,["modelValue"])]),s(x)==="mirror"?(o(),f(Le,{key:0})):C("v-if",!0),C(" We use v-show here to still infer the clicks context "),I(c(P,{key:"main",class:"p-2 lg:p-4 flex-auto","is-main":"",onContextmenu:s(we)},{default:y(()=>[c(Se,{"render-context":"presenter"})]),_:1},8,["onContextmenu"]),[[W,s(x)==="slides"]]),(o(),f(ze,{key:(g=s(d))==null?void 0:g.no,"clicks-context":s(A)(s(d)),class:"w-full pb2 px4 flex-none"},null,8,["clicks-context"]))],512),e("div",Pe,[v.value&&k.value?(o(),f(P,{key:"next"},{default:y(()=>[(o(),f(_e,{key:v.value[0].no,"clicks-context":k.value,route:v.value[0],"render-context":"previewNext"},null,8,["clicks-context","route"]))]),_:1})):(o(),m("div",Re,t[7]||(t[7]=[e("div",{class:"text-gray-500"}," End of the presentation ",-1)]))),t[8]||(t[8]=e("div",{class:"absolute left-0 top-0 bg-main border-b border-r border-main px2 py1 op50 text-sm"}," Next ",-1))]),D.value&&s(ie)?(o(),m("div",Ie,[c(s(D))])):(o(),m("div",We,[(o(),f(je,{key:`static-${s(u)}`,no:s(u),class:"w-full max-w-full h-full overflow-auto p-2 lg:p-4",style:B({fontSize:`${s(ae)}em`}),"clicks-context":s(l)},null,8,["no","style","clicks-context"])),t[12]||(t[12]=e("div",{"border-t":"","border-main":""},null,-1)),e("div",{class:w(["py-1 px-2 text-sm transition",s(n)?"":"op25"])},[c(R,{title:"Increase font size",onClick:s(ce)},{default:y(()=>t[9]||(t[9]=[e("div",{class:"i-carbon:zoom-in"},null,-1)])),_:1},8,["onClick"]),c(R,{title:"Decrease font size",onClick:s(ue)},{default:y(()=>t[10]||(t[10]=[e("div",{class:"i-carbon:zoom-out"},null,-1)])),_:1},8,["onClick"]),C("v-if",!0)],2)])),e("div",Ae,[c(Ce,{persist:!0,class:w(["transition",s(n)?"":"op25"])},null,8,["class"]),t[15]||(t[15]=e("div",{"flex-auto":""},null,-1)),e("div",Oe,[e("div",Ge,[t[14]||(t[14]=e("div",{class:"i-carbon:time group-hover:hidden text-xl"},null,-1)),e("div",He,[e("div",{class:"relative op-80 hover:op-100",onClick:t[3]||(t[3]=(...i)=>s(j)&&s(j)(...i))},[s(U)?(o(),m("div",Ue)):(o(),m("div",qe))]),e("div",{class:"op-80 hover:op-100",onClick:t[4]||(t[4]=(...i)=>s(F)&&s(F)(...i))},t[13]||(t[13]=[e("div",{class:"i-carbon:renew"},null,-1)]))])]),e("div",Qe,te(s(H)),1)])]),(o(),f(Ne,{key:2}))],2),e("div",Ye,[e("div",{class:"progress h-3px bg-primary transition-all",style:B({width:`${(s(u)-1)/(s(O)-1)*100+1}%`})},null,4)])]),c(he),c($e),c(Me)],64)}}}),it=fe(Je,[["__scopeId","data-v-088786d1"]]);export{it as default};
