import { useState, useRef, useEffect } from "react";

// ─── POLYFILL: window.storage → localStorage ─────────────────────────────────
if (typeof window !== 'undefined' && !window.storage) {
  window.storage = {
    get: async (key) => {
      try {
        const val = localStorage.getItem(key);
        return val ? { key, value: val } : null;
      } catch { return null; }
    },
    set: async (key, value) => {
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        return { key, value };
      } catch { return null; }
    },
    delete: async (key) => {
      try { localStorage.removeItem(key); return { key, deleted: true }; } catch { return null; }
    },
    list: async () => {
      try { return { keys: Object.keys(localStorage) }; } catch { return { keys: [] }; }
    }
  };
}



// ═══════════════════════════════════════════════════════════════════════════════
// PALETA + CONSTANTES GLOBALES
// ═══════════════════════════════════════════════════════════════════════════════
const C = {
  tierra:"#3D2B1F", musgo:"#4A5E3A", musgoClaro:"#6B8C52",
  ocre:"#C8852A", ocreClaro:"#E8A94A", hueso:"#F5F0E8",
  crema:"#EDE8DC", gris:"#8A8074", grisFino:"#C4BDB3",
  rojo:"#9B3A2A", rojoBg:"#FEE2E2", azul:"#2E4057",
  blanco:"#FDFAF5", verde:"#166534", verdeBg:"#F0FDF4",
};

const DESTINOS = [
  { id:"avellano",      label:"🌰 Avellano",     desc:"Plantación avellanos (16 há)" },
  { id:"trufera",       label:"🍄 Trufera",       desc:"Plantación trufera (3 há)" },
  { id:"ambas",         label:"🌰🍄 Ambas",        desc:"Proporcional avellano + trufera" },
  { id:"granja",        label:"🏡 Granja",         desc:"Granja Llamas del Sur" },
  { id:"campo_general", label:"⚙️ Campo",         desc:"Campo sin asignación específica" },
];

const CATS_INSUMO   = ["fertilizante","agroquimico","combustible","lubricante","empaques","insumo_trufera","herramienta","otro"];
const CATS_SERVICIO = ["mano_obra","maquinaria","transporte","profesional","arriendo","otro"];
const CATS_INGRESO  = ["venta_cosecha","arriendo_animales","arriendo_terreno","subsidio","proyecto","servicio_granja","otro"];
const TIPO_DOC      = [{id:"factura",label:"Factura"},{id:"boleta",label:"Boleta"},{id:"guia",label:"Guía despacho"},{id:"contrato",label:"Contrato"},{id:"otro",label:"Otro"}];
const MESES         = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const CAT_COLOR_INV = { fertilizante:C.musgo, agroquimico:C.rojo, combustible:C.ocre, empaques:C.azul, lubricante:C.gris, insumo_trufera:C.tierra };

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════════
const fmtM  = m => "$" + Number(m||0).toLocaleString("es-CL");
const fmtMK = m => m>=1000000 ? `$${(m/1000000).toFixed(1)}M` : m>=1000 ? `$${Math.round(m/1000)}k` : fmtM(m);
const hoy   = () => new Date().toISOString().split("T")[0];
const mesAnio = f => f ? f.slice(0,7) : "";
const fmtFecha = f => { if(!f) return "—"; return new Date(f+"T12:00:00").toLocaleDateString("es-CL",{day:"2-digit",month:"short",year:"numeric"}); };
const diasRest = f => { if(!f) return null; return Math.ceil((new Date(f)-new Date())/86400000); };

// ═══════════════════════════════════════════════════════════════════════════════
// BACKEND — GOOGLE SHEETS SYNC
// ═══════════════════════════════════════════════════════════════════════════════
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxrVvVX69qjBNcCUwg55-JZX8huEuJx6-F-MjgrIhu8N1lP54rh13Wk7pnXryv_sfdi7g/exec";

// Lee todos los registros de una tabla desde Google Sheets
async function sheetLeer(tabla) {
  try {
    const res = await fetch(`${SCRIPT_URL}?tabla=${tabla}`);
    const data = await res.json();
    if (data.ok) return data.datos;
    console.error("sheetLeer error:", data.error);
    return null;
  } catch(e) {
    console.error("sheetLeer fetch error:", e);
    return null;
  }
}

// Guarda un registro nuevo en Google Sheets
async function sheetGuardar(tabla, datos) {
  try {
    const res = await fetch(SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ accion:"guardar", tabla, datos })
    });
    const data = await res.json();
    return data.ok ? data.datos : null;
  } catch(e) { console.error("sheetGuardar error:", e); return null; }
}

// Elimina un registro por id en Google Sheets
async function sheetEliminar(tabla, id) {
  try {
    const res = await fetch(SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ accion:"eliminar", tabla, id })
    });
    const data = await res.json();
    return data.ok;
  } catch(e) { console.error("sheetEliminar error:", e); return false; }
}

// Reemplaza todos los registros de una tabla (sync completo)
async function sheetReemplazar(tabla, datos) {
  try {
    const res = await fetch(SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ accion:"reemplazar", tabla, datos })
    });
    const data = await res.json();
    return data.ok;
  } catch(e) { console.error("sheetReemplazar error:", e); return false; }
}

// Hook reutilizable: carga datos desde Sheets con fallback a datos de ejemplo
function useSheetData(tabla, fallback) {
  const [datos, setDatos]       = useState([]);
  const [cargando, setCargando] = useState(true);
  const [online, setOnline]     = useState(true);

  useEffect(() => {
    (async () => {
      const resultado = await sheetLeer(tabla);
      if (resultado !== null) {
        setDatos(resultado.length > 0 ? resultado : fallback);
        setOnline(true);
      } else {
        // Fallback: leer desde storage local
        try {
          const r = await window.storage.get(`${tabla}-local`, true);
          setDatos(r ? JSON.parse(r.value) : fallback);
        } catch { setDatos(fallback); }
        setOnline(false);
      }
      setCargando(false);
    })();
  }, []);

  async function guardar(item, esNuevo) {
    if (esNuevo) {
      const nuevo = { ...item, id: item.id || Date.now() };
      const guardado = await sheetGuardar(tabla, nuevo);
      const nuevos = guardado ? [...datos, guardado] : [...datos, nuevo];
      setDatos(nuevos);
      if (!guardado) guardarLocal(nuevos);
      return nuevos;
    } else {
      const actualizados = datos.map(d => String(d.id) === String(item.id) ? { ...d, ...item } : d);
      setDatos(actualizados);
      await sheetReemplazar(tabla, actualizados);
      return actualizados;
    }
  }

  async function eliminar(id) {
    const nuevos = datos.filter(d => String(d.id) !== String(id));
    setDatos(nuevos);
    await sheetEliminar(tabla, id);
    return nuevos;
  }

  async function guardarLocal(arr) {
    try { await window.storage.set(`${tabla}-local`, JSON.stringify(arr), true); } catch {}
  }

  return { datos, setDatos, cargando, online, guardar, eliminar };
}

// ─── Badge de estado de conexión ─────────────────────────────────────────────
function BadgeSync({online}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:99,background:online?"rgba(74,94,58,0.15)":"rgba(155,58,42,0.15)"}}>
      <div style={{width:6,height:6,borderRadius:"50%",background:online?C.musgoClaro:C.rojo}}/>
      <span style={{fontSize:10,fontWeight:600,color:online?C.musgo:C.rojo}}>{online?"Sheets ✓":"Sin conexión"}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTES COMPARTIDOS
