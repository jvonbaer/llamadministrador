import { useState, useEffect, useCallback } from "react";

// ─── CONSTANTES ────────────────────────────────────────────────────────────────
const API = "/api/sheets";

const CENTROS = [
  { id: "avellano",      label: "Avellano (16 há)",        icon: "🌰" },
  { id: "trufera",       label: "Trufera (3 há)",           icon: "🍄" },
  { id: "ambas",         label: "Ambas",                    icon: "🌰🍄" },
  { id: "granja",        label: "Granja Llamas del Sur",    icon: "🏡" },
  { id: "campo_general", label: "Campo sin asignación",     icon: "⚙️" },
];

const CATEGORIAS_GASTO = [
  "Insumos agrícolas","Combustible","Herramientas","Maquinaria",
  "Mano de obra","Veterinario","Alimentación animales","Cafetería",
  "Mantenimiento","Servicios básicos","Transporte","Administrativo","Otro",
];

const CATEGORIAS_INGRESO = [
  "Visitas / Entradas","Cafetería","Tinajas","Cabaña","Cabalgatas",
  "Terapias Anímate","Arriendo animales","Venta avellanas","Venta trufas",
  "Eventos especiales","Otro",
];

const UNIDADES = ["kg","L","unidad","saco","fardo","caja","rollo","dosis","metro"];

// ─── STORAGE ───────────────────────────────────────────────────────────────────
const lsGet = (key, def = []) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; }
  catch { return def; }
};
const lsSet = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

// ─── SYNC SHEETS (FIRE AND FORGET) ────────────────────────────────────────────
function syncSheets(accion, tabla, datos, id) {
  fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accion, tabla, datos, id }),
  }).catch(() => {});
}

async function loadFromSheets(tabla) {
  try {
    const r = await fetch(`${API}?tabla=${tabla}`);
    if (!r.ok) return null;
    const d = await r.json();
    // El Apps Script devuelve { ok: true, datos: [...] }
    if (Array.isArray(d)) return d;
    if (d?.ok && Array.isArray(d?.datos)) return d.datos;
    return null;
  } catch { return null; }
}

// ─── HOOK TABLA ────────────────────────────────────────────────────────────────
function useTabla(nombre) {
  const [datos, setDatosRaw] = useState(() => lsGet(`ll_${nombre}`));
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setCargando(true);
    loadFromSheets(nombre).then(remoto => {
      if (remoto && remoto.length > 0) {
        setDatosRaw(remoto);
        lsSet(`ll_${nombre}`, remoto);
      }
      setCargando(false);
    });
  }, [nombre]);

  const setDatos = useCallback((nuevos) => {
    setDatosRaw(nuevos);
    lsSet(`ll_${nombre}`, nuevos);
    syncSheets("reemplazar", nombre, nuevos);
  }, [nombre]);

  const agregar = useCallback((item) => {
    const nuevo = { ...item, id: `${nombre}_${Date.now()}` };
    setDatosRaw(prev => {
      const next = [nuevo, ...prev];
      lsSet(`ll_${nombre}`, next);
      syncSheets("guardar", nombre, nuevo);   // append solo el item nuevo
      return next;
    });
  }, [nombre]);

  const eliminar = useCallback((id) => {
    setDatosRaw(prev => {
      const next = prev.filter(x => x.id !== id);
      lsSet(`ll_${nombre}`, next);
      syncSheets("eliminar", nombre, null, id); // elimina por id
      return next;
    });
  }, [nombre]);

  return { datos, setDatos, agregar, eliminar, cargando };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString("es-CL", { minimumFractionDigits: 0 });
