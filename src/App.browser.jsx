import React from "react";
const { useState, useEffect, useRef, createContext, useContext } = React;

// ── Colors ────────────────────────────────────────────────
const NAVY="#1A3A5C",BLUE="#2980B9",DBLUE="#1F618D",RED="#C0392B",ORANGE="#E67E22",
      GREEN="#27AE60",DGREEN="#1E8449",YELLOW="#F39C12",GRAY="#7F8C8D",
      INPUT_BG="#FFFDE7",INPUT_BD="#F9A825";

// ── Stations & constants ──────────────────────────────────
const STATIONS={
  "南ア消防署":["救急１号車","救急４号車","救急５号車","ポンプ１号車","水槽１号車","化学消防車","救助工作車","はしご車","照明車","積載１号車","積載２号車","指揮１号車"],
  "甲西分遣所":["救急３号車","水槽３号車"],
  "八田消防署":["救急２号車","ポンプ２号車","水槽２号車","指令２号車"],
  "消防本部":["プリウス","広報１号車","団積載車","団ポンプ車","ハイエース","スクラムバン"],
};
const SC={"待機":{bg:"#E8F8F5",fg:"#1E8449",bd:"#27AE60",dot:GREEN},"出場中":{bg:"#FDEDEC",fg:"#922B21",bd:"#C0392B",dot:RED},"活動中":{bg:"#FEF5E7",fg:"#784212",bd:"#E67E22",dot:ORANGE},"帰署中":{bg:"#FEF9E7",fg:"#7D6608",bd:"#F39C12",dot:YELLOW},"点検中":{bg:"#EBF5FB",fg:"#1A5276",bd:"#2980B9",dot:BLUE},"不在":{bg:"#F2F3F4",fg:"#717D7E",bd:"#BDC3C7",dot:GRAY}};
const STATUS_LIST=["待機","出場中","活動中","帰署中","点検中","不在"];
const DTYPES=["火災","救助","救急","その他"];
const ACT_ST=["活動中","調査中","終了","未活動"];
const PRIO=["高","中","低"];
const TC={火災:RED,救助:ORANGE,救急:BLUE,その他:GRAY};
const PC={高:RED,中:YELLOW,低:GREEN};
const PBG={高:"#FDEDEC",中:"#FFFDE7",低:"#E8F8F5"};
const UNIT_GROUPS=["南ア隊","甲西隊","八田隊","本部隊","消防団","県内隊","緊援隊","その他"];
const ALL_VEHICLES=Object.values(STATIONS).flat();
const TABLE_KEYS=["nf-road","nf-comm","nf-water","nf-tochuu","nf-staff","nf-support","nf-kinkyuu"];
const ROLE_LABELS={admin:"🔑 管理者",input:"✏️ 入力者",viewer:"👁 閲覧者"};
const ROLE_COLORS={admin:NAVY,input:DGREEN,viewer:GRAY};

const initVehicles=()=>{const v={};Object.entries(STATIONS).forEach(([s,a])=>a.forEach(n=>{v[`${s}::${n}`]={status:"待機",staff:["","","",""]}}));return v;};
const parseSelected=(s)=>(s||"").split(/[、,]/).map(x=>x.trim()).filter(Boolean);
const fmtDT=(iso)=>iso?new Date(iso).toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"";

// ── Storage / Realtime Sync ───────────────────────────────
// 1. SupabaseでSQLを実行:
// create table minamia_fire_shared_state (
//   key text primary key,
//   value jsonb not null,
//   updated_at timestamptz default now()
// );
// alter table minamia_fire_shared_state replica identity full;
// 2. Project Settings > API の URL と anon key を下に貼り付ける。
const SUPABASE_URL="https://wegwfzzlglauiwonsdbf.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_gc1JVInZp67YrAndq7d6qQ_rHs0ny93";
const STATE_TABLE="minamia_fire_shared_state";
const cloudEnabled=SUPABASE_URL.startsWith("http")&&SUPABASE_ANON_KEY.length>20;
let supabaseClient=null;
const getSupabase=async()=>{
  if(!cloudEnabled)return null;
  if(supabaseClient)return supabaseClient;
  try{
    let createClient;
    if(window.supabase&&window.supabase.createClient){
      createClient=window.supabase.createClient;
    }else{
      const mod=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
      createClient=mod.createClient;
    }
    supabaseClient=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
    return supabaseClient;
  }catch(e){console.warn("Supabase client is not available",e);return null;}
};

const localGet=async(k)=>{try{const r=await window.storage.get(k,false);return r?JSON.parse(r.value):null;}catch{return null;}};
const localSet=async(k,v)=>{try{await window.storage.set(k,JSON.stringify(v),false);}catch{}};
const localDelete=async(k)=>{try{await window.storage.delete(k,false);}catch{}};

// 接続状態グローバル
let _cloudOK=false;
const _listeners=new Set();
const setCloudStatus=(ok)=>{if(_cloudOK===ok)return;_cloudOK=ok;_listeners.forEach(fn=>fn(ok));};
const onCloudStatus=(fn)=>{_listeners.add(fn);return()=>_listeners.delete(fn);};

const sg=async(k)=>{
  const supabase=await getSupabase();
  if(!supabase){setCloudStatus(false);return localGet(k);}
  try{
    const{data,error}=await supabase.from(STATE_TABLE).select("value").eq("key",k).maybeSingle();
    if(error)throw error;
    setCloudStatus(true);
    if(data?.value!=null)return data.value;
    // DBにデータがない場合はローカルから取得してDBに書き込む（移行処理）
    const local=await localGet(k);
    if(local!=null){
      console.log("[DB] migrating local->cloud:",k);
      await supabase.from(STATE_TABLE).upsert({key:k,value:local,updated_at:new Date().toISOString()},{onConflict:"key"});
    }
    return local;
  }catch(e){
    console.warn("[DB] get failed:",k,e?.message||e);
    setCloudStatus(false);
    return localGet(k);
  }
};
const ss=async(k,v)=>{
  const supabase=await getSupabase();
  if(!supabase){setCloudStatus(false);return localSet(k,v);}
  try{
    const{error}=await supabase.from(STATE_TABLE).upsert({key:k,value:v,updated_at:new Date().toISOString()},{onConflict:"key"});
    if(error)throw error;
    setCloudStatus(true);
    await localSet(k,v);
  }catch(e){
    console.warn("[DB] set failed:",k,e?.message||e);
    setCloudStatus(false);
    await localSet(k,v);
  }
};
const sd=async(k)=>{
  const supabase=await getSupabase();
  if(!supabase){setCloudStatus(false);return localDelete(k);}
  try{
    const{error}=await supabase.from(STATE_TABLE).delete().eq("key",k);
    if(error)throw error;
    setCloudStatus(true);
    await localDelete(k);
  }catch(e){
    console.warn("[DB] delete failed:",k,e?.message||e);
    setCloudStatus(false);
    await localDelete(k);
  }
};
const subscribeStorage=(keys,onChange)=>{
  const startPolling=(interval=3000)=>{
    const load=async()=>{for(const key of keys){const v=await sg(key);onChange(key,v);}};
    load();
    const timer=setInterval(load,interval);
    return timer;
  };
  if(!cloudEnabled){
    const timer=startPolling();
    return()=>clearInterval(timer);
  }
  let disposed=false,timer=null,channel=null,realtimeOK=false;
  getSupabase().then(async supabase=>{
    if(disposed)return;
    if(!supabase){timer=startPolling();return;}
    for(const key of keys){const v=await sg(key);if(!disposed)onChange(key,v);}
    const keySet=new Set(keys);
    channel=supabase.channel(`minamia-fire-${keys.join("-")}-${Date.now()}`)
      .on("postgres_changes",{event:"*",schema:"public",table:STATE_TABLE},payload=>{
        const key=payload.new?.key||payload.old?.key;
        if(keySet.has(key)){
          const val=payload.eventType==="DELETE"?null:payload.new?.value;
          onChange(key,val);
        }
      })
      .subscribe((status)=>{
        if(status==="SUBSCRIBED"){
          realtimeOK=true;setCloudStatus(true);
          if(timer){clearInterval(timer);timer=null;}
        }else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){
          realtimeOK=false;
          if(!timer)timer=startPolling(5000);
        }
      });
    setTimeout(()=>{if(!realtimeOK&&!disposed&&!timer)timer=startPolling(5000);},2000);
  });
  return()=>{
    disposed=true;
    if(timer)clearInterval(timer);
    if(channel&&supabaseClient)supabaseClient.removeChannel(channel);
  };
};

function CloudStatusBadge(){
  const[ok,setOk]=useState(_cloudOK);
  useEffect(()=>onCloudStatus(setOk),[]);
  return(
    <div style={{position:"fixed",bottom:80,right:12,zIndex:500,display:"flex",alignItems:"center",gap:5,
      background:ok?"rgba(30,132,73,0.92)":"rgba(192,57,43,0.92)",
      color:"#fff",borderRadius:20,padding:"4px 10px",fontSize:12,fontWeight:"bold",
      boxShadow:"0 2px 8px rgba(0,0,0,0.25)",pointerEvents:"none"}}>
      <span style={{width:7,height:7,borderRadius:"50%",background:"#fff",display:"inline-block"}}/>
      {ok?"🌐 DB接続中":"⚠️ ローカル保存中"}
    </div>
  );
}

// ── Auth ──────────────────────────────────────────────────
const mkToken=(role,pw)=>`MINAMIA-FIRE-${role.toUpperCase()}-${btoa(unescape(encodeURIComponent(pw)))}`;
const parseToken=(t)=>{try{const p=t.split("-");if(p[0]!=="MINAMIA-FIRE")return null;return{role:p[1].toLowerCase(),pw:decodeURIComponent(escape(atob(p.slice(2).join("-"))))}}catch{return null;}};
const getQRData=(token)=>{try{const u=new URL(window.location.href);u.searchParams.set("token",token);return u.toString();}catch{return token;}};

// ── Vehicle sync ──────────────────────────────────────────
const syncVehicles=(disasters,cur)=>{
  const next={...cur};
  const active=new Set(),finished=new Set();
  disasters.forEach(d=>{
    const vs=parseSelected(d.vehicles); // 車両名は動的リストで管理
    (d.status==="終了"||d.status==="未活動"?finished:active).forEach?.(()=>{});
    vs.forEach(v=>(d.status==="終了"||d.status==="未活動"?finished:active).add(v));
  });
  Object.keys(next).forEach(k=>{
    if(k.startsWith("__"))return;
    const n=k.split("::")[1];
    if(active.has(n)&&(next[k].status==="待機"||next[k].status==="出場中"))next[k]={...next[k],status:"出場中"};
    else if(finished.has(n)&&!active.has(n)&&next[k].status==="出場中")next[k]={...next[k],status:"帰署中"};
  });
  return next;
};