// ═══════════════════════════════════════════════════════════════════════════════
function Pill({label,activo,onClick,colorOn}) {
  return <button onClick={onClick} style={{padding:"7px 13px",borderRadius:99,fontSize:12,fontWeight:600,border:`1.5px solid ${activo?(colorOn||C.musgo):C.grisFino}`,background:activo?(colorOn||C.musgo):"transparent",color:activo?"white":C.gris,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'Source Sans 3',sans-serif",transition:"all 0.15s"}}>{label}</button>;
}

function ModalEliminar({nombre,monto,tipo,onOk,onCancel}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(61,43,31,0.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(3px)"}}>
      <div style={{background:C.blanco,borderRadius:20,padding:28,width:"100%",maxWidth:340,textAlign:"center",boxShadow:"0 24px 64px rgba(0,0,0,0.25)"}}>
        <div style={{fontSize:40,marginBottom:10}}>🗑</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:900,color:C.tierra,marginBottom:6}}>¿Eliminar?</div>
        <div style={{fontSize:14,color:C.gris,marginBottom:4}}><b style={{color:C.tierra}}>{nombre}</b></div>
        {monto && <div style={{fontSize:19,fontWeight:900,color:tipo==="ingreso"?C.verde:C.rojo,fontFamily:"'Playfair Display',serif",marginBottom:18}}>{monto}</div>}
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={{flex:1,padding:"11px",borderRadius:10,background:C.crema,color:C.tierra,border:"none",cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>Cancelar</button>
          <button onClick={onOk} style={{flex:1,padding:"11px",borderRadius:10,background:C.rojo,color:"white",border:"none",fontWeight:700,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>Eliminar</button>
        </div>
      </div>
    </div>
  );
}

function Toast({msg,color}) {
  return <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:color||C.musgo,color:"white",padding:"11px 24px",borderRadius:99,fontSize:13,fontWeight:700,zIndex:400,boxShadow:"0 6px 24px rgba(0,0,0,0.25)",whiteSpace:"nowrap"}}>{msg}</div>;
}

const INP = {width:"100%",padding:"10px 13px",borderRadius:10,fontSize:14,border:`1.5px solid ${C.grisFino}`,background:C.blanco,color:C.tierra,fontFamily:"'Source Sans 3',sans-serif",boxSizing:"border-box"};

// ═══════════════════════════════════════════════════════════════════════════════
// MÓDULO 1 — ESCÁNER
// ═══════════════════════════════════════════════════════════════════════════════
function ZonaCarga({onArchivo}) {
  const ref = useRef(null);
  const [sobre,setSobre] = useState(false);
  function proc(file) {
    if(!file) return;
    const esPDF = file.type==="application/pdf"||file.name?.toLowerCase().endsWith(".pdf");
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = ev.target.result.split(",")[1];
      onArchivo({base64:b64,mediaType:esPDF?"application/pdf":(file.type||"image/jpeg"),esPDF,preview:esPDF?null:ev.target.result,nombre:file.name,tamaño:file.size});
    };
    reader.readAsDataURL(file);
  }
  return (
    <div onDrop={e=>{e.preventDefault();setSobre(false);proc(e.dataTransfer.files[0]);}} onDragOver={e=>{e.preventDefault();setSobre(true);}} onDragLeave={()=>setSobre(false)} onClick={()=>ref.current?.click()}
      style={{border:`2.5px dashed ${sobre?C.musgo:C.grisFino}`,borderRadius:18,padding:"44px 24px",textAlign:"center",cursor:"pointer",background:sobre?"#F0FDF4":C.crema,transition:"all 0.2s"}}>
      <div style={{fontSize:52,marginBottom:14}}>📄</div>
      <div style={{fontSize:16,fontWeight:700,color:C.tierra,marginBottom:6}}>Sube tu boleta, factura o guía</div>
      <div style={{fontSize:13,color:C.gris,marginBottom:16,lineHeight:1.5}}>Foto desde el celular, imagen JPG/PNG<br/>o archivo PDF</div>
      <div style={{display:"inline-block",padding:"10px 22px",borderRadius:10,background:C.musgo,color:"white",fontSize:13,fontWeight:700}}>Elegir archivo</div>
      <input ref={ref} type="file" accept="image/*,application/pdf,.pdf" onChange={e=>proc(e.target.files[0])} style={{display:"none"}}/>
    </div>
  );
}

function PanelAnalisis({archivo,onResultado,onReset}) {
  const [estado,setEstado] = useState("listo");
  const [resultado,setResultado] = useState(null);
  const [errMsg,setErrMsg] = useState("");

  async function analizar() {
    setEstado("analizando"); setErrMsg("");
    try {
      const contenido = archivo.esPDF
        ? {type:"document",source:{type:"base64",media_type:"application/pdf",data:archivo.base64}}
        : {type:"image",source:{type:"base64",media_type:archivo.mediaType,data:archivo.base64}};
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        model:"claude-sonnet-4-20250514",max_tokens:1200,
        messages:[{role:"user",content:[contenido,{type:"text",text:`Eres un asistente contable chileno. Analiza este documento y responde ÚNICAMENTE con JSON válido, sin texto adicional ni backticks.\n{"tipo_documento":"factura|boleta|guia|contrato|otro","numero":null,"fecha":"YYYY-MM-DD o null","proveedor":"nombre emisor","rut_proveedor":null,"monto_neto":número o null,"iva":número o null,"monto_total":número entero,"descripcion_general":"máx 10 palabras","items":[{"descripcion":"","cantidad":null,"unidad":null,"precio_unitario":null,"total":null}],"tipo_gasto":"insumo|servicio","categoria_sugerida":"fertilizante|agroquimico|combustible|lubricante|empaques|insumo_trufera|herramienta|mano_obra|maquinaria|transporte|profesional|arriendo|otro","notas":null}\nSi no puedes leer un campo usa null. monto_total es crítico.`}]}]
      })});
      const data = await res.json();
      if(data.error) throw new Error(data.error.message);
      const txt = data.content?.find(b=>b.type==="text")?.text||"";
      const parsed = JSON.parse(txt.replace(/```json|```/g,"").trim());
      setResultado(parsed); setEstado("ok");
    } catch(e) { setEstado("error"); setErrMsg("No se pudo analizar. Intenta con foto más nítida o ingresa manualmente."); }
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{borderRadius:14,overflow:"hidden",position:"relative"}}>
        {archivo.preview
          ? <img src={archivo.preview} alt="doc" style={{width:"100%",maxHeight:200,objectFit:"contain",background:"#000",display:"block"}}/>
          : <div style={{background:"#FEF3C7",padding:24,textAlign:"center",borderRadius:14}}>
              <div style={{fontSize:48,marginBottom:8}}>📋</div>
              <div style={{fontSize:14,fontWeight:700,color:C.tierra}}>{archivo.nombre}</div>
              <div style={{fontSize:11,color:C.gris,marginTop:4}}>PDF · {Math.round(archivo.tamaño/1024)} KB</div>
            </div>}
        <button onClick={onReset} style={{position:"absolute",top:8,right:8,width:30,height:30,borderRadius:"50%",background:C.rojo,border:"none",color:"white",fontWeight:700,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
      </div>

      {estado==="listo" && <button onClick={analizar} style={{width:"100%",padding:"14px",borderRadius:12,background:C.musgo,color:"white",border:"none",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>🔍 Analizar con IA</button>}

      {estado==="analizando" && <div style={{textAlign:"center",padding:"20px 0"}}><div style={{fontSize:32,marginBottom:10}}>⏳</div><div style={{fontSize:14,fontWeight:700,color:C.musgo}}>Extrayendo datos…</div></div>}

      {estado==="error" && <div><div style={{background:"#FEE2E2",borderRadius:12,padding:16,marginBottom:12}}><div style={{fontSize:13,color:C.rojo,fontWeight:600}}>{errMsg}</div></div><div style={{display:"flex",gap:8}}><button onClick={analizar} style={{flex:1,padding:"11px",borderRadius:10,background:C.musgo,color:"white",border:"none",fontWeight:700,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>Reintentar</button><button onClick={()=>onResultado(null)} style={{flex:1,padding:"11px",borderRadius:10,background:C.crema,color:C.tierra,border:"none",cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>Ingresar manual</button></div></div>}

      {estado==="ok" && resultado && (
        <div>
          <div style={{background:C.verdeBg,border:`1px solid #BBF7D0`,borderRadius:12,padding:14,marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:C.verde,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>✓ Datos extraídos</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 12px"}}>
              {[["Proveedor",resultado.proveedor],["Tipo",resultado.tipo_documento],["N°",resultado.numero],["Fecha",resultado.fecha],["Neto",resultado.monto_neto?fmtM(resultado.monto_neto):null],["IVA",resultado.iva?fmtM(resultado.iva):null]].filter(([,v])=>v).map(([k,v])=>(
                <div key={k}><div style={{fontSize:10,color:C.gris,textTransform:"uppercase",letterSpacing:"0.05em"}}>{k}</div><div style={{fontSize:13,fontWeight:600,color:C.tierra}}>{v}</div></div>
              ))}
              <div style={{gridColumn:"span 2"}}><div style={{fontSize:10,color:C.gris,textTransform:"uppercase",letterSpacing:"0.05em"}}>Total</div><div style={{fontSize:20,fontWeight:900,color:C.tierra,fontFamily:"'Playfair Display',serif"}}>{resultado.monto_total?fmtM(resultado.monto_total):"—"}</div></div>
            </div>
            {resultado.items?.length>0 && <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid #BBF7D0`}}><div style={{fontSize:11,fontWeight:700,color:C.verde,marginBottom:6}}>Ítems ({resultado.items.length})</div>{resultado.items.slice(0,3).map((it,i)=><div key={i} style={{fontSize:12,color:C.tierra,marginBottom:3,display:"flex",justifyContent:"space-between"}}><span>{it.descripcion}{it.cantidad?` · ${it.cantidad} ${it.unidad||""}`:"" }</span>{it.total&&<span style={{fontWeight:700,color:C.musgo}}>{fmtM(it.total)}</span>}</div>)}{resultado.items.length>3&&<div style={{fontSize:11,color:C.gris}}>+{resultado.items.length-3} más</div>}</div>}
          </div>
          <button onClick={()=>onResultado(resultado)} style={{width:"100%",padding:"14px",borderRadius:12,background:C.ocre,color:"white",border:"none",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>Revisar y asignar →</button>
        </div>
      )}
    </div>
  );
}

function PanelAsignacion({archivo,iaData,onGuardar,onVolver}) {
  const [form,setForm] = useState({
    tipo_documento:iaData?.tipo_documento||"factura", numero:iaData?.numero||"",
    fecha:iaData?.fecha||hoy(), proveedor:iaData?.proveedor||"", rut_proveedor:iaData?.rut_proveedor||"",
    monto_neto:String(iaData?.monto_neto||""), iva:String(iaData?.iva||""),
    monto_total:String(iaData?.monto_total||""), descripcion:iaData?.descripcion_general||"",
    tipo_gasto:iaData?.tipo_gasto||"insumo", categoria:iaData?.categoria_sugerida||"otro", destino:"avellano", notas:iaData?.notas||"",
  });
  const s = c => e => setForm(f=>({...f,[c]:e.target.value}));
  const cats = form.tipo_gasto==="insumo"?CATS_INSUMO:CATS_SERVICIO;
  function guardar() {
    if(!form.proveedor||!form.monto_total) return;
    onGuardar({...form,monto_neto:parseInt(form.monto_neto)||null,iva:parseInt(form.iva)||null,monto_total:parseInt(form.monto_total)||0,imagen_preview:archivo?.preview||null,fecha_registro:hoy(),id:Date.now()});
  }
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {archivo?.preview && <div style={{borderRadius:10,overflow:"hidden",maxHeight:70}}><img src={archivo.preview} alt="doc" style={{width:"100%",maxHeight:70,objectFit:"cover"}}/></div>}
      {archivo?.esPDF && <div style={{borderRadius:10,padding:"10px 14px",background:"#FEF3C7",display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:22}}>📋</span><span style={{fontSize:12,color:C.tierra,fontWeight:600}}>{archivo.nombre}</span></div>}

      <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Tipo de documento</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{TIPO_DOC.map(t=><Pill key={t.id} label={t.label} activo={form.tipo_documento===t.id} onClick={()=>setForm(f=>({...f,tipo_documento:t.id}))}/>)}</div></div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{gridColumn:"span 2"}}><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Proveedor *</div><input style={INP} placeholder="Nombre del proveedor" value={form.proveedor} onChange={s("proveedor")}/></div>
        <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>RUT</div><input style={INP} placeholder="12.345.678-9" value={form.rut_proveedor} onChange={s("rut_proveedor")}/></div>
        <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>N° documento</div><input style={INP} placeholder="Opcional" value={form.numero} onChange={s("numero")}/></div>
        <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Fecha</div><input type="date" style={INP} value={form.fecha} onChange={s("fecha")}/></div>
        <div><div style={{fontSize:11,fontWeight:700,color:C.tierra,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Total *</div><input type="number" style={{...INP,fontWeight:700,fontSize:16}} placeholder="Monto total $" value={form.monto_total} onChange={s("monto_total")}/></div>
        <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Neto</div><input type="number" style={INP} placeholder="Monto neto" value={form.monto_neto} onChange={s("monto_neto")}/></div>
        <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>IVA</div><input type="number" style={INP} placeholder="IVA" value={form.iva} onChange={s("iva")}/></div>
      </div>

      <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Descripción</div><input style={INP} placeholder="¿Qué compraste o contrataste?" value={form.descripcion} onChange={s("descripcion")}/></div>

      <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Tipo de gasto</div><div style={{display:"flex",gap:8}}><Pill label="📦 Insumo" activo={form.tipo_gasto==="insumo"} onClick={()=>setForm(f=>({...f,tipo_gasto:"insumo",categoria:"fertilizante"}))}/><Pill label="🔧 Servicio" activo={form.tipo_gasto==="servicio"} onClick={()=>setForm(f=>({...f,tipo_gasto:"servicio",categoria:"mano_obra"}))}/></div></div>

      <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Categoría</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{cats.map(cat=><Pill key={cat} label={cat.replace(/_/g," ")} activo={form.categoria===cat} onClick={()=>setForm(f=>({...f,categoria:cat}))}/>)}</div></div>

      <div><div style={{fontSize:11,fontWeight:700,color:C.tierra,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Asignar a</div><div style={{display:"flex",flexDirection:"column",gap:8}}>{DESTINOS.map(d=><div key={d.id} onClick={()=>setForm(f=>({...f,destino:d.id}))} style={{borderRadius:12,padding:"12px 16px",cursor:"pointer",border:`2px solid ${form.destino===d.id?C.musgo:C.grisFino}`,background:form.destino===d.id?"#F0FDF4":C.crema,display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.15s"}}><div><div style={{fontSize:14,fontWeight:700,color:C.tierra}}>{d.label}</div><div style={{fontSize:11,color:C.gris,marginTop:2}}>{d.desc}</div></div>{form.destino===d.id&&<div style={{width:22,height:22,borderRadius:"50%",background:C.musgo,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:13,fontWeight:700,flexShrink:0}}>✓</div>}</div>)}</div></div>

      <div style={{display:"flex",gap:10,paddingBottom:8}}>
        <button onClick={onVolver} style={{padding:"12px 18px",borderRadius:12,background:C.crema,color:C.tierra,border:"none",cursor:"pointer",fontSize:14,fontFamily:"'Source Sans 3',sans-serif"}}>← Volver</button>
        <button onClick={guardar} disabled={!form.proveedor||!form.monto_total} style={{flex:1,padding:"12px",borderRadius:12,background:form.proveedor&&form.monto_total?C.musgo:C.grisFino,color:"white",border:"none",fontWeight:700,fontSize:15,cursor:form.proveedor&&form.monto_total?"pointer":"not-allowed",fontFamily:"'Source Sans 3',sans-serif"}}>Guardar ✓</button>
      </div>
    </div>
  );
}

function ModuloEscaner({onToast}) {
  const [paso,setPaso]     = useState("inicio");
  const [archivo,setArch]  = useState(null);
  const [iaData,setIaData] = useState(null);
  const [docs,setDocs]     = useState([]);

  useEffect(()=>{ (async()=>{
    const remoto = await sheetLeer("documentos");
    if(remoto&&remoto.length>0) setDocs(remoto.map(d=>({...d,monto_total:Number(d.monto_total)||0})));
  })(); },[]);

  async function handleGuardar(doc){
    const n=[...docs,doc]; setDocs(n);
    await sheetGuardar("documentos",doc);
    onToast("Documento guardado ✓"); setArch(null); setIaData(null); setPaso("historial");
  }
  async function handleEliminar(id){
    const n=docs.filter(d=>d.id!==id); setDocs(n);
    await sheetEliminar("documentos",id);
    onToast("Eliminado",C.rojo);
  }
  function reset(){ setArch(null); setIaData(null); setPaso("inicio"); }

  const totalMonto = docs.reduce((s,d)=>s+(d.monto_total||0),0);
  const porDestino = docs.reduce((a,d)=>{ a[d.destino]=(a[d.destino]||0)+d.monto_total; return a; },{});

  return (
    <div>
      <div style={{background:`linear-gradient(135deg,${C.tierra},${C.azul})`,padding:"22px 20px 18px"}}>
        <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.15em",color:C.ocreClaro,marginBottom:4}}>Llamadministrador v5</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:900,color:"white",lineHeight:1.1}}>Escáner de<br/>Documentos</h1>
          <div style={{textAlign:"right"}}><div style={{fontSize:22,fontWeight:900,color:"white",fontFamily:"'Playfair Display',serif"}}>{fmtMK(totalMonto)}</div><div style={{fontSize:10,color:C.ocreClaro}}>{docs.length} docs</div></div>
        </div>
        {Object.keys(porDestino).length>0 && <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>{Object.entries(porDestino).map(([dest,monto])=><div key={dest} style={{borderRadius:10,padding:"8px 12px",background:"rgba(255,255,255,0.12)",flexShrink:0}}><div style={{fontSize:10,color:C.ocreClaro}}>{{avellano:"🌰",trufera:"🍄",ambas:"🌰🍄",granja:"🏡",campo_general:"⚙️"}[dest]||dest}</div><div style={{fontSize:13,fontWeight:700,color:"white"}}>{fmtMK(monto)}</div></div>)}</div>}
      </div>

      <div style={{display:"flex",background:C.crema,borderBottom:`1px solid ${C.grisFino}`}}>
        {[["inicio","📄 Nuevo"],["historial",`📋 Docs (${docs.length})`]].map(([id,label])=>(
          <button key={id} onClick={()=>{if(id==="inicio")reset();else setPaso(id);}} style={{flex:1,padding:"12px",border:"none",cursor:"pointer",background:(paso===id||(id==="inicio"&&["analisis","asignacion"].includes(paso)))?C.blanco:"transparent",color:(paso===id||(id==="inicio"&&["analisis","asignacion"].includes(paso)))?C.tierra:C.gris,fontWeight:600,fontSize:13,borderBottom:(paso===id||(id==="inicio"&&["analisis","asignacion"].includes(paso)))?`2px solid ${C.musgo}`:"2px solid transparent",fontFamily:"'Source Sans 3',sans-serif"}}>{label}</button>
        ))}
      </div>

      <div style={{padding:"20px 16px 24px"}}>
        {["analisis","asignacion"].includes(paso) && (
          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:18}}>
            {[["analisis","Documento"],["asignacion","Asignación"]].map(([id,label],i)=>(
              <div key={id} style={{display:"flex",alignItems:"center",gap:6}}>
                {i>0&&<div style={{width:24,height:1,background:C.grisFino}}/>}
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:20,height:20,borderRadius:"50%",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",background:paso===id?C.musgo:(paso==="asignacion"&&id==="analisis"?C.musgoClaro:C.grisFino),color:"white"}}>{i+1}</div>
                  <span style={{fontSize:12,fontWeight:600,color:paso===id?C.tierra:C.gris}}>{label}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {paso==="inicio"      && <ZonaCarga onArchivo={a=>{setArch(a);setPaso("analisis");}}/>}
        {paso==="analisis"    && archivo && <PanelAnalisis archivo={archivo} onResultado={r=>{setIaData(r);setPaso("asignacion");}} onReset={reset}/>}
        {paso==="asignacion"  && <PanelAsignacion archivo={archivo} iaData={iaData} onGuardar={handleGuardar} onVolver={()=>setPaso("analisis")}/>}
        {paso==="historial"   && (
          docs.length===0
            ? <div style={{textAlign:"center",padding:"32px 20px",color:C.gris,fontSize:14}}>Aún no hay documentos registrados.</div>
            : <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[...docs].reverse().map(doc=>{
                  const dl=DESTINOS.find(d=>d.id===doc.destino);
                  return <div key={doc.id} style={{borderRadius:14,padding:16,background:C.crema}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                      <div style={{flex:1,minWidth:0}}><div style={{fontSize:14,fontWeight:700,color:C.tierra}}>{doc.proveedor}</div><div style={{fontSize:11,color:C.gris,marginTop:2}}>{doc.tipo_documento?.toUpperCase()} {doc.numero?`N° ${doc.numero}`:""} · {fmtFecha(doc.fecha)}</div></div>
                      <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}><div style={{fontSize:18,fontWeight:900,color:C.tierra,fontFamily:"'Playfair Display',serif"}}>{fmtM(doc.monto_total)}</div><div style={{fontSize:10,color:C.musgo,fontWeight:600,marginTop:2}}>{dl?.label||doc.destino}</div></div>
                    </div>
                    {doc.descripcion&&<div style={{fontSize:12,color:C.gris,marginBottom:8,fontStyle:"italic"}}>{doc.descripcion}</div>}
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <span style={{fontSize:10,padding:"2px 9px",borderRadius:99,background:C.musgo,color:"white",fontWeight:700,textTransform:"uppercase"}}>{doc.categoria?.replace(/_/g," ")}</span>
                      <div style={{flex:1}}/>
                      <button onClick={()=>handleEliminar(doc.id)} style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:`1px solid ${C.rojo}`,color:C.rojo,background:"transparent",cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>Eliminar</button>
                    </div>
                  </div>;
                })}
              </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MÓDULO 2 — FINANZAS
// ═══════════════════════════════════════════════════════════════════════════════
const DATOS_FIN = [
  {id:1,tipo:"gasto",fecha:"2026-05-10",proveedor:"AgroCentro Temuco",descripcion:"Urea 46% — 200 kg",categoria:"fertilizante",destino:"avellano",monto_total:196000,origen:"manual"},
  {id:2,tipo:"gasto",fecha:"2026-05-14",proveedor:"COPEC Padre Las Casas",descripcion:"Diesel 200 L",categoria:"combustible",destino:"ambas",monto_total:230000,origen:"manual"},
  {id:3,tipo:"ingreso",fecha:"2026-05-05",proveedor:"Comercial Frutos Sur",descripcion:"Venta avellana temporada 2025 — saldo final",categoria:"venta_cosecha",destino:"avellano",monto_total:4800000,origen:"manual"},
  {id:4,tipo:"gasto",fecha:"2026-04-22",proveedor:"Joel Huaiquipán",descripcion:"Jornales abril — poda trufera",categoria:"mano_obra",destino:"trufera",monto_total:320000,origen:"manual"},
  {id:5,tipo:"ingreso",fecha:"2026-04-10",proveedor:"Fundación Anímate",descripcion:"Arriendo instalaciones y animales — abril",categoria:"arriendo_animales",destino:"granja",monto_total:400000,origen:"manual"},
];

function ModalMovimiento({item,tipoProp,onGuardar,onCerrar}) {
  const [form,setForm] = useState(item?{tipo:item.tipo,fecha:item.fecha||hoy(),proveedor:item.proveedor||"",descripcion:item.descripcion||"",categoria:item.categoria||"otro",destino:item.destino||"avellano",monto_total:String(item.monto_total||""),monto_neto:String(item.monto_neto||""),iva:String(item.iva||""),numero:item.numero||""}:{tipo:tipoProp||"gasto",fecha:hoy(),proveedor:"",descripcion:"",categoria:tipoProp==="ingreso"?"venta_cosecha":"fertilizante",destino:"avellano",monto_total:"",monto_neto:"",iva:"",numero:""});
  const s = c => e => {
    const v=e.target.value;
    setForm(f=>{
      const n={...f,[c]:v};
      if(c==="monto_neto"&&v){const neto=parseInt(v)||0;n.iva=String(Math.round(neto*0.19));n.monto_total=String(neto+Math.round(neto*0.19));}
      if(c==="tipo"){n.categoria=v==="ingreso"?"venta_cosecha":"fertilizante";}
      return n;
    });
  };
  const cats = form.tipo==="ingreso"?CATS_INGRESO:CATS_GASTO;
  const ok = form.proveedor.trim()&&form.monto_total;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(61,43,31,0.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(3px)"}}>
      <div style={{background:C.blanco,borderRadius:20,padding:24,width:"100%",maxWidth:480,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(61,43,31,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900,color:C.tierra}}>{item?"Editar movimiento":"Nuevo movimiento"}</div>
          <button onClick={onCerrar} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:C.gris}}>✕</button>
        </div>
        {!item && <div style={{display:"flex",gap:8,marginBottom:16}}>{["gasto","ingreso"].map(t=><button key={t} onClick={()=>setForm(f=>({...f,tipo:t,categoria:t==="ingreso"?"venta_cosecha":"fertilizante"}))} style={{flex:1,padding:"11px",borderRadius:12,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif",border:`2px solid ${form.tipo===t?(t==="gasto"?C.rojo:C.musgo):C.grisFino}`,background:form.tipo===t?(t==="gasto"?C.rojoBg:C.verdeBg):"transparent",color:form.tipo===t?(t==="gasto"?C.rojo:C.verde):C.gris}}>{t==="gasto"?"📤 Gasto":"📥 Ingreso"}</button>)}</div>}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>{form.tipo==="ingreso"?"Cliente / Origen":"Proveedor"} *</div><input style={INP} placeholder="Nombre" value={form.proveedor} onChange={s("proveedor")}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Fecha</div><input type="date" style={INP} value={form.fecha} onChange={s("fecha")}/></div>
            <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>N° doc.</div><input style={INP} placeholder="Opcional" value={form.numero} onChange={s("numero")}/></div>
          </div>
          <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Descripción</div><input style={INP} placeholder="¿Qué fue?" value={form.descripcion} onChange={s("descripcion")}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Neto</div><input type="number" style={INP} placeholder="Neto" value={form.monto_neto} onChange={s("monto_neto")}/></div>
            <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>IVA</div><input type="number" style={INP} placeholder="Auto" value={form.iva} onChange={s("iva")}/></div>
            <div><div style={{fontSize:11,fontWeight:700,color:C.tierra,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Total *</div><input type="number" style={{...INP,fontWeight:700}} placeholder="$" value={form.monto_total} onChange={s("monto_total")}/></div>
          </div>
          <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Categoría</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{cats.map(c=><Pill key={c} label={c.replace(/_/g," ")} activo={form.categoria===c} onClick={()=>setForm(f=>({...f,categoria:c}))}/> )}</div></div>
          <div><div style={{fontSize:11,fontWeight:700,color:C.tierra,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Asignar a</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{DESTINOS.map(d=><Pill key={d.id} label={d.label} activo={form.destino===d.id} onClick={()=>setForm(f=>({...f,destino:d.id}))}/> )}</div></div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button onClick={()=>onGuardar({...form,monto_total:parseInt(form.monto_total)||0,monto_neto:parseInt(form.monto_neto)||null,iva:parseInt(form.iva)||null,origen:item?.origen||"manual"})} disabled={!ok} style={{flex:1,padding:"13px",borderRadius:12,background:ok?C.musgo:C.grisFino,color:"white",border:"none",fontWeight:700,fontSize:14,cursor:ok?"pointer":"not-allowed",fontFamily:"'Source Sans 3',sans-serif"}}>{item?"Guardar cambios":"Registrar"}</button>
          <button onClick={onCerrar} style={{padding:"13px 20px",borderRadius:12,background:C.crema,color:C.tierra,border:"none",cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function ModuloFinanzas({onToast}) {
  const { datos:movsPropios, cargando, online, guardar:guardarSheet, eliminar:eliminarSheet } = useSheetData("finanzas", DATOS_FIN);
  const [docsEsc,setDocsEsc] = useState([]);
  const [tab,setTab]         = useState("resumen");
  const [filtroTipo,setFT]   = useState("todos");
  const [filtroDest,setFD]   = useState("todos");
  const [filtroPer,setFP]    = useState("todo");
  const [modalF,setModalF]   = useState(null);
  const [modalD,setModalD]   = useState(null);

  useEffect(()=>{ (async()=>{
    const docs = await sheetLeer("documentos");
    if(docs&&docs.length>0){
      setDocsEsc(docs.filter(d=>d.monto_total>0).map(d=>({
        id:`esc_${d.id}`,tipo:"gasto",fecha:d.fecha||d.fecha_registro,
        proveedor:d.proveedor||"Sin proveedor",descripcion:d.descripcion||"",
        categoria:d.categoria||"otro",destino:d.destino||"campo_general",
        monto_total:Number(d.monto_total)||0,monto_neto:d.monto_neto||null,
        iva:d.iva||null,numero:d.numero||"",origen:"escaner"
      })));
    }
  })(); },[]);

  const movs=[...movsPropios,...docsEsc.filter(e=>!movsPropios.some(p=>String(p.id)===String(e.id)))];

  async function handleGuardar(form){
    if(modalF&&typeof modalF==="object"){
      await guardarSheet({...form,id:modalF.id},false);
      onToast("Actualizado");
    } else {
      await guardarSheet({...form,id:Date.now(),origen:"manual",fecha_registro:hoy()},true);
      onToast(form.tipo==="ingreso"?"Ingreso registrado ✓":"Gasto registrado ✓",form.tipo==="ingreso"?C.musgo:C.rojo);
    }
    setModalF(null);
  }
  async function handleEliminar(){ await eliminarSheet(modalD.id); onToast("Eliminado",C.rojo); setModalD(null); }

  const ahora=new Date();
  const mesAct=`${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,"0")}`;
  const anioAct=String(ahora.getFullYear());
  const mf=movs.filter(m=>filtroTipo==="todos"||m.tipo===filtroTipo).filter(m=>filtroDest==="todos"||m.destino===filtroDest||m.destino==="ambas").filter(m=>{ if(filtroPer==="mes") return mesAnio(m.fecha)===mesAct; if(filtroPer==="anio") return m.fecha?.startsWith(anioAct); return true; }).sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));

  const tI=mf.filter(m=>m.tipo==="ingreso").reduce((s,m)=>s+m.monto_total,0);
  const tG=mf.filter(m=>m.tipo==="gasto").reduce((s,m)=>s+m.monto_total,0);
  const bal=tI-tG;
  const escCount=movs.filter(m=>m.origen==="escaner").length;

  // Gráfico mensual
  const datosGraf=MESES.map((mes,i)=>{ const clave=`${anioAct}-${String(i+1).padStart(2,"0")}`; return {mes,g:movs.filter(m=>m.tipo==="gasto"&&mesAnio(m.fecha)===clave).reduce((s,m)=>s+m.monto_total,0),i:movs.filter(m=>m.tipo==="ingreso"&&mesAnio(m.fecha)===clave).reduce((s,m)=>s+m.monto_total,0)}; });
  const maxG=Math.max(...datosGraf.map(d=>Math.max(d.g,d.i)),1);
  const mesIdx=ahora.getMonth();

  if(cargando) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:300,fontFamily:"'Source Sans 3',sans-serif",color:C.gris}}>Cargando…</div>;

  return (
    <div>
      <div style={{background:`linear-gradient(135deg,${C.musgo},${C.tierra})`,padding:"22px 20px 18px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.15em",color:C.ocreClaro}}>Campo Von Baer · Finanzas</div>
          <BadgeSync online={online}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
          {[[tI,"Ingresos","rgba(255,255,255,0.12)"],[tG,"Gastos","rgba(155,58,42,0.4)"],[bal,"Balance",bal>=0?"rgba(74,94,58,0.5)":"rgba(155,58,42,0.5)"]].map(([v,l,bg])=>(
            <div key={l} style={{borderRadius:12,padding:"12px 14px",background:bg}}>
              <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em",color:"rgba(255,255,255,0.7)",marginBottom:3}}>{l}</div>
              <div style={{fontSize:16,fontWeight:900,color:"white",fontFamily:"'Playfair Display',serif"}}>{fmtMK(v)}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setModalF("ingreso")} style={{flex:1,padding:"10px",borderRadius:10,background:"rgba(255,255,255,0.15)",color:"white",border:"1.5px solid rgba(255,255,255,0.3)",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>+ Ingreso</button>
          <button onClick={()=>setModalF("gasto")} style={{flex:1,padding:"10px",borderRadius:10,background:C.ocre,color:"white",border:"none",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>+ Gasto</button>
        </div>
        {escCount>0 && <div style={{marginTop:10,padding:"8px 12px",borderRadius:10,background:"rgba(255,255,255,0.1)",fontSize:11,color:"rgba(255,255,255,0.8)"}}>📄 {escCount} gasto{escCount>1?"s":""} importado{escCount>1?"s":""} desde el escáner</div>}
      </div>

      <div style={{display:"flex",background:C.crema,borderBottom:`1px solid ${C.grisFino}`}}>
        {[["resumen","📊 Resumen"],["movimientos","📋 Movimientos"]].map(([id,label])=><button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"12px",border:"none",cursor:"pointer",background:tab===id?C.blanco:"transparent",color:tab===id?C.tierra:C.gris,fontWeight:600,fontSize:13,borderBottom:tab===id?`2px solid ${C.musgo}`:"2px solid transparent",fontFamily:"'Source Sans 3',sans-serif"}}>{label}</button>)}
      </div>

      <div style={{padding:"16px 16px 24px"}}>
        <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto",paddingBottom:2}}>
          {[["todo","Todo"],["anio","Este año"],["mes","Este mes"]].map(([id,label])=><Pill key={id} label={label} activo={filtroPer===id} onClick={()=>setFP(id)}/>)}
        </div>

        {tab==="resumen" && (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{borderRadius:14,padding:"16px 14px",background:C.crema}}>
              <div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:14}}>Flujo mensual {anioAct}</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:3,height:80}}>
                {datosGraf.map((d,i)=>(
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                    <div style={{width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",height:70,gap:1}}>
                      {d.i>0&&<div style={{width:"100%",borderRadius:"3px 3px 0 0",background:i===mesIdx?C.musgo:C.musgoClaro,height:`${(d.i/maxG)*65}px`,minHeight:2}}/>}
                      {d.g>0&&<div style={{width:"100%",borderRadius:d.i>0?0:"3px 3px 0 0",background:i===mesIdx?C.rojo:"#C97060",height:`${(d.g/maxG)*65}px`,minHeight:2}}/>}
                      {d.i===0&&d.g===0&&<div style={{width:"100%",height:2,background:C.grisFino,borderRadius:99}}/>}
                    </div>
                    <div style={{fontSize:9,color:i===mesIdx?C.tierra:C.gris,fontWeight:i===mesIdx?700:400}}>{d.mes}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:14,marginTop:10}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,borderRadius:2,background:C.musgoClaro}}/><span style={{fontSize:10,color:C.gris}}>Ingresos</span></div>
                <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,borderRadius:2,background:"#C97060"}}/><span style={{fontSize:10,color:C.gris}}>Gastos</span></div>
              </div>
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Por unidad</div>
              {DESTINOS.map(d=>{ const gi=mf.filter(m=>m.tipo==="ingreso"&&(m.destino===d.id||m.destino==="ambas")).reduce((s,m)=>s+m.monto_total,0); const gg=mf.filter(m=>m.tipo==="gasto"&&(m.destino===d.id||m.destino==="ambas")).reduce((s,m)=>s+m.monto_total,0); if(!gi&&!gg) return null;
                return <div key={d.id} style={{borderRadius:12,padding:"12px 16px",background:C.crema,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.tierra}}>{d.label}</div>
                  <div style={{display:"flex",gap:14,alignItems:"center"}}>
                    {gi>0&&<div style={{textAlign:"right"}}><div style={{fontSize:9,color:C.musgo,textTransform:"uppercase"}}>Ingr.</div><div style={{fontSize:13,fontWeight:700,color:C.verde}}>{fmtMK(gi)}</div></div>}
                    {gg>0&&<div style={{textAlign:"right"}}><div style={{fontSize:9,color:C.rojo,textTransform:"uppercase"}}>Gasto</div><div style={{fontSize:13,fontWeight:700,color:C.rojo}}>{fmtMK(gg)}</div></div>}
                    <div style={{textAlign:"right"}}><div style={{fontSize:9,color:C.gris,textTransform:"uppercase"}}>Balance</div><div style={{fontSize:14,fontWeight:900,color:(gi-gg)>=0?C.verde:C.rojo,fontFamily:"'Playfair Display',serif"}}>{fmtMK(gi-gg)}</div></div>
                  </div>
                </div>;
              })}
            </div>
          </div>
        )}

        {tab==="movimientos" && (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[["todos","Todos"],["ingreso","Ingresos"],["gasto","Gastos"]].map(([id,l])=><Pill key={id} label={l} activo={filtroTipo===id} onClick={()=>setFT(id)}/>)}
              <div style={{width:"100%",height:0}}/>
              {["todos",...DESTINOS.map(d=>d.id)].map(id=><Pill key={id} label={id==="todos"?"Todas":DESTINOS.find(d=>d.id===id)?.label||id} activo={filtroDest===id} onClick={()=>setFD(id)} colorOn={C.ocre}/>)}
            </div>
            <div style={{fontSize:12,color:C.gris}}>{mf.length} movimiento{mf.length!==1?"s":""}</div>
            {mf.length===0
              ? <div style={{textAlign:"center",padding:"32px 20px",color:C.gris,fontSize:14}}>Sin movimientos para este filtro.</div>
              : mf.map(m=>{ const dl=DESTINOS.find(d=>d.id===m.destino); return (
                  <div key={m.id} style={{borderRadius:14,padding:"14px 16px",background:C.crema,borderLeft:`4px solid ${m.tipo==="ingreso"?C.musgoClaro:C.rojo}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                      <div style={{flex:1,minWidth:0,paddingRight:10}}><div style={{fontSize:14,fontWeight:700,color:C.tierra,marginBottom:2}}>{m.proveedor}</div>{m.descripcion&&<div style={{fontSize:12,color:C.gris,marginBottom:3}}>{m.descripcion}</div>}<div style={{fontSize:11,color:C.gris}}>{fmtFecha(m.fecha)}{m.numero?` · N° ${m.numero}`:""}{m.origen==="escaner"&&<span style={{marginLeft:6,fontSize:10,background:C.azul,color:"white",padding:"1px 7px",borderRadius:99,fontWeight:700}}>IA</span>}</div></div>
                      <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:18,fontWeight:900,color:m.tipo==="ingreso"?C.verde:C.rojo,fontFamily:"'Playfair Display',serif"}}>{m.tipo==="ingreso"?"+":"−"}{fmtM(m.monto_total)}</div><div style={{fontSize:10,color:C.gris,marginTop:2}}>{dl?.label||m.destino}</div></div>
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center",marginTop:6}}>
                      <span style={{fontSize:10,padding:"2px 9px",borderRadius:99,fontWeight:700,background:m.tipo==="ingreso"?C.musgo:C.rojo,color:"white",textTransform:"uppercase"}}>{m.categoria?.replace(/_/g," ")}</span>
                      <div style={{flex:1}}/>
                      <button onClick={()=>setModalF(m)} style={{fontSize:11,padding:"4px 12px",borderRadius:8,border:`1px solid ${C.musgo}`,color:C.musgo,background:"transparent",cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif",fontWeight:600}}>Editar</button>
                      <button onClick={()=>setModalD(m)} style={{fontSize:11,padding:"4px 12px",borderRadius:8,border:`1px solid ${C.rojo}`,color:C.rojo,background:"transparent",cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif",fontWeight:600}}>Eliminar</button>
                    </div>
                  </div>
                );
              })
            }
          </div>
        )}
      </div>

      {modalF && <ModalMovimiento item={typeof modalF==="object"?modalF:null} tipoProp={typeof modalF==="string"?modalF:null} onGuardar={handleGuardar} onCerrar={()=>setModalF(null)}/>}
      {modalD && <ModalEliminar nombre={modalD.proveedor} monto={`${modalD.tipo==="ingreso"?"+":"−"}${fmtM(modalD.monto_total)}`} tipo={modalD.tipo} onOk={handleEliminar} onCancel={()=>setModalD(null)}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MÓDULO 3 — INVENTARIO
// ═══════════════════════════════════════════════════════════════════════════════
const DATOS_INV = [
  {id:1,nombre:"Urea 46%",categoria:"fertilizante",plantacion:"avellano",unidad:"kg",stock:320,minimo:100,precio_unitario:980,proveedor:"AgroCentro Temuco",vencimiento:"2027-03-01",descripcion:"Fertilizante nitrogenado base."},
  {id:2,nombre:"Burrito 48 SC",categoria:"agroquimico",plantacion:"avellano",unidad:"L",stock:18,minimo:20,precio_unitario:12500,proveedor:"Agroquímicos del Sur",vencimiento:"2026-11-15",descripcion:"Control Burrito del avellano."},
  {id:3,nombre:"Diesel 200 L",categoria:"combustible",plantacion:"ambas",unidad:"L",stock:340,minimo:100,precio_unitario:1150,proveedor:"COPEC Padre Las Casas",vencimiento:null,descripcion:"Tractores y maquinaria."},
  {id:4,nombre:"Sacos yute 50 kg",categoria:"empaques",plantacion:"avellano",unidad:"un",stock:120,minimo:300,precio_unitario:450,proveedor:"Envases Sur",vencimiento:null,descripcion:"Empaques cosecha avellana."},
  {id:5,nombre:"Micorriza Tuber",categoria:"insumo_trufera",plantacion:"trufera",unidad:"kg",stock:2.5,minimo:1,precio_unitario:85000,proveedor:"Trufas del Sur",vencimiento:"2026-09-01",descripcion:"Inóculo micorrízico."},
];

const FORM_INV_VACIO = {nombre:"",categoria:"fertilizante",plantacion:"avellano",unidad:"kg",stock:"",minimo:"",precio_unitario:"",proveedor:"",vencimiento:"",descripcion:""};

function ModalInventario({item,onGuardar,onCerrar}) {
  const [form,setForm] = useState(item?{nombre:item.nombre||"",categoria:item.categoria||"fertilizante",plantacion:item.plantacion||"avellano",unidad:item.unidad||"kg",stock:String(item.stock||""),minimo:String(item.minimo||""),precio_unitario:String(item.precio_unitario||""),proveedor:item.proveedor||"",vencimiento:item.vencimiento||"",descripcion:item.descripcion||""}:{...FORM_INV_VACIO});
  const s = c => e => setForm(f=>({...f,[c]:e.target.value}));
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(61,43,31,0.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(3px)"}}>
      <div style={{background:C.blanco,borderRadius:20,padding:24,width:"100%",maxWidth:480,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(61,43,31,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900,color:C.tierra}}>{item?"Editar producto":"Nuevo producto"}</div>
          <button onClick={onCerrar} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:C.gris}}>✕</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <input style={INP} placeholder="Nombre del producto *" value={form.nombre} onChange={s("nombre")}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <select style={INP} value={form.categoria} onChange={s("categoria")}>{CATS_INSUMO.map(c=><option key={c} value={c}>{c.replace(/_/g," ")}</option>)}</select>
            <select style={INP} value={form.plantacion} onChange={s("plantacion")}><option value="avellano">🌰 Avellano</option><option value="trufera">🍄 Trufera</option><option value="ambas">Ambas</option></select>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 80px",gap:8}}>
            <input style={INP} type="number" placeholder="Stock actual" value={form.stock} onChange={s("stock")}/>
            <input style={INP} type="number" placeholder="Stock mínimo" value={form.minimo} onChange={s("minimo")}/>
            <select style={INP} value={form.unidad} onChange={s("unidad")}><option value="kg">kg</option><option value="L">L</option><option value="un">un</option><option value="m">m</option></select>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <input style={INP} type="number" placeholder="Precio unitario ($)" value={form.precio_unitario} onChange={s("precio_unitario")}/>
            <input style={INP} placeholder="Proveedor" value={form.proveedor} onChange={s("proveedor")}/>
          </div>
          <div><div style={{fontSize:11,color:C.gris,marginBottom:4}}>Vencimiento (opcional)</div><input type="date" style={INP} value={form.vencimiento} onChange={s("vencimiento")}/></div>
          <textarea style={{...INP,height:64,resize:"vertical"}} placeholder="Descripción y usos" value={form.descripcion} onChange={s("descripcion")}/>
        </div>
        <div style={{display:"flex",gap:10,marginTop:18}}>
          <button onClick={()=>onGuardar({...form,stock:parseFloat(form.stock)||0,minimo:parseFloat(form.minimo)||0,precio_unitario:parseInt(form.precio_unitario)||0})} disabled={!form.nombre.trim()} style={{flex:1,padding:"12px",borderRadius:10,background:form.nombre.trim()?C.musgo:C.grisFino,color:"white",border:"none",fontWeight:700,cursor:form.nombre.trim()?"pointer":"not-allowed",fontSize:14,fontFamily:"'Source Sans 3',sans-serif"}}>{item?"Guardar cambios":"Agregar"}</button>
          <button onClick={onCerrar} style={{padding:"12px 20px",borderRadius:10,background:C.crema,color:C.tierra,border:"none",cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function ModuloInventario({onToast}) {
  const [items,setItems]     = useState([]);
  const [cargando,setCarg]   = useState(true);
  const [filtro,setFiltro]   = useState("todos");
  const [busqueda,setBusq]   = useState("");
  const [modalF,setModalF]   = useState(null);
  const [modalD,setModalD]   = useState(null);

  useEffect(()=>{ (async()=>{
    const remoto = await sheetLeer("inventario");
    setItems(remoto&&remoto.length>0 ? remoto.map(i=>({...i,stock:Number(i.stock)||0,minimo:Number(i.minimo)||0,precio_unitario:Number(i.precio_unitario)||0})) : DATOS_INV);
    setCarg(false);
  })(); },[]);

  async function handleGuardar(form){
    const conId={...form,id:(modalF&&modalF!=="nuevo")?modalF.id:Date.now()};
    let n;
    if(modalF&&modalF!=="nuevo"){n=items.map(i=>i.id===modalF.id?conId:i);onToast("Producto actualizado");await sheetReemplazar("inventario",n);}
    else{n=[...items,conId];onToast("Producto agregado");await sheetGuardar("inventario",conId);}
    setItems(n); setModalF(null);
  }
  async function handleEliminar(){
    const n=items.filter(i=>String(i.id)!==String(modalD.id));
    setItems(n); await sheetEliminar("inventario",modalD.id);
    onToast("Eliminado",C.rojo); setModalD(null);
  }
  }
  function handleEliminar(){ const n=items.filter(i=>i.id!==modalD.id); setItems(n); persistir(n); onToast("Eliminado",C.rojo); setModalD(null); }

  const cats=["todos",...Array.from(new Set(items.map(i=>i.categoria)))];
  const filtrados=items.filter(i=>filtro==="todos"||i.categoria===filtro).filter(i=>!busqueda||i.nombre.toLowerCase().includes(busqueda.toLowerCase())||(i.proveedor||"").toLowerCase().includes(busqueda.toLowerCase()));
  const criticos=items.filter(i=>i.stock<=i.minimo).length;
  const vencen=items.filter(i=>{const d=diasRest(i.vencimiento);return d!==null&&d<60;}).length;
  const valTotal=items.reduce((s,i)=>s+i.stock*i.precio_unitario,0);

  if(cargando) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:300,fontFamily:"'Source Sans 3',sans-serif",color:C.gris}}>Cargando…</div>;

  return (
    <div>
      <div style={{background:`linear-gradient(135deg,${C.tierra},${C.musgo})`,padding:"22px 20px 18px"}}>
        <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.15em",color:C.ocreClaro,marginBottom:4}}>Campo Von Baer · Inventario</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:900,color:"white",lineHeight:1.1}}>Inventario<br/>de Insumos</h1>
          <button onClick={()=>setModalF("nuevo")} style={{background:C.ocre,border:"none",color:"white",fontWeight:700,fontSize:14,padding:"12px 18px",borderRadius:12,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif",whiteSpace:"nowrap"}}>+ Agregar</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {[[criticos,"Stock crítico","productos",criticos>0?"#FCA5A5":"white"],[vencen,"Por vencer","en 60 días",vencen>0?"#FDE68A":"white"],[null,"Valor total",`${fmtMK(valTotal)}`,null]].map(([v,l,sub,col],i)=>(
            <div key={i} style={{borderRadius:12,padding:"12px 14px",background:"rgba(255,255,255,0.12)"}}>
              <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em",color:C.ocreClaro,marginBottom:3}}>{l}</div>
              <div style={{fontSize:i===2?15:22,fontWeight:900,color:col||"white",fontFamily:"'Playfair Display',serif"}}>{i===2?sub:v}</div>
              {i!==2&&<div style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>{sub}</div>}
            </div>
          ))}
        </div>
      </div>

      <div style={{padding:"14px 16px 0"}}>
        <input placeholder="🔍  Buscar producto o proveedor…" value={busqueda} onChange={e=>setBusq(e.target.value)} style={{...INP,marginBottom:10}}/>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
          {cats.map(cat=><Pill key={cat} label={cat==="todos"?"Todos":cat.replace(/_/g," ")} activo={filtro===cat} onClick={()=>setFiltro(cat)}/>)}
        </div>
      </div>

      <div style={{padding:"10px 16px 24px",display:"flex",flexDirection:"column",gap:10}}>
        {filtrados.length===0
          ? <div style={{textAlign:"center",padding:"32px 20px",color:C.gris,fontSize:14}}>Sin resultados.</div>
          : filtrados.map(item=>{
              const critico=item.stock<=item.minimo;
              const pct=Math.min(100,(item.stock/Math.max(item.minimo*3,item.stock))*100);
              const barColor=critico?C.rojo:pct<50?C.ocre:C.musgo;
              const dv=diasRest(item.vencimiento);
              return (
                <div key={item.id} style={{borderRadius:16,padding:18,background:critico?"#FEF0EE":C.crema,border:`2px solid ${critico?C.rojo:"transparent"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div style={{flex:1,minWidth:0,paddingRight:8}}>
                      <div style={{fontSize:14,fontWeight:700,color:C.tierra,marginBottom:2}}>{item.nombre}</div>
                      <div style={{fontSize:11,color:C.gris}}>{item.proveedor||"Sin proveedor"}</div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end",flexShrink:0}}>
                      <span style={{fontSize:10,padding:"2px 9px",borderRadius:99,fontWeight:700,color:"white",background:CAT_COLOR_INV[item.categoria]||C.gris,textTransform:"uppercase"}}>{item.categoria.replace(/_/g," ")}</span>
                      <span style={{fontSize:11,color:C.gris}}>{{avellano:"🌰",trufera:"🍄",ambas:"🌰🍄"}[item.plantacion]||item.plantacion}</span>
                    </div>
                  </div>
                  <div style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.gris,marginBottom:5}}>
                      <span>Stock: <b style={{color:critico?C.rojo:C.tierra,fontSize:14}}>{item.stock} {item.unidad}</b></span>
                      <span>Mín: {item.minimo} {item.unidad}</span>
                    </div>
                    <div style={{width:"100%",height:5,borderRadius:99,background:C.grisFino}}><div style={{height:5,borderRadius:99,width:`${pct}%`,background:barColor,transition:"width 0.4s"}}/></div>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.gris,marginBottom:6}}>
                    <span>{fmtM(item.precio_unitario)}/{item.unidad}</span>
                    <span>Total: <b style={{color:C.tierra}}>{fmtM(item.stock*item.precio_unitario)}</b></span>
                  </div>
                  {critico&&<div style={{marginBottom:6,fontSize:12,fontWeight:700,color:C.rojo}}>⚠ Stock bajo mínimo — reponer</div>}
                  {dv!==null&&dv<60&&<div style={{marginBottom:6,fontSize:12,color:dv<30?C.rojo:C.ocre}}>⏱ Vence {fmtFecha(item.vencimiento)} ({dv}d)</div>}
                  <div style={{display:"flex",gap:8,marginTop:8}}>
                    <button onClick={()=>setModalF(item)} style={{flex:1,padding:"8px",borderRadius:8,border:`1.5px solid ${C.musgo}`,color:C.musgo,background:"transparent",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"'Source Sans 3',sans-serif"}}>✏ Editar</button>
                    <button onClick={()=>setModalD(item)} style={{flex:1,padding:"8px",borderRadius:8,border:`1.5px solid ${C.rojo}`,color:C.rojo,background:"transparent",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"'Source Sans 3',sans-serif"}}>🗑 Eliminar</button>
                  </div>
                </div>
              );
            })
        }
      </div>

      {modalF && <ModalInventario item={modalF==="nuevo"?null:modalF} onGuardar={handleGuardar} onCerrar={()=>setModalF(null)}/>}
      {modalD && <ModalEliminar nombre={modalD.nombre} onOk={handleEliminar} onCancel={()=>setModalD(null)}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MÓDULO 4 — TAREAS
// ═══════════════════════════════════════════════════════════════════════════════
const RESPONSABLES = ["Juaco","Alejandra","Pedro Mansilla","Luis Cayupán","Carlos Antileo","Joel","Equipo"];
const PRIORIDAD_CFG = {
  urgente: { label:"🔴 Urgente", color:C.rojo,   bg:"#FEE2E2" },
  normal:  { label:"🟡 Normal",  color:C.ocre,   bg:"#FEF9C3" },
  baja:    { label:"🟢 Puede esperar", color:C.musgo, bg:C.verdeBg },
};
const ESTADO_CFG = {
  pendiente: { label:"Pendiente", color:C.gris,       bg:C.crema },
  en_curso:  { label:"En curso",  color:C.ocre,       bg:"#FEF9C3" },
  hecha:     { label:"Hecha ✓",   color:C.verde,      bg:C.verdeBg },
};

const DATOS_TAREAS = [
  { id:1, titulo:"Fumigación Burrito — ciclo 25 días", descripcion:"Aplicar Clorpirifos según protocolo. Revisar stock antes.", centro:"avellano", responsable:"Pedro Mansilla", prioridad:"urgente", estado:"pendiente", fecha_limite:"2026-06-07", recurrente:true, dias_ciclo:25, subtareas:[{id:11,texto:"Revisar stock de Burrito 48 SC",hecha:false},{id:12,texto:"Calibrar pulverizador",hecha:true},{id:13,texto:"Aplicar en sector norte",hecha:false}], fecha_creacion:hoy() },
  { id:2, titulo:"Poda de formación — trufera sector A", descripcion:"Poda de ramas bajas para aireación.", centro:"trufera", responsable:"Juaco", prioridad:"normal", estado:"en_curso", fecha_limite:"2026-06-15", recurrente:false, dias_ciclo:null, subtareas:[], fecha_creacion:hoy() },
  { id:3, titulo:"Revisión de riego — avellano sur", descripcion:"Verificar goteros obstruidos en sector sur.", centro:"avellano", responsable:"Luis Cayupán", prioridad:"normal", estado:"pendiente", fecha_limite:"2026-06-10", recurrente:false, dias_ciclo:null, subtareas:[], fecha_creacion:hoy() },
  { id:4, titulo:"Limpieza galpón de maquinaria", descripcion:"Ordenar herramientas y revisar aceites.", centro:"campo_general", responsable:"Carlos Antileo", prioridad:"baja", estado:"pendiente", fecha_limite:"2026-06-20", recurrente:false, dias_ciclo:null, subtareas:[], fecha_creacion:hoy() },
];

const FORM_TAREA_VACIO = { titulo:"", descripcion:"", centro:"avellano", responsable:"Juaco", prioridad:"normal", estado:"pendiente", fecha_limite:"", recurrente:false, dias_ciclo:"", subtareas:[] };

function ModalTarea({item,onGuardar,onCerrar}) {
  const [form,setForm] = useState(item ? {
    titulo:item.titulo||"", descripcion:item.descripcion||"", centro:item.centro||"avellano",
    responsable:item.responsable||"Juaco", prioridad:item.prioridad||"normal",
    estado:item.estado||"pendiente", fecha_limite:item.fecha_limite||"",
    recurrente:item.recurrente||false, dias_ciclo:String(item.dias_ciclo||""),
    subtareas:item.subtareas||[],
  } : {...FORM_TAREA_VACIO});

  const [nuevaSub,setNuevaSub] = useState("");
  const s = c => e => setForm(f=>({...f,[c]:e.target.value}));
  const sb = c => v => setForm(f=>({...f,[c]:v}));

  function agregarSub() {
    if(!nuevaSub.trim()) return;
    setForm(f=>({...f,subtareas:[...f.subtareas,{id:Date.now(),texto:nuevaSub.trim(),hecha:false}]}));
    setNuevaSub("");
  }
  function toggleSub(id) { setForm(f=>({...f,subtareas:f.subtareas.map(s=>s.id===id?{...s,hecha:!s.hecha}:s)})); }
  function elimSub(id)   { setForm(f=>({...f,subtareas:f.subtareas.filter(s=>s.id!==id)})); }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(61,43,31,0.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(3px)"}}>
      <div style={{background:C.blanco,borderRadius:20,padding:24,width:"100%",maxWidth:480,maxHeight:"93vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(61,43,31,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900,color:C.tierra}}>{item?"Editar tarea":"Nueva tarea"}</div>
          <button onClick={onCerrar} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:C.gris}}>✕</button>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {/* Título */}
          <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Título *</div>
            <input style={INP} placeholder="¿Qué hay que hacer?" value={form.titulo} onChange={s("titulo")}/></div>

          {/* Descripción */}
          <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Descripción</div>
            <textarea style={{...INP,height:64,resize:"vertical"}} placeholder="Detalles, instrucciones, contexto..." value={form.descripcion} onChange={s("descripcion")}/></div>

          {/* Centro de costos */}
          <div><div style={{fontSize:11,fontWeight:700,color:C.tierra,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Centro de costos</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {DESTINOS.map(d=><Pill key={d.id} label={d.label} activo={form.centro===d.id} onClick={()=>sb("centro")(d.id)}/>)}
            </div>
          </div>

          {/* Responsable */}
          <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Responsable</div>
            <select style={INP} value={form.responsable} onChange={s("responsable")}>
              {RESPONSABLES.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Fecha límite */}
          <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Fecha límite</div>
            <input type="date" style={INP} value={form.fecha_limite} onChange={s("fecha_limite")}/></div>

          {/* Prioridad */}
          <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Prioridad</div>
            <div style={{display:"flex",gap:8}}>
              {Object.entries(PRIORIDAD_CFG).map(([k,v])=>(
                <button key={k} onClick={()=>sb("prioridad")(k)} style={{flex:1,padding:"9px 6px",borderRadius:10,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif",border:`2px solid ${form.prioridad===k?v.color:C.grisFino}`,background:form.prioridad===k?v.bg:"transparent",color:form.prioridad===k?v.color:C.gris}}>{v.label}</button>
              ))}
            </div>
          </div>

          {/* Estado — solo si se edita */}
          {item && <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Estado</div>
            <div style={{display:"flex",gap:8}}>
              {Object.entries(ESTADO_CFG).map(([k,v])=>(
                <button key={k} onClick={()=>sb("estado")(k)} style={{flex:1,padding:"9px 4px",borderRadius:10,fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif",border:`2px solid ${form.estado===k?v.color:C.grisFino}`,background:form.estado===k?v.bg:"transparent",color:form.estado===k?v.color:C.gris}}>{v.label}</button>
              ))}
            </div>
          </div>}

          {/* Recurrente */}
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:12,background:C.crema,cursor:"pointer"}} onClick={()=>sb("recurrente")(!form.recurrente)}>
            <div style={{width:22,height:22,borderRadius:6,border:`2px solid ${form.recurrente?C.musgo:C.grisFino}`,background:form.recurrente?C.musgo:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {form.recurrente&&<span style={{color:"white",fontSize:14,fontWeight:700}}>✓</span>}
            </div>
            <div><div style={{fontSize:13,fontWeight:700,color:C.tierra}}>Tarea recurrente</div>
              <div style={{fontSize:11,color:C.gris}}>Se repite cada ciertos días</div>
            </div>
          </div>
          {form.recurrente && <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Repetir cada (días)</div>
            <input type="number" style={INP} placeholder="Ej: 25" value={form.dias_ciclo} onChange={s("dias_ciclo")}/></div>}

          {/* Subtareas */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Subtareas ({form.subtareas.length})</div>
            {form.subtareas.map(st=>(
              <div key={st.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <div onClick={()=>toggleSub(st.id)} style={{width:20,height:20,borderRadius:5,border:`2px solid ${st.hecha?C.musgo:C.grisFino}`,background:st.hecha?C.musgo:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
                  {st.hecha&&<span style={{color:"white",fontSize:12,fontWeight:700}}>✓</span>}
                </div>
                <span style={{flex:1,fontSize:13,color:C.tierra,textDecoration:st.hecha?"line-through":"none"}}>{st.texto}</span>
                <button onClick={()=>elimSub(st.id)} style={{background:"none",border:"none",color:C.gris,cursor:"pointer",fontSize:16,padding:"0 4px"}}>×</button>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:6}}>
              <input style={{...INP,flex:1}} placeholder="Agregar paso..." value={nuevaSub} onChange={e=>setNuevaSub(e.target.value)} onKeyDown={e=>e.key==="Enter"&&agregarSub()}/>
              <button onClick={agregarSub} style={{padding:"10px 14px",borderRadius:10,background:C.musgo,color:"white",border:"none",cursor:"pointer",fontWeight:700,fontFamily:"'Source Sans 3',sans-serif"}}>+</button>
            </div>
          </div>
        </div>

        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button onClick={()=>onGuardar({...form,dias_ciclo:parseInt(form.dias_ciclo)||null})} disabled={!form.titulo.trim()}
            style={{flex:1,padding:"13px",borderRadius:12,background:form.titulo.trim()?C.musgo:C.grisFino,color:"white",border:"none",fontWeight:700,fontSize:14,cursor:form.titulo.trim()?"pointer":"not-allowed",fontFamily:"'Source Sans 3',sans-serif"}}>
            {item?"Guardar cambios":"Crear tarea"}
          </button>
          <button onClick={onCerrar} style={{padding:"13px 20px",borderRadius:12,background:C.crema,color:C.tierra,border:"none",cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function ModuloTareas({onToast}) {
  const [tareas,setTareas]   = useState([]);
  const [cargando,setCarg]   = useState(true);
  const [filtroE,setFE]      = useState("activas"); // activas | todas | hecha
  const [filtroC,setFC]      = useState("todos");
  const [modalF,setModalF]   = useState(null);
  const [modalD,setModalD]   = useState(null);
  const [expandido,setExp]   = useState(null);

  useEffect(()=>{ (async()=>{
    const remoto = await sheetLeer("tareas");
    setTareas(remoto&&remoto.length>0 ? remoto.map(t=>({...t,subtareas:typeof t.subtareas==="string"?JSON.parse(t.subtareas||"[]"):t.subtareas||[]})) : DATOS_TAREAS);
    setCarg(false);
  })(); },[]);

  async function syncTareas(n){
    setTareas(n);
    await sheetReemplazar("tareas", n.map(t=>({...t,subtareas:JSON.stringify(t.subtareas||[])})));
  }

  async function handleGuardar(form) {
    const conSub={...form,subtareas:form.subtareas||[]};
    let n;
    if(modalF&&typeof modalF==="object"){ n=tareas.map(t=>t.id===modalF.id?{...t,...conSub}:t); onToast("Tarea actualizada"); }
    else{ n=[...tareas,{...conSub,id:Date.now(),fecha_creacion:hoy()}]; onToast("Tarea creada ✓"); }
    await syncTareas(n); setModalF(null);
  }

  async function avanzarEstado(id) {
    const orden=["pendiente","en_curso","hecha"];
    const n=tareas.map(t=>{ if(t.id!==id) return t; const idx=orden.indexOf(t.estado); const sig=orden[Math.min(idx+1,2)]; return {...t,estado:sig}; });
    const nueva=n.find(t=>t.id===id);
    onToast(ESTADO_CFG[nueva.estado].label, nueva.estado==="hecha"?C.musgo:C.ocre);
    await syncTareas(n);
  }

  async function toggleSubtarea(tareaId,subId) {
    const n=tareas.map(t=>{ if(t.id!==tareaId) return t; return {...t,subtareas:t.subtareas.map(s=>s.id===subId?{...s,hecha:!s.hecha}:s)}; });
    await syncTareas(n);
  }

  async function handleEliminar(){ const n=tareas.filter(t=>t.id!==modalD.id); await syncTareas(n); onToast("Tarea eliminada",C.rojo); setModalD(null); }

  const tf = tareas
    .filter(t=> filtroE==="activas" ? t.estado!=="hecha" : filtroE==="hecha" ? t.estado==="hecha" : true)
    .filter(t=> filtroC==="todos" || t.centro===filtroC)
    .sort((a,b)=>{ const po={urgente:0,normal:1,baja:2}; return (po[a.prioridad]||1)-(po[b.prioridad]||1); });

  const counts = { pendiente:tareas.filter(t=>t.estado==="pendiente").length, en_curso:tareas.filter(t=>t.estado==="en_curso").length, hecha:tareas.filter(t=>t.estado==="hecha").length };
  const urgentes = tareas.filter(t=>t.prioridad==="urgente"&&t.estado!=="hecha").length;

  if(cargando) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:300,fontFamily:"'Source Sans 3',sans-serif",color:C.gris}}>Cargando…</div>;

  return (
    <div>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.azul},${C.tierra})`,padding:"22px 20px 18px"}}>
        <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.15em",color:C.ocreClaro,marginBottom:4}}>Campo Von Baer · Tareas</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:900,color:"white",lineHeight:1.1}}>Tareas<br/>del Campo</h1>
          <button onClick={()=>setModalF("nueva")} style={{background:C.ocre,border:"none",color:"white",fontWeight:700,fontSize:14,padding:"12px 16px",borderRadius:12,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>+ Nueva</button>
        </div>
        {/* KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
          {[["⏳",counts.pendiente,"Pend.","rgba(255,255,255,0.12)"],["▶",counts.en_curso,"Curso","rgba(200,133,42,0.4)"],["✓",counts.hecha,"Hechas","rgba(74,94,58,0.4)"],[urgentes>0?"🔴":"✅",urgentes,urgentes>0?"Urgentes":"Sin urgentes",urgentes>0?"rgba(155,58,42,0.5)":"rgba(74,94,58,0.4)"]].map(([ic,v,l,bg])=>(
            <div key={l} style={{borderRadius:10,padding:"10px 8px",background:bg,textAlign:"center"}}>
              <div style={{fontSize:14,marginBottom:2}}>{ic}</div>
              <div style={{fontSize:18,fontWeight:900,color:"white",fontFamily:"'Playfair Display',serif",lineHeight:1}}>{v}</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.7)",marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div style={{padding:"14px 16px 0"}}>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          {[["activas","Activas"],["todas","Todas"],["hecha","Hechas"]].map(([id,label])=><Pill key={id} label={label} activo={filtroE===id} onClick={()=>setFE(id)}/>)}
        </div>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
          {["todos",...DESTINOS.map(d=>d.id)].map(id=><Pill key={id} label={id==="todos"?"Todos":DESTINOS.find(d=>d.id===id)?.label||id} activo={filtroC===id} onClick={()=>setFC(id)} colorOn={C.azul}/>)}
        </div>
      </div>

      {/* Lista de tareas */}
      <div style={{padding:"10px 16px 24px",display:"flex",flexDirection:"column",gap:10}}>
        {tf.length===0
          ? <div style={{textAlign:"center",padding:"32px 20px",color:C.gris,fontSize:14}}>Sin tareas para este filtro.</div>
          : tf.map(t=>{
              const pr=PRIORIDAD_CFG[t.prioridad]||PRIORIDAD_CFG.normal;
              const est=ESTADO_CFG[t.estado]||ESTADO_CFG.pendiente;
              const dest=DESTINOS.find(d=>d.id===t.centro);
              const subTotal=t.subtareas?.length||0;
              const subHechas=t.subtareas?.filter(s=>s.hecha).length||0;
              const pctSub=subTotal>0?Math.round(subHechas/subTotal*100):null;
              const diasF=diasRest(t.fecha_limite);
              const vencida=diasF!==null&&diasF<0&&t.estado!=="hecha";
              const isExp=expandido===t.id;

              return (
                <div key={t.id} style={{borderRadius:16,background:t.estado==="hecha"?C.verdeBg:C.crema,border:`2px solid ${vencida?C.rojo:t.estado==="hecha"?"#BBF7D0":"transparent"}`,overflow:"hidden"}}>
                  {/* Barra de prioridad */}
                  <div style={{height:3,background:t.estado==="hecha"?C.musgoClaro:pr.color}}/>

                  <div style={{padding:"14px 16px"}}>
                    {/* Fila principal */}
                    <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:8}}>
                      {/* Botón avanzar estado */}
                      <button onClick={()=>avanzarEstado(t.id)} style={{width:28,height:28,borderRadius:"50%",border:`2.5px solid ${est.color}`,background:t.estado==="hecha"?C.musgo:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                        {t.estado==="hecha"&&<span style={{color:"white",fontSize:14,fontWeight:700}}>✓</span>}
                        {t.estado==="en_curso"&&<span style={{color:C.ocre,fontSize:10,fontWeight:700}}>▶</span>}
                      </button>
                      <div style={{flex:1,minWidth:0}} onClick={()=>setExp(isExp?null:t.id)}>
                        <div style={{fontSize:14,fontWeight:700,color:t.estado==="hecha"?C.gris:C.tierra,textDecoration:t.estado==="hecha"?"line-through":"none",marginBottom:3}}>{t.titulo}</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                          <span style={{fontSize:10,padding:"2px 8px",borderRadius:99,fontWeight:700,background:est.bg,color:est.color}}>{est.label}</span>
                          <span style={{fontSize:10,color:C.gris}}>{dest?.label||t.centro}</span>
                          <span style={{fontSize:10,color:C.gris}}>👤 {t.responsable}</span>
                        </div>
                      </div>
                    </div>

                    {/* Fecha + recurrente */}
                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:subTotal>0?8:0}}>
                      {t.fecha_limite&&<span style={{fontSize:11,color:vencida?C.rojo:diasF!==null&&diasF<3?C.ocre:C.gris,fontWeight:vencida?700:400}}>{vencida?"⚠ Venció":"📅"} {fmtFecha(t.fecha_limite)}{!vencida&&diasF!==null&&diasF<=7?` (${diasF}d)`:""}</span>}
                      {t.recurrente&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:99,background:C.crema,color:C.azul,border:`1px solid ${C.grisFino}`,fontWeight:600}}>🔄 c/{t.dias_ciclo}d</span>}
                    </div>

                    {/* Barra de subtareas */}
                    {subTotal>0&&(
                      <div style={{marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.gris,marginBottom:4}}>
                          <span>Subtareas</span><span style={{fontWeight:700,color:C.tierra}}>{subHechas}/{subTotal}</span>
                        </div>
                        <div style={{width:"100%",height:4,borderRadius:99,background:C.grisFino}}>
                          <div style={{height:4,borderRadius:99,width:`${pctSub}%`,background:pctSub===100?C.musgo:C.ocre,transition:"width 0.4s"}}/>
                        </div>
                      </div>
                    )}

                    {/* Subtareas expandidas */}
                    {isExp&&subTotal>0&&(
                      <div style={{marginBottom:10,padding:"10px 12px",borderRadius:10,background:C.blanco}}>
                        {t.subtareas.map(st=>(
                          <div key={st.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}} onClick={()=>toggleSubtarea(t.id,st.id)}>
                            <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${st.hecha?C.musgo:C.grisFino}`,background:st.hecha?C.musgo:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
                              {st.hecha&&<span style={{color:"white",fontSize:11,fontWeight:700}}>✓</span>}
                            </div>
                            <span style={{fontSize:12,color:C.tierra,textDecoration:st.hecha?"line-through":"none",flex:1}}>{st.texto}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Descripción expandida */}
                    {isExp&&t.descripcion&&(
                      <div style={{marginBottom:10,fontSize:12,color:C.gris,fontStyle:"italic",lineHeight:1.5}}>{t.descripcion}</div>
                    )}

                    {/* Acciones */}
                    <div style={{display:"flex",gap:8,marginTop:4}}>
                      <button onClick={()=>setExp(isExp?null:t.id)} style={{flex:1,padding:"7px",borderRadius:8,border:`1px solid ${C.grisFino}`,color:C.gris,background:"transparent",cursor:"pointer",fontSize:11,fontFamily:"'Source Sans 3',sans-serif"}}>
                        {isExp?"▲ Ocultar":"▼ Detalle"}
                      </button>
                      <button onClick={()=>setModalF(t)} style={{flex:1,padding:"7px",borderRadius:8,border:`1px solid ${C.musgo}`,color:C.musgo,background:"transparent",cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"'Source Sans 3',sans-serif"}}>✏ Editar</button>
                      <button onClick={()=>setModalD(t)} style={{flex:1,padding:"7px",borderRadius:8,border:`1px solid ${C.rojo}`,color:C.rojo,background:"transparent",cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"'Source Sans 3',sans-serif"}}>🗑</button>
                    </div>
                  </div>
                </div>
              );
            })
        }
      </div>

      {modalF&&<ModalTarea item={modalF==="nueva"?null:modalF} onGuardar={handleGuardar} onCerrar={()=>setModalF(null)}/>}
      {modalD&&<ModalEliminar nombre={modalD.titulo} onOk={handleEliminar} onCancel={()=>setModalD(null)}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MÓDULO 5 — PERSONAL Y HH
// ═══════════════════════════════════════════════════════════════════════════════
const TRABAJADORES_BASE = [
  { id:"joel",      nombre:"Joel",       tipo:"fijo",    sueldo_base:550000, centro:"granja",        activo:true },
  { id:"abraham",   nombre:"Abraham",    tipo:"fijo",    sueldo_base:520000, centro:"campo_general", activo:true },
  { id:"hernan",    nombre:"Hernán",     tipo:"fijo",    sueldo_base:520000, centro:"campo_general", activo:true },
  { id:"juaco",     nombre:"Juaco",      tipo:"gerente", sueldo_base:700000, centro:"campo_general", activo:true },
  { id:"alejandra", nombre:"Alejandra",  tipo:"gerente", sueldo_base:700000, centro:"granja",        activo:true },
];

const TIPO_PAGO_JORNAL = [
  { id:"dia",  label:"Por día" },
  { id:"hora", label:"Por hora" },
  { id:"kilo", label:"Por kilo" },
];

function mesActualISO() {
  const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`;
}
function nombreMes(iso) {
  if(!iso) return "";
  const [y,m]=iso.split("-");
  return `${MESES[parseInt(m)-1]} ${y}`;
}

// ─── Modal trabajador fijo ────────────────────────────────────────────────────
function ModalTrabajador({item,onGuardar,onCerrar}) {
  const [form,setForm]=useState(item?{nombre:item.nombre,tipo:item.tipo,sueldo_base:String(item.sueldo_base||""),centro:item.centro,activo:item.activo}:{nombre:"",tipo:"fijo",sueldo_base:"",centro:"campo_general",activo:true});
  const s=c=>e=>setForm(f=>({...f,[c]:e.target.value}));
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(61,43,31,0.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(3px)"}}>
      <div style={{background:C.blanco,borderRadius:20,padding:24,width:"100%",maxWidth:440,boxShadow:"0 24px 64px rgba(61,43,31,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900,color:C.tierra}}>{item?"Editar trabajador":"Nuevo trabajador"}</div>
          <button onClick={onCerrar} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:C.gris}}>✕</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Nombre *</div>
            <input style={INP} placeholder="Nombre completo" value={form.nombre} onChange={s("nombre")}/></div>
          <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Tipo</div>
            <div style={{display:"flex",gap:8}}>
              {[["fijo","Fijo"],["gerente","Gerente (70/30)"]].map(([k,l])=>(
                <button key={k} onClick={()=>setForm(f=>({...f,tipo:k}))} style={{flex:1,padding:"9px",borderRadius:10,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif",border:`2px solid ${form.tipo===k?C.musgo:C.grisFino}`,background:form.tipo===k?C.verdeBg:"transparent",color:form.tipo===k?C.verde:C.gris}}>{l}</button>
              ))}
            </div>
          </div>
          <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Sueldo base mensual</div>
            <input type="number" style={INP} placeholder="$" value={form.sueldo_base} onChange={s("sueldo_base")}/></div>
          <div><div style={{fontSize:11,fontWeight:700,color:C.tierra,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Centro de costos</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{DESTINOS.map(d=><Pill key={d.id} label={d.label} activo={form.centro===d.id} onClick={()=>setForm(f=>({...f,centro:d.id}))}/>)}</div>
          </div>
          {form.tipo==="gerente"&&(
            <div style={{borderRadius:12,padding:"12px 14px",background:"#FEF9C3",border:`1px solid ${C.ocre}`}}>
              <div style={{fontSize:12,fontWeight:700,color:C.ocre,marginBottom:3}}>Modelo 70/30 activo</div>
              <div style={{fontSize:11,color:C.tierra}}>Base: {fmtM(Math.round((parseInt(form.sueldo_base)||0)*0.7))} · Variable máx: {fmtM(Math.round((parseInt(form.sueldo_base)||0)*0.3))}</div>
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button onClick={()=>onGuardar({...form,sueldo_base:parseInt(form.sueldo_base)||0})} disabled={!form.nombre.trim()} style={{flex:1,padding:"13px",borderRadius:12,background:form.nombre.trim()?C.musgo:C.grisFino,color:"white",border:"none",fontWeight:700,fontSize:14,cursor:form.nombre.trim()?"pointer":"not-allowed",fontFamily:"'Source Sans 3',sans-serif"}}>{item?"Guardar":"Agregar"}</button>
          <button onClick={onCerrar} style={{padding:"13px 20px",borderRadius:12,background:C.crema,color:C.tierra,border:"none",cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal registro HH / jornal ───────────────────────────────────────────────
function ModalRegistroHH({onGuardar,onCerrar,trabajadores}) {
  const [form,setForm]=useState({trabajador_id:"",trabajador_nombre:"",tipo_trabajador:"fijo",fecha:hoy(),tipo_pago:"dia",cantidad:"",valor_unitario:"",centro:"avellano",evento:"",es_jornalero:false,nombre_jornalero:""});
  const s=c=>e=>setForm(f=>({...f,[c]:e.target.value}));

  const total=(parseFloat(form.cantidad)||0)*(parseInt(form.valor_unitario)||0);
  const labelCantidad={dia:"Días trabajados",hora:"Horas trabajadas",kilo:"Kilos procesados"}[form.tipo_pago]||"Cantidad";
  const labelValor={dia:"Valor por día ($)",hora:"Valor por hora ($)",kilo:"Valor por kilo ($)"}[form.tipo_pago]||"Valor unitario";

  function selTrabajador(t) {
    setForm(f=>({...f,trabajador_id:t.id,trabajador_nombre:t.nombre,tipo_trabajador:t.tipo,valor_unitario:t.tipo==="fijo"||t.tipo==="gerente"?String(Math.round(t.sueldo_base/25)):"",es_jornalero:false}));
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(61,43,31,0.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(3px)"}}>
      <div style={{background:C.blanco,borderRadius:20,padding:24,width:"100%",maxWidth:480,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(61,43,31,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900,color:C.tierra}}>Registrar trabajo</div>
          <button onClick={onCerrar} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:C.gris}}>✕</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* ¿Jornalero externo? */}
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setForm(f=>({...f,es_jornalero:false}))} style={{flex:1,padding:"10px",borderRadius:10,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif",border:`2px solid ${!form.es_jornalero?C.musgo:C.grisFino}`,background:!form.es_jornalero?C.verdeBg:"transparent",color:!form.es_jornalero?C.verde:C.gris}}>👤 Trabajador fijo</button>
            <button onClick={()=>setForm(f=>({...f,es_jornalero:true,trabajador_id:"",trabajador_nombre:""}))} style={{flex:1,padding:"10px",borderRadius:10,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif",border:`2px solid ${form.es_jornalero?C.ocre:C.grisFino}`,background:form.es_jornalero?"#FEF9C3":"transparent",color:form.es_jornalero?C.ocre:C.gris}}>🧑‍🌾 Jornalero</button>
          </div>

          {/* Selección trabajador fijo */}
          {!form.es_jornalero && (
            <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Trabajador</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {trabajadores.filter(t=>t.activo).map(t=>(
                  <div key={t.id} onClick={()=>selTrabajador(t)} style={{borderRadius:10,padding:"10px 14px",cursor:"pointer",border:`2px solid ${form.trabajador_id===t.id?C.musgo:C.grisFino}`,background:form.trabajador_id===t.id?C.verdeBg:C.crema,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div><div style={{fontSize:13,fontWeight:700,color:C.tierra}}>{t.nombre}</div><div style={{fontSize:11,color:C.gris}}>{t.tipo==="gerente"?"Gerente (70/30)":"Fijo"} · {fmtM(t.sueldo_base)}/mes</div></div>
                    {form.trabajador_id===t.id&&<span style={{color:C.musgo,fontWeight:700}}>✓</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Jornalero nombre */}
          {form.es_jornalero && (
            <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Nombre del jornalero</div>
              <input style={INP} placeholder="Nombre completo" value={form.nombre_jornalero} onChange={s("nombre_jornalero")}/></div>
          )}

          {/* Tipo de pago */}
          <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Tipo de pago</div>
            <div style={{display:"flex",gap:6}}>
              {TIPO_PAGO_JORNAL.map(t=><Pill key={t.id} label={t.label} activo={form.tipo_pago===t.id} onClick={()=>setForm(f=>({...f,tipo_pago:t.id}))}/>)}
            </div>
          </div>

          {/* Fecha + evento */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Fecha</div>
              <input type="date" style={INP} value={form.fecha} onChange={s("fecha")}/></div>
            <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>Evento / labor</div>
              <input style={INP} placeholder="Ej: Poda, Cosecha..." value={form.evento} onChange={s("evento")}/></div>
          </div>

          {/* Cantidad + valor */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>{labelCantidad}</div>
              <input type="number" style={INP} placeholder="0" value={form.cantidad} onChange={s("cantidad")}/></div>
            <div><div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>{labelValor}</div>
              <input type="number" style={INP} placeholder="$" value={form.valor_unitario} onChange={s("valor_unitario")}/></div>
          </div>

          {/* Total calculado */}
          {total>0&&(
            <div style={{borderRadius:12,padding:"12px 16px",background:C.verdeBg,border:`1px solid #BBF7D0`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,color:C.verde,fontWeight:700}}>Total a pagar</span>
              <span style={{fontSize:22,fontWeight:900,color:C.tierra,fontFamily:"'Playfair Display',serif"}}>{fmtM(total)}</span>
            </div>
          )}

          {/* Centro de costos */}
          <div><div style={{fontSize:11,fontWeight:700,color:C.tierra,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Centro de costos</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{DESTINOS.map(d=><Pill key={d.id} label={d.label} activo={form.centro===d.id} onClick={()=>setForm(f=>({...f,centro:d.id}))}/>)}</div>
          </div>
        </div>

        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button onClick={()=>{
            const nombre=form.es_jornalero?form.nombre_jornalero:form.trabajador_nombre;
            if(!nombre||!form.cantidad||!form.valor_unitario) return;
            onGuardar({...form,nombre_efectivo:nombre,total,id:Date.now()});
          }} style={{flex:1,padding:"13px",borderRadius:12,background:C.musgo,color:"white",border:"none",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>Registrar</button>
          <button onClick={onCerrar} style={{padding:"13px 20px",borderRadius:12,background:C.crema,color:C.tierra,border:"none",cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function ModuloPersonal({onToast}) {
  const [trabajadores,setTrab]  = useState([]);
  const [registros,setReg]      = useState([]);
  const [cargando,setCarg]      = useState(true);
  const [tab,setTab]            = useState("planilla");   // planilla | trabajadores | registros
  const [periodo,setPeriodo]    = useState(mesActualISO());
  const [modalTrab,setModalT]   = useState(null);
  const [modalHH,setModalHH]    = useState(false);
  const [modalDT,setModalDT]    = useState(null);
  const [modalDR,setModalDR]    = useState(null);

  useEffect(()=>{ (async()=>{
    const t = await sheetLeer("trabajadores");
    setTrab(t&&t.length>0 ? t.map(w=>({...w,sueldo_base:Number(w.sueldo_base)||0,activo:w.activo==="true"||w.activo===true})) : TRABAJADORES_BASE);
    const r = await sheetLeer("registrosHH");
    if(r&&r.length>0) setReg(r.map(x=>({...x,total:Number(x.total)||0,cantidad:Number(x.cantidad)||0,valor_unitario:Number(x.valor_unitario)||0,es_jornalero:x.es_jornalero==="true"||x.es_jornalero===true})));
    setCarg(false);
  })(); },[]);

  async function handleGuardarTrab(form){
    let n;
    if(modalTrab&&typeof modalTrab==="object"){
      n=trabajadores.map(t=>t.id===modalTrab.id?{...t,...form}:t);
      onToast("Trabajador actualizado"); await sheetReemplazar("trabajadores",n);
    } else {
      const nuevo={...form,id:`t_${Date.now()}`};
      n=[...trabajadores,nuevo]; onToast("Trabajador agregado ✓");
      await sheetGuardar("trabajadores",nuevo);
    }
    setTrab(n); setModalT(null);
  }
  async function handleElimT(){
    const n=trabajadores.filter(t=>t.id!==modalDT.id); setTrab(n);
    await sheetEliminar("trabajadores",modalDT.id);
    onToast("Eliminado",C.rojo); setModalDT(null);
  }

  async function handleGuardarHH(form){
    const n=[...registros,form]; setReg(n);
    await sheetGuardar("registrosHH",form);
    onToast("Registro guardado ✓"); setModalHH(false);
  }
  async function handleElimR(){
    const n=registros.filter(r=>r.id!==modalDR.id); setReg(n);
    await sheetEliminar("registrosHH",modalDR.id);
    onToast("Eliminado",C.rojo); setModalDR(null);
  }

  // ── Planilla del período ──────────────────────────────────────────────────
  const regPeriodo = registros.filter(r=>r.fecha?.startsWith(periodo));

  // Fijos: sueldo base prorrateado por días registrados en el período
  const planillaFijos = trabajadores.filter(t=>t.activo).map(t=>{
    const regs=regPeriodo.filter(r=>r.trabajador_id===t.id);
    const totalPagado=regs.reduce((s,r)=>s+r.total,0);
    const dias=regs.filter(r=>r.tipo_pago==="dia").reduce((s,r)=>s+(parseFloat(r.cantidad)||0),0);
    return {...t,regs,totalPagado,dias,variable:t.tipo==="gerente"?Math.round(t.sueldo_base*0.3):0};
  });

  // Jornaleros del período
  const jornaleros=regPeriodo.filter(r=>r.es_jornalero);
  const totalJornaleros=jornaleros.reduce((s,r)=>s+r.total,0);
  const totalFijos=planillaFijos.reduce((s,t)=>s+(t.totalPagado||t.sueldo_base),0);
  const totalNomina=totalFijos+totalJornaleros;

  // Resumen por centro
  const porCentro=DESTINOS.map(d=>({
    ...d,
    monto:[...regPeriodo,...planillaFijos.flatMap(t=>t.regs)].filter(r=>r.centro===d.id).reduce((s,r)=>s+r.total,0)
  })).filter(d=>d.monto>0);

  if(cargando) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:300,fontFamily:"'Source Sans 3',sans-serif",color:C.gris}}>Cargando…</div>;

  return (
    <div>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,#2E4057,${C.musgo})`,padding:"22px 20px 18px"}}>
        <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.15em",color:C.ocreClaro,marginBottom:4}}>Campo Von Baer · Personal</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:900,color:"white",lineHeight:1.1}}>Personal<br/>y Nómina</h1>
          <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
            <button onClick={()=>setModalHH(true)} style={{background:C.ocre,border:"none",color:"white",fontWeight:700,fontSize:13,padding:"10px 14px",borderRadius:10,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>+ Registrar trabajo</button>
            <button onClick={()=>setModalT("nueva")} style={{background:"rgba(255,255,255,0.15)",border:"1.5px solid rgba(255,255,255,0.3)",color:"white",fontWeight:600,fontSize:12,padding:"7px 14px",borderRadius:10,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>+ Trabajador</button>
          </div>
        </div>
        {/* KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          {[[fmtMK(totalNomina),"Nómina total"],[String(trabajadores.filter(t=>t.activo).length)+" fijos","Personal fijo"],[fmtMK(totalJornaleros),"Jornaleros"]].map(([v,l])=>(
            <div key={l} style={{borderRadius:12,padding:"10px 12px",background:"rgba(255,255,255,0.12)"}}>
              <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em",color:C.ocreClaro,marginBottom:2}}>{l}</div>
              <div style={{fontSize:15,fontWeight:900,color:"white",fontFamily:"'Playfair Display',serif"}}>{v}</div>
            </div>
          ))}
        </div>
        {/* Selector de período */}
        <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.1)",borderRadius:10,padding:"8px 12px"}}>
          <span style={{fontSize:12,color:"rgba(255,255,255,0.7)"}}>Período:</span>
          <input type="month" value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{background:"transparent",border:"none",color:"white",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}/>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",background:C.crema,borderBottom:`1px solid ${C.grisFino}`}}>
        {[["planilla","📋 Planilla"],["registros","🕐 Registros"],["trabajadores","👥 Equipo"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"12px 4px",border:"none",cursor:"pointer",background:tab===id?C.blanco:"transparent",color:tab===id?C.tierra:C.gris,fontWeight:600,fontSize:12,borderBottom:tab===id?`2px solid ${C.musgo}`:"2px solid transparent",fontFamily:"'Source Sans 3',sans-serif"}}>{label}</button>
        ))}
      </div>

      <div style={{padding:"14px 16px 24px"}}>

        {/* ── PLANILLA ── */}
        {tab==="planilla" && (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{fontSize:12,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.08em"}}>{nombreMes(periodo)}</div>

            {/* Fijos */}
            {planillaFijos.map(t=>(
              <div key={t.id} style={{borderRadius:14,padding:16,background:C.crema}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:C.tierra}}>{t.nombre}</div>
                    <div style={{fontSize:11,color:C.gris,marginTop:2}}>{t.tipo==="gerente"?"Gerente (70/30)":"Trabajador fijo"} · {DESTINOS.find(d=>d.id===t.centro)?.label||t.centro}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:18,fontWeight:900,color:C.tierra,fontFamily:"'Playfair Display',serif"}}>{fmtM(t.sueldo_base)}</div>
                    <div style={{fontSize:10,color:C.gris}}>base mensual</div>
                  </div>
                </div>
                {t.tipo==="gerente"&&(
                  <div style={{display:"flex",gap:8,marginBottom:8}}>
                    <div style={{flex:1,borderRadius:8,padding:"8px 10px",background:"#FEF9C3"}}>
                      <div style={{fontSize:9,color:C.ocre,textTransform:"uppercase",fontWeight:700}}>Base 70%</div>
                      <div style={{fontSize:13,fontWeight:700,color:C.tierra}}>{fmtM(Math.round(t.sueldo_base*0.7))}</div>
                    </div>
                    <div style={{flex:1,borderRadius:8,padding:"8px 10px",background:C.verdeBg}}>
                      <div style={{fontSize:9,color:C.verde,textTransform:"uppercase",fontWeight:700}}>Variable 30%</div>
                      <div style={{fontSize:13,fontWeight:700,color:C.tierra}}>{fmtM(Math.round(t.sueldo_base*0.3))}</div>
                    </div>
                  </div>
                )}
                {t.dias>0&&<div style={{fontSize:11,color:C.gris,marginBottom:4}}>Días registrados este período: <b style={{color:C.tierra}}>{t.dias}</b></div>}
                {t.regs.length===0&&<div style={{fontSize:11,color:C.grisFino,fontStyle:"italic"}}>Sin registros de HH este período.</div>}
              </div>
            ))}

            {/* Jornaleros del período */}
            {jornaleros.length>0&&(
              <div style={{borderRadius:14,padding:16,background:"#FEF9C3",border:`1px solid ${C.ocre}`}}>
                <div style={{fontSize:12,fontWeight:700,color:C.ocre,marginBottom:8}}>🧑‍🌾 Jornaleros · {nombreMes(periodo)}</div>
                {jornaleros.map(r=>(
                  <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,paddingBottom:6,borderBottom:`1px solid rgba(200,133,42,0.2)`}}>
                    <div><div style={{fontSize:13,fontWeight:700,color:C.tierra}}>{r.nombre_jornalero||r.nombre_efectivo}</div>
                      <div style={{fontSize:11,color:C.gris}}>{r.evento||"Sin evento"} · {fmtFecha(r.fecha)} · {DESTINOS.find(d=>d.id===r.centro)?.label||r.centro}</div>
                    </div>
                    <div style={{fontWeight:900,color:C.tierra,fontFamily:"'Playfair Display',serif"}}>{fmtM(r.total)}</div>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",paddingTop:6}}>
                  <span style={{fontSize:12,fontWeight:700,color:C.ocre}}>Subtotal jornaleros</span>
                  <span style={{fontSize:14,fontWeight:900,color:C.tierra,fontFamily:"'Playfair Display',serif"}}>{fmtM(totalJornaleros)}</span>
                </div>
              </div>
            )}

            {/* Total nómina */}
            <div style={{borderRadius:14,padding:16,background:`linear-gradient(135deg,${C.musgo},${C.tierra})`,marginTop:4}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>Total nómina {nombreMes(periodo)}</div>
              <div style={{fontSize:28,fontWeight:900,color:"white",fontFamily:"'Playfair Display',serif"}}>{fmtM(totalNomina)}</div>
              {porCentro.length>0&&(
                <div style={{marginTop:10,display:"flex",gap:6,flexWrap:"wrap"}}>
                  {porCentro.map(d=><div key={d.id} style={{borderRadius:8,padding:"5px 10px",background:"rgba(255,255,255,0.15)"}}><div style={{fontSize:9,color:"rgba(255,255,255,0.7)"}}>{d.label}</div><div style={{fontSize:12,fontWeight:700,color:"white"}}>{fmtMK(d.monto)}</div></div>)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── REGISTROS HH ── */}
        {tab==="registros" && (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{fontSize:12,color:C.gris}}>{regPeriodo.length} registro{regPeriodo.length!==1?"s":""} en {nombreMes(periodo)}</div>
            {regPeriodo.length===0
              ? <div style={{textAlign:"center",padding:"32px 20px",color:C.gris,fontSize:14}}>Sin registros para este período.<br/><span style={{fontSize:12}}>Usa el botón "Registrar trabajo".</span></div>
              : [...regPeriodo].reverse().map(r=>{
                  const dest=DESTINOS.find(d=>d.id===r.centro);
                  return (
                    <div key={r.id} style={{borderRadius:14,padding:"14px 16px",background:C.crema,borderLeft:`4px solid ${r.es_jornalero?C.ocre:C.musgo}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:700,color:C.tierra}}>{r.nombre_efectivo||r.trabajador_nombre}</div>
                          <div style={{fontSize:11,color:C.gris,marginTop:2}}>{r.evento||"Sin evento"} · {fmtFecha(r.fecha)}</div>
                          <div style={{fontSize:11,color:C.gris}}>{dest?.label} · {r.cantidad} {r.tipo_pago==="dia"?"día(s)":r.tipo_pago==="hora"?"hora(s)":"kilo(s)"} × {fmtM(r.valor_unitario||0)}</div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                          <div style={{fontSize:17,fontWeight:900,color:C.tierra,fontFamily:"'Playfair Display',serif"}}>{fmtM(r.total)}</div>
                          {r.es_jornalero&&<div style={{fontSize:10,color:C.ocre,fontWeight:700}}>Jornalero</div>}
                        </div>
                      </div>
                      <div style={{marginTop:8,display:"flex",justifyContent:"flex-end"}}>
                        <button onClick={()=>setModalDR(r)} style={{fontSize:11,padding:"4px 12px",borderRadius:8,border:`1px solid ${C.rojo}`,color:C.rojo,background:"transparent",cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif",fontWeight:600}}>Eliminar</button>
                      </div>
                    </div>
                  );
                })
            }
          </div>
        )}

        {/* ── EQUIPO ── */}
        {tab==="trabajadores" && (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {trabajadores.map(t=>(
              <div key={t.id} style={{borderRadius:14,padding:16,background:t.activo?C.crema:"#F5F5F5",opacity:t.activo?1:0.6}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:C.tierra}}>{t.nombre}</div>
                    <div style={{fontSize:11,color:C.gris,marginTop:2}}>{t.tipo==="gerente"?"Gerente (70/30)":"Fijo"} · {DESTINOS.find(d=>d.id===t.centro)?.label||t.centro}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:16,fontWeight:900,color:C.tierra,fontFamily:"'Playfair Display',serif"}}>{fmtM(t.sueldo_base)}</div>
                    <div style={{fontSize:10,color:C.gris}}>base/mes</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setModalT(t)} style={{flex:1,padding:"7px",borderRadius:8,border:`1px solid ${C.musgo}`,color:C.musgo,background:"transparent",cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"'Source Sans 3',sans-serif"}}>✏ Editar</button>
                  <button onClick={async ()=>{ const n=trabajadores.map(w=>w.id===t.id?{...w,activo:!w.activo}:w); setTrab(n); await sheetReemplazar("trabajadores",n); }} style={{flex:1,padding:"7px",borderRadius:8,border:`1px solid ${C.ocre}`,color:C.ocre,background:"transparent",cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"'Source Sans 3',sans-serif"}}>{t.activo?"Pausar":"Activar"}</button>
                  <button onClick={()=>setModalDT(t)} style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${C.rojo}`,color:C.rojo,background:"transparent",cursor:"pointer",fontSize:11,fontFamily:"'Source Sans 3',sans-serif"}}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalTrab&&<ModalTrabajador item={modalTrab==="nueva"?null:modalTrab} onGuardar={handleGuardarTrab} onCerrar={()=>setModalT(null)}/>}
      {modalHH&&<ModalRegistroHH trabajadores={trabajadores} onGuardar={handleGuardarHH} onCerrar={()=>setModalHH(false)}/>}
      {modalDT&&<ModalEliminar nombre={modalDT.nombre} onOk={handleElimT} onCancel={()=>setModalDT(null)}/>}
      {modalDR&&<ModalEliminar nombre={`${modalDR.nombre_efectivo||modalDR.trabajador_nombre} · ${fmtM(modalDR.total)}`} onOk={handleElimR} onCancel={()=>setModalDR(null)}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP CONTENEDOR — NAVEGACIÓN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
const NAV = [
  { id:"escaner",    label:"Escáner",    icon:"📄" },
  { id:"finanzas",   label:"Finanzas",   icon:"💰" },
  { id:"inventario", label:"Stock",      icon:"📦" },
  { id:"tareas",     label:"Tareas",     icon:"✅" },
  { id:"personal",   label:"Personal",   icon:"👷" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MÓDULO 6 — DASHBOARD GENERAL
// ═══════════════════════════════════════════════════════════════════════════════
function ModuloDashboard({onNavegar}) {
  const [datos,setDatos]     = useState(null);
  const [cargando,setCarg]   = useState(true);
  const ahora                = new Date();
  const mesActual            = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,"0")}`;
  const anioActual           = String(ahora.getFullYear());

  useEffect(()=>{ (async()=>{
    // Leer todos los storages en paralelo
    const leer = async (key) => { try{ const r=await window.storage.get(key,true); return r?JSON.parse(r.value):null; }catch{ return null; } };
    const [finRaw,escRaw,invRaw,tarRaw,trabRaw,regRaw] = await Promise.all([
      leer("finanzas-campo-v1"), leer("documentos-campo-v1"), leer("inventario-campo-v1"),
      leer("tareas-campo-v1"),   leer("trabajadores-v1"),     leer("registros-hh-v1"),
    ]);

    const finanzas  = finRaw  || DATOS_FIN;
    const docs      = escRaw  || [];
    const inventario= invRaw  || DATOS_INV;
    const tareas    = tarRaw  || DATOS_TAREAS;
    const trabajadores = trabRaw || TRABAJADORES_BASE;
    const registros = regRaw  || [];

    // Unir movimientos + documentos escáner
    const escGastos = docs.filter(d=>d.monto_total>0).map(d=>({id:`esc_${d.id}`,tipo:"gasto",fecha:d.fecha||d.fecha_registro,monto_total:d.monto_total,destino:d.destino||"campo_general",origen:"escaner"}));
    const todosMovs = [...finanzas,...escGastos.filter(e=>!finanzas.some(f=>f.id===e.id))];

    // ── Finanzas del mes ──────────────────────────────────────────────────
    const movMes    = todosMovs.filter(m=>m.fecha?.startsWith(mesActual));
    const ingMes    = movMes.filter(m=>m.tipo==="ingreso").reduce((s,m)=>s+m.monto_total,0);
    const gastMes   = movMes.filter(m=>m.tipo==="gasto").reduce((s,m)=>s+m.monto_total,0);
    const balMes    = ingMes-gastMes;

    // ── Resultado operacional acumulado año ───────────────────────────────
    const movAnio   = todosMovs.filter(m=>m.fecha?.startsWith(anioActual));
    const ingAnio   = movAnio.filter(m=>m.tipo==="ingreso").reduce((s,m)=>s+m.monto_total,0);
    const gastAnio  = movAnio.filter(m=>m.tipo==="gasto").reduce((s,m)=>s+m.monto_total,0);
    const resultOp  = ingAnio-gastAnio;

    // ── Gráfico mensual 6 meses ────────────────────────────────────────────
    const graf6 = Array.from({length:6},(_,i)=>{
      const d=new Date(ahora.getFullYear(),ahora.getMonth()-5+i,1);
      const clave=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      const g=todosMovs.filter(m=>m.tipo==="gasto"  &&m.fecha?.startsWith(clave)).reduce((s,m)=>s+m.monto_total,0);
      const ing=todosMovs.filter(m=>m.tipo==="ingreso"&&m.fecha?.startsWith(clave)).reduce((s,m)=>s+m.monto_total,0);
      return {mes:MESES[d.getMonth()],g,ing,bal:ing-g};
    });

    // ── Por destino (año) ──────────────────────────────────────────────────
    const porDest = DESTINOS.map(d=>({
      ...d,
      ing: movAnio.filter(m=>m.tipo==="ingreso"&&(m.destino===d.id||m.destino==="ambas")).reduce((s,m)=>s+m.monto_total,0),
      gast:movAnio.filter(m=>m.tipo==="gasto"  &&(m.destino===d.id||m.destino==="ambas")).reduce((s,m)=>s+m.monto_total,0),
    })).filter(d=>d.ing>0||d.gast>0);

    // ── Tareas urgentes / vencidas ────────────────────────────────────────
    const tarUrgentes = tareas.filter(t=>t.estado!=="hecha"&&t.prioridad==="urgente");
    const tarVencidas = tareas.filter(t=>t.estado!=="hecha"&&diasRest(t.fecha_limite)!==null&&diasRest(t.fecha_limite)<0);
    const tarEnCurso  = tareas.filter(t=>t.estado==="en_curso");

    // ── Stock crítico ──────────────────────────────────────────────────────
    const stockCritico = inventario.filter(i=>i.stock<=i.minimo);
    const vencenProx   = inventario.filter(i=>{ const d=diasRest(i.vencimiento); return d!==null&&d<60; });

    // ── Nómina del mes ────────────────────────────────────────────────────
    const regMes    = registros.filter(r=>r.fecha?.startsWith(mesActual));
    const nomMes    = trabajadores.filter(t=>t.activo).reduce((s,t)=>s+t.sueldo_base,0);
    const jornMes   = regMes.filter(r=>r.es_jornalero).reduce((s,r)=>s+r.total,0);

    setDatos({ingMes,gastMes,balMes,ingAnio,gastAnio,resultOp,graf6,porDest,tarUrgentes,tarVencidas,tarEnCurso,stockCritico,vencenProx,nomMes,jornMes,mesActual});
    setCarg(false);
  })(); },[]);

  if(cargando) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"60vh",fontFamily:"'Source Sans 3',sans-serif",color:C.gris,flexDirection:"column",gap:10}}><div style={{fontSize:36}}>🌱</div><div>Cargando datos…</div></div>;

  const {ingMes,gastMes,balMes,ingAnio,gastAnio,resultOp,graf6,porDest,tarUrgentes,tarVencidas,tarEnCurso,stockCritico,vencenProx,nomMes,jornMes} = datos;
  const maxGraf = Math.max(...graf6.map(d=>Math.max(d.g,d.ing)),1);
  const alertas = tarUrgentes.length+tarVencidas.length+stockCritico.length;

  return (
    <div>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.tierra},${C.musgo})`,padding:"22px 20px 20px"}}>
        <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.15em",color:C.ocreClaro,marginBottom:2}}>Llamadministrador v5</div>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:14}}>{new Date().toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long"})}</div>

        {/* Balance del mes — protagonista */}
        <div style={{borderRadius:16,padding:"18px 20px",background:"rgba(255,255,255,0.12)",marginBottom:12}}>
          <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.12em",color:C.ocreClaro,marginBottom:6}}>Balance {MESES[new Date().getMonth()]} {new Date().getFullYear()}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div><div style={{fontSize:9,color:"rgba(255,255,255,0.6)",textTransform:"uppercase"}}>Ingresos</div><div style={{fontSize:18,fontWeight:900,color:"white",fontFamily:"'Playfair Display',serif"}}>{fmtMK(ingMes)}</div></div>
            <div><div style={{fontSize:9,color:"rgba(255,255,255,0.6)",textTransform:"uppercase"}}>Gastos</div><div style={{fontSize:18,fontWeight:900,color:"#FCA5A5",fontFamily:"'Playfair Display',serif"}}>{fmtMK(gastMes)}</div></div>
          </div>
          <div style={{borderTop:"1px solid rgba(255,255,255,0.2)",paddingTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>Balance neto</span>
            <span style={{fontSize:24,fontWeight:900,color:balMes>=0?"#86EFAC":"#FCA5A5",fontFamily:"'Playfair Display',serif"}}>{balMes>=0?"+":""}{fmtMK(balMes)}</span>
          </div>
        </div>

        {/* Resultado operacional año */}
        <div style={{borderRadius:12,padding:"12px 16px",background:resultOp>=0?"rgba(74,94,58,0.5)":"rgba(155,58,42,0.5)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:9,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",letterSpacing:"0.1em"}}>Resultado operacional {new Date().getFullYear()}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginTop:2}}>Ingresos {fmtMK(ingAnio)} · Gastos {fmtMK(gastAnio)}</div>
          </div>
          <div style={{fontSize:22,fontWeight:900,color:"white",fontFamily:"'Playfair Display',serif",flexShrink:0,marginLeft:12}}>{resultOp>=0?"+":""}{fmtMK(resultOp)}</div>
        </div>

        {/* Badge alertas */}
        {alertas>0&&(
          <div style={{marginTop:10,borderRadius:10,padding:"8px 14px",background:"rgba(155,58,42,0.5)",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:16}}>⚠️</span>
            <span style={{fontSize:12,color:"white",fontWeight:600}}>{alertas} alerta{alertas>1?"s":""} requieren atención</span>
          </div>
        )}
      </div>

      <div style={{padding:"16px 16px 24px",display:"flex",flexDirection:"column",gap:16}}>

        {/* ── GRÁFICO 6 MESES ── */}
        <div style={{borderRadius:16,padding:"16px 14px",background:C.crema}}>
          <div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:14}}>Últimos 6 meses</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:4,height:90,marginBottom:8}}>
            {graf6.map((d,i)=>{
              const esActual=i===5;
              return (
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <div style={{width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",height:75,gap:1}}>
                    {d.ing>0&&<div style={{width:"100%",borderRadius:"4px 4px 0 0",background:esActual?C.musgo:C.musgoClaro,height:`${(d.ing/maxGraf)*70}px`,minHeight:2,transition:"height 0.4s"}}/>}
                    {d.g>0&&<div style={{width:"100%",borderRadius:d.ing>0?0:"4px 4px 0 0",background:esActual?C.rojo:"#C97060",height:`${(d.g/maxGraf)*70}px`,minHeight:2,transition:"height 0.4s"}}/>}
                    {d.ing===0&&d.g===0&&<div style={{width:"100%",height:2,background:C.grisFino,borderRadius:99,marginBottom:0}}/>}
                  </div>
                  <div style={{fontSize:9,color:esActual?C.tierra:C.gris,fontWeight:esActual?700:400}}>{d.mes}</div>
                  {/* Balance del mes como punto */}
                  <div style={{width:6,height:6,borderRadius:"50%",background:d.bal>=0?C.musgo:C.rojo,marginTop:1}}/>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:16}}>
            {[["Ingresos",C.musgoClaro],["Gastos","#C97060"],["• Balance",C.musgo]].map(([l,col])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                <div style={{width:8,height:8,borderRadius:l.startsWith("•")?4:2,background:col}}/>
                <span style={{fontSize:10,color:C.gris}}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── RESULTADO POR DESTINO ── */}
        {porDest.length>0&&(
          <div style={{borderRadius:16,padding:"16px 14px",background:C.crema}}>
            <div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>Resultado por unidad · {new Date().getFullYear()}</div>
            {porDest.map(d=>{
              const bal=d.ing-d.gast;
              const maxBar=Math.max(d.ing,d.gast,1);
              return (
                <div key={d.id} style={{marginBottom:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                    <span style={{fontSize:12,fontWeight:700,color:C.tierra}}>{d.label}</span>
                    <span style={{fontSize:14,fontWeight:900,color:bal>=0?C.verde:C.rojo,fontFamily:"'Playfair Display',serif"}}>{bal>=0?"+":""}{fmtMK(bal)}</span>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:3}}>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <span style={{fontSize:9,color:C.musgo,width:42,textAlign:"right"}}>Ingr.</span>
                      <div style={{flex:1,height:6,borderRadius:99,background:C.grisFino}}>
                        <div style={{height:6,borderRadius:99,background:C.musgoClaro,width:`${(d.ing/maxBar)*100}%`,minWidth:d.ing>0?4:0}}/>
                      </div>
                      <span style={{fontSize:9,color:C.gris,width:44}}>{fmtMK(d.ing)}</span>
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <span style={{fontSize:9,color:C.rojo,width:42,textAlign:"right"}}>Gasto</span>
                      <div style={{flex:1,height:6,borderRadius:99,background:C.grisFino}}>
                        <div style={{height:6,borderRadius:99,background:"#C97060",width:`${(d.gast/maxBar)*100}%`,minWidth:d.gast>0?4:0}}/>
                      </div>
                      <span style={{fontSize:9,color:C.gris,width:44}}>{fmtMK(d.gast)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── TAREAS ── */}
        <div style={{borderRadius:16,padding:"16px 14px",background:C.crema}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.08em"}}>Tareas</div>
            <button onClick={()=>onNavegar("tareas")} style={{fontSize:11,color:C.musgo,fontWeight:700,background:"none",border:"none",cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>Ver todas →</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:tarUrgentes.length>0||tarVencidas.length>0?12:0}}>
            {[[tarUrgentes.length,"Urgentes",C.rojo,"#FEE2E2"],[tarVencidas.length,"Vencidas",C.rojo,"#FEE2E2"],[tarEnCurso.length,"En curso",C.ocre,"#FEF9C3"]].map(([v,l,col,bg])=>(
              <div key={l} style={{borderRadius:10,padding:"10px 8px",background:v>0?bg:C.hueso,textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:900,color:v>0?col:C.grisFino,fontFamily:"'Playfair Display',serif"}}>{v}</div>
                <div style={{fontSize:9,color:v>0?col:C.grisFino,textTransform:"uppercase",fontWeight:600,marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>
          {(tarUrgentes.length>0||tarVencidas.length>0)&&[...new Map([...tarUrgentes,...tarVencidas].map(t=>[t.id,t])).values()].slice(0,3).map(t=>(
            <div key={t.id} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 0",borderTop:`1px solid ${C.grisFino}`}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:t.prioridad==="urgente"?C.rojo:C.ocre,flexShrink:0}}/>
              <span style={{fontSize:12,color:C.tierra,flex:1}}>{t.titulo}</span>
              <span style={{fontSize:10,color:C.gris}}>{t.responsable}</span>
            </div>
          ))}
        </div>

        {/* ── STOCK CRÍTICO ── */}
        {(stockCritico.length>0||vencenProx.length>0)&&(
          <div style={{borderRadius:16,padding:"16px 14px",background:C.crema}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.08em"}}>Alertas de inventario</div>
              <button onClick={()=>onNavegar("inventario")} style={{fontSize:11,color:C.musgo,fontWeight:700,background:"none",border:"none",cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>Ver stock →</button>
            </div>
            {stockCritico.map(i=>(
              <div key={i.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.grisFino}`}}>
                <div><div style={{fontSize:12,fontWeight:700,color:C.tierra}}>{i.nombre}</div>
                  <div style={{fontSize:10,color:C.rojo}}>Stock: {i.stock} {i.unidad} · Mín: {i.minimo} {i.unidad}</div>
                </div>
                <span style={{fontSize:10,padding:"3px 9px",borderRadius:99,background:"#FEE2E2",color:C.rojo,fontWeight:700}}>Reponer</span>
              </div>
            ))}
            {vencenProx.filter(i=>!stockCritico.find(s=>s.id===i.id)).map(i=>{
              const d=diasRest(i.vencimiento);
              return (
                <div key={i.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.grisFino}`}}>
                  <div><div style={{fontSize:12,fontWeight:700,color:C.tierra}}>{i.nombre}</div>
                    <div style={{fontSize:10,color:C.ocre}}>Vence en {d} días · {fmtFecha(i.vencimiento)}</div>
                  </div>
                  <span style={{fontSize:10,padding:"3px 9px",borderRadius:99,background:"#FEF9C3",color:C.ocre,fontWeight:700}}>⏱ Pronto</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── NÓMINA DEL MES ── */}
        <div style={{borderRadius:16,padding:"16px 14px",background:C.crema}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:C.gris,textTransform:"uppercase",letterSpacing:"0.08em"}}>Nómina · {MESES[new Date().getMonth()]}</div>
            <button onClick={()=>onNavegar("personal")} style={{fontSize:11,color:C.musgo,fontWeight:700,background:"none",border:"none",cursor:"pointer",fontFamily:"'Source Sans 3',sans-serif"}}>Ver planilla →</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{borderRadius:10,padding:"10px 12px",background:C.hueso}}>
              <div style={{fontSize:9,color:C.gris,textTransform:"uppercase"}}>Fijos</div>
              <div style={{fontSize:16,fontWeight:900,color:C.tierra,fontFamily:"'Playfair Display',serif"}}>{fmtMK(nomMes)}</div>
            </div>
            <div style={{borderRadius:10,padding:"10px 12px",background:"#FEF9C3"}}>
              <div style={{fontSize:9,color:C.ocre,textTransform:"uppercase"}}>Jornaleros</div>
              <div style={{fontSize:16,fontWeight:900,color:C.tierra,fontFamily:"'Playfair Display',serif"}}>{fmtMK(jornMes)}</div>
            </div>
          </div>
          <div style={{marginTop:10,padding:"10px 12px",borderRadius:10,background:`linear-gradient(135deg,${C.musgo},${C.tierra})`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,color:"rgba(255,255,255,0.8)"}}>Total nómina</span>
            <span style={{fontSize:18,fontWeight:900,color:"white",fontFamily:"'Playfair Display',serif"}}>{fmtMK(nomMes+jornMes)}</span>
          </div>
        </div>

        {/* Acceso rápido al escáner */}
        <div onClick={()=>onNavegar("escaner")} style={{borderRadius:16,padding:"16px 20px",background:C.azul,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:14,fontWeight:700,color:"white"}}>Escanear documento</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginTop:2}}>Facturas, boletas y guías con IA</div>
          </div>
          <span style={{fontSize:32}}>📄</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP CONTENEDOR FINAL
// ═══════════════════════════════════════════════════════════════════════════════
const NAV_FINAL = [
  { id:"dashboard",  label:"Inicio",     icon:"🏠" },
  { id:"finanzas",   label:"Finanzas",   icon:"💰" },
  { id:"tareas",     label:"Tareas",     icon:"✅" },
  { id:"inventario", label:"Stock",      icon:"📦" },
  { id:"personal",   label:"Personal",   icon:"👷" },
];

export default function LlamadministradorV5() {
  const [modulo,setModulo] = useState("dashboard");
  const [toast,setToast]   = useState(null);

  function onToast(msg,color){ setToast({msg,color}); setTimeout(()=>setToast(null),2600); }
  function onNavegar(id){ setModulo(id); }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Source+Sans+3:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.hueso};}
        input:focus,select:focus,textarea:focus{border-color:${C.musgo}!important;outline:none;}
        input::placeholder,textarea::placeholder{color:${C.grisFino};}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:${C.grisFino};border-radius:4px;}
      `}</style>

      <div style={{fontFamily:"'Source Sans 3',sans-serif",background:C.hueso,minHeight:"100vh",maxWidth:480,margin:"0 auto",paddingBottom:72}}>
        {modulo==="dashboard"  && <ModuloDashboard  onNavegar={onNavegar}/>}
        {modulo==="escaner"    && <ModuloEscaner    onToast={onToast}/>}
        {modulo==="finanzas"   && <ModuloFinanzas   onToast={onToast}/>}
        {modulo==="inventario" && <ModuloInventario onToast={onToast}/>}
        {modulo==="tareas"     && <ModuloTareas     onToast={onToast}/>}
        {modulo==="personal"   && <ModuloPersonal   onToast={onToast}/>}
      </div>

      {/* BARRA DE NAVEGACIÓN INFERIOR */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:C.blanco,borderTop:`1px solid ${C.grisFino}`,display:"flex",zIndex:100,boxShadow:"0 -4px 20px rgba(61,43,31,0.08)"}}>
        {NAV_FINAL.map(n=>(
          <button key={n.id} onClick={()=>setModulo(n.id)}
            style={{flex:1,padding:"8px 2px 10px",border:"none",cursor:"pointer",background:"transparent",display:"flex",flexDirection:"column",alignItems:"center",gap:2,fontFamily:"'Source Sans 3',sans-serif"}}>
            <span style={{fontSize:20,lineHeight:1}}>{n.icon}</span>
            <span style={{fontSize:9,fontWeight:modulo===n.id?700:400,color:modulo===n.id?C.musgo:C.gris}}>{n.label}</span>
            {modulo===n.id&&<div style={{width:16,height:2,borderRadius:99,background:C.musgo}}/>}
          </button>
        ))}
      </div>

      {toast && <Toast msg={toast.msg} color={toast.color}/>}
    </>
  );
}