const fmtMiles = (n) => {
  const abs = Math.abs(Number(n || 0));
  if (abs >= 1_000_000) return `$${(Number(n) / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(Number(n) / 1_000).toFixed(0)}k`;
  return `$${fmt(n)}`;
};
const hoy = () => new Date().toISOString().split("T")[0];
const uid = () => `id_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;

// ─── ESTILOS BASE ──────────────────────────────────────────────────────────────
const S = {
  app: {
    fontFamily: "'Source Sans 3', 'Segoe UI', sans-serif",
    background: "#F5F0E8",
    minHeight: "100vh",
    maxWidth: 480,
    margin: "0 auto",
    paddingBottom: 80,
    color: "#3D2B1F",
  },
  header: {
    background: "#3D2B1F",
    color: "#F5F0E8",
    padding: "16px 20px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  titulo: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
  },
  nav: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: 480,
    background: "#3D2B1F",
    display: "flex",
    justifyContent: "space-around",
    padding: "8px 0 12px",
    zIndex: 100,
  },
  navBtn: (activo) => ({
    background: "none",
    border: "none",
    color: activo ? "#C8852A" : "#F5F0E8aa",
    fontSize: 10,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 8,
  }),
  navIcon: { fontSize: 22 },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: "16px",
    margin: "12px 16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },
  cardTitulo: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 16,
    fontWeight: 700,
    color: "#3D2B1F",
    marginBottom: 12,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: 8,
    fontSize: 15,
    background: "#fafafa",
    color: "#3D2B1F",
    boxSizing: "border-box",
    marginBottom: 10,
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: 8,
    fontSize: 15,
    background: "#fafafa",
    color: "#3D2B1F",
    boxSizing: "border-box",
    marginBottom: 10,
    appearance: "none",
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "#666",
    marginBottom: 4,
    display: "block",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  btnPrimario: {
    width: "100%",
    padding: "13px",
    background: "#C8852A",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 4,
  },
  btnSecundario: {
    padding: "8px 16px",
    background: "transparent",
    color: "#C8852A",
    border: "1.5px solid #C8852A",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnDanger: {
    padding: "6px 10px",
    background: "transparent",
    color: "#c0392b",
    border: "1px solid #c0392b",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  },
  row: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
  },
  tag: (color) => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    background: color + "22",
    color: color,
    whiteSpace: "nowrap",
  }),
  badge: (tipo) => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    background: tipo === "ingreso" ? "#4A5E3A22" : "#c0392b22",
    color: tipo === "ingreso" ? "#4A5E3A" : "#c0392b",
  }),
  separador: { borderBottom: "1px solid #eee", margin: "10px 0" },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    padding: "0 16px 4px",
  },
  kpiCard: (color) => ({
    background: color + "15",
    borderLeft: `4px solid ${color}`,
    borderRadius: 10,
    padding: "12px 14px",
  }),
  kpiVal: { fontSize: 22, fontWeight: 800, color: "#3D2B1F" },
  kpiLabel: { fontSize: 11, color: "#666", marginTop: 2 },
  seccionTitulo: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 18,
    fontWeight: 700,
    padding: "20px 16px 8px",
    color: "#3D2B1F",
  },
  listaItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "10px 0",
    borderBottom: "1px solid #f0ebe3",
  },
  modal: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 200,
  },
  modalContent: {
    background: "#F5F0E8",
    borderRadius: "20px 20px 0 0",
    padding: "24px 20px 32px",
    width: "100%",
    maxWidth: 480,
    maxHeight: "90vh",
    overflowY: "auto",
  },
  modalTitulo: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 20,
    color: "#3D2B1F",
  },
  toast: {
    position: "fixed",
    bottom: 90,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#3D2B1F",
    color: "#F5F0E8",
    padding: "10px 24px",
    borderRadius: 30,
    fontSize: 14,
    fontWeight: 600,
    zIndex: 300,
    whiteSpace: "nowrap",
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
  },
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
function Toast({ msg, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [onClose]);
  if (!msg) return null;
  return <div style={S.toast}>{msg}</div>;
}

// ─── MODAL WRAPPER ────────────────────────────────────────────────────────────
function Modal({ titulo, onClose, children }) {
  return (
    <div style={S.modal} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modalContent}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ ...S.modalTitulo, margin: 0 }}>{titulo}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#999" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── MÓDULO DASHBOARD ─────────────────────────────────────────────────────────
function ModuloDashboard({ finanzas, inventario, tareas, personal }) {
  const mesActual = new Date().toISOString().slice(0, 7);
  const movMes = finanzas.filter(f => (f.fecha || "").startsWith(mesActual));
  const ingresos = movMes.filter(f => f.tipo === "ingreso").reduce((a, b) => a + Number(b.monto || 0), 0);
  const gastos = movMes.filter(f => f.tipo === "gasto").reduce((a, b) => a + Number(b.monto || 0), 0);
  const saldo = ingresos - gastos;
  const tareasPend = tareas.filter(t => t.estado !== "completada").length;
  const stockBajo = inventario.filter(i => Number(i.stock || 0) <= Number(i.stockMinimo || 0)).length;

  const ultMovs = [...finanzas]
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))
    .slice(0, 5);

  const mes = new Date().toLocaleString("es-CL", { month: "long", year: "numeric" });

  return (
    <div>
      <p style={{ padding: "8px 16px 0", color: "#888", fontSize: 13, textTransform: "capitalize" }}>{mes}</p>
      <div style={S.kpiGrid}>
        <div style={S.kpiCard("#4A5E3A")}>
          <div style={S.kpiVal}>{fmtMiles(ingresos)}</div>
          <div style={S.kpiLabel}>Ingresos mes</div>
        </div>
        <div style={S.kpiCard("#c0392b")}>
          <div style={S.kpiVal}>{fmtMiles(gastos)}</div>
          <div style={S.kpiLabel}>Gastos mes</div>
        </div>
        <div style={S.kpiCard(saldo >= 0 ? "#C8852A" : "#c0392b")}>
          <div style={S.kpiVal}>{fmtMiles(saldo)}</div>
          <div style={S.kpiLabel}>Resultado mes</div>
        </div>
        <div style={S.kpiCard("#3D2B1F")}>
          <div style={S.kpiVal}>{tareasPend}</div>
          <div style={S.kpiLabel}>Tareas pendientes</div>
        </div>
      </div>

      {stockBajo > 0 && (
        <div style={{ ...S.card, background: "#fff3cd", border: "1px solid #C8852A" }}>
          <div style={{ fontWeight: 700, color: "#C8852A" }}>⚠️ Stock bajo</div>
          <div style={{ fontSize: 13, color: "#7a5a1e", marginTop: 4 }}>
            {stockBajo} producto{stockBajo > 1 ? "s" : ""} bajo el mínimo en inventario.
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.cardTitulo}>Últimos movimientos</div>
        {ultMovs.length === 0 && <p style={{ color: "#aaa", fontSize: 14 }}>Sin registros aún.</p>}
        {ultMovs.map(m => (
          <div key={m.id} style={S.listaItem}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{m.descripcion || m.categoria}</div>
              <div style={{ fontSize: 12, color: "#888" }}>{m.fecha} · {CENTROS.find(c => c.id === m.centro)?.icon} {m.centro}</div>
            </div>
            <div style={{ fontWeight: 700, color: m.tipo === "ingreso" ? "#4A5E3A" : "#c0392b", whiteSpace: "nowrap" }}>
              {m.tipo === "ingreso" ? "+" : "-"}${fmt(m.monto)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MÓDULO FINANZAS ──────────────────────────────────────────────────────────
function ModuloFinanzas({ datos, agregar, eliminar }) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroCentro, setFiltroCentro] = useState("todos");
  const [filtroMes, setFiltroMes] = useState(new Date().toISOString().slice(0, 7));

  const [form, setForm] = useState({
    tipo: "gasto", fecha: hoy(), monto: "", categoria: "", descripcion: "", centro: "campo_general", proveedor: "",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const guardar = () => {
    if (!form.monto || !form.categoria) return;
    agregar({ ...form, monto: Number(form.monto) });
    setForm({ tipo: "gasto", fecha: hoy(), monto: "", categoria: "", descripcion: "", centro: "campo_general", proveedor: "" });
    setModalAbierto(false);
  };

  const filtrados = datos
    .filter(d => filtroTipo === "todos" || d.tipo === filtroTipo)
    .filter(d => filtroCentro === "todos" || d.centro === filtroCentro)
    .filter(d => !filtroMes || (d.fecha || "").startsWith(filtroMes))
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

  const totalIngresos = filtrados.filter(d => d.tipo === "ingreso").reduce((a, b) => a + Number(b.monto || 0), 0);
  const totalGastos = filtrados.filter(d => d.tipo === "gasto").reduce((a, b) => a + Number(b.monto || 0), 0);

  const categoriasForm = form.tipo === "ingreso" ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO;

  return (
    <div>
      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ ...S.seccionTitulo, padding: 0, margin: 0 }}>Finanzas</h2>
        <button onClick={() => setModalAbierto(true)} style={{ ...S.btnPrimario, width: "auto", padding: "10px 20px", fontSize: 14 }}>
          + Registrar
        </button>
      </div>

      {/* Filtros */}
      <div style={{ padding: "0 16px 8px", display: "flex", gap: 8, overflowX: "auto", flexWrap: "wrap" }}>
        <input type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
          style={{ ...S.input, width: "auto", marginBottom: 0, padding: "6px 10px", fontSize: 13 }} />
        {["todos", "ingreso", "gasto"].map(t => (
          <button key={t} onClick={() => setFiltroTipo(t)}
            style={{ ...S.btnSecundario, padding: "6px 12px", background: filtroTipo === t ? "#C8852A" : "transparent", color: filtroTipo === t ? "#fff" : "#C8852A" }}>
            {t === "todos" ? "Todos" : t === "ingreso" ? "Ingresos" : "Gastos"}
          </button>
        ))}
      </div>

      {/* Resumen rápido */}
      <div style={{ ...S.row, padding: "0 16px 4px", gap: 8 }}>
        <div style={{ flex: 1, ...S.kpiCard("#4A5E3A"), padding: "10px 12px" }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtMiles(totalIngresos)}</div>
          <div style={{ fontSize: 11, color: "#666" }}>Ingresos</div>
        </div>
        <div style={{ flex: 1, ...S.kpiCard("#c0392b"), padding: "10px 12px" }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtMiles(totalGastos)}</div>
          <div style={{ fontSize: 11, color: "#666" }}>Gastos</div>
        </div>
        <div style={{ flex: 1, ...S.kpiCard(totalIngresos - totalGastos >= 0 ? "#C8852A" : "#c0392b"), padding: "10px 12px" }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtMiles(totalIngresos - totalGastos)}</div>
          <div style={{ fontSize: 11, color: "#666" }}>Resultado</div>
        </div>
      </div>

      {/* Lista */}
      <div style={S.card}>
        {filtrados.length === 0 && <p style={{ color: "#aaa", fontSize: 14, textAlign: "center", padding: "20px 0" }}>Sin registros para este filtro.</p>}
        {filtrados.map(mov => (
          <div key={mov.id} style={S.listaItem}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={S.badge(mov.tipo)}>{mov.tipo}</span>
                <span style={{ fontSize: 12, color: "#888" }}>{mov.fecha}</span>
                <span style={{ fontSize: 11, color: "#aaa" }}>{CENTROS.find(c => c.id === mov.centro)?.icon}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 3 }}>{mov.descripcion || mov.categoria}</div>
              <div style={{ fontSize: 12, color: "#888" }}>{mov.categoria}{mov.proveedor ? ` · ${mov.proveedor}` : ""}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: mov.tipo === "ingreso" ? "#4A5E3A" : "#c0392b" }}>
                {mov.tipo === "ingreso" ? "+" : "-"}${fmt(mov.monto)}
              </div>
              <button onClick={() => eliminar(mov.id)} style={S.btnDanger}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {modalAbierto && (
        <Modal titulo={`Nuevo ${form.tipo}`} onClose={() => setModalAbierto(false)}>
          <label style={S.label}>Tipo</label>
          <div style={{ ...S.row, marginBottom: 10 }}>
            {["gasto", "ingreso"].map(t => (
              <button key={t} onClick={() => set("tipo", t)}
                style={{ flex: 1, padding: "10px", border: "1.5px solid", borderColor: form.tipo === t ? "#C8852A" : "#ddd",
                  borderRadius: 8, background: form.tipo === t ? "#C8852A" : "#fff", color: form.tipo === t ? "#fff" : "#666", fontWeight: 700, cursor: "pointer" }}>
                {t === "gasto" ? "Gasto" : "Ingreso"}
              </button>
            ))}
          </div>

          <label style={S.label}>Fecha</label>
          <input type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} style={S.input} />

          <label style={S.label}>Monto ($)</label>
          <input type="number" value={form.monto} onChange={e => set("monto", e.target.value)}
            placeholder="0" style={S.input} inputMode="numeric" />

          <label style={S.label}>Categoría</label>
          <select value={form.categoria} onChange={e => set("categoria", e.target.value)} style={S.select}>
            <option value="">— Seleccionar —</option>
            {categoriasForm.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <label style={S.label}>Centro de costo</label>
          <select value={form.centro} onChange={e => set("centro", e.target.value)} style={S.select}>
            {CENTROS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>

          <label style={S.label}>Descripción (opcional)</label>
          <input value={form.descripcion} onChange={e => set("descripcion", e.target.value)}
            placeholder="Ej: Abono para avellano sector norte" style={S.input} />

          <label style={S.label}>{form.tipo === "gasto" ? "Proveedor" : "Cliente"} (opcional)</label>
          <input value={form.proveedor} onChange={e => set("proveedor", e.target.value)}
            placeholder="Nombre" style={S.input} />

          <button onClick={guardar} style={S.btnPrimario}>
            Guardar {form.tipo}
          </button>
        </Modal>
      )}
    </div>
  );
}

// ─── MÓDULO INVENTARIO ────────────────────────────────────────────────────────
function ModuloInventario({ datos, agregar, eliminar }) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [filtroCentro, setFiltroCentro] = useState("todos");
  const [form, setForm] = useState({
    nombre: "", cantidad: "", unidad: "unidad", stockMinimo: "",
    centro: "campo_general", categoria: "", observacion: "",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const guardar = () => {
    if (!form.nombre || !form.cantidad) return;
    agregar({ ...form, stock: Number(form.cantidad), cantidad: undefined });
    setForm({ nombre: "", cantidad: "", unidad: "unidad", stockMinimo: "", centro: "campo_general", categoria: "", observacion: "" });
    setModalAbierto(false);
  };

  const filtrados = datos
    .filter(d => filtroCentro === "todos" || d.centro === filtroCentro);

  return (
    <div>
      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ ...S.seccionTitulo, padding: 0, margin: 0 }}>Inventario</h2>
        <button onClick={() => setModalAbierto(true)}
          style={{ ...S.btnPrimario, width: "auto", padding: "10px 20px", fontSize: 14 }}>
          + Agregar
        </button>
      </div>

      <div style={{ padding: "0 16px 8px", display: "flex", gap: 8, overflowX: "auto" }}>
        {["todos", ...CENTROS.map(c => c.id)].map(id => {
          const c = CENTROS.find(x => x.id === id);
          return (
            <button key={id} onClick={() => setFiltroCentro(id)}
              style={{ ...S.btnSecundario, padding: "6px 12px", whiteSpace: "nowrap",
                background: filtroCentro === id ? "#C8852A" : "transparent",
                color: filtroCentro === id ? "#fff" : "#C8852A" }}>
              {id === "todos" ? "Todos" : `${c?.icon} ${c?.id}`}
            </button>
          );
        })}
      </div>

      <div style={S.card}>
        {filtrados.length === 0 && <p style={{ color: "#aaa", fontSize: 14, textAlign: "center", padding: "20px 0" }}>Sin productos.</p>}
        {filtrados.map(item => {
          const bajo = Number(item.stock || 0) <= Number(item.stockMinimo || 0);
          return (
            <div key={item.id} style={S.listaItem}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{item.nombre}</span>
                  {bajo && <span style={S.tag("#c0392b")}>⚠ bajo</span>}
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>
                  {CENTROS.find(c => c.id === item.centro)?.icon} {item.centro}
                  {item.categoria ? ` · ${item.categoria}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <div style={{ fontWeight: 700, color: bajo ? "#c0392b" : "#3D2B1F" }}>
                  {item.stock} {item.unidad}
                </div>
                <button onClick={() => eliminar(item.id)} style={S.btnDanger}>✕</button>
              </div>
            </div>
          );
        })}
      </div>

      {modalAbierto && (
        <Modal titulo="Nuevo producto" onClose={() => setModalAbierto(false)}>
          <label style={S.label}>Nombre del producto</label>
          <input value={form.nombre} onChange={e => set("nombre", e.target.value)}
            placeholder="Ej: Herbicida Glifosato" style={S.input} />

          <div style={S.row}>
            <div style={{ flex: 2 }}>
              <label style={S.label}>Cantidad actual</label>
              <input type="number" value={form.cantidad} onChange={e => set("cantidad", e.target.value)}
                placeholder="0" style={S.input} inputMode="numeric" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Unidad</label>
              <select value={form.unidad} onChange={e => set("unidad", e.target.value)} style={S.select}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <label style={S.label}>Stock mínimo (alerta)</label>
          <input type="number" value={form.stockMinimo} onChange={e => set("stockMinimo", e.target.value)}
            placeholder="0" style={S.input} inputMode="numeric" />

          <label style={S.label}>Centro de costo</label>
          <select value={form.centro} onChange={e => set("centro", e.target.value)} style={S.select}>
            {CENTROS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>

          <label style={S.label}>Categoría (opcional)</label>
          <input value={form.categoria} onChange={e => set("categoria", e.target.value)}
            placeholder="Ej: Fitosanitarios" style={S.input} />

          <button onClick={guardar} style={S.btnPrimario}>Guardar producto</button>
        </Modal>
      )}
    </div>
  );
}