// ── QR Canvas ─────────────────────────────────────────────
function QRCanvas({data,size=220}){
  const[src,setSrc]=useState(null),[failed,setFailed]=useState(false);
  useEffect(()=>{
    if(!data)return;
    const services=[
      `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&margin=10`,
      `https://quickchart.io/qr?text=${encodeURIComponent(data)}&size=${size}`,
    ];
    let idx=0;
    const tryNext=()=>{if(idx>=services.length){setFailed(true);return;}const url=services[idx++];const img=new Image();img.onload=()=>setSrc(url);img.onerror=()=>tryNext();img.src=url;};
    tryNext();
  },[data,size]);
  if(failed)return(<div style={{width:size,height:size,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#F8F9FA",border:"2px dashed #ccc",borderRadius:8,padding:12,textAlign:"center"}}><div style={{fontSize:13,color:"#666",marginBottom:8,lineHeight:1.5}}>インターネット接続が必要です。<br/>このURLを共有してください：</div><div style={{fontSize:11,color:NAVY,wordBreak:"break-all",background:"#fff",padding:"6px 8px",borderRadius:6,border:"1px solid #ddd",cursor:"pointer"}} onClick={e=>{try{navigator.clipboard.writeText(data);}catch{}e.target.style.background="#E8F8F5";}}>{data}</div><div style={{fontSize:12,color:GRAY,marginTop:4}}>↑ タップでコピー</div></div>);
  if(!src)return(<div style={{width:size,height:size,display:"flex",alignItems:"center",justifyContent:"center",background:"#F8F9FA",borderRadius:8}}><div style={{fontSize:14,color:GRAY}}>読み込み中...</div></div>);
  return <img src={src} alt="QR Code" style={{display:"block",width:size,height:size,borderRadius:6}}/>;
}

// ── Shared UI ─────────────────────────────────────────────
function Btn({children,onClick,color=NAVY,outline=false,small=false,disabled=false,style={}}){
  return <button disabled={disabled} onClick={onClick} style={{background:disabled?"#ccc":outline?"transparent":color,color:disabled?"#fff":outline?color:"#fff",border:`2px solid ${disabled?"#ccc":color}`,borderRadius:8,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",fontWeight:"bold",fontSize:small?14:16,padding:small?"5px 12px":"9px 18px",opacity:disabled?0.6:1,...style}}>{children}</button>;
}
function Card({children,style={}}){return <div style={{background:"#fff",borderRadius:12,padding:16,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",...style}}>{children}</div>;}
function Toast({msg,type}){if(!msg)return null;return <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:type==="error"?RED:GREEN,color:"#fff",padding:"10px 22px",borderRadius:10,boxShadow:"0 4px 16px rgba(0,0,0,0.25)",zIndex:9999,fontFamily:"inherit",fontSize:16,fontWeight:"bold",whiteSpace:"nowrap"}}>{msg}</div>;}
function AppBar({title,onBack,role,onLogout}){
  const c=ROLE_COLORS[role]||GRAY;
  return <div style={{background:`linear-gradient(135deg,${NAVY},#243B55)`,color:"#fff",padding:"0 18px",display:"flex",alignItems:"center",gap:12,height:64,position:"sticky",top:0,zIndex:200,boxShadow:"0 2px 10px rgba(0,0,0,0.25)"}}>{onBack&&<Btn onClick={onBack} small style={{padding:"4px 10px",background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)"}}>← 戻る</Btn>}<span style={{fontWeight:"bold",fontSize:20,flex:1}}>{title}</span>{role&&<span style={{fontSize:15,background:c,color:"#fff",padding:"5px 14px",borderRadius:20,fontWeight:"bold"}}>{ROLE_LABELS[role]}</span>}{onLogout&&<Btn onClick={onLogout} small color={RED} style={{padding:"4px 10px",background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.25)"}}>終了</Btn>}</div>;
}
function FRow({label,children}){return <div style={{marginBottom:10}}><label style={{fontSize:13,color:"#555",display:"block",marginBottom:4,fontWeight:"bold"}}>{label}</label>{children}</div>;}
function PwField({label,value,onChange,show,onToggle,hint,color}){return <div style={{marginBottom:14}}><label style={{fontSize:14,color:"#555",display:"block",marginBottom:6,fontWeight:"bold"}}>{label}</label><div style={{position:"relative"}}><input type={show?"text":"password"} value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",border:`2px solid ${color}44`,borderRadius:8,padding:"9px 40px 9px 12px",fontSize:16,boxSizing:"border-box",fontFamily:"inherit",outline:"none",background:color+"08"}}/><button onClick={onToggle} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#999"}}>{show?"🙈":"👁"}</button></div>{hint&&<div style={{fontSize:13,color:"#aaa",marginTop:4}}>{hint}</div>}</div>;}

const iSt={width:"100%",border:`1.5px solid ${INPUT_BD}`,borderRadius:6,padding:"8px 10px",fontSize:15,boxSizing:"border-box",fontFamily:"inherit",background:INPUT_BG,outline:"none"};
const sSt={...iSt,padding:"8px"};

// ── GlobalStyle ───────────────────────────────────────────
function GlobalStyle(){return <style>{`html{font-size:22px}body{font-weight:600;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}button,input,select,textarea{font-weight:700!important;font-size:1rem!important}label{font-weight:800!important}select{font-size:1rem!important}input[type="date"]::-webkit-clear-button,input[type="time"]::-webkit-clear-button{display:none;-webkit-appearance:none}input[type="date"]::-webkit-inner-spin-button,input[type="time"]::-webkit-inner-spin-button{display:none;-webkit-appearance:none}.appbar-title{font-size:1.1rem!important}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none!important}.print-area{display:block!important}thead{display:table-header-group}}`}</style>;}

// ── FormField (module-level, no remount) ──────────────────
function FormField({col,value,onChange}){
  if(col.options)return <select value={value||""} onChange={e=>onChange(e.target.value)} style={sSt}><option value=""></option>{col.options.map(o=><option key={o}>{o}</option>)}</select>;
  if(col.type==="time")return <div style={{display:"flex",gap:4}}><input type="time" value={value||""} onChange={e=>onChange(e.target.value)} style={{...iSt,flex:1}}/>{value&&<button type="button" onClick={()=>onChange("")} style={{padding:"4px 8px",borderRadius:6,border:"1px solid #ddd",background:"#fff",cursor:"pointer",fontSize:14,color:GRAY}}>✕</button>}</div>;
  if(col.type==="date")return <div style={{display:"flex",gap:4}}><input type="date" value={value||""} onChange={e=>onChange(e.target.value)} style={{...iSt,flex:1}}/>{value&&<button type="button" onClick={()=>onChange("")} style={{padding:"4px 8px",borderRadius:6,border:"1px solid #ddd",background:"#fff",cursor:"pointer",fontSize:14,color:GRAY}}>✕</button>}</div>;
  return <input value={value||""} onChange={e=>onChange(e.target.value)} style={iSt}/>;
}

// ── GenericForm (module-level) ────────────────────────────
function GenericForm({cols,form,onUpdate,editing,onSave,onCancel,color}){
  return(
    <Card style={{marginBottom:12,border:`2px solid ${editing===-1?color:BLUE}`}}>
      <div style={{display:"flex",alignItems:"center",marginBottom:12,paddingBottom:8,borderBottom:`1px solid ${color}33`}}>
        <span style={{fontSize:13,background:editing===-1?color:BLUE,color:"#fff",padding:"3px 10px",borderRadius:20,fontWeight:"bold"}}>
          {editing===-1?"➕ 新規入力":`✏️ ${editing+1}件目を編集`}
        </span>
      </div>
      <div style={{background:"#FFFBF0",border:`1px dashed ${INPUT_BD}`,borderRadius:8,padding:14,marginBottom:12}}>
        <div style={{fontSize:13,color:YELLOW,fontWeight:"bold",marginBottom:10}}>✏️ 入力欄</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
          {cols.map(col=>(
            <div key={col.key}>
              <label style={{fontSize:13,color:"#555",display:"block",marginBottom:4,fontWeight:"bold"}}>{col.label}</label>
              <FormField col={col} value={form[col.key]||""} onChange={val=>onUpdate(col.key,val)}/>
            </div>
          ))}
        </div>
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn onClick={onSave} color={editing===-1?color:BLUE} style={{flex:1,padding:10}}>保存</Btn>
        <Btn onClick={onCancel} color={GRAY} outline style={{flex:1,padding:10}}>キャンセル</Btn>
      </div>
    </Card>
  );
}

// ── DesktopSidebar ────────────────────────────────────────
function DesktopSidebar({disasters,archives,role,page,onNav,onLogout,onArchive}){
  const isAdmin=role==="admin";
  const base=[{icon:"📋",label:"災害一覧",page:"disasters",color:RED},{icon:"🚒",label:"指揮動態管理",page:"vehicles",color:RED},{icon:"👥",label:"参集報告",page:"staff",color:ORANGE},{icon:"🚶",label:"参集途上被害",page:"tochuu",color:ORANGE},{icon:"🛣️",label:"道路被害",page:"road",color:YELLOW},{icon:"📡",label:"通信状況",page:"comm",color:YELLOW},{icon:"💧",label:"水利状況",page:"water",color:DBLUE},{icon:"🤝",label:"応援状況",page:"support",color:DGREEN},{icon:"📁",label:"保存済み記録",page:"archives",color:DGREEN},{icon:"🌐",label:"外部リンク",page:"links",color:GRAY},...(isAdmin?[{icon:"⚙️",label:"管理設定",page:"settings",color:NAVY}]:[])];
  const nav=role==="viewer"?[{icon:"📋",label:"災害一覧",page:"disasters",color:RED}]:base;
  return(
    <div style={{width:260,background:NAVY,height:"100vh",position:"fixed",left:0,top:0,overflowY:"auto",display:"flex",flexDirection:"column",zIndex:100,boxShadow:"2px 0 8px rgba(0,0,0,0.15)"}}>
      <div style={{padding:"14px 12px 10px",borderBottom:"1px solid rgba(255,255,255,0.1)"}}>
        <div style={{fontSize:28,marginBottom:4}}>🚒</div>
        <div style={{color:"#fff",fontWeight:"bold",fontSize:14,lineHeight:1.4}}>南アルプス市消防本部</div>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:2}}>災害対策情報システム</div>
      </div>
      <div style={{flex:1,padding:"4px 0"}}>
        {nav.map(item=>{const active=page===item.page;return(
          <button key={item.page} onClick={()=>onNav(item.page)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 12px",background:active?"rgba(255,255,255,0.13)":"transparent",border:"none",borderLeft:`3px solid ${active?item.color:"transparent"}`,color:active?"#fff":"rgba(255,255,255,0.65)",cursor:"pointer",textAlign:"left",fontFamily:"inherit",fontSize:14,fontWeight:active?"bold":600}}>
            <span style={{fontSize:16,width:20,textAlign:"center",flexShrink:0}}>{item.icon}</span>{item.label}
          </button>
        );})}
        {isAdmin&&disasters.length>0&&<button onClick={onArchive} style={{display:"flex",alignItems:"center",gap:6,width:"calc(100% - 20px)",margin:"6px 10px",padding:"7px 10px",background:`linear-gradient(135deg,${DGREEN},${GREEN})`,border:"none",borderRadius:7,color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:"bold"}}><span>📁</span><span>事案記録を保存</span></button>}
      </div>
      <div style={{padding:"10px 10px 14px",borderTop:"1px solid rgba(255,255,255,0.1)"}}>
        <div style={{background:"rgba(255,255,255,0.1)",borderRadius:6,padding:"6px 8px",marginBottom:6,textAlign:"center"}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:1}}>ログイン中</div>
          <div style={{fontSize:13,fontWeight:"bold",color:"#fff"}}>{ROLE_LABELS[role]}</div>
        </div>
        <button onClick={onLogout} style={{width:"100%",background:RED,color:"#fff",border:"none",borderRadius:6,padding:"7px",fontSize:13,fontWeight:"bold",cursor:"pointer",fontFamily:"inherit"}}>ログアウト</button>
      </div>
    </div>
  );
}

// ── MobileNav ─────────────────────────────────────────────
function MobileNav({role,page,onNav}){
  const items=role==="viewer"
    ?[{icon:"📋",label:"災害一覧",page:"disasters",color:RED}]
    :[{icon:"📋",label:"災害",page:"disasters",color:RED},{icon:"🚒",label:"動態",page:"vehicles",color:RED},{icon:"🏠",label:"ホーム",page:"home",color:NAVY},{icon:"📁",label:"記録",page:"archives",color:DGREEN},{icon:"⚙️",label:"設定",page:"settings",color:NAVY}];
  return(
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#fff",borderTop:"1px solid #E0E0E0",display:"flex",alignItems:"stretch",zIndex:300,boxShadow:"0 -2px 8px rgba(0,0,0,0.08)",paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
      {items.map(item=>{const active=page===item.page;return(
        <button key={item.page} onClick={()=>onNav(item.page)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"8px 4px",background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit",borderTop:`2px solid ${active?item.color:"transparent"}`}}>
          <span style={{fontSize:22,lineHeight:1,marginBottom:2}}>{item.icon}</span>
          <span style={{fontSize:11,color:active?item.color:"#999",fontWeight:active?"bold":600}}>{item.label}</span>
        </button>
      );})}
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────
function LoginScreen({onLogin}){
  // mode: "viewer"=閲覧者(デフォルト) / "staff"=管理者・入力者
  const[mode,setMode]=useState("viewer");
  const[pw,setPw]=useState(""),[err,setErr]=useState("");
  const try_=(v)=>{if(onLogin(v))return;setErr("パスワードが正しくありません");setPw("");};
  const switchMode=(m)=>{setMode(m);setPw("");setErr("");};

  return(
    <div style={{minHeight:"100vh",background:`linear-gradient(160deg,${NAVY},#243B55)`,display:"flex",alignItems:"center",justifyContent:"center",padding:16,fontFamily:"'Noto Sans JP',sans-serif"}}>
      <div style={{width:"100%",maxWidth:400}}>
        {/* ヘッダー */}
        <div style={{textAlign:"center",marginBottom:24,color:"#fff"}}>
          <div style={{fontSize:56,marginBottom:10}}>🚒</div>
          <div style={{fontWeight:"bold",fontSize:22}}>南アルプス市消防本部</div>
          <div style={{fontSize:15,opacity:0.7,marginTop:4}}>災害対策情報システム</div>
        </div>

        <div style={{background:"rgba(255,255,255,0.97)",borderRadius:16,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
          {/* モード切替タブ */}
          <div style={{display:"flex",background:"#F0F4F8",borderBottom:"2px solid #E0E0E0"}}>
            <button onClick={()=>switchMode("viewer")} style={{flex:1,padding:"13px 8px",background:mode==="viewer"?NAVY:"transparent",color:mode==="viewer"?"#fff":"#888",border:"none",fontWeight:"bold",fontSize:15,cursor:"pointer",fontFamily:"inherit",borderRadius:mode==="viewer"?"14px 0 0 0":0,transition:"background 0.2s"}}>
              👁 閲覧者
            </button>
            <button onClick={()=>switchMode("staff")} style={{flex:1,padding:"13px 8px",background:mode==="staff"?NAVY:"transparent",color:mode==="staff"?"#fff":"#888",border:"none",fontWeight:"bold",fontSize:15,cursor:"pointer",fontFamily:"inherit",borderRadius:mode==="staff"?"0 14px 0 0":0,transition:"background 0.2s"}}>
              🔑 職員ログイン
            </button>
          </div>

          <div style={{padding:"24px 20px"}}>
            {mode==="viewer"?(
              <>
                <div style={{background:"#EBF5FB",border:`1px solid ${BLUE}33`,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:14,color:"#1A5276"}}>
                  👁 閲覧者用パスワードを入力してください
                </div>
                <label style={{fontSize:14,color:"#666",display:"block",marginBottom:6,fontWeight:"bold"}}>閲覧者パスワード</label>
                <input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&try_(pw)} placeholder="閲覧者パスワードを入力" autoComplete="new-password"
                  style={{width:"100%",border:`2px solid ${BLUE}`,borderRadius:8,padding:"12px 14px",fontSize:17,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                {err&&<div style={{color:RED,fontSize:14,marginTop:6,fontWeight:"bold"}}>⚠ {err}</div>}
                <Btn onClick={()=>try_(pw)} style={{width:"100%",padding:"12px",marginTop:14,fontSize:16}}>👁 閲覧者としてログイン</Btn>
              </>
            ):(
              <>
                <div style={{background:"#F9F0FF",border:`1px solid ${NAVY}33`,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:14,color:NAVY}}>
                  🔑 管理者・入力者のパスワードを入力してください
                </div>
                <label style={{fontSize:14,color:"#666",display:"block",marginBottom:6,fontWeight:"bold"}}>パスワード</label>
                <input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&try_(pw)} placeholder="管理者 または 入力者のパスワード" autoComplete="new-password"
                  style={{width:"100%",border:`2px solid ${NAVY}`,borderRadius:8,padding:"12px 14px",fontSize:17,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                {err&&<div style={{color:RED,fontSize:14,marginTop:6,fontWeight:"bold"}}>⚠ {err}</div>}
                <Btn onClick={()=>try_(pw)} style={{width:"100%",padding:"12px",marginTop:14,fontSize:16,background:NAVY}}>🔑 ログイン</Btn>
                <div style={{marginTop:12,padding:10,background:"#F8F9FA",borderRadius:8}}>
                  {[["🔑 管理者",NAVY,"全機能"],["✏️ 入力者",DGREEN,"入力のみ"]].map(([l,c,d])=>(
                    <div key={l} style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:13,background:c,color:"#fff",padding:"2px 8px",borderRadius:20}}>{l}</span>
                      <span style={{fontSize:13,color:"#888"}}>{d}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div style={{marginTop:16,display:"flex",flexWrap:"wrap",justifyContent:"center",gap:6}}>
          {[["\uD83D\uDD04","\u66F4\u65B0\u30DC\u30BF\u30F3"],["\uD83D\uDDB8\uFE0F","\u5370\u5237\u6A5F\u80FD"],["\uD83D\uDCE5","\u5FA9\u5143\u6A5F\u80FD"],["\uD83C\uDF10","DB\u540C\u671F"],["\uD83D\uDC41","\u6A29\u9650\u7BA1\u7406"],["\uD83D\uDCF1","PWA\u5BFE\u5FDC"]].map(([ic,lb])=>(
            <span key={lb} style={{background:"rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.75)",fontSize:12,padding:"3px 10px",borderRadius:20,display:"flex",alignItems:"center",gap:4}}>
              <span>{ic}</span><span>{lb}</span><span style={{color:"#2ECC71",fontWeight:"bold"}}>✅</span>
            </span>
          ))}
        </div>
        <div style={{textAlign:"center",color:"rgba(255,255,255,0.4)",fontSize:13,marginTop:10}}>© 南アルプス市消防本部</div>
      </div>
    </div>
  );
}

// ── Home ──────────────────────────────────────────────────
function HomeScreen({disasters,vehicles,archives,role,onNav,onLogout,onArchive,dutyCount,onDutyChange,onForceRefresh}){
  const[staffRows,setStaffRows]=useState([]);
  const[localDuty,setLocalDuty]=useState(dutyCount||0);
  const[homeSync,setHomeSync]=useState(false);
  const[homeSyncMsg,setHomeSyncMsg]=useState(null);
  useEffect(()=>{setLocalDuty(dutyCount||0);},[dutyCount]);
  useEffect(()=>{
    return subscribeStorage(["nf-staff","nf-duty-count"],(key,value)=>{
      if(key==="nf-staff")setStaffRows(Array.isArray(value)?value:[]);
      if(key==="nf-duty-count"&&value!=null)setLocalDuty(value);
    });
  },[]);
  const tot=DTYPES.reduce((a,t)=>({...a,[t]:disasters.filter(d=>d.type===t).length}),{});
  const activeV=Object.values(vehicles).filter(v=>["出場中","活動中"].includes(v.status)).length;
  const activeD=disasters.filter(d=>d.status==="活動中").length;
  const hasData=disasters.length>0;
  const sanshuSumi=staffRows.filter(r=>r.status==="参集済").length;
  const miSanshu=staffRows.filter(r=>r.status==="未参集").length;
  const renraku=staffRows.filter(r=>r.status==="連絡中").length;
  const fuzai=staffRows.filter(r=>r.status==="不在").length;
  const canEdit=role==="admin"||role==="input";
  const handleDuty=(n)=>{setLocalDuty(n);onDutyChange(n);};

  if(role==="viewer")return(
    <div style={{minHeight:"100vh",background:"#F0F4F8",fontFamily:"'Noto Sans JP',sans-serif"}}>
      <AppBar title="🚒 南アルプス市消防本部" role={role} onLogout={onLogout}/>
      <div style={{padding:14,maxWidth:560,margin:"0 auto"}}>
        <Card style={{marginBottom:12}}>
          <div style={{fontSize:14,color:GRAY,marginBottom:12,fontWeight:"bold"}}>👁 閲覧者モード</div>
          <button onClick={()=>onNav("disasters")} style={{width:"100%",background:RED,color:"#fff",border:"none",borderRadius:10,padding:"14px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,fontFamily:"inherit"}}>
            <span style={{fontSize:30}}>📋</span>
            <div style={{textAlign:"left"}}><div style={{fontWeight:"bold",fontSize:17}}>災害一覧を見る</div><div style={{fontSize:14,opacity:0.85,marginTop:2}}>{disasters.length}件登録中</div></div>
            <span style={{marginLeft:"auto",fontSize:22,opacity:0.7}}>›</span>
          </button>
        </Card>
      </div>
    </div>
  );

  const navItems=[{icon:"📋",label:"災害一覧",page:"disasters",color:RED,sub:"発生案件"},{icon:"🚒",label:"指揮動態管理",page:"vehicles",color:RED,sub:"車両動態"},{icon:"👥",label:"参集報告",page:"staff",color:ORANGE,sub:"参集状況"},{icon:"🚶",label:"参集途上被害",page:"tochuu",color:ORANGE,sub:"途上被害"},{icon:"🛣️",label:"道路被害",page:"road",color:YELLOW,sub:"道路状況"},{icon:"📡",label:"通信状況",page:"comm",color:YELLOW,sub:"通信状況"},{icon:"💧",label:"水利状況",page:"water",color:DBLUE,sub:"水利状況"},{icon:"🤝",label:"応援状況",page:"support",color:DGREEN,sub:"県内・緊援"},{icon:"📁",label:"保存済み記録",page:"archives",color:DGREEN,sub:`${archives.length}件`},{icon:"🌐",label:"外部リンク",page:"links",color:GRAY,sub:"気象・道路"},...(role==="admin"?[{icon:"⚙️",label:"管理設定",page:"settings",color:NAVY,sub:"PW・QR"}]:[])];

  return(
    <div style={{minHeight:"100vh",background:"#F0F4F8",fontFamily:"'Noto Sans JP',sans-serif"}}>
      <AppBar title="🚒 南アルプス市消防本部" role={role} onLogout={onLogout}/>
      <div style={{padding:16,maxWidth:960,margin:"0 auto"}}>

        {/* 更新ボタン */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <button onClick={async()=>{
            setHomeSync(true);setHomeSyncMsg(null);
            try{
              const[dis,veh,dty,stf]=await Promise.all([sg("nf-disasters"),sg("nf-vehicles"),sg("nf-duty-count"),sg("nf-staff")]);
              if(onForceRefresh)onForceRefresh(dis,veh,dty,stf);
              setHomeSyncMsg({type:"ok",text:"✅ 更新しました"});
            }catch(e){setHomeSyncMsg({type:"err",text:"⚠️ 更新に失敗しました"});}
            finally{setHomeSync(false);setTimeout(()=>setHomeSyncMsg(null),3000);}
          }} disabled={homeSync} style={{display:"flex",alignItems:"center",gap:8,background:homeSync?"#ccc":DBLUE,color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontSize:16,fontWeight:"bold",cursor:homeSync?"not-allowed":"pointer",fontFamily:"inherit",boxShadow:"0 2px 6px rgba(0,0,0,0.15)"}}>
            <span style={{display:"inline-block",animation:homeSync?"spin 1s linear infinite":"none",fontSize:18}}>🔄</span>
            {homeSync?"更新中..":"最新データに更新"}
          </button>
          {homeSyncMsg&&<span style={{fontSize:15,fontWeight:"bold",color:homeSyncMsg.type==="ok"?DGREEN:RED,padding:"8px 14px",background:homeSyncMsg.type==="ok"?"#E8F8F5":"#FDEDEC",borderRadius:8,border:`1px solid ${homeSyncMsg.type==="ok"?DGREEN:RED}44`}}>{homeSyncMsg.text}</span>}
        </div>
        {/* 災害バナー */}
        <div style={{background:`linear-gradient(135deg,${NAVY},${DBLUE})`,borderRadius:14,padding:18,color:"#fff",marginBottom:14,boxShadow:"0 4px 16px rgba(26,58,92,0.3)"}}>
          <div style={{fontSize:15,opacity:0.8,marginBottom:12,letterSpacing:0.5}}>📊 現在の災害発生状況 · {new Date().toLocaleString("ja-JP",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:12}}>
            {[[RED,"🔴","火災"],[ORANGE,"🟠","救助"],[BLUE,"🔵","救急"],[GRAY,"⚫","その他"]].map(([c,ic,t])=>(
              <div key={t} style={{background:"rgba(255,255,255,0.14)",borderRadius:10,padding:"12px 6px",textAlign:"center",border:`1px solid ${c}44`}}>
                <div style={{fontSize:15,marginBottom:4,fontWeight:"bold"}}>{ic} {t}</div>
                <div style={{fontSize:44,fontWeight:"bold",lineHeight:1,color:"#fff"}}>{tot[t]||0}</div>
                <div style={{fontSize:13,opacity:0.7,marginTop:4}}>件</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:10}}>
            {activeD>0&&<div style={{flex:1,background:"rgba(192,57,43,0.4)",borderRadius:8,padding:"10px 14px",fontSize:16,display:"flex",alignItems:"center",gap:8,fontWeight:"bold"}}><span style={{width:10,height:10,borderRadius:"50%",background:RED,display:"inline-block",flexShrink:0}}/>活動中 {activeD} 件</div>}
            <div style={{flex:1,background:"rgba(255,255,255,0.13)",borderRadius:8,padding:"10px 14px",fontSize:16,fontWeight:"bold"}}>🚒 出動車両 {activeV} 台</div>
          </div>
        </div>

        {/* 優先度「高」の案件 */}
        {disasters.filter(d=>d.priority==="高"&&d.status!=="終了"&&d.status!=="未活動").length>0&&(
          <Card style={{marginBottom:14,border:`2px solid ${RED}`,padding:"14px 16px",boxShadow:"0 2px 10px rgba(192,57,43,0.15)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{background:RED,color:"#fff",fontSize:16,fontWeight:"bold",padding:"4px 14px",borderRadius:20}}>🔴 優先度：高　{disasters.filter(d=>d.priority==="高"&&d.status!=="終了"&&d.status!=="未活動").length}件</span>
              <button onClick={()=>onNav("disasters")} style={{marginLeft:"auto",fontSize:15,color:RED,background:"none",border:`1px solid ${RED}`,borderRadius:6,padding:"4px 14px",cursor:"pointer",fontFamily:"inherit",fontWeight:"bold"}}>一覧へ →</button>
            </div>
            {[...disasters].filter(d=>d.priority==="高"&&d.status!=="終了"&&d.status!=="未活動").sort((a,b)=>(`${a.date||"9999"}${a.time||"9999"}`).localeCompare(`${b.date||"9999"}${b.time||"9999"}`)).map((d,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderTop:i>0?"1px solid #F5E6E6":"none"}}>
                <span style={{background:TC[d.type]||GRAY,color:"#fff",fontSize:14,padding:"3px 10px",borderRadius:20,fontWeight:"bold",flexShrink:0}}>{d.type}</span>
                <span style={{fontSize:17,color:NAVY,fontWeight:"bold",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.address} {d.landmark}</span>
                <span style={{fontSize:15,color:"#888",flexShrink:0}}>{d.time||""}</span>
                <span style={{fontSize:14,background:"#f5f5f5",color:"#555",padding:"3px 10px",borderRadius:20,flexShrink:0,fontWeight:"bold"}}>{d.status}</span>
              </div>
            ))}
          </Card>
        )}

        {/* 職員参集状況 */}
        <Card style={{marginBottom:14,padding:"14px 16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <span style={{fontSize:20}}>👥</span>
            <span style={{fontWeight:"bold",fontSize:18,color:NAVY,flex:1}}>職員参集状況</span>
            <button onClick={()=>onNav("staff")} style={{fontSize:14,color:ORANGE,background:"none",border:`1.5px solid ${ORANGE}`,borderRadius:6,padding:"4px 12px",cursor:"pointer",fontFamily:"inherit",fontWeight:"bold"}}>参集報告へ →</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8}}>
            {[["対応職員",localDuty+sanshuSumi,RED,false],["勤務",localDuty,NAVY,true],["参集済",sanshuSumi,DGREEN,false],["未参集",miSanshu,ORANGE,false],["連絡中",renraku,BLUE,false],["不在",fuzai,GRAY,false]].map(([label,val,c,editable])=>(
              <div key={label} style={{background:c+"12",border:`1.5px solid ${c}44`,borderRadius:10,padding:"10px 4px",textAlign:"center"}}>
                <div style={{fontSize:13,color:c,fontWeight:"bold",marginBottom:4}}>{label}</div>
                {editable&&canEdit?(
                  <input type="number" min="0" value={localDuty||""} onChange={e=>handleDuty(Number(e.target.value)||0)}
                    style={{width:"100%",border:`1.5px solid ${INPUT_BD}`,borderRadius:6,padding:"2px",fontSize:28,fontWeight:"bold",color:c,background:INPUT_BG,textAlign:"center",boxSizing:"border-box",fontFamily:"inherit"}}/>
                ):(
                  <div style={{fontSize:34,fontWeight:"bold",color:c,lineHeight:1}}>{val}</div>
                )}
                <div style={{fontSize:12,color:GRAY,marginTop:4}}>名</div>
              </div>
            ))}
          </div>
        </Card>

        {/* 保存ボタン */}
        {role==="admin"&&(
          <button onClick={hasData?onArchive:undefined} style={{width:"100%",marginBottom:14,background:hasData?`linear-gradient(135deg,${DGREEN},${GREEN})`:"#EBEBEB",border:"none",borderRadius:14,padding:"18px 20px",cursor:hasData?"pointer":"default",display:"flex",alignItems:"center",gap:16,fontFamily:"inherit",boxShadow:hasData?"0 4px 16px rgba(39,174,96,0.35)":"none"}}>
            <span style={{fontSize:36}}>📁</span>
            <div style={{textAlign:"left",flex:1}}>
              <div style={{fontWeight:"bold",fontSize:19,color:hasData?"#fff":"#bbb"}}>事案記録を保存 / リセット</div>
              <div style={{fontSize:15,color:hasData?"rgba(255,255,255,0.85)":"#ccc",marginTop:4}}>{hasData?`${disasters.length}件のデータを保存できます`:"案件が登録されると保存できます"}</div>
            </div>
          </button>
        )}

        {/* ナビグリッド */}
        <Card>
          <div style={{fontSize:16,fontWeight:"bold",color:"#555",marginBottom:12}}>📂 シート一覧</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            {navItems.map(item=>(
              <button key={item.page} onClick={()=>onNav(item.page)} style={{background:"#FAFAFA",border:`1.5px solid ${item.color}30`,borderLeft:`4px solid ${item.color}`,borderRadius:10,padding:"14px 12px",cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"box-shadow 0.15s"}} onMouseOver={e=>e.currentTarget.style.boxShadow="0 2px 10px rgba(0,0,0,0.1)"} onMouseOut={e=>e.currentTarget.style.boxShadow="none"}>
                <div style={{fontSize:28,marginBottom:6}}>{item.icon}</div>
                <div style={{fontSize:16,fontWeight:"bold",color:NAVY,lineHeight:1.3}}>{item.label}</div>
                <div style={{fontSize:14,color:"#999",marginTop:4}}>{item.sub}</div>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── DisasterForm (module-level) ───────────────────────────
function UnitVehiclePicker({value,onChange,vehicles}){
  const sel=parseSelected(value);
  const toggle=(item)=>{const n=sel.includes(item)?sel.filter(x=>x!==item):[...sel,item];onChange(n.join("、"));};
  const stC={"南ア消防署":RED,"甲西分遣所":ORANGE,"八田消防署":DBLUE,"消防本部":DGREEN};
  // 現在のvehiclesオブジェクトから動的に所属・車両リストを生成
  const dynStations={};
  Object.keys(vehicles).filter(k=>!k.startsWith("__")).forEach(k=>{
    const[stn,veh]=k.split("::");
    if(stn&&veh){if(!dynStations[stn])dynStations[stn]=[];dynStations[stn].push(veh);}
  });
  const isD=(vn)=>{
    const key=Object.keys(vehicles).find(k=>k.split("::")[1]===vn&&!k.startsWith("__"));
    return key&&vehicles[key]?.status==="出場中";
  };
  const Chip=({label,active,color,deployed,onPress})=>(
    <button type="button" onClick={onPress} style={{padding:"4px 10px",borderRadius:20,cursor:"pointer",border:`2px solid ${active?color:deployed?color+"66":"#ddd"}`,background:active?color:deployed?color+"15":"#fff",color:active?"#fff":deployed?color:"#555",fontSize:13,fontWeight:active?"bold":600,fontFamily:"inherit",whiteSpace:"nowrap"}}>
      {active?"✓ ":deployed?"🚒 ":""}{label}
    </button>
  );
  return(
    <div>
      <div style={{marginBottom:8}}><div style={{fontSize:13,color:GRAY,fontWeight:"bold",marginBottom:5}}>── 隊 ──</div><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{UNIT_GROUPS.map(o=><Chip key={o} label={o} active={sel.includes(o)} color={DGREEN} deployed={false} onPress={()=>toggle(o)}/>)}</div></div>
      {Object.entries(dynStations).map(([stn,vehs])=>(
        <div key={stn} style={{marginBottom:8}}><div style={{fontSize:13,color:stC[stn]||GRAY,fontWeight:"bold",marginBottom:5}}>── {stn} ──</div><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{vehs.map(veh=><Chip key={veh} label={veh} active={sel.includes(veh)} color={stC[stn]||GRAY} deployed={isD(veh)} onPress={()=>toggle(veh)}/>)}</div></div>
      ))}
      {sel.length>0&&<div style={{marginTop:6,padding:"6px 10px",background:DGREEN+"15",border:`1px solid ${DGREEN}44`,borderRadius:7,fontSize:14}}><span style={{color:DGREEN,fontWeight:"bold"}}>選択中：</span>{sel.join("　")}<button type="button" onClick={()=>onChange("")} style={{marginLeft:8,fontSize:13,color:RED,background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>クリア</button></div>}
    </div>
  );
}

function DisasterForm({form,setForm,editing,onSave,onCancel,vehicles,color,title}){
  const upd=(key)=>(e)=>setForm(prev=>({...prev,[key]:e.target.value}));
  return(
    <Card style={{marginBottom:12,border:`2px solid ${color}`}}>
      <div style={{display:"flex",alignItems:"center",marginBottom:12,paddingBottom:8,borderBottom:`1px solid ${color}33`}}>
        <span style={{fontSize:13,background:editing!==-1?BLUE:color,color:"#fff",padding:"3px 10px",borderRadius:20,fontWeight:"bold"}}>{editing!==-1?"✏️ 案件を編集":"➕ 新規案件を登録"}</span>
      </div>
      <div style={{background:"#FFFBF0",border:`1px dashed ${INPUT_BD}`,borderRadius:8,padding:14,marginBottom:8}}>
        <div style={{fontSize:13,color:YELLOW,fontWeight:"bold",marginBottom:10}}>✏️ 入力欄</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
          <FRow label="発生日"><div style={{display:"flex",gap:4}}><input type="date" value={form.date} onChange={upd("date")} style={{...iSt,flex:1}}/>{form.date&&<button type="button" onClick={()=>setForm(p=>({...p,date:""}))} style={{padding:"4px 8px",borderRadius:6,border:"1px solid #ddd",background:"#fff",cursor:"pointer",fontSize:14,color:GRAY}}>✕</button>}</div></FRow>
          <FRow label="発生時間"><div style={{display:"flex",gap:4}}><input type="time" value={form.time} onChange={upd("time")} style={{...iSt,flex:1}}/>{form.time&&<button type="button" onClick={()=>setForm(p=>({...p,time:""}))} style={{padding:"4px 8px",borderRadius:6,border:"1px solid #ddd",background:"#fff",cursor:"pointer",fontSize:14,color:GRAY}}>✕</button>}</div></FRow>
        </div>
        <FRow label="住所"><input value={form.address} onChange={upd("address")} style={iSt}/></FRow>
        <FRow label="目標物等"><input value={form.landmark} onChange={upd("landmark")} style={iSt}/></FRow>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0 8px"}}>
          <FRow label="災害種別"><select value={form.type} onChange={upd("type")} style={sSt}>{DTYPES.map(o=><option key={o}>{o}</option>)}</select></FRow>
          <FRow label="優先順位"><select value={form.priority} onChange={upd("priority")} style={sSt}>{PRIO.map(o=><option key={o}>{o}</option>)}</select></FRow>
          <FRow label="活動状況"><select value={form.status} onChange={upd("status")} style={sSt}>{ACT_ST.map(o=><option key={o}>{o}</option>)}</select></FRow>
        </div>
        <FRow label="出動隊・車両"><UnitVehiclePicker value={form.vehicles} onChange={v=>setForm(p=>({...p,vehicles:v}))} vehicles={vehicles}/></FRow>
        <FRow label="備考"><input value={form.note} onChange={upd("note")} style={iSt}/></FRow>
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn onClick={onSave} color={color} style={{flex:1}}>保存</Btn>
        <Btn onClick={onCancel} color={GRAY} outline style={{flex:1}}>キャンセル</Btn>
      </div>
    </Card>
  );
}

// ── Disaster Screen ───────────────────────────────────────
function DisasterScreen({disasters,vehicles,onSave,role,onBack,onForceRefresh}){
  const isAdmin=role==="admin",canEdit=role==="admin"||role==="input";
  const blank={date:"",time:"",address:"南アルプス市",landmark:"",type:"火災",status:"活動中",priority:"中",vehicles:"",note:""};
  const[showForm,setShowForm]=useState(false),[editing,setEditing]=useState(null),[form,setForm]=useState(blank);
  const[syncing,setSyncing]=useState(false),[syncMsg,setSyncMsg]=useState(null);
  const openNew=()=>{setForm(blank);setEditing(-1);setShowForm(true);};
  const openEdit=(d,i)=>{setForm({...blank,...d});setEditing(i);setShowForm(true);};
  const save=()=>{const n=[...disasters];if(editing!==-1&&editing!==null)n[editing]=form;else n.push({...form,id:Date.now()});onSave(n);setShowForm(false);};
  const remove=(i)=>{if(!confirm("削除しますか？"))return;const n=[...disasters];n.splice(i,1);onSave(n);};
  const sorted=[...disasters].sort((a,b)=>(`${a.date||"9999"}${a.time||"9999"}`).localeCompare(`${b.date||"9999"}${b.time||"9999"}`));
  const handleRefresh=async()=>{
    setSyncing(true);setSyncMsg(null);
    try{
      const[dis,veh]=await Promise.all([sg("nf-disasters"),sg("nf-vehicles")]);
      if(onForceRefresh)onForceRefresh(dis,veh);
      setSyncMsg({type:"ok",text:`✅ 更新しました（${Array.isArray(dis)?dis.length:0}件）`});
    }catch(e){setSyncMsg({type:"err",text:"⚠️ 更新に失敗しました"});}
    finally{setSyncing(false);setTimeout(()=>setSyncMsg(null),3000);}
  };
  return(
    <div style={{minHeight:"100vh",background:"#F0F4F8",fontFamily:"'Noto Sans JP',sans-serif"}}>
      <AppBar title="📋 災害一覧" onBack={onBack} role={role}/>
      <div style={{padding:14,maxWidth:1100,margin:"0 auto"}}>
        {/* 更新ボタン */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <button onClick={handleRefresh} disabled={syncing} style={{display:"flex",alignItems:"center",gap:8,background:syncing?"#ccc":DBLUE,color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontSize:16,fontWeight:"bold",cursor:syncing?"not-allowed":"pointer",fontFamily:"inherit",boxShadow:"0 2px 6px rgba(0,0,0,0.15)"}}>
            <span style={{display:"inline-block",animation:syncing?"spin 1s linear infinite":"none",fontSize:18}}>🔄</span>
            {syncing?"更新中..":"最新データに更新"}
          </button>
          <button onClick={()=>{
            const win=window.open("","_blank","width=1000,height=700");
            const now=new Date().toLocaleString("ja-JP");
            const rows=sorted.map(d=>`<tr>
              <td>${d.date||"―"}</td><td>${d.time||"―"}</td>
              <td>${d.type||"―"}</td><td>${d.address||"―"} ${d.landmark||""}</td>
              <td>${d.status||"―"}</td><td>${d.priority||"―"}</td>
              <td>${d.vehicles||"―"}</td><td>${d.note||"―"}</td>
            </tr>`).join("");
            win.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/>
            <title>📋 災害一覧 印刷</title>
            <style>body{font-family:'Meiryo',sans-serif;margin:20px;font-size:13px;}
            h1{font-size:18px;color:#1A3A5C;margin-bottom:4px;}
            .meta{font-size:12px;color:#666;margin-bottom:12px;}
            table{width:100%;border-collapse:collapse;}
            th{background:#1A3A5C;color:#fff;padding:8px 10px;text-align:left;font-size:13px;border:1px solid #ccc;}
            td{padding:7px 10px;border:1px solid #ddd;font-size:13px;vertical-align:top;}
            tr:nth-child(even) td{background:#F5F8FA;}
            @media print{body{margin:8px;}}</style></head><body>
            <h1>📋 災害一覧</h1>
            <div class="meta">印刷日時：${now}　／　件数：${disasters.length}件</div>
            <table><thead><tr>
              <th>日付</th><th>時刻</th><th>種別</th><th>場所</th>
              <th>状況</th><th>優先度</th><th>車両</th><th>備考</th>
            </tr></thead><tbody>${rows||"<tr><td colspan='8' style='text-align:center;color:#aaa;padding:20px'>データがありません</td></tr>"}</tbody></table>
            </body></html>`);
            win.document.close();win.focus();setTimeout(()=>win.print(),400);
          }} style={{display:"flex",alignItems:"center",gap:8,background:"#fff",color:NAVY,border:`2px solid ${NAVY}`,borderRadius:10,padding:"10px 20px",fontSize:16,fontWeight:"bold",cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 6px rgba(0,0,0,0.08)"}}>
            <span style={{fontSize:18}}>🖨️</span>印刷
          </button>
          {syncMsg&&<span style={{fontSize:15,fontWeight:"bold",color:syncMsg.type==="ok"?DGREEN:RED,padding:"8px 14px",background:syncMsg.type==="ok"?"#E8F8F5":"#FDEDEC",borderRadius:8,border:`1px solid ${syncMsg.type==="ok"?DGREEN:RED}44`}}>{syncMsg.text}</span>}
        </div>
        {showForm&&canEdit&&editing!==-1&&editing!==null&&<DisasterForm form={form} setForm={setForm} editing={editing} onSave={save} onCancel={()=>setShowForm(false)} vehicles={vehicles} color={BLUE} title="案件を編集"/>}
        {disasters.length===0&&!(showForm&&(editing===-1||editing===null))?(
          <Card style={{textAlign:"center",padding:32,color:"#bbb"}}><div style={{fontSize:38,marginBottom:8}}>📋</div>案件が登録されていません</Card>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(380px,1fr))",gap:10}}>
            {sorted.map((d,i)=>{
              const oi=disasters.indexOf(d),tc=TC[d.type]||GRAY,pc=PC[d.priority]||GRAY,pbg=PBG[d.priority]||"#F8F9FA";
              const vehs=parseSelected(d.vehicles),mq=encodeURIComponent(`${d.address||""}${d.landmark?" "+d.landmark:""}`);
              return(
                <div key={d.id||i} style={{borderRadius:12,background:pbg,border:`2px solid ${pc}`,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
                  <div style={{background:pc,padding:"4px 12px",display:"flex",alignItems:"center",gap:8}}>
                    <span style={{color:"#fff",fontSize:14,fontWeight:"bold"}}>優先度：{d.priority}</span>
                    <span style={{color:"rgba(255,255,255,0.85)",fontSize:13}}>{d.date} {d.time}</span>
                    <span style={{marginLeft:"auto",background:"rgba(255,255,255,0.25)",color:"#fff",fontSize:13,padding:"1px 8px",borderRadius:20,fontWeight:"bold"}}>{d.status}</span>
                  </div>
                  <div style={{padding:"10px 12px",display:"flex",alignItems:"flex-start",gap:8}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",gap:6,marginBottom:6}}><span style={{background:tc,color:"#fff",fontSize:13,padding:"2px 8px",borderRadius:20,fontWeight:"bold"}}>{d.type}</span></div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                        <div style={{fontWeight:"bold",fontSize:16,color:NAVY,flex:1}}>{d.address} {d.landmark}</div>
                        {(d.address||d.landmark)&&<a href={`https://www.google.com/maps/search/?api=1&query=${mq}`} target="_blank" rel="noopener noreferrer" style={{background:"#fff",border:`1.5px solid ${BLUE}`,color:BLUE,borderRadius:6,padding:"3px 8px",fontSize:13,fontWeight:"bold",textDecoration:"none",flexShrink:0}}>🗺️</a>}
                      </div>
                      {d.note&&<div style={{fontSize:14,color:"#666",marginBottom:4}}>{d.note}</div>}
                      {vehs.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4}}>{vehs.map(v=><span key={v} style={{fontSize:13,background:"rgba(31,97,141,0.12)",color:DBLUE,padding:"1px 7px",borderRadius:20,border:`1px solid ${DBLUE}33`}}>🚒 {v}</span>)}</div>}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                      {canEdit&&<Btn onClick={()=>openEdit(d,oi)} color={BLUE} outline small>編集</Btn>}
                      {isAdmin&&<Btn onClick={()=>remove(oi)} color={RED} outline small>削除</Btn>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {showForm&&canEdit&&(editing===-1||editing===null)&&<div style={{marginTop:8}}><DisasterForm form={form} setForm={setForm} editing={-1} onSave={save} onCancel={()=>setShowForm(false)} vehicles={vehicles} color={RED} title="新規案件を登録"/></div>}
        {canEdit&&!showForm&&<Btn onClick={openNew} color={RED} style={{width:"100%",marginTop:8,padding:10}}>＋ 新規案件を追加</Btn>}
      </div>
    </div>
  );
}

// ── VehicleList ───────────────────────────────────────────
function VehicleList({vehicles,canEdit,onUpdate,onUpdateStaff,onAddReq,onUpdateReq,onRemoveReq}){
  const reqRows=vehicles["__req_rows__"]||[];
  return(
    <>
      {Object.entries(STATIONS).map(([stn,vehs])=>(
        <Card key={stn} style={{marginBottom:12}}>
          <div style={{fontWeight:"bold",fontSize:15,color:NAVY,marginBottom:10,paddingBottom:8,borderBottom:"1px solid #eee"}}>▶ {stn}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {vehs.map(veh=>{
              const key=`${stn}::${veh}`,info=vehicles[key]||{status:"待機",staff:["","","",""]},staff=info.staff||["","","",""],cfg=SC[info.status]||SC["待機"];
              return(
                <div key={veh} style={{borderRadius:8,border:"1px solid #E8E8E8",background:"#fff",overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px"}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:cfg.dot,flexShrink:0}}/>
                    <span style={{fontSize:14,color:NAVY,fontWeight:"600",flex:1}}>{veh}</span>
                    {canEdit?(<select value={info.status} onChange={e=>onUpdate(key,"status",e.target.value)} style={{background:cfg.bg,color:cfg.fg,border:`2px solid ${cfg.bd}`,borderRadius:6,padding:"4px 7px",fontSize:13,fontWeight:"bold",fontFamily:"inherit",cursor:"pointer",flexShrink:0,minWidth:74}}>{STATUS_LIST.map(s=><option key={s}>{s}</option>)}</select>):(<span style={{background:cfg.bg,color:cfg.fg,border:`2px solid ${cfg.bd}`,padding:"3px 10px",borderRadius:20,fontSize:13,fontWeight:"bold"}}>{info.status}</span>)}
                  </div>
                  <div style={{padding:"4px 10px 7px",borderTop:"1px solid #F0F0F0",background:"#FAFAFA"}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:3}}>
                      {[0,1,2,3].map(i=>(canEdit?<input key={i} value={staff[i]||""} onChange={e=>onUpdateStaff(key,i,e.target.value)} placeholder={`隊員${i+1}`} style={{border:`1px solid ${staff[i]?INPUT_BD:"#ddd"}`,background:staff[i]?INPUT_BG:"#fff",borderRadius:4,padding:"3px 5px",fontSize:12,fontFamily:"inherit",boxSizing:"border-box",width:"100%"}}/>:<div key={i} style={{fontSize:12,padding:"3px 5px",color:staff[i]?"#333":"#ccc"}}>{staff[i]||""}</div>))}
                    </div>
                    {!canEdit&&staff.filter(s=>s).length===0&&<div style={{fontSize:12,color:"#ccc"}}>—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      <Card style={{marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:10,paddingBottom:8,borderBottom:"1px solid #eee"}}>
          <span style={{fontWeight:"bold",fontSize:15,color:NAVY,flex:1}}>▶ 要請機関</span>
          {canEdit&&<button onClick={onAddReq} style={{background:DGREEN,color:"#fff",border:"none",borderRadius:6,padding:"3px 10px",fontSize:13,fontWeight:"bold",cursor:"pointer",fontFamily:"inherit"}}>＋ 追加</button>}
        </div>
        {reqRows.length===0?(<div style={{textAlign:"center",padding:"12px 0",color:"#bbb",fontSize:14}}>{canEdit?"「＋ 追加」から要請機関を登録":"要請機関なし"}</div>):reqRows.map((row,i)=>{
          const cfg=SC[row.status]||SC["待機"];
          return(
            <div key={i} style={{marginBottom:8,borderRadius:8,border:"1px solid #E8E8E8",background:"#fff",overflow:"hidden"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px"}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:cfg.dot,flexShrink:0}}/>
                {canEdit?<input value={row.name} onChange={e=>onUpdateReq(i,"name",e.target.value)} placeholder="機関名" style={{flex:1,border:`1px solid ${INPUT_BD}`,background:INPUT_BG,borderRadius:4,padding:"4px 7px",fontSize:13,fontFamily:"inherit"}}/>:<span style={{flex:1,fontSize:14,color:NAVY,fontWeight:"600"}}>{row.name||`要請機関 ${i+1}`}</span>}
                {canEdit?<select value={row.status||"待機"} onChange={e=>onUpdateReq(i,"status",e.target.value)} style={{background:cfg.bg,color:cfg.fg,border:`2px solid ${cfg.bd}`,borderRadius:6,padding:"4px 7px",fontSize:13,fontWeight:"bold",fontFamily:"inherit",cursor:"pointer",minWidth:74}}>{STATUS_LIST.map(s=><option key={s}>{s}</option>)}</select>:<span style={{background:cfg.bg,color:cfg.fg,border:`2px solid ${cfg.bd}`,padding:"3px 10px",borderRadius:20,fontSize:13,fontWeight:"bold"}}>{row.status||"待機"}</span>}
                {canEdit&&<button onClick={()=>onRemoveReq(i)} style={{background:"none",border:"none",cursor:"pointer",color:RED,fontSize:17,padding:"0 2px"}}>✕</button>}
              </div>
              {canEdit&&<div style={{padding:"3px 8px 6px",borderTop:"1px solid #F0F0F0",background:"#FAFAFA"}}><input value={row.note||""} onChange={e=>onUpdateReq(i,"note",e.target.value)} placeholder="備考" style={{width:"100%",border:`1px solid ${row.note?INPUT_BD:"#ddd"}`,background:row.note?INPUT_BG:"#fff",borderRadius:4,padding:"4px 7px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/></div>}
              {!canEdit&&row.note&&<div style={{padding:"4px 8px 6px",borderTop:"1px solid #F0F0F0",background:"#FAFAFA",fontSize:13,color:"#666"}}>{row.note}</div>}
            </div>
          );
        })}
      </Card>
    </>
  );
}

// ── Vehicle Screen ────────────────────────────────────────
function VehicleScreen({vehicles,onSaveVehicles,role,onBack,onForceRefresh}){
  const canEdit=role==="admin"||role==="input";
  const[showFull,setShowFull]=useState(false);
  const[syncing,setSyncing]=useState(false);
  const[syncMsg,setSyncMsg]=useState(null);
  const update=(key,field,val)=>onSaveVehicles({...vehicles,[key]:{...vehicles[key],[field]:val}});
  const updateStaff=(key,idx,val)=>{const staff=[...(vehicles[key]?.staff||["","","",""])];staff[idx]=val;onSaveVehicles({...vehicles,[key]:{...vehicles[key],staff}});};
  const addReqRow=()=>{const rows=[...(vehicles["__req_rows__"]||[]),{name:"",status:"待機",note:""}];onSaveVehicles({...vehicles,__req_rows__:rows});};
  const updateReqRow=(i,f,v)=>{const rows=(vehicles["__req_rows__"]||[]).map((r,idx)=>idx===i?{...r,[f]:v}:r);onSaveVehicles({...vehicles,__req_rows__:rows});};
  const removeReqRow=(i)=>{const rows=(vehicles["__req_rows__"]||[]).filter((_,idx)=>idx!==i);onSaveVehicles({...vehicles,__req_rows__:rows});};
  const handleRefresh=async()=>{
    setSyncing(true);setSyncMsg(null);
    try{
      const veh=await sg("nf-vehicles");
      if(onForceRefresh)onForceRefresh(veh);
      setSyncMsg({type:"ok",text:"✅ 更新しました"});
    }catch(e){setSyncMsg({type:"err",text:"⚠️ 更新に失敗しました"});}
    finally{setSyncing(false);setTimeout(()=>setSyncMsg(null),3000);}
  };
  const printVehicles=()=>{
    const win=window.open("","_blank","width=1000,height=700");
    const now=new Date().toLocaleString("ja-JP");
    const rows=Object.entries(vehicles).filter(([k])=>!k.startsWith("__")).map(([k,v])=>{
      const cfg=SC[v.status]||{};
      return `<tr><td>${k}</td><td style="background:${cfg.bg||"#fff"};color:${cfg.fg||"#000"}">${v.status||"―"}</td><td>${(v.staff||[]).filter(Boolean).join(", ")||"―"}</td><td>${v.note||"―"}</td></tr>`;
    }).join("");
    win.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/>
    <title>🚒 指揮動態管理 印刷</title>
    <style>body{font-family:'Meiryo',sans-serif;margin:20px;font-size:13px;}
    h1{font-size:18px;color:#1A3A5C;margin-bottom:4px;}
    .meta{font-size:12px;color:#666;margin-bottom:12px;}
    table{width:100%;border-collapse:collapse;}
    th{background:#1A3A5C;color:#fff;padding:8px 10px;text-align:left;border:1px solid #ccc;}
    td{padding:7px 10px;border:1px solid #ddd;vertical-align:top;}
    tr:nth-child(even) td{background:#F5F8FA;}
    @media print{body{margin:8px;}}</style></head><body>
    <h1>🚒 指揮動態管理</h1>
    <div class="meta">印刷日時：${now}</div>
    <table><thead><tr><th>車両名</th><th>状況</th><th>乗務員</th><th>備考</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`);
    win.document.close();win.focus();setTimeout(()=>win.print(),400);
  };
  const RefreshBar=()=>(
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
      <button onClick={handleRefresh} disabled={syncing} style={{display:"flex",alignItems:"center",gap:8,background:syncing?"#ccc":DBLUE,color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontSize:16,fontWeight:"bold",cursor:syncing?"not-allowed":"pointer",fontFamily:"inherit",boxShadow:"0 2px 6px rgba(0,0,0,0.15)"}}>
        <span style={{display:"inline-block",animation:syncing?"spin 1s linear infinite":"none",fontSize:18}}>🔄</span>
        {syncing?"更新中..":"最新データに更新"}
      </button>
      <button onClick={printVehicles} style={{display:"flex",alignItems:"center",gap:8,background:"#fff",color:NAVY,border:`2px solid ${NAVY}`,borderRadius:10,padding:"10px 20px",fontSize:16,fontWeight:"bold",cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 6px rgba(0,0,0,0.08)"}}>
        <span style={{fontSize:18}}>🖨️</span>印刷
      </button>
      {syncMsg&&<span style={{fontSize:15,fontWeight:"bold",color:syncMsg.type==="ok"?DGREEN:RED,padding:"8px 14px",background:syncMsg.type==="ok"?"#E8F8F5":"#FDEDEC",borderRadius:8,border:`1px solid ${syncMsg.type==="ok"?DGREEN:RED}44`}}>{syncMsg.text}</span>}
    </div>
  );
  if(showFull)return(
    <div style={{minHeight:"100vh",background:"#F0F4F8",fontFamily:"'Noto Sans JP',sans-serif"}}>
      <AppBar title="📋 車両配備状況 全体表示" onBack={()=>setShowFull(false)} role={role}/>
      <div style={{padding:14,maxWidth:1200,margin:"0 auto"}}>
        <RefreshBar/>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>{STATUS_LIST.map(s=>{const cfg=SC[s],cnt=Object.entries(vehicles).filter(([k,v])=>!k.startsWith("__")&&v.status===s).length;return <span key={s} style={{background:cfg.bg,color:cfg.fg,border:`1.5px solid ${cfg.bd}`,fontSize:13,padding:"3px 10px",borderRadius:20,fontWeight:"bold"}}>{s} ({cnt})</span>;})}</div>
        <VehicleList vehicles={vehicles} canEdit={false} onUpdate={()=>{}} onUpdateStaff={()=>{}} onAddReq={()=>{}} onUpdateReq={()=>{}} onRemoveReq={()=>{}}/>
      </div>
    </div>
  );
  return(
    <div style={{minHeight:"100vh",background:"#F0F4F8",fontFamily:"'Noto Sans JP',sans-serif"}}>
      <AppBar title="🚒 指揮動態管理" onBack={onBack} role={role}/>
      <div style={{padding:14,maxWidth:1200,margin:"0 auto"}}>
        <RefreshBar/>
        <Card style={{marginBottom:12}}>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>{STATUS_LIST.map(s=>{const cfg=SC[s];return <span key={s} style={{background:cfg.bg,color:cfg.fg,border:`1.5px solid ${cfg.bd}`,fontSize:13,padding:"3px 10px",borderRadius:20,fontWeight:"bold"}}>{s}</span>;})}</div>
          <div style={{display:"flex",justifyContent:"flex-end"}}><button onClick={()=>setShowFull(true)} style={{background:NAVY,color:"#fff",border:"none",borderRadius:6,padding:"5px 12px",fontSize:14,fontWeight:"bold",cursor:"pointer",fontFamily:"inherit"}}>📋 全体表示</button></div>
        </Card>
        <VehicleList vehicles={vehicles} canEdit={canEdit} onUpdate={update} onUpdateStaff={updateStaff} onAddReq={addReqRow} onUpdateReq={updateReqRow} onRemoveReq={removeReqRow}/>
      </div>
    </div>
  );
}

// ── Generic Sheet Page (cards only) ──────────────────────
function SheetPage({title,icon,color,cols,storageKey,role,onBack}){
  const[rows,setRows]=useState([]);
  const[editing,setEditing]=useState(null);
  const[form,setForm]=useState({});
  const[saved,setSaved]=useState(false);
  const[syncing,setSyncing]=useState(false);
  const[syncMsg,setSyncMsg]=useState(null);
  const canEdit=role==="admin"||role==="input",isAdmin=role==="admin";

  // 初回 + リアルタイム同期
  useEffect(()=>{
    return subscribeStorage([storageKey],(_,r)=>setRows(Array.isArray(r)?r:[]));
  },[storageKey]);

  // 手動更新（DBから強制再取得）
  const handleRefresh=async()=>{
    setSyncing(true);
    setSyncMsg(null);
    try{
      const data=await sg(storageKey);
      setRows(Array.isArray(data)?data:[]);
      setSyncMsg({type:"ok",text:`✅ 更新しました（${Array.isArray(data)?data.length:0}件）`});
    }catch(e){
      setSyncMsg({type:"err",text:"⚠️ 更新に失敗しました"});
    }finally{
      setSyncing(false);
      setTimeout(()=>setSyncMsg(null),3000);
    }
  };

  const handlePrint=()=>{
    const printWin=window.open("","_blank","width=900,height=700");
    const now=new Date().toLocaleString("ja-JP");
    const headerHtml=cols.map(c=>`<th style="background:#1A3A5C;color:#fff;padding:10px 14px;text-align:left;font-size:14px;border:1px solid #ccc;white-space:nowrap">${c.label}</th>`).join("");
    const rowsHtml=rows.map(r=>`<tr>${cols.map(c=>`<td style="padding:9px 12px;border:1px solid #ddd;font-size:14px;vertical-align:top">${r[c.key]||"―"}</td>`).join("")}</tr>`).join("");
    printWin.document.write(`
      <!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/>
      <title>${icon} ${title} 印刷</title>
      <style>
        body{font-family:"Noto Sans JP","Meiryo",sans-serif;margin:20px;color:#222;}
        h1{font-size:20px;margin-bottom:4px;color:#1A3A5C;}
        .meta{font-size:13px;color:#666;margin-bottom:16px;}
        table{width:100%;border-collapse:collapse;margin-top:8px;}
        tr:nth-child(even) td{background:#F5F8FA;}
        @media print{body{margin:10px;}h1{font-size:18px;}}
      </style></head><body>
      <h1>${icon} ${title}</h1>
      <div class="meta">印刷日時：${now}　／　件数：${rows.length}件</div>
      <table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml||"<tr><td colspan='${cols.length}' style='padding:20px;text-align:center;color:#aaa'>データがありません</td></tr>"}</tbody></table>
      </body></html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(()=>{printWin.print();},400);
  };

  const openNew=()=>{setForm(Object.fromEntries(cols.map(c=>[c.key,c.default||""])));setEditing(-1);};
  const openEdit=(ri)=>{setForm({...rows[ri]});setEditing(ri);};
  const saveForm=async()=>{
    const n=[...rows];
    if(editing===-1)n.push({id:Date.now(),...form});
    else n[editing]={...n[editing],...form};
    setRows(n);
    await ss(storageKey,n);
    setEditing(null);
    setSaved(true);
    setTimeout(()=>setSaved(false),2000);
  };
  const removeRow=async(ri)=>{
    if(!confirm("この行を削除しますか？"))return;
    const n=rows.filter((_,i)=>i!==ri);
    setRows(n);
    await ss(storageKey,n);
    if(editing===ri)setEditing(null);
  };
  const updForm=(key,val)=>setForm(prev=>({...prev,[key]:val}));

  return(
    <div style={{minHeight:"100vh",background:"#F0F4F8",fontFamily:"'Noto Sans JP',sans-serif"}}>
      <AppBar title={`${icon} ${title}`} onBack={onBack} role={role}/>
      <div style={{padding:14,maxWidth:900,margin:"0 auto"}}>
        {/* 更新ボタン */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
          <button onClick={handleRefresh} disabled={syncing} style={{display:"flex",alignItems:"center",gap:8,background:syncing?"#ccc":DBLUE,color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontSize:16,fontWeight:"bold",cursor:syncing?"not-allowed":"pointer",fontFamily:"inherit",boxShadow:"0 2px 6px rgba(0,0,0,0.15)",transition:"opacity 0.2s"}}>
            <span style={{display:"inline-block",animation:syncing?"spin 1s linear infinite":"none",fontSize:18}}>🔄</span>
            {syncing?"更新中...":"最新データに更新"}
          </button>
          <button onClick={handlePrint} style={{display:"flex",alignItems:"center",gap:8,background:"#fff",color:NAVY,border:`2px solid ${NAVY}`,borderRadius:10,padding:"10px 20px",fontSize:16,fontWeight:"bold",cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 6px rgba(0,0,0,0.08)"}}>
            <span style={{fontSize:18}}>🖨️</span>印刷
          </button>
          {syncMsg&&<span style={{fontSize:15,fontWeight:"bold",color:syncMsg.type==="ok"?DGREEN:RED,padding:"8px 14px",background:syncMsg.type==="ok"?"#E8F8F5":"#FDEDEC",borderRadius:8,border:`1px solid ${syncMsg.type==="ok"?DGREEN:RED}44`}}>{syncMsg.text}</span>}
        </div>
        {saved&&<div style={{background:DGREEN,color:"#fff",borderRadius:8,padding:"10px 16px",marginBottom:12,fontWeight:"bold",fontSize:15,textAlign:"center"}}>✅ 保存しました</div>}
        {canEdit&&!isAdmin&&editing===null&&<div style={{background:"#FFFBF0",border:`1px solid ${INPUT_BD}`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:14,color:"#7D6608"}}>✏️ 入力欄に記入できます。行の削除は管理者のみ可能です。</div>}

        {/* 編集フォーム（既存行）は上部 */}
        {editing!==null&&editing!==-1&&canEdit&&<GenericForm cols={cols} form={form} onUpdate={updForm} editing={editing} onSave={saveForm} onCancel={()=>setEditing(null)} color={color}/>}

        {/* カード一覧 */}
        {rows.length===0&&editing===null?(
          <Card style={{textAlign:"center",padding:36,color:"#bbb"}}><div style={{fontSize:38,marginBottom:8}}>{icon}</div><div>{canEdit?"下の「＋ 新規入力」からデータを追加してください":"データがありません"}</div></Card>
        ):(
          <>
            <div style={{fontSize:14,color:GRAY,marginBottom:8,fontWeight:"bold"}}>{title}　{rows.length}件</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:8}}>
              {rows.map((row,ri)=>(
                <div key={row.id||ri} style={{background:"#fff",borderRadius:10,borderLeft:`4px solid ${color}`,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",opacity:editing!==null&&editing!==ri?0.5:1,overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",background:color+"14",borderBottom:`1px solid ${color}22`}}>
                    <span style={{fontSize:12,background:color,color:"#fff",padding:"1px 7px",borderRadius:20,fontWeight:"bold",flexShrink:0}}>{ri+1}</span>
                    <span style={{fontWeight:"bold",fontSize:14,color:NAVY,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row[cols[0].key]||"―"}</span>
                    {canEdit&&editing===null&&<Btn onClick={()=>openEdit(ri)} color={BLUE} outline small style={{padding:"2px 8px",fontSize:12}}>編集</Btn>}
                    {isAdmin&&editing===null&&<Btn onClick={()=>removeRow(ri)} color={RED} outline small style={{padding:"2px 8px",fontSize:12}}>削除</Btn>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
                    {cols.slice(1).map((c,ci)=>(
                      <div key={c.key} style={{padding:"5px 10px",borderBottom:"1px solid #F0F0F0",borderRight:ci%2===0?"1px solid #F0F0F0":"none"}}>
                        <div style={{fontSize:11,color:GRAY,marginBottom:1}}>{c.label}</div>
                        <div style={{fontSize:14,color:row[c.key]?"#333":"#ccc",wordBreak:"break-all",lineHeight:1.4}}>{row[c.key]||"―"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 新規入力フォームは末尾 */}
        {editing===-1&&canEdit&&<div style={{marginTop:8}}><GenericForm cols={cols} form={form} onUpdate={updForm} editing={-1} onSave={saveForm} onCancel={()=>setEditing(null)} color={color}/></div>}
        {canEdit&&editing===null&&<Btn onClick={openNew} color={color} style={{width:"100%",marginTop:8,padding:10}}>＋ 新規入力</Btn>}
      </div>
    </div>
  );
}

// ── Links ─────────────────────────────────────────────────
function LinksScreen({onBack,role}){
  const links=[{cat:"気象情報",name:"注意報・警報",url:"https://www.jma.go.jp/bosai/warning/"},{cat:"気象情報",name:"土砂災害警戒情報",url:"https://www.jma.go.jp/bosai/risk/"},{cat:"道路規制",name:"山梨県道路規制情報",url:"https://www.pref.yamanashi.jp/dourokisei/"},{cat:"道路規制",name:"NEXCO中日本",url:"https://www.c-nexco.co.jp/"},{cat:"河川情報",name:"川の防災情報",url:"https://www.river.go.jp/"},{cat:"防災情報",name:"やまなし防災ポータル",url:"https://www.pref.yamanashi.jp/bousai/"},{cat:"地図",name:"Googleマップ（南アルプス市）",url:"https://www.google.com/maps/place/南アルプス市"}];
  const cats=[...new Set(links.map(l=>l.cat))];
  return(<div style={{minHeight:"100vh",background:"#F0F4F8",fontFamily:"'Noto Sans JP',sans-serif"}}><AppBar title="🌐 外部情報リンク" onBack={onBack} role={role}/><div style={{padding:14,maxWidth:560,margin:"0 auto"}}>{cats.map(cat=>(<Card key={cat} style={{marginBottom:12}}><div style={{fontWeight:"bold",fontSize:15,color:NAVY,marginBottom:10}}>🔗 {cat}</div>{links.filter(l=>l.cat===cat).map(l=>(<a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid #f0f0f0",textDecoration:"none",color:BLUE}}><span style={{flex:1,fontSize:16,fontWeight:"500"}}>{l.name}</span><span style={{fontSize:14,color:"#999"}}>→</span></a>))}</Card>))}</div></div>);
}

// ── Settings ──────────────────────────────────────────────
function SettingsScreen({config,onSaveConfig,onBack,showToast,vehicles,onSaveVehicles,disasters,onUpdateDisasters}){
  const[aPw,setAPw]=useState(config.adminPw),[iPw,setIPw]=useState(config.inputPw),[vPw,setVPw]=useState(config.viewerPw);
  const[vis,setVis]=useState({a:false,i:false,v:false}),[qrT,setQrT]=useState(null);
  const[vehTab,setVehTab]=useState(Object.keys(STATIONS)[0]);
  const[editVeh,setEditVeh]=useState(null);
  const[newVehName,setNewVehName]=useState("");
  const savePws=()=>{if(!aPw||!iPw||!vPw){showToast("パスワードをすべて入力してください","error");return;}if(new Set([aPw,iPw,vPw]).size!==3){showToast("3つのパスワードはすべて異なる値にしてください","error");return;}onSaveConfig({adminPw:aPw,inputPw:iPw,viewerPw:vPw});};
  const roles=[{key:"admin",label:"🔑 管理者",token:mkToken("admin",config.adminPw),color:NAVY,bg:"#EBF0F5",desc:"全機能の編集・設定"},{key:"input",label:"✏️ 入力者",token:mkToken("input",config.inputPw),color:DGREEN,bg:"#E8F8F5",desc:"入力欄への記入のみ"},{key:"viewer",label:"👁 閲覧者",token:mkToken("viewer",config.viewerPw),color:GRAY,bg:"#F2F3F4",desc:"閲覧のみ"}];

  // 車両名変更（災害記録の車両名も一括更新）
  const renameVehicle=(stn,oldName,newName)=>{
    if(!newName.trim()||oldName===newName.trim())return;
    const oldKey=`${stn}::${oldName}`;
    const newKey=`${stn}::${newName.trim()}`;
    const next={...vehicles};
    next[newKey]={...next[oldKey]};
    delete next[oldKey];
    onSaveVehicles(next);
    // 災害記録内の車両名も一括置換
    if(onUpdateDisasters){
      const updated=disasters.map(d=>({
        ...d,
        vehicles:(d.vehicles||"").split(/[、,]/).map(v=>v.trim()===oldName?newName.trim():v.trim()).filter(Boolean).join("、")
      }));
      onUpdateDisasters(updated);
    }
    showToast(`「${oldName}」→「${newName.trim()}」に変更しました`);
    setEditVeh(null);
  };

  // 車両追加
  const addVehicle=(stn)=>{
    if(!newVehName.trim()){showToast("車両名を入力してください","error");return;}
    const key=`${stn}::${newVehName.trim()}`;
    if(vehicles[key]){showToast("同じ名前の車両がすでに存在します","error");return;}
    const next={...vehicles,[key]:{status:"待機",staff:["","","",""]}};
    onSaveVehicles(next);
    showToast(`「${newVehName.trim()}」を追加しました`);
    setNewVehName("");
  };

  // 車両削除
  const deleteVehicle=(stn,name)=>{
    if(!confirm(`「${name}」を削除しますか？`))return;
    const next={...vehicles};
    delete next[`${stn}::${name}`];
    onSaveVehicles(next);
    showToast(`「${name}」を削除しました`);
  };

  return(
    <div style={{minHeight:"100vh",background:"#F0F4F8",fontFamily:"'Noto Sans JP',sans-serif"}}>
      <AppBar title="⚙️ 管理設定" onBack={onBack} role="admin"/>
      <div style={{padding:14,maxWidth:760,margin:"0 auto"}}>
        <Card style={{marginBottom:14}}>
          <div style={{fontWeight:"bold",fontSize:15,color:NAVY,marginBottom:12}}>🔐 パスワード設定（3役割）</div>
          <PwField label="🔑 管理者パスワード" value={aPw} onChange={setAPw} show={vis.a} onToggle={()=>setVis({...vis,a:!vis.a})} hint="全機能の編集・設定が可能" color={NAVY}/>
          <PwField label="✏️ 入力者パスワード" value={iPw} onChange={setIPw} show={vis.i} onToggle={()=>setVis({...vis,i:!vis.i})} hint="指定された入力欄のみ記入可能" color={DGREEN}/>
          <PwField label="👁 閲覧者パスワード" value={vPw} onChange={setVPw} show={vis.v} onToggle={()=>setVis({...vis,v:!vis.v})} hint="閲覧のみ（編集不可）" color={GRAY}/>
          <Btn onClick={savePws} style={{width:"100%",padding:10}}>パスワードを更新する</Btn>
        </Card>

        {/* 🚒 車両管理 */}
        <Card style={{marginBottom:14}}>
          <div style={{fontWeight:"bold",fontSize:15,color:NAVY,marginBottom:12}}>🚒 車両管理（追加・名称変更・削除）</div>
          {/* 所属タブ */}
          <div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"wrap"}}>
            {Object.keys(STATIONS).map(stn=>(
              <button key={stn} onClick={()=>{setVehTab(stn);setEditVeh(null);setNewVehName("");}}
                style={{padding:"6px 14px",borderRadius:20,border:`2px solid ${vehTab===stn?NAVY:"#ddd"}`,
                  background:vehTab===stn?NAVY:"#fff",color:vehTab===stn?"#fff":"#555",
                  fontWeight:"bold",fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
                {stn}
              </button>
            ))}
          </div>

          {/* 車両一覧 */}
          <div style={{marginBottom:12}}>
            {Object.entries(vehicles)
              .filter(([k])=>k.startsWith(vehTab+"::"))
              .map(([k,v])=>{
                const name=k.split("::")[1];
                const cfg=SC[v.status]||SC["待機"];
                return(
                  <div key={k} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",
                    background:"#FAFAFA",borderRadius:8,marginBottom:6,border:"1px solid #E8E8E8"}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:cfg.dot,flexShrink:0}}/>
                    {editVeh===k?(
                      <>
                        <input defaultValue={name} id={`veh-edit-${k}`} autoFocus
                          style={{flex:1,border:`2px solid ${NAVY}`,borderRadius:6,padding:"4px 8px",
                            fontSize:15,fontFamily:"inherit",background:"#EBF5FB"}}
                          onKeyDown={e=>{
                            if(e.key==="Enter")renameVehicle(vehTab,name,e.target.value);
                            if(e.key==="Escape")setEditVeh(null);
                          }}/>
                        <Btn onClick={()=>{
                          const el=document.getElementById(`veh-edit-${k}`);
                          if(el)renameVehicle(vehTab,name,el.value);
                        }} color={DGREEN} small>保存</Btn>
                        <Btn onClick={()=>setEditVeh(null)} color={GRAY} outline small>戻る</Btn>
                      </>
                    ):(
                      <>
                        <span style={{flex:1,fontSize:15,fontWeight:"bold",color:NAVY}}>{name}</span>
                        <span style={{fontSize:12,background:cfg.bg,color:cfg.fg,border:`1px solid ${cfg.bd}`,
                          padding:"2px 8px",borderRadius:20}}>{v.status}</span>
                        <Btn onClick={()=>setEditVeh(k)} color={BLUE} outline small>名称変更</Btn>
                        <Btn onClick={()=>deleteVehicle(vehTab,name)} color={RED} outline small>削除</Btn>
                      </>
                    )}
                  </div>
                );
              })}
          </div>

          {/* 車両追加 */}
          <div style={{background:"#F0F9F4",border:`1.5px solid ${DGREEN}44`,borderRadius:10,padding:12}}>
            <div style={{fontSize:13,fontWeight:"bold",color:DGREEN,marginBottom:8}}>➕ 新しい車両を追加（{vehTab}）</div>
            <div style={{display:"flex",gap:8}}>
              <input value={newVehName} onChange={e=>setNewVehName(e.target.value)}
                placeholder="車両名を入力（例：救急６号車）"
                onKeyDown={e=>e.key==="Enter"&&addVehicle(vehTab)}
                style={{flex:1,border:`1.5px solid ${DGREEN}`,borderRadius:8,padding:"8px 12px",
                  fontSize:15,fontFamily:"inherit",background:"#fff",outline:"none"}}/>
              <Btn onClick={()=>addVehicle(vehTab)} color={DGREEN}>追加</Btn>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{fontWeight:"bold",fontSize:15,color:NAVY,marginBottom:12}}>📲 QRコード発行</div>
          <p style={{fontSize:14,color:"#666",marginBottom:14,lineHeight:1.7}}>QRコードをスキャンするとこのアプリに直接接続・自動ログインできます。</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
            {roles.map(r=>(<button key={r.key} onClick={()=>setQrT(qrT===r.key?null:r.key)} style={{background:qrT===r.key?r.bg:"#FAFAFA",border:`2px solid ${qrT===r.key?r.color:"#ddd"}`,borderRadius:10,padding:12,cursor:"pointer",textAlign:"center",fontFamily:"inherit"}}><div style={{fontSize:22,marginBottom:4}}>{r.label.split(" ")[0]}</div><div style={{fontWeight:"bold",color:r.color,fontSize:14}}>{r.label.split(" ").slice(1).join(" ")}</div><div style={{fontSize:12,color:"#888",marginTop:2}}>{r.desc}</div></button>))}
          </div>
          {qrT&&(()=>{const r=roles.find(x=>x.key===qrT);if(!r)return null;return(
            <div style={{background:r.bg,border:`1.5px solid ${r.color}44`,borderRadius:12,padding:16,textAlign:"center"}}>
              <div style={{fontWeight:"bold",fontSize:15,color:r.color,marginBottom:12}}>{r.label} 用QRコード</div>
              <div style={{background:"#fff",borderRadius:10,display:"inline-block",padding:8,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}><QRCanvas data={getQRData(r.token)} size={220}/></div>
              <div style={{fontSize:13,color:"#888",marginTop:12,lineHeight:1.7}}>📱 スキャンするとログイン画面に直接接続します</div>
              <Btn onClick={()=>setQrT(null)} color={GRAY} outline small style={{marginTop:12}}>閉じる</Btn>
            </div>
          );})()} 
        </Card>
      </div>
    </div>
  );
}

// ── Archive Modal ─────────────────────────────────────────
function ArchiveModal({disasters,onSave,onClose}){
  const[name,setName]=useState(""),[doReset,setDoReset]=useState(false);
  const now=new Date();
  const def=`${now.getFullYear()}年${String(now.getMonth()+1).padStart(2,"0")}月${String(now.getDate()).padStart(2,"0")}日　災害対応記録`;
  const counts=DTYPES.reduce((a,t)=>({...a,[t]:disasters.filter(d=>d.type===t).length}),{});
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:440,boxShadow:"0 24px 80px rgba(0,0,0,0.4)",overflow:"hidden"}}>
        <div style={{background:`linear-gradient(135deg,${DGREEN},${GREEN})`,padding:"18px 20px"}}><div style={{color:"#fff",fontWeight:"bold",fontSize:18,marginBottom:2}}>📁 事案記録を保存</div><div style={{color:"rgba(255,255,255,0.8)",fontSize:14}}>現在の全データを名前を付けて保存します</div></div>
        <div style={{padding:20}}>
          <div style={{background:"#F8F9FA",borderRadius:10,padding:12,marginBottom:16}}>
            <div style={{fontSize:13,color:GRAY,fontWeight:"bold",marginBottom:8}}>保存するデータのサマリー</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{[["合計",`${disasters.length}件`,NAVY],["🔴 火災",`${counts["火災"]}件`,RED],["🟠 救助",`${counts["救助"]}件`,ORANGE],["🔵 救急",`${counts["救急"]}件`,BLUE],["⚫ その他",`${counts["その他"]}件`,GRAY]].map(([l,v,c])=>(<div key={l} style={{background:"#fff",border:`1px solid ${c}22`,borderRadius:8,padding:"6px 10px",textAlign:"center",flex:"1 0 auto"}}><div style={{fontSize:12,color:GRAY}}>{l}</div><div style={{fontSize:17,fontWeight:"bold",color:c}}>{v}</div></div>))}</div>
          </div>
          <div style={{marginBottom:16}}><label style={{fontSize:14,color:"#555",display:"block",marginBottom:6,fontWeight:"bold"}}>📝 保存名</label><input value={name} onChange={e=>setName(e.target.value)} placeholder={def} style={{width:"100%",border:"2px solid #ddd",borderRadius:8,padding:"10px 12px",fontSize:16,boxSizing:"border-box",fontFamily:"inherit",outline:"none"}} onFocus={e=>(e.target.style.borderColor=DGREEN)} onBlur={e=>(e.target.style.borderColor="#ddd")}/><div style={{fontSize:13,color:"#aaa",marginTop:4}}>空欄の場合：「{def}」で保存します</div></div>
          <div onClick={()=>setDoReset(!doReset)} style={{background:doReset?"#FEF5E7":"#F8F9FA",border:`2px solid ${doReset?ORANGE:"#E0E0E0"}`,borderRadius:10,padding:14,marginBottom:16,cursor:"pointer"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:20,height:20,borderRadius:5,border:`2px solid ${doReset?ORANGE:"#ccc"}`,background:doReset?ORANGE:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{doReset&&<span style={{color:"#fff",fontSize:16}}>✓</span>}</div><div><div style={{fontWeight:"bold",fontSize:15,color:doReset?ORANGE:NAVY}}>保存後にデータをリセットする</div><div style={{fontSize:13,color:"#888",marginTop:2}}>保存完了後、全シートを初期状態に戻します</div></div></div>
          </div>
          <div style={{display:"flex",gap:10}}><Btn onClick={()=>onSave(name||def,doReset)} color={doReset?ORANGE:DGREEN} style={{flex:1,padding:11}}>{doReset?"📁 保存してリセット":"📁 保存する"}</Btn><Btn onClick={onClose} color={GRAY} outline style={{flex:1,padding:11}}>キャンセル</Btn></div>
        </div>
      </div>
    </div>
  );
}

// ── Reset Progress ────────────────────────────────────────
function ResetProgress({onDone}){
  const[step,setStep]=useState(0);
  const steps=["災害一覧をクリア中...","車両動態をリセット中...","参集データをクリア中...","被害状況をクリア中...","応援状況をクリア中...","✅ 初期化完了！"];
  useEffect(()=>{if(step<steps.length-1){const t=setTimeout(()=>setStep(s=>s+1),420);return()=>clearTimeout(t);}else{setTimeout(onDone,1000);}},[step]);
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000}}><div style={{background:"#fff",borderRadius:14,padding:32,width:"100%",maxWidth:320,textAlign:"center"}}><div style={{fontSize:42,marginBottom:16}}>🔄</div><div style={{fontWeight:"bold",fontSize:18,color:NAVY,marginBottom:20}}>データをリセット中</div>{steps.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",opacity:i<=step?1:0.25,borderBottom:i<steps.length-1?"1px solid #f0f0f0":"none"}}><span style={{fontSize:18,width:22,textAlign:"center"}}>{i<step?"✅":i===step?"⏳":"○"}</span><span style={{fontSize:15,color:i<=step?NAVY:"#ccc",fontWeight:i===step?"bold":"normal"}}>{s}</span></div>))}</div></div>);
}

// ── Archives ──────────────────────────────────────────────
function ArchivesScreen({archives,onDelete,onRestore,onBack,role}){
  const[sel,setSel]=useState(null),[conf,setConf]=useState(null),[restConf,setRestConf]=useState(false);
  const arc=sel?archives.find(a=>a.id===sel):null;
  if(arc){
    const sorted=[...(arc.disasters||[])].sort((a,b)=>(`${a.date||"9999"}${a.time||"9999"}`).localeCompare(`${b.date||"9999"}${b.time||"9999"}`));
    return(
      <div style={{minHeight:"100vh",background:"#F0F4F8",fontFamily:"'Noto Sans JP',sans-serif"}}>
        <AppBar title="📁 保存記録の詳細" onBack={()=>setSel(null)} role={role}/>
        <div style={{padding:14,maxWidth:1100,margin:"0 auto"}}>
          <Card style={{marginBottom:12,border:`2px solid ${DGREEN}44`}}>
            <div style={{fontWeight:"bold",fontSize:18,color:NAVY,marginBottom:4}}>{arc.name}</div>
            <div style={{fontSize:14,color:GRAY,marginBottom:12}}>📅 保存日時：{fmtDT(arc.savedAt)}　📋 案件数：{arc.disasters.length}件</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>{DTYPES.map(t=>(<div key={t} style={{background:TC[t]+"15",border:`1px solid ${TC[t]}33`,borderRadius:8,padding:"8px 4px",textAlign:"center"}}><div style={{fontSize:12,color:GRAY}}>{t}</div><div style={{fontSize:22,fontWeight:"bold",color:TC[t]}}>{arc.disasters.filter(d=>d.type===t).length}</div></div>))}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {role==="admin"&&<><Btn onClick={()=>setRestConf(true)} color={DGREEN} small>📥 この記録を復元</Btn><Btn onClick={()=>setConf(arc.id)} color={RED} outline small>🗑 この記録を削除</Btn></>}
            </div>
          </Card>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(380px,1fr))",gap:10}}>
            {sorted.map((d,i)=>{const tc=TC[d.type]||GRAY,pc=PC[d.priority]||GRAY,pbg=PBG[d.priority]||"#F8F9FA",vehs=parseSelected(d.vehicles),mq=encodeURIComponent(`${d.address||""}${d.landmark?" "+d.landmark:""}`);;return(
              <div key={i} style={{borderRadius:12,background:pbg,border:`2px solid ${pc}`,overflow:"hidden"}}>
                <div style={{background:pc,padding:"4px 12px",display:"flex",alignItems:"center",gap:8}}><span style={{color:"#fff",fontSize:14,fontWeight:"bold"}}>優先度：{d.priority||"―"}</span><span style={{color:"rgba(255,255,255,0.85)",fontSize:13}}>{d.date} {d.time}</span><span style={{marginLeft:"auto",background:"rgba(255,255,255,0.25)",color:"#fff",fontSize:13,padding:"1px 8px",borderRadius:20,fontWeight:"bold"}}>{d.status}</span></div>
                <div style={{padding:"10px 12px"}}>
                  <div style={{display:"flex",gap:6,marginBottom:6}}><span style={{background:tc,color:"#fff",fontSize:13,padding:"2px 8px",borderRadius:20,fontWeight:"bold"}}>{d.type}</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}><div style={{fontWeight:"bold",fontSize:16,color:NAVY,flex:1}}>{d.address} {d.landmark}</div>{(d.address||d.landmark)&&<a href={`https://www.google.com/maps/search/?api=1&query=${mq}`} target="_blank" rel="noopener noreferrer" style={{background:"#fff",border:`1.5px solid ${BLUE}`,color:BLUE,borderRadius:6,padding:"3px 8px",fontSize:13,fontWeight:"bold",textDecoration:"none",flexShrink:0}}>🗺️</a>}</div>
                  {d.note&&<div style={{fontSize:14,color:"#666",marginBottom:4}}>{d.note}</div>}
                  {vehs.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4}}>{vehs.map(v=><span key={v} style={{fontSize:13,background:"rgba(31,97,141,0.12)",color:DBLUE,padding:"1px 7px",borderRadius:20,border:`1px solid ${DBLUE}33`}}>🚒 {v}</span>)}</div>}
                </div>
              </div>
            );})}
          </div>
        </div>
        {restConf&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}><div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:400,overflow:"hidden"}}><div style={{background:`linear-gradient(135deg,${DGREEN},${GREEN})`,padding:"16px 20px"}}><div style={{color:"#fff",fontWeight:"bold",fontSize:18}}>📥 記録を復元しますか？</div></div><div style={{padding:20}}><div style={{background:"#FEF5E7",border:`1px solid ${ORANGE}44`,borderRadius:8,padding:12,marginBottom:16,fontSize:14,color:"#784212"}}>⚠️ 現在のデータが上書きされます。<br/>復元前に現在のデータを保存しておくことをお勧めします。</div><div style={{display:"flex",gap:10}}><Btn onClick={()=>{onRestore(arc);setRestConf(false);setSel(null);}} color={DGREEN} style={{flex:1,padding:10}}>📥 復元する</Btn><Btn onClick={()=>setRestConf(false)} color={GRAY} outline style={{flex:1,padding:10}}>キャンセル</Btn></div></div></div></div>)}
        {conf&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}><div style={{background:"#fff",borderRadius:14,padding:24,width:"100%",maxWidth:380}}><div style={{fontWeight:"bold",fontSize:18,color:NAVY,marginBottom:8}}>記録を削除しますか？</div><div style={{fontSize:15,color:"#555",marginBottom:16}}>「{arc.name}」を完全に削除します。</div><div style={{display:"flex",gap:10}}><Btn onClick={()=>{onDelete(conf);setConf(null);setSel(null);}} color={RED} style={{flex:1,padding:10}}>削除する</Btn><Btn onClick={()=>setConf(null)} color={GRAY} outline style={{flex:1,padding:10}}>キャンセル</Btn></div></div></div>)}
      </div>
    );
  }
  return(
    <div style={{minHeight:"100vh",background:"#F0F4F8",fontFamily:"'Noto Sans JP',sans-serif"}}>
      <AppBar title="📁 保存済み事案記録" onBack={onBack} role={role}/>
      <div style={{padding:14,maxWidth:1100,margin:"0 auto"}}>
        <div style={{fontSize:14,color:GRAY,marginBottom:12}}>保存済み記録 {archives.length} 件（新しい順）</div>
        {archives.length===0?(<Card style={{textAlign:"center",padding:40,color:"#bbb"}}><div style={{fontSize:42,marginBottom:12}}>📁</div><div>保存された記録はありません</div></Card>):(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:10}}>
            {[...archives].reverse().map(a=>{const cnts=DTYPES.reduce((acc,t)=>({...acc,[t]:a.disasters.filter(d=>d.type===t).length}),{});return(
              <Card key={a.id} style={{cursor:"pointer"}} onClick={()=>setSel(a.id)} onMouseOver={e=>(e.currentTarget.style.transform="translateY(-1px)")} onMouseOut={e=>(e.currentTarget.style.transform="none")}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12}}><div style={{fontSize:30,flexShrink:0}}>📁</div><div style={{flex:1}}><div style={{fontWeight:"bold",fontSize:16,color:NAVY,marginBottom:4}}>{a.name}</div><div style={{fontSize:13,color:GRAY,marginBottom:8}}>📅 {fmtDT(a.savedAt)}</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{DTYPES.filter(t=>cnts[t]>0).map(t=>(<span key={t} style={{background:TC[t]+"20",color:TC[t],fontSize:13,padding:"2px 8px",borderRadius:20,fontWeight:"bold",border:`1px solid ${TC[t]}33`}}>{t} {cnts[t]}件</span>))}</div></div><div style={{color:"#ccc",fontSize:22}}>›</div></div>
              </Card>
            );})}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sheet configs ─────────────────────────────────────────
const SHEETS={
  road:   {title:"道路被害状況",icon:"🛣️",color:YELLOW,storageKey:"nf-road",
    cols:[{key:"name",label:"路線名"},{key:"status",label:"通行状況",options:["通行可","通行注意","通行止め","確認中"]},{key:"detail",label:"被害詳細"},{key:"note",label:"備考"}]},
  comm:   {title:"通信状況",icon:"📡",color:ORANGE,storageKey:"nf-comm",
    cols:[{key:"type",label:"手段",options:["固定電話","携帯電話","無線","衛星電話","その他"]},{key:"location",label:"場所",default:"南アルプス市"},{key:"status",label:"不通状況",options:["完全不通","一部不通","通話困難","確認中"]},{key:"note",label:"備考"}]},
  water:  {title:"水利状況",icon:"💧",color:DBLUE,storageKey:"nf-water",
    cols:[{key:"type",label:"種別",options:["消火栓","貯水槽","自然水利","防火水槽"]},{key:"location",label:"場所",default:"南アルプス市"},{key:"detail",label:"状況"},{key:"note",label:"備考"}]},
  tochuu: {title:"参集途上被害",icon:"🚶",color:ORANGE,storageKey:"nf-tochuu",
    cols:[{key:"location",label:"場所",default:"南アルプス市"},{key:"damage",label:"被害状況"},{key:"casualties",label:"傷病者",options:["有","無","不明"]},{key:"request",label:"消防要請",options:["要請","不要","検討中"]},{key:"reporter",label:"報告者"}]},
  staff:  {title:"参集報告",icon:"👥",color:ORANGE,storageKey:"nf-staff",
    cols:[{key:"name",label:"氏名"},{key:"station",label:"所属",options:["南ア署","甲西","八田署","本部"]},{key:"time",label:"参集時刻",type:"time"},{key:"status",label:"状況",options:["参集済","未参集","連絡中","不在"]},{key:"note",label:"備考"}]},
  support:{title:"応援状況",icon:"🤝",color:DGREEN,storageKey:"nf-support",
    cols:[{key:"org",label:"消防本部名"},{key:"arrived",label:"到着時刻",type:"time"},{key:"leader",label:"部隊長"},{key:"num",label:"人員"},{key:"location",label:"活動場所",default:"南アルプス市"},{key:"status",label:"活動状況",options:["待機","移動中","活動中","撤退","完了"]}]},
  kinkyuu:{title:"緊急援助隊",icon:"🆘",color:RED,storageKey:"nf-kinkyuu",
    cols:[{key:"org",label:"消防本部名"},{key:"arrived",label:"到着時刻",type:"time"},{key:"leader",label:"部隊長"},{key:"num",label:"人員"},{key:"location",label:"活動場所",default:"南アルプス市"},{key:"status",label:"活動状況",options:["待機","移動中","活動中","撤退","完了"]}]},
};

// ── App ───────────────────────────────────────────────────
function App(){
  const[loading,setLoading]=useState(true);
  const[role,setRole]=useState(null);
  const[page,setPage]=useState("home");
  const[config,setConfig]=useState({adminPw:"nanami2024",inputPw:"input2024",viewerPw:"view2024"});
  const[disasters,setDisasters]=useState([]);
  const[vehicles,setVehicles]=useState(()=>initVehicles());
  const[archives,setArchives]=useState([]);
  const[dutyCount,setDutyCount]=useState(0);
  const[toast,setToast]=useState({msg:null});
  const[showModal,setShowModal]=useState(false);
  const[resetting,setResetting]=useState(false);
  const[windowWidth,setWindowWidth]=useState(window.innerWidth);
  const pendingToken=useRef(null);

  useEffect(()=>{
    try{const t=new URLSearchParams(window.location.search).get("token");if(t)pendingToken.current=t;}catch{}
  },[]);

  useEffect(()=>{(async()=>{
    const[cfg,dis,veh,arc,dty]=await Promise.all([sg("nf-config"),sg("nf-disasters"),sg("nf-vehicles"),sg("nf-archives"),sg("nf-duty-count")]);
    if(cfg)setConfig(cfg);
    if(dis&&Array.isArray(dis))setDisasters(dis);
    if(veh&&typeof veh==="object")setVehicles(veh);
    if(arc&&Array.isArray(arc))setArchives(arc);
    if(dty!=null)setDutyCount(dty);
    setLoading(false);
  })();},[]);

  useEffect(()=>{if(loading)return;if(pendingToken.current){const t=pendingToken.current;pendingToken.current=null;doLogin(t);try{const u=new URL(window.location.href);u.searchParams.delete("token");window.history.replaceState({},"",u.toString());}catch{}}},[loading]);

  // グローバルリアルタイム同期
  useEffect(()=>{
    if(loading)return;
    return subscribeStorage(["nf-config","nf-disasters","nf-vehicles","nf-archives","nf-duty-count"],(key,value)=>{
      if(key==="nf-config"&&value)setConfig(value);
      if(key==="nf-disasters")setDisasters(Array.isArray(value)?value:[]);
      if(key==="nf-vehicles")setVehicles(value&&typeof value==="object"?value:initVehicles());
      if(key==="nf-archives")setArchives(Array.isArray(value)?value:[]);
      if(key==="nf-duty-count"&&value!=null)setDutyCount(value);
    });
  },[loading]);

  // レスポンシブ
  useEffect(()=>{const h=()=>setWindowWidth(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);

  const isDesktop=windowWidth>=900;
  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast({msg:null}),2800);};

  const doLogin=(val)=>{
    const p=parseToken(val);
    if(p){
      if(p.role==="admin"&&p.pw===config.adminPw){setRole("admin");return true;}
      if(p.role==="input"&&p.pw===config.inputPw){setRole("input");return true;}
      if(p.role==="viewer"&&p.pw===config.viewerPw){setRole("viewer");return true;}
    }
    if(val===config.adminPw){setRole("admin");return true;}
    if(val===config.inputPw){setRole("input");return true;}
    if(val===config.viewerPw){setRole("viewer");return true;}
    return false;
  };

  // 強制リフレッシュ（各画面の更新ボタン用）
  const forceRefreshDisasters=async(dis,veh)=>{
    if(dis&&Array.isArray(dis)){setDisasters(dis);}
    if(veh&&typeof veh==="object"){setVehicles(veh);}
  };
  const forceRefreshHome=async(dis,veh,dty,stf)=>{
    if(dis&&Array.isArray(dis))setDisasters(dis);
    if(veh&&typeof veh==="object")setVehicles(veh);
    if(dty!=null)setDutyCount(dty);
  };

  const saveDisasters=async(d)=>{
    setDisasters(d);await ss("nf-disasters",d);
    setVehicles(prev=>{const s=syncVehicles(d,prev);ss("nf-vehicles",s);return s;});
  };
  const saveVehicles=async(v)=>{setVehicles(v);await ss("nf-vehicles",v);};
  const saveConfig=async(c)=>{setConfig(c);await ss("nf-config",c);showToast("パスワードを更新しました");};
  const saveDutyCount=async(n)=>{setDutyCount(n);await ss("nf-duty-count",n);};

  const handleArchiveSave=async(name,doReset)=>{
    const tableData={};for(const k of TABLE_KEYS)tableData[k]=await sg(k);
    const arc={id:`arc-${Date.now()}`,name,savedAt:new Date().toISOString(),disasters,vehicles,tableData};
    const next=[...archives,arc];setArchives(next);await ss("nf-archives",next);setShowModal(false);
    if(doReset){setResetting(true);await new Promise(r=>setTimeout(r,2400));const fresh=initVehicles();setDisasters([]);setVehicles(fresh);await ss("nf-disasters",[]);await ss("nf-vehicles",fresh);for(const k of TABLE_KEYS)await sd(k);setResetting(false);showToast(`「${name}」を保存し、初期化しました`);}
    else showToast(`「${name}」を保存しました`);
  };

  const deleteArchive=async(id)=>{const n=archives.filter(a=>a.id!==id);setArchives(n);await ss("nf-archives",n);showToast("記録を削除しました");};
  const handleRestore=async(arc)=>{
    try{
      // ① stateを即時反映（画面がすぐ切り替わるように）
      const dis=arc.disasters||[];
      const veh=arc.vehicles||initVehicles();
      setDisasters(dis);
      setVehicles(veh);

      // ② DBへ書き込み
      await ss("nf-disasters",dis);
      await ss("nf-vehicles",veh);

      // ③ シートデータをDBへ書き込み＋state反映
      if(arc.tableData){
        for(const[k,v]of Object.entries(arc.tableData)){
          if(v!=null){await ss(k,v);}
          else{await sd(k);}
        }
      }else{
        // tableDataがない古い保存データの場合は全シートをクリア
        for(const k of TABLE_KEYS)await sd(k);
      }

      // ④ dutyCountも復元
      if(arc.dutyCount!=null){
        setDutyCount(arc.dutyCount);
        await ss("nf-duty-count",arc.dutyCount);
      }

      showToast(`✅「${arc.name}」を復元しました`);
      setPage("disasters");
    }catch(e){
      console.error("[restore] failed:",e);
      showToast("⚠️ 復元に失敗しました。再度お試しください。");
    }
  };

  if(loading)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:NAVY,fontFamily:"'Noto Sans JP',sans-serif"}}><div style={{color:"#fff",textAlign:"center"}}><div style={{fontSize:42,marginBottom:12}}>🚒</div><div style={{fontSize:16,opacity:0.7}}>読み込み中...</div></div></div>);
  if(!role)return <LoginScreen onLogin={doLogin}/>;

  const safePage=role==="viewer"?"disasters":page;
  const back=()=>setPage(role==="viewer"?"disasters":"home");
  const sheet=SHEETS[safePage];

  const content=(
    <>
      <GlobalStyle/>
      {safePage==="home"&&<HomeScreen disasters={disasters} vehicles={vehicles} archives={archives} role={role} onNav={setPage} onLogout={()=>setRole(null)} onArchive={()=>setShowModal(true)} dutyCount={dutyCount} onDutyChange={saveDutyCount} onForceRefresh={forceRefreshHome}/>}
      {safePage==="disasters"&&<DisasterScreen disasters={disasters} vehicles={vehicles} onSave={saveDisasters} role={role} onBack={back} onForceRefresh={forceRefreshDisasters}/>}
      {safePage==="vehicles"&&role!=="viewer"&&<VehicleScreen vehicles={vehicles} onSaveVehicles={saveVehicles} role={role} onBack={back} onForceRefresh={async(veh)=>{if(veh&&typeof veh==="object")setVehicles(veh);}}/>}
      {safePage==="archives"&&role!=="viewer"&&<ArchivesScreen archives={archives} onDelete={deleteArchive} onRestore={handleRestore} onBack={back} role={role}/>}
      {safePage==="links"&&role!=="viewer"&&<LinksScreen role={role} onBack={back}/>}
      {safePage==="settings"&&role==="admin"&&<SettingsScreen config={config} onSaveConfig={saveConfig} onBack={back} showToast={showToast} vehicles={vehicles} onSaveVehicles={saveVehicles} disasters={disasters} onUpdateDisasters={saveDisasters}/>}
      {sheet&&role!=="viewer"&&<SheetPage {...sheet} role={role} onBack={back}/>}
      {showModal&&<ArchiveModal disasters={disasters} onSave={handleArchiveSave} onClose={()=>setShowModal(false)}/>}
      {resetting&&<ResetProgress onDone={()=>setResetting(false)}/>}
      <CloudStatusBadge/>
      <Toast msg={toast.msg} type={toast.type}/>
    </>
  );

  if(isDesktop)return(
    <div style={{display:"flex"}}>
      <DesktopSidebar disasters={disasters} archives={archives} role={role} page={safePage} onNav={setPage} onLogout={()=>setRole(null)} onArchive={()=>setShowModal(true)}/>
      <div style={{marginLeft:260,flex:1,background:"#F0F4F8",minWidth:0}}>{content}</div>
    </div>
  );
  return <div style={{paddingBottom:70}}>{content}<MobileNav role={role} page={safePage} onNav={setPage}/></div>;
}

export default App;