// ─── MÓDULO TAREAS ────────────────────────────────────────────────────────────
const PRIORIDADES = ["urgente", "alta", "normal", "baja"];
const ESTADOS_TAREA = ["pendiente", "en progreso", "completada"];
const RESPONSABLES = ["Juaco", "Alejandra", "Joel", "Abraham", "Hernán", "Josefa"];

function ModuloTareas({ datos, agregar, eliminar, setDatos }) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("activas");
  const [form, setForm] = useState({
    titulo: "", descripcion: "", prioridad: "normal", estado: "pendiente",
    responsable: "Juaco", centro: "campo_general", fechaLimite: "",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const guardar = () => {
    if (!form.titulo) return;
    agregar({ ...form, fechaCreacion: hoy() });
    setForm({ titulo: "", descripcion: "", prioridad: "normal", estado: "pendiente", responsable: "Juaco", centro: "campo_general", fechaLimite: "" });
    setModalAbierto(false);
  };

  const cambiarEstado = (id, nuevoEstado) => {
    const actualizados = datos.map(t => t.id === id ? { ...t, estado: nuevoEstado } : t);
    setDatos(actualizados);
  };

  const filtradas = datos
    .filter(t => filtroEstado === "todas" ? true : filtroEstado === "activas" ? t.estado !== "completada" : t.estado === "completada")
    .sort((a, b) => PRIORIDADES.indexOf(a.prioridad) - PRIORIDADES.indexOf(b.prioridad));

  const coloresPrioridad = { urgente: "#c0392b", alta: "#C8852A", normal: "#4A5E3A", baja: "#888" };

  return (
    <div>
      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ ...S.seccionTitulo, padding: 0, margin: 0 }}>Tareas</h2>
        <button onClick={() => setModalAbierto(true)}
          style={{ ...S.btnPrimario, width: "auto", padding: "10px 20px", fontSize: 14 }}>
          + Nueva
        </button>
      </div>

      <div style={{ padding: "0 16px 8px", display: "flex", gap: 8 }}>
        {[["activas", "Activas"], ["todas", "Todas"], ["completada", "Hechas"]].map(([val, lbl]) => (
          <button key={val} onClick={() => setFiltroEstado(val)}
            style={{ ...S.btnSecundario, padding: "6px 12px",
              background: filtroEstado === val ? "#C8852A" : "transparent",
              color: filtroEstado === val ? "#fff" : "#C8852A" }}>
            {lbl}
          </button>
        ))}
      </div>

      <div style={S.card}>
        {filtradas.length === 0 && <p style={{ color: "#aaa", fontSize: 14, textAlign: "center", padding: "20px 0" }}>Sin tareas.</p>}
        {filtradas.map(t => (
          <div key={t.id} style={{ ...S.listaItem, opacity: t.estado === "completada" ? 0.5 : 1 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={S.tag(coloresPrioridad[t.prioridad] || "#888")}>{t.prioridad}</span>
                <span style={{ fontSize: 12, color: "#888" }}>{t.responsable}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{t.titulo}</div>
              {t.descripcion && <div style={{ fontSize: 12, color: "#888" }}>{t.descripcion}</div>}
              {t.fechaLimite && <div style={{ fontSize: 11, color: "#C8852A" }}>📅 {t.fechaLimite}</div>}
              <div style={{ marginTop: 8 }}>
                <select value={t.estado}
                  onChange={e => cambiarEstado(t.id, e.target.value)}
                  style={{ ...S.select, width: "auto", padding: "4px 8px", fontSize: 12, marginBottom: 0 }}>
                  {ESTADOS_TAREA.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
            <button onClick={() => eliminar(t.id)} style={{ ...S.btnDanger, marginLeft: 8 }}>✕</button>
          </div>
        ))}
      </div>

      {modalAbierto && (
        <Modal titulo="Nueva tarea" onClose={() => setModalAbierto(false)}>
          <label style={S.label}>Título</label>
          <input value={form.titulo} onChange={e => set("titulo", e.target.value)}
            placeholder="¿Qué hay que hacer?" style={S.input} />

          <label style={S.label}>Descripción (opcional)</label>
          <input value={form.descripcion} onChange={e => set("descripcion", e.target.value)}
            placeholder="Detalle" style={S.input} />

          <div style={S.row}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Prioridad</label>
              <select value={form.prioridad} onChange={e => set("prioridad", e.target.value)} style={S.select}>
                {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Responsable</label>
              <select value={form.responsable} onChange={e => set("responsable", e.target.value)} style={S.select}>
                {RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <label style={S.label}>Centro de costo</label>
          <select value={form.centro} onChange={e => set("centro", e.target.value)} style={S.select}>
            {CENTROS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>

          <label style={S.label}>Fecha límite (opcional)</label>
          <input type="date" value={form.fechaLimite} onChange={e => set("fechaLimite", e.target.value)} style={S.input} />

          <button onClick={guardar} style={S.btnPrimario}>Guardar tarea</button>
        </Modal>
      )}
    </div>
  );
}

// ─── MÓDULO PERSONAL ──────────────────────────────────────────────────────────
const TIPOS_TRABAJADOR = ["permanente", "temporal", "gerencial"];

function ModuloPersonal({ trabajadores, agregarTrabajador, eliminarTrabajador,
  registros, agregarRegistro, eliminarRegistro }) {
  const [vista, setVista] = useState("equipo");
  const [modalTrabajador, setModalTrabajador] = useState(false);
  const [modalHH, setModalHH] = useState(false);

  const [formT, setFormT] = useState({
    nombre: "", tipo: "permanente", cargo: "", sueldoBase: "",
    centros: ["campo_general"], activo: true,
  });

  const [formHH, setFormHH] = useState({
    trabajadorId: "", trabajadorNombre: "",
    fecha: hoy(), horas: "", actividad: "", centro: "campo_general",
    jornal: "", observacion: "",
  });

  const setT = (k, v) => setFormT(f => ({ ...f, [k]: v }));
  const setH = (k, v) => setFormHH(f => ({ ...f, [k]: v }));

  const guardarTrabajador = () => {
    if (!formT.nombre) return;
    agregarTrabajador(formT);
    setFormT({ nombre: "", tipo: "permanente", cargo: "", sueldoBase: "", centros: ["campo_general"], activo: true });
    setModalTrabajador(false);
  };

  const guardarHH = () => {
    if (!formHH.trabajadorId || !formHH.horas) return;
    agregarRegistro(formHH);
    setFormHH({ trabajadorId: "", trabajadorNombre: "", fecha: hoy(), horas: "", actividad: "", centro: "campo_general", jornal: "", observacion: "" });
    setModalHH(false);
  };

  const mesActual = new Date().toISOString().slice(0, 7);
  const registrosMes = registros.filter(r => (r.fecha || "").startsWith(mesActual));
  const hhTotalesMes = registrosMes.reduce((a, b) => a + Number(b.horas || 0), 0);

  return (
    <div>
      <div style={{ padding: "12px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ ...S.seccionTitulo, padding: 0, margin: 0 }}>Personal</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setModalTrabajador(true)} style={{ ...S.btnSecundario, padding: "8px 12px", fontSize: 13 }}>+ Persona</button>
          <button onClick={() => setModalHH(true)} style={{ ...S.btnPrimario, width: "auto", padding: "8px 14px", fontSize: 13 }}>+ HH</button>
        </div>
      </div>

      <div style={{ padding: "8px 16px", display: "flex", gap: 8 }}>
        {[["equipo", "Equipo"], ["registros", "Reg. HH"]].map(([val, lbl]) => (
          <button key={val} onClick={() => setVista(val)}
            style={{ ...S.btnSecundario, padding: "6px 16px",
              background: vista === val ? "#C8852A" : "transparent",
              color: vista === val ? "#fff" : "#C8852A" }}>
            {lbl}
          </button>
        ))}
      </div>

      {vista === "equipo" && (
        <div style={S.card}>
          <div style={{ marginBottom: 10, fontSize: 13, color: "#888" }}>
            HH este mes: <strong>{hhTotalesMes.toFixed(1)} hrs</strong>
          </div>
          {trabajadores.length === 0 && <p style={{ color: "#aaa", fontSize: 14, textAlign: "center" }}>Sin trabajadores.</p>}
          {trabajadores.map(t => (
            <div key={t.id} style={S.listaItem}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{t.nombre}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{t.cargo || t.tipo}</div>
                {t.sueldoBase && <div style={{ fontSize: 12, color: "#C8852A" }}>Base: ${fmt(t.sueldoBase)}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <span style={S.tag(t.tipo === "gerencial" ? "#C8852A" : t.tipo === "permanente" ? "#4A5E3A" : "#888")}>{t.tipo}</span>
                <button onClick={() => eliminarTrabajador(t.id)} style={S.btnDanger}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {vista === "registros" && (
        <div style={S.card}>
          {registros.length === 0 && <p style={{ color: "#aaa", fontSize: 14, textAlign: "center" }}>Sin registros.</p>}
          {[...registros].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")).map(r => (
            <div key={r.id} style={S.listaItem}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.trabajadorNombre}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{r.fecha} · {r.actividad}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{CENTROS.find(c => c.id === r.centro)?.icon} {r.centro}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>{r.horas} hrs</div>
                {r.jornal ? <div style={{ fontSize: 12, color: "#C8852A" }}>${fmt(r.jornal)}</div> : null}
                <button onClick={() => eliminarRegistro(r.id)} style={S.btnDanger}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal trabajador */}
      {modalTrabajador && (
        <Modal titulo="Agregar persona" onClose={() => setModalTrabajador(false)}>
          <label style={S.label}>Nombre completo</label>
          <input value={formT.nombre} onChange={e => setT("nombre", e.target.value)}
            placeholder="Nombre" style={S.input} />

          <label style={S.label}>Tipo</label>
          <select value={formT.tipo} onChange={e => setT("tipo", e.target.value)} style={S.select}>
            {TIPOS_TRABAJADOR.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <label style={S.label}>Cargo / Rol</label>
          <input value={formT.cargo} onChange={e => setT("cargo", e.target.value)}
            placeholder="Ej: Operario campo" style={S.input} />

          <label style={S.label}>Sueldo base ($)</label>
          <input type="number" value={formT.sueldoBase} onChange={e => setT("sueldoBase", e.target.value)}
            placeholder="0" style={S.input} inputMode="numeric" />

          <button onClick={guardarTrabajador} style={S.btnPrimario}>Guardar</button>
        </Modal>
      )}

      {/* Modal HH */}
      {modalHH && (
        <Modal titulo="Registrar horas" onClose={() => setModalHH(false)}>
          <label style={S.label}>Trabajador</label>
          <select value={formHH.trabajadorId}
            onChange={e => {
              const t = trabajadores.find(x => x.id === e.target.value);
              setH("trabajadorId", e.target.value);
              setH("trabajadorNombre", t?.nombre || "");
            }} style={S.select}>
            <option value="">— Seleccionar —</option>
            {trabajadores.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>

          <label style={S.label}>Fecha</label>
          <input type="date" value={formHH.fecha} onChange={e => setH("fecha", e.target.value)} style={S.input} />

          <div style={S.row}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Horas</label>
              <input type="number" value={formHH.horas} onChange={e => setH("horas", e.target.value)}
                placeholder="0" style={S.input} inputMode="decimal" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Jornal ($)</label>
              <input type="number" value={formHH.jornal} onChange={e => setH("jornal", e.target.value)}
                placeholder="0" style={S.input} inputMode="numeric" />
            </div>
          </div>

          <label style={S.label}>Actividad</label>
          <input value={formHH.actividad} onChange={e => setH("actividad", e.target.value)}
            placeholder="Ej: Poda avellanos sector A" style={S.input} />

          <label style={S.label}>Centro de costo</label>
          <select value={formHH.centro} onChange={e => setH("centro", e.target.value)} style={S.select}>
            {CENTROS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>

          <button onClick={guardarHH} style={S.btnPrimario}>Registrar horas</button>
        </Modal>
      )}
    </div>
  );
}

// ─── MÓDULO ESCÁNER ───────────────────────────────────────────────────────────
function ModuloEscaner({ onExtraer }) {
  const [estado, setEstado] = useState("idle");
  const [preview, setPreview] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [base64, setBase64] = useState(null);
  const [mediaType, setMediaType] = useState("image/jpeg");

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Guardar el tipo real del archivo; si es desconocido, usar jpeg como fallback
    const tipo = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";
    setMediaType(tipo);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target.result;
      setPreview(data);
      setBase64(data.split(",")[1]);
      setEstado("listo");
    };
    reader.readAsDataURL(file);
  };

  const analizar = async () => {
    if (!base64) return;
    setEstado("analizando");
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 }
              },
              {
                type: "text",
                text: `Analiza este documento (boleta, factura o recibo) y extrae los datos en formato JSON estricto, sin texto adicional, sin markdown:
{
  "tipo": "gasto" o "ingreso",
  "monto": número sin puntos ni símbolos,
  "fecha": "YYYY-MM-DD",
  "descripcion": "descripción breve del documento",
  "proveedor": "nombre del proveedor o emisor",
  "categoria": "una de estas: Insumos agrícolas, Combustible, Herramientas, Maquinaria, Mano de obra, Veterinario, Alimentación animales, Cafetería, Mantenimiento, Servicios básicos, Transporte, Administrativo, Otro",
  "detalles": "cualquier información adicional relevante"
}
Si no puedes extraer un campo, usa null.`
              }
            ]
          }]
        })
      });
      const data = await res.json();
      const texto = data.content?.[0]?.text || "";
      let parsed;
      try {
        const clean = texto.replace(/```json|```/g, "").trim();
        parsed = JSON.parse(clean);
      } catch {
        parsed = { error: "No se pudo parsear", raw: texto };
      }
      setResultado(parsed);
      setEstado("resultado");
    } catch (err) {
      setEstado("error");
    }
  };

  const enviarAFinanzas = () => {
    if (!resultado || resultado.error) return;
    onExtraer(resultado);
    setEstado("idle");
    setPreview(null);
    setResultado(null);
    setBase64(null);
  };

  return (
    <div>
      <h2 style={S.seccionTitulo}>Escáner IA</h2>
      <div style={S.card}>
        <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
          Saca foto o sube una boleta/factura y la IA extrae los datos automáticamente.
        </p>

        {estado === "idle" || estado === "listo" ? (
          <>
            <label style={{
              display: "block", background: "#f5f0e8", border: "2px dashed #C8852A",
              borderRadius: 12, padding: 24, textAlign: "center", cursor: "pointer", marginBottom: 12,
            }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
              <div style={{ color: "#C8852A", fontWeight: 700 }}>Toca para subir imagen</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Boleta, factura o recibo</div>
              <input type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
            </label>

            {preview && (
              <img src={preview} alt="preview" style={{ width: "100%", borderRadius: 8, marginBottom: 12, maxHeight: 300, objectFit: "contain" }} />
            )}

            {estado === "listo" && (
              <button onClick={analizar} style={S.btnPrimario}>🔍 Analizar con IA</button>
            )}
          </>
        ) : null}

        {estado === "analizando" && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
            <div style={{ color: "#C8852A", fontWeight: 700 }}>Analizando documento…</div>
          </div>
        )}

        {estado === "resultado" && resultado && !resultado.error && (
          <div>
            {preview && <img src={preview} alt="preview" style={{ width: "100%", borderRadius: 8, marginBottom: 12, maxHeight: 200, objectFit: "contain" }} />}
            <div style={{ background: "#f0f7ee", borderRadius: 10, padding: 16, marginBottom: 12 }}>
              <div style={S.cardTitulo}>Datos extraídos</div>
              {[
                ["Tipo", resultado.tipo],
                ["Monto", resultado.monto ? `$${fmt(resultado.monto)}` : null],
                ["Fecha", resultado.fecha],
                ["Descripción", resultado.descripcion],
                ["Proveedor", resultado.proveedor],
                ["Categoría", resultado.categoria],
              ].map(([k, v]) => v ? (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #ddd" }}>
                  <span style={{ fontSize: 13, color: "#666" }}>{k}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{v}</span>
                </div>
              ) : null)}
            </div>
            <button onClick={enviarAFinanzas} style={S.btnPrimario}>✅ Enviar a Finanzas</button>
            <button onClick={() => { setEstado("idle"); setPreview(null); setResultado(null); }}
              style={{ ...S.btnSecundario, width: "100%", marginTop: 8 }}>Descartar</button>
          </div>
        )}

        {estado === "error" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ color: "#c0392b", fontWeight: 700 }}>Error al analizar</div>
            <button onClick={() => setEstado("listo")} style={{ ...S.btnSecundario, marginTop: 12 }}>Intentar de nuevo</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
const TABS = [
  { id: "dashboard", icon: "🏠", label: "Inicio" },
  { id: "finanzas",  icon: "💰", label: "Finanzas" },
  { id: "inventario",icon: "📦", label: "Insumos" },
  { id: "tareas",    icon: "✅", label: "Tareas" },
  { id: "personal",  icon: "👷", label: "Personal" },
  { id: "escaner",   icon: "📷", label: "Escáner" },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState("");

  const finanzas   = useTabla("finanzas");
  const inventario = useTabla("inventario");
  const tareas     = useTabla("tareas");
  const trabajadores = useTabla("trabajadores");
  const registrosHH  = useTabla("registrosHH");

  const showToast = (msg) => setToast(msg);

  // Wrapper para agregar con toast
  const agregarConToast = (tabla, msg) => (item) => {
    tabla.agregar(item);
    showToast(msg);
  };

  // Cuando el escáner extrae datos → pre-llena finanzas y va a esa tab
  const handleExtraccion = (datos) => {
    finanzas.agregar({
      tipo: datos.tipo || "gasto",
      fecha: datos.fecha || hoy(),
      monto: Number(datos.monto || 0),
      categoria: datos.categoria || "Otro",
      descripcion: datos.descripcion || "",
      proveedor: datos.proveedor || "",
      centro: "campo_general",
      origen: "escaner",
    });
    setTab("finanzas");
    showToast("✅ Documento registrado en Finanzas");
  };

  const renderTab = () => {
    switch (tab) {
      case "dashboard":
        return <ModuloDashboard
          finanzas={finanzas.datos}
          inventario={inventario.datos}
          tareas={tareas.datos}
          personal={trabajadores.datos}
        />;
      case "finanzas":
        return <ModuloFinanzas
          datos={finanzas.datos}
          agregar={agregarConToast(finanzas, "💰 Movimiento guardado")}
          eliminar={finanzas.eliminar}
        />;
      case "inventario":
        return <ModuloInventario
          datos={inventario.datos}
          agregar={agregarConToast(inventario, "📦 Producto guardado")}
          eliminar={inventario.eliminar}
        />;
      case "tareas":
        return <ModuloTareas
          datos={tareas.datos}
          agregar={agregarConToast(tareas, "✅ Tarea creada")}
          eliminar={tareas.eliminar}
          setDatos={tareas.setDatos}
        />;
      case "personal":
        return <ModuloPersonal
          trabajadores={trabajadores.datos}
          agregarTrabajador={agregarConToast(trabajadores, "👷 Persona agregada")}
          eliminarTrabajador={trabajadores.eliminar}
          registros={registrosHH.datos}
          agregarRegistro={agregarConToast(registrosHH, "⏱ Horas registradas")}
          eliminarRegistro={registrosHH.eliminar}
        />;
      case "escaner":
        return <ModuloEscaner onExtraer={handleExtraccion} />;
      default:
        return null;
    }
  };

  return (
    <div style={S.app}>
      {/* Header */}
      <div style={S.header}>
        <h1 style={S.titulo}>Llamadministrador</h1>
        <div style={{ fontSize: 12, color: "#F5F0E8aa" }}>
          {TABS.find(t => t.id === tab)?.label}
        </div>
      </div>

      {/* Contenido */}
      <div style={{ paddingTop: 4 }}>
        {renderTab()}
      </div>

      {/* Nav */}
      <nav style={S.nav}>
        {TABS.map(t => (
          <button key={t.id} style={S.navBtn(tab === t.id)} onClick={() => setTab(t.id)}>
            <span style={S.navIcon}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {/* Toast */}
      {toast && <Toast msg={toast} onClose={() => setToast("")} />}
    </div>
  );
}
