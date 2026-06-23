import { useState, useEffect, useCallback, useRef } from "react";

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

// Categorías de inventario
const CATEGORIAS_INVENTARIO = [
  "Fertilizantes foliares","Herbicidas","Fungicidas/Bactericidas","Insecticidas",
  "Bioestimulantes","Coadyuvantes","Adherentes","Combustibles",
  "Herramientas","Repuestos","Semillas","Veterinario","Alimentación animales","Otros",
];

// Categorías de gasto que pueden generar un movimiento de entrada en inventario
const CATS_INSUMO = new Set([
  "Insumos agrícolas","Combustible","Herramientas","Veterinario","Alimentación animales",
]);

const UNIDADES = ["kg","L","unidad","saco","fardo","caja","rollo","dosis","metro","g","mL"];

// Stock calculado en tiempo real desde movimientos
const calcStock = (productoId, movs) => {
  const propios = movs.filter(m => String(m.producto_id) === String(productoId));
  const ent = propios.filter(m => m.tipo === "entrada").reduce((a, b) => a + Number(b.cantidad || 0), 0);
  const sal = propios.filter(m => m.tipo === "salida").reduce((a, b) => a + Number(b.cantidad || 0), 0);
  return ent - sal;
};

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
    const nuevo = { ...item, id: item.id || `${nombre}_${Date.now()}` };
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

  const recargar = useCallback(() => {
    setCargando(true);
    return loadFromSheets(nombre).then(remoto => {
      if (remoto && remoto.length > 0) {
        setDatosRaw(remoto);
        lsSet(`ll_${nombre}`, remoto);
      }
      setCargando(false);
    });
  }, [nombre]);

  const actualizar = useCallback((item) => {
    setDatosRaw(prev => {
      const next = prev.map(x => x.id === item.id ? item : x);
      lsSet(`ll_${nombre}`, next);
      syncSheets("actualizar", nombre, item);
      return next;
    });
  }, [nombre]);

  return { datos, setDatos, agregar, actualizar, eliminar, cargando, recargar };
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
function exportarExcel({ finanzas, inventario, movInventario, tareas, trabajadores, registrosHH }) {
  if (!window.XLSX) {
    alert("No se pudo cargar el motor de Excel. Intenta de nuevo en unos segundos.");
    return;
  }
  const wb = window.XLSX.utils.book_new();
  const addSheet = (datos, nombre) => {
    const hoja = window.XLSX.utils.json_to_sheet(datos && datos.length > 0 ? datos : [{ sin_datos: true }]);
    window.XLSX.utils.book_append_sheet(wb, hoja, nombre);
  };
  addSheet(finanzas, "Finanzas");
  addSheet(inventario, "Inventario");
  addSheet(movInventario, "MovimientosInventario");
  addSheet(tareas, "Tareas");
  addSheet(trabajadores, "Trabajadores");
  addSheet(registrosHH, "RegistrosHH");
  const fechaArchivo = new Date().toISOString().slice(0, 10);
  window.XLSX.writeFile(wb, `Llamadministrador_${fechaArchivo}.xlsx`);
}

function VistaInforme({ finanzas, inventario, movInventario, tareas, trabajadores, registrosHH, onVolver }) {
  const [mesSel, setMesSel] = useState(new Date().toISOString().slice(0, 7));

  const cambiarMes = (delta) => {
    const [y, m] = mesSel.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMesSel(d.toISOString().slice(0, 7));
  };

  const labelMesLargo = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleString("es-CL", { month: "long", year: "numeric" });
  };

  const mesAnteriorStr = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    return d.toISOString().slice(0, 7);
  };

  const movMes    = finanzas.filter(f => (f.fecha || "").startsWith(mesSel));
  const movAnt    = finanzas.filter(f => (f.fecha || "").startsWith(mesAnteriorStr(mesSel)));
  const suma      = (arr, tipo) => arr.filter(f => f.tipo === tipo).reduce((a, b) => a + Number(b.monto || 0), 0);
  const ing = suma(movMes, "ingreso"); const gas = suma(movMes, "gasto"); const resultado = ing - gas;
  const ingAnt = suma(movAnt, "ingreso"); const gasAnt = suma(movAnt, "gasto");
  const varPct = (a, b) => b === 0 ? null : Math.round(((a - b) / b) * 100);

  // Gastos por categoría y centro
  const tabla = {};
  movMes.filter(f => f.tipo === "gasto").forEach(f => {
    const key = `${f.categoria || "Otro"}|${f.centro || "—"}`;
    tabla[key] = (tabla[key] || 0) + Number(f.monto || 0);
  });
  const filasTabla = Object.entries(tabla)
    .map(([key, val]) => { const [cat, centro] = key.split("|"); return { cat, centro, val }; })
    .sort((a, b) => b.val - a.val);

  // Personal del mes
  const regsMes = registrosHH.filter(r => (r.fecha || "").startsWith(mesSel));
  const hhTemporales = regsMes.reduce((a, b) => a + Number(b.horas || 0), 0);
  const pagadoVariable = regsMes.reduce((a, b) => a + Number(b.jornal || 0), 0);
  const liquidacionesFijas = movMes.filter(f => f.categoria === "Mano de obra").reduce((a, b) => a + Number(b.monto || 0), 0);

  // Inventario
  const movInvMes = movInventario.filter(m => (m.fecha || "").startsWith(mesSel));
  const entradasMes = movInvMes.filter(m => m.tipo === "entrada").length;
  const salidasMes  = movInvMes.filter(m => m.tipo === "salida").length;
  const stockBajo   = inventario.filter(i => {
    const stock = calcStock(i.id, movInventario);
    return i.minimo && stock <= Number(i.minimo);
  });

  // Tareas del mes
  const tareasCompletadasMes = tareas.filter(t => t.estado === "completada" && (t.fechaCreacion || t.fecha_creacion || "").startsWith(mesSel)).length;
  const tareasPendActuales   = tareas.filter(t => t.estado !== "completada").length;

  return (
    <div>
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={onVolver} style={{ ...S.btnSecundario, padding: "6px 12px", fontSize: 13 }}>← Volver</button>
        <h2 style={{ ...S.seccionTitulo, padding: 0, margin: 0, fontSize: 18 }}>Informe</h2>
        <div style={{ width: 70 }} />
      </div>

      <div style={{ padding: "0 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => cambiarMes(-1)} style={{ ...S.btnSecundario, padding: "4px 10px" }}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 700, textTransform: "capitalize" }}>{labelMesLargo(mesSel)}</span>
          <button onClick={() => cambiarMes(1)} style={{ ...S.btnSecundario, padding: "4px 10px" }}>›</button>
        </div>
        <button
          onClick={() => exportarExcel({ finanzas, inventario, movInventario, tareas, trabajadores, registrosHH })}
          style={{ ...S.btnPrimario, width: "auto", padding: "8px 14px", fontSize: 13 }}>
          ⬇ Exportar a Excel
        </button>
      </div>

      <div style={{ padding: "0 16px" }}>
        {/* KPIs del mes */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <div style={{ background: "#eaf4e6", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#4A5E3A" }}>Ingresos</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#4A5E3A" }}>${fmt(ing)}</div>
          </div>
          <div style={{ background: "#fdecea", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#c0392b" }}>Gastos</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#c0392b" }}>${fmt(gas)}</div>
          </div>
          <div style={{ background: "#f5f0e8", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#3D2B1F" }}>Resultado</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: resultado >= 0 ? "#4A5E3A" : "#c0392b" }}>${fmt(resultado)}</div>
          </div>
          <div style={{ background: "#f5f0e8", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#3D2B1F" }}>vs mes anterior</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {varPct(gas, gasAnt) === null ? "—" : `${varPct(gas, gasAnt) > 0 ? "+" : ""}${varPct(gas, gasAnt)}%`}
            </div>
          </div>
        </div>

        {/* Tabla gastos por categoría y centro */}
        <div style={S.card}>
          <div style={S.cardTitulo}>Gastos por categoría y centro de costo</div>
          {filasTabla.length === 0 && <p style={{ color: "#aaa", fontSize: 13, textAlign: "center" }}>Sin gastos este mes.</p>}
          {filasTabla.map((f, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f0ece6", fontSize: 13 }}>
              <span>{f.cat}</span>
              <span style={{ color: "#888" }}>{CENTROS.find(c => c.id === f.centro)?.label || f.centro}</span>
              <span style={{ fontWeight: 700, color: "#c0392b" }}>${fmt(f.val)}</span>
            </div>
          ))}
        </div>

        {/* Personal e Inventario lado a lado */}
        <div style={S.card}>
          <div style={S.cardTitulo}>Personal</div>
          <div style={{ fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ color: "#888" }}>HH temporales</span><span>{hhTemporales.toFixed(1)} hrs</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ color: "#888" }}>Pagado variable (temporales)</span><span style={{ fontWeight: 700 }}>${fmt(pagadoVariable)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ color: "#888" }}>Liquidaciones / sueldos fijos</span><span style={{ fontWeight: 700 }}>${fmt(liquidacionesFijas)}</span>
            </div>
          </div>
        </div>

        <div style={S.card}>
          <div style={S.cardTitulo}>Inventario</div>
          <div style={{ fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ color: "#888" }}>Productos bajo mínimo</span>
              <span style={{ fontWeight: 700, color: stockBajo.length > 0 ? "#c0392b" : "#4A5E3A" }}>{stockBajo.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ color: "#888" }}>Entradas del mes</span><span>{entradasMes}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ color: "#888" }}>Salidas del mes</span><span>{salidasMes}</span>
            </div>
          </div>
        </div>

        <div style={S.card}>
          <div style={S.cardTitulo}>Tareas</div>
          <div style={{ fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ color: "#888" }}>Completadas en {labelMesLargo(mesSel).split(" ")[0]}</span><span>{tareasCompletadasMes}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ color: "#888" }}>Pendientes actuales (todas)</span><span>{tareasPendActuales}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModuloDashboard({ finanzas, inventario, tareas, personal, movInventario, registrosHH }) {
  const [vistaInforme, setVistaInforme] = useState(false);

  if (vistaInforme) {
    return <VistaInforme
      finanzas={finanzas} inventario={inventario} movInventario={movInventario || []}
      tareas={tareas} trabajadores={personal} registrosHH={registrosHH || []}
      onVolver={() => setVistaInforme(false)}
    />;
  }

  const getMes = (off = 0) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - off);
    return d.toISOString().slice(0, 7);
  };
  const labelMes = (ym) => {
    const nombres = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return nombres[parseInt(ym.slice(5)) - 1];
  };
  const suma = (arr, tipo) => arr.filter(f => f.tipo === tipo).reduce((a, b) => a + Number(b.monto || 0), 0);

  const mesAct = getMes(0); const mesAnt = getMes(1);
  const movAct = finanzas.filter(f => (f.fecha || "").startsWith(mesAct));
  const movAnt = finanzas.filter(f => (f.fecha || "").startsWith(mesAnt));

  const ingAct = suma(movAct, "ingreso"); const gasAct = suma(movAct, "gasto");
  const ingAnt = suma(movAnt, "ingreso"); const gasAnt = suma(movAnt, "gasto");
  const saldo  = ingAct - gasAct;

  const varPct = (a, b) => b === 0 ? null : Math.round(((a - b) / b) * 100);
  const varIng = varPct(ingAct, ingAnt); const varGas = varPct(gasAct, gasAnt);

  const meses4 = [getMes(3), getMes(2), getMes(1), getMes(0)];
  const dm = meses4.map(m => ({
    label: labelMes(m),
    ing: suma(finanzas.filter(f => (f.fecha || "").startsWith(m)), "ingreso"),
    gas: suma(finanzas.filter(f => (f.fecha || "").startsWith(m)), "gasto"),
  }));
  const maxV = Math.max(...dm.flatMap(d => [d.ing, d.gas]), 1);

  const catMap = {};
  movAct.filter(f => f.tipo === "gasto").forEach(f => {
    const c = f.categoria || "Otro";
    catMap[c] = (catMap[c] || 0) + Number(f.monto || 0);
  });
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCat = Math.max(...topCats.map(c => c[1]), 1);

  const tareasPend = tareas.filter(t => t.estado === "pendiente").length;
  const tareasEnC  = tareas.filter(t => t.estado === "en_progreso").length;
  const hoyStr     = new Date().toISOString().slice(0, 10);
  const tareasHoy  = tareas.filter(t => t.fecha_limite === hoyStr && t.estado !== "completada").length;

  const stockBajo = inventario.filter(i => i.minimo && Number(i.stock || 0) <= Number(i.minimo || 0));
  const ultMovs   = [...finanzas].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")).slice(0, 5);
  const mes = new Date().toLocaleString("es-CL", { month: "long", year: "numeric" });

  const Chip = ({ pct, inv = false }) => {
    if (pct === null) return null;
    const ok = inv ? pct < 0 : pct > 0;
    return (
      <span style={{ fontSize: 10, fontWeight: 700, color: ok ? "#4A5E3A" : "#c0392b",
        background: ok ? "#eaf4e6" : "#fdecea", borderRadius: 5, padding: "1px 5px", marginLeft: 5 }}>
        {pct > 0 ? "↑" : "↓"}{Math.abs(pct)}%
      </span>
    );
  };

  return (
    <div>
      <div style={{ padding: "8px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <p style={{ color: "#888", fontSize: 13, textTransform: "capitalize", margin: 0 }}>{mes}</p>
        <button onClick={() => setVistaInforme(true)} style={{ ...S.btnSecundario, padding: "6px 12px", fontSize: 12 }}>
          📄 Ver informe completo
        </button>
      </div>

      <div style={S.kpiGrid}>
        <div style={S.kpiCard("#4A5E3A")}>
          <div style={S.kpiVal}>{fmtMiles(ingAct)}</div>
          <div style={S.kpiLabel}>Ingresos <Chip pct={varIng} /></div>
        </div>
        <div style={S.kpiCard("#c0392b")}>
          <div style={S.kpiVal}>{fmtMiles(gasAct)}</div>
          <div style={S.kpiLabel}>Gastos <Chip pct={varGas} inv /></div>
        </div>
        <div style={S.kpiCard(saldo >= 0 ? "#C8852A" : "#c0392b")}>
          <div style={S.kpiVal}>{fmtMiles(saldo)}</div>
          <div style={S.kpiLabel}>Resultado</div>
        </div>
        <div style={S.kpiCard("#3D2B1F")}>
          <div style={S.kpiVal}>{tareasPend + tareasEnC}</div>
          <div style={S.kpiLabel}>
            Tareas activas
            {tareasHoy > 0 && <span style={{ fontSize: 9, background: "#c0392b", color: "#fff", borderRadius: 4, padding: "1px 4px", marginLeft: 4 }}>{tareasHoy} hoy</span>}
          </div>
        </div>
      </div>

      {stockBajo.length > 0 && (
        <div style={{ ...S.card, background: "#fff3cd", border: "1px solid #C8852A", padding: "10px 14px" }}>
          <div style={{ fontWeight: 700, color: "#C8852A", fontSize: 13 }}>⚠️ Stock bajo — {stockBajo.length} producto{stockBajo.length > 1 ? "s" : ""}</div>
          {stockBajo.map(i => (
            <div key={i.id} style={{ fontSize: 12, color: "#7a5a1e", marginTop: 2 }}>· {i.nombre}: {i.stock} {i.unidad} (mín {i.minimo})</div>
          ))}
        </div>
      )}

      {finanzas.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitulo}>Ingresos vs Gastos — 4 meses</div>
          <svg viewBox="0 0 300 115" style={{ width: "100%", marginTop: 6 }}>
            {[0.25, 0.5, 0.75, 1].map(p => (
              <line key={p} x1="0" y1={10 + (1 - p) * 80} x2="300" y2={10 + (1 - p) * 80} stroke="#f0ece6" strokeWidth="1" />
            ))}
            {dm.map((d, i) => {
              const x = 20 + i * 70;
              const hI = (d.ing / maxV) * 80; const hG = (d.gas / maxV) * 80;
              return (
                <g key={i}>
                  <rect x={x}      y={90 - hI} width={22} height={hI} fill="#4A5E3A" rx="2" />
                  <rect x={x + 24} y={90 - hG} width={22} height={hG} fill="#c0392b" rx="2" />
                  <text x={x + 23} y={106} textAnchor="middle" fontSize="9" fill="#888">{d.label}</text>
                  {d.ing > 0 && <text x={x + 11} y={90 - hI - 3} textAnchor="middle" fontSize="7" fill="#4A5E3A">{fmtMiles(d.ing)}</text>}
                  {d.gas > 0 && <text x={x + 35} y={90 - hG - 3} textAnchor="middle" fontSize="7" fill="#c0392b">{fmtMiles(d.gas)}</text>}
                </g>
              );
            })}
          </svg>
          <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#666", marginTop: 2 }}>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#4A5E3A", borderRadius: 2, marginRight: 4 }} />Ingresos</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#c0392b", borderRadius: 2, marginRight: 4 }} />Gastos</span>
          </div>
        </div>
      )}

      {topCats.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitulo}>Top gastos por categoría — {labelMes(mesAct)}</div>
          {topCats.map(([cat, val], i) => (
            <div key={cat} style={{ marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: "#555" }}>{cat}</span>
                <span style={{ fontWeight: 700, color: "#c0392b" }}>${fmt(val)}</span>
              </div>
              <div style={{ height: 6, background: "#f0ece6", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(val / maxCat) * 100}%`,
                  background: i === 0 ? "#c0392b" : i === 1 ? "#C8852A" : "#7a5a1e",
                  borderRadius: 4 }} />
              </div>
            </div>
          ))}
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
function ModuloFinanzas({ datos, agregar, actualizar, eliminar, formularioInicial, onLimpiarFormulario, inventario, agregarMovInventario, agregarProductoInventario, trabajadores }) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalInsumo, setModalInsumo] = useState(null); // datos del gasto recién guardado
  const [itemEditando, setItemEditando] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroCentro, setFiltroCentro] = useState("todos");
  const [filtroMes, setFiltroMes] = useState(new Date().toISOString().slice(0, 7));
  const [formInsumo, setFormInsumo] = useState({ producto_id: "", es_nuevo: false, nombre: "", cantidad: "", unidad: "kg", categoria: "Fertilizantes foliares" });

  const FORM_VACIO = { tipo: "gasto", fecha: hoy(), monto: "", categoria: "", descripcion: "", centro: "campo_general", proveedor: "", trabajador_id: "" };
  const [form, setForm] = useState(FORM_VACIO);

  // Busca coincidencia de nombre (tolerante a mayúsculas/orden de palabras simple)
  const buscarTrabajadorPorNombre = (nombre) => {
    if (!nombre || !trabajadores) return null;
    const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const nNombre = norm(nombre);
    return trabajadores.find(t => {
      const nt = norm(t.nombre || "");
      return nt === nNombre || nt.includes(nNombre) || nNombre.includes(nt);
    }) || null;
  };

  useEffect(() => {
    if (formularioInicial) {
      let fecha = formularioInicial.fecha || hoy();
      const anio = parseInt(fecha.slice(0, 4));
      if (anio > new Date().getFullYear() + 1 || anio < 2000) fecha = hoy();

      const esLiquidacion = formularioInicial.tipo_documento === "liquidacion_sueldo";
      const trabajadorMatch = esLiquidacion ? buscarTrabajadorPorNombre(formularioInicial.trabajador_nombre) : null;

      setForm({
        tipo: formularioInicial.tipo || "gasto", fecha,
        monto: formularioInicial.monto ? String(formularioInicial.monto) : "",
        categoria: esLiquidacion ? "Mano de obra" : (formularioInicial.categoria || ""),
        descripcion: formularioInicial.descripcion || "",
        centro: trabajadorMatch?.centro || "campo_general",
        proveedor: formularioInicial.proveedor || formularioInicial.trabajador_nombre || "",
        trabajador_id: trabajadorMatch?.id || "",
      });
      setItemEditando(null);
      setModalAbierto(true);
      if (onLimpiarFormulario) onLimpiarFormulario();
    }
  }, [formularioInicial]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setFI = (k, v) => setFormInsumo(f => ({ ...f, [k]: v }));

  const abrirEditar = (item) => {
    setItemEditando(item);
    setForm({ tipo: item.tipo || "gasto", fecha: item.fecha || hoy(),
      monto: String(item.monto || ""), categoria: item.categoria || "",
      descripcion: item.descripcion || "", centro: item.centro || "campo_general",
      proveedor: item.proveedor || "", trabajador_id: item.trabajador_id || "" });
    setModalAbierto(true);
  };

  const guardar = () => {
    if (!form.monto || !form.categoria) return;
    if (itemEditando) {
      actualizar({ ...itemEditando, ...form, monto: Number(form.monto) });
      setItemEditando(null);
    } else {
      agregar({ ...form, monto: Number(form.monto) });
      // Si es un gasto de categoría insumo → preguntar si agregar al inventario
      if (form.tipo === "gasto" && CATS_INSUMO.has(form.categoria)) {
        setFormInsumo({ producto_id: "", es_nuevo: false, nombre: form.descripcion || "", cantidad: "", unidad: "kg", categoria: "Fertilizantes foliares" });
        setModalInsumo(form);
      }
    }
    setForm(FORM_VACIO);
    setModalAbierto(false);
  };

  const guardarInsumo = () => {
    if (!formInsumo.cantidad) return;

    if (formInsumo.es_nuevo) {
      // Crear producto nuevo en catálogo con ID pre-generado
      if (!formInsumo.nombre) return;
      const nuevoId = `inventario_${Date.now()}`;
      agregarProductoInventario({
        id: nuevoId,
        nombre: formInsumo.nombre,
        categoria: formInsumo.categoria || "Fertilizantes foliares",
        unidad: formInsumo.unidad || "kg",
        minimo: 0,
        descripcion: "",
        proveedor: modalInsumo?.proveedor || "",
      });
      agregarMovInventario({
        producto_id: nuevoId,
        producto_nombre: formInsumo.nombre,
        tipo: "entrada",
        cantidad: Number(formInsumo.cantidad),
        unidad: formInsumo.unidad || "kg",
        motivo: "compra",
        tarea_id: null, tarea_titulo: null,
        fecha: modalInsumo?.fecha || hoy(),
        notas: `Desde gasto: ${modalInsumo?.descripcion || ""}`,
      });
    } else if (formInsumo.producto_id) {
      // Producto existente → solo movimiento de entrada
      const prod = inventario?.find(p => p.id === formInsumo.producto_id);
      if (prod) {
        agregarMovInventario({
          producto_id: prod.id,
          producto_nombre: prod.nombre,
          tipo: "entrada",
          cantidad: Number(formInsumo.cantidad),
          unidad: prod.unidad,
          motivo: "compra",
          tarea_id: null, tarea_titulo: null,
          fecha: modalInsumo?.fecha || hoy(),
          notas: `Desde gasto: ${modalInsumo?.descripcion || ""}`,
        });
      }
    }
    setModalInsumo(null);
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
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => abrirEditar(mov)} style={{ ...S.btnSecundario, padding: "3px 8px", fontSize: 11 }}>✏</button>
                <button onClick={() => eliminar(mov.id)} style={S.btnDanger}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal nuevo/editar movimiento */}
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

          {form.categoria === "Mano de obra" && trabajadores && trabajadores.length > 0 && (
            <>
              <label style={S.label}>Vincular a trabajador (opcional)</label>
              <select value={form.trabajador_id} onChange={e => set("trabajador_id", e.target.value)} style={S.select}>
                <option value="">— Sin vincular —</option>
                {trabajadores.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </>
          )}

          <button onClick={guardar} style={S.btnPrimario}>
            {itemEditando ? "Guardar cambios" : `Guardar ${form.tipo}`}
          </button>
        </Modal>
      )}

      {/* Modal: agregar gasto al inventario */}
      {modalInsumo && (
        <Modal titulo="¿Agregar al inventario?" onClose={() => setModalInsumo(null)}>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
            Detectamos un gasto de insumo. ¿Quieres registrar la entrada al stock?
          </div>
          <label style={S.label}>Producto</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button onClick={() => setFI("es_nuevo", false)}
              style={{ flex: 1, padding: 8, border: "1.5px solid", borderRadius: 8, cursor: "pointer",
                borderColor: !formInsumo.es_nuevo ? "#C8852A" : "#ddd",
                background: !formInsumo.es_nuevo ? "#C8852A" : "#fff",
                color: !formInsumo.es_nuevo ? "#fff" : "#666", fontSize: 13 }}>
              Existente
            </button>
            <button onClick={() => setFI("es_nuevo", true)}
              style={{ flex: 1, padding: 8, border: "1.5px solid", borderRadius: 8, cursor: "pointer",
                borderColor: formInsumo.es_nuevo ? "#C8852A" : "#ddd",
                background: formInsumo.es_nuevo ? "#C8852A" : "#fff",
                color: formInsumo.es_nuevo ? "#fff" : "#666", fontSize: 13 }}>
              Nuevo
            </button>
          </div>
          {!formInsumo.es_nuevo && inventario && inventario.length > 0 ? (
            <select value={formInsumo.producto_id} onChange={e => setFI("producto_id", e.target.value)} style={S.select}>
              <option value="">Seleccionar producto…</option>
              {inventario.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.unidad})</option>)}
            </select>
          ) : formInsumo.es_nuevo ? (
            <>
              <input value={formInsumo.nombre} onChange={e => setFI("nombre", e.target.value)}
                placeholder="Nombre del producto" style={S.input} />
              <div style={{ fontSize: 12, color: "#aaa", marginBottom: 8 }}>El producto se creará automáticamente en Insumos.</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: 8 }}>No hay productos en inventario aún.</div>
          )}
          <label style={S.label}>Cantidad a ingresar</label>
          <input type="number" value={formInsumo.cantidad} onChange={e => setFI("cantidad", e.target.value)}
            placeholder="0" style={S.input} inputMode="numeric" autoFocus />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={guardarInsumo} style={S.btnPrimario}>✅ Registrar entrada</button>
            <button onClick={() => setModalInsumo(null)} style={{ ...S.btnSecundario, flex: 1 }}>Omitir</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MÓDULO INVENTARIO ────────────────────────────────────────────────────────
function ModuloInventario({ datos, agregar, actualizar, eliminar, movimientos, agregarMov }) {
  const [modal, setModal] = useState(null); // null | "nuevo" | "editar" | "movimiento"
  const [itemEditando, setItemEditando] = useState(null);
  const [filtroCat, setFiltroCat] = useState("todos");
  const FORM_VACIO = { nombre: "", unidad: "kg", minimo: "", categoria: "Fertilizantes foliares", descripcion: "", proveedor: "" };
  const [form, setForm] = useState(FORM_VACIO);
  const [formMov, setFormMov] = useState({ tipo: "entrada", cantidad: "", motivo: "compra", notas: "", fecha: hoy() });
  const [productoSelMov, setProductoSelMov] = useState(null);

  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setM = (k, v) => setFormMov(f => ({ ...f, [k]: v }));

  const abrirNuevo = () => { setForm(FORM_VACIO); setModal("nuevo"); };
  const abrirEditar = (item) => {
    setItemEditando(item);
    setForm({ nombre: item.nombre || "", unidad: item.unidad || "kg", minimo: item.minimo || "",
      categoria: item.categoria || "Fertilizantes foliares", descripcion: item.descripcion || "", proveedor: item.proveedor || "" });
    setModal("editar");
  };
  const abrirMov = (item) => {
    setProductoSelMov(item);
    setFormMov({ tipo: "entrada", cantidad: "", motivo: "compra", notas: "", fecha: hoy() });
    setModal("movimiento");
  };

  const guardar = () => {
    if (!form.nombre) return;
    if (modal === "editar" && itemEditando) {
      actualizar({ ...itemEditando, ...form, minimo: Number(form.minimo || 0) });
    } else {
      agregar({ ...form, minimo: Number(form.minimo || 0) });
    }
    setModal(null); setItemEditando(null);
  };

  const guardarMov = () => {
    if (!formMov.cantidad || !productoSelMov) return;
    agregarMov({
      producto_id: productoSelMov.id,
      producto_nombre: productoSelMov.nombre,
      tipo: formMov.tipo,
      cantidad: Number(formMov.cantidad),
      unidad: productoSelMov.unidad,
      motivo: formMov.motivo,
      tarea_id: null, tarea_titulo: null,
      fecha: formMov.fecha,
      notas: formMov.notas,
    });
    setModal(null);
  };

  // Agrupar por categoría
  const cats = ["todos", ...CATEGORIAS_INVENTARIO];
  const filtrados = filtroCat === "todos" ? datos : datos.filter(d => d.categoria === filtroCat);
  const agrupados = {};
  filtrados.forEach(d => {
    const cat = d.categoria || "Otros";
    if (!agrupados[cat]) agrupados[cat] = [];
    agrupados[cat].push(d);
  });

  return (
    <div>
      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ ...S.seccionTitulo, padding: 0, margin: 0 }}>Insumos</h2>
        <button onClick={abrirNuevo} style={{ ...S.btnPrimario, width: "auto", padding: "10px 20px", fontSize: 14 }}>+ Agregar</button>
      </div>

      {/* Filtro por categoría */}
      <div style={{ padding: "0 16px 8px", display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8 }}>
        {cats.map(cat => (
          <button key={cat} onClick={() => setFiltroCat(cat)}
            style={{ ...S.btnSecundario, padding: "5px 10px", whiteSpace: "nowrap", fontSize: 12,
              background: filtroCat === cat ? "#C8852A" : "transparent",
              color: filtroCat === cat ? "#fff" : "#C8852A" }}>
            {cat === "todos" ? "Todos" : cat}
          </button>
        ))}
      </div>

      {datos.length === 0 && (
        <div style={S.card}>
          <p style={{ color: "#aaa", fontSize: 14, textAlign: "center", padding: "20px 0" }}>Sin productos. Agrega tu primer insumo.</p>
        </div>
      )}

      {Object.entries(agrupados).map(([cat, items]) => (
        <div key={cat} style={S.card}>
          <div style={{ ...S.cardTitulo, marginBottom: 8 }}>{cat}</div>
          {items.map(item => {
            const stock = calcStock(item.id, movimientos);
            const bajo = item.minimo && stock <= Number(item.minimo);
            return (
              <div key={item.id} style={{ ...S.listaItem, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{item.nombre}</span>
                    {bajo && <span style={S.tag("#c0392b")}>⚠ bajo</span>}
                  </div>
                  {item.proveedor && <div style={{ fontSize: 11, color: "#aaa" }}>{item.proveedor}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button onClick={() => abrirMov(item)}
                      style={{ ...S.btnSecundario, padding: "4px 10px", fontSize: 12 }}>
                      ± Movimiento
                    </button>
                    <button onClick={() => abrirEditar(item)}
                      style={{ ...S.btnSecundario, padding: "4px 10px", fontSize: 12 }}>
                      ✏ Editar
                    </button>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: bajo ? "#c0392b" : "#3D2B1F" }}>
                    {stock} {item.unidad}
                  </div>
                  {item.minimo ? <div style={{ fontSize: 11, color: "#aaa" }}>mín {item.minimo}</div> : null}
                  <button onClick={() => eliminar(item.id)} style={{ ...S.btnDanger, marginTop: 4 }}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Modal nuevo/editar producto */}
      {(modal === "nuevo" || modal === "editar") && (
        <Modal titulo={modal === "editar" ? "Editar producto" : "Nuevo producto"} onClose={() => setModal(null)}>
          <label style={S.label}>Nombre del producto</label>
          <input value={form.nombre} onChange={e => set("nombre", e.target.value)}
            placeholder="Ej: Óxido de cobre 50%" style={S.input} autoFocus />

          <label style={S.label}>Categoría</label>
          <select value={form.categoria} onChange={e => set("categoria", e.target.value)} style={S.select}>
            {CATEGORIAS_INVENTARIO.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <div style={S.row}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Unidad</label>
              <select value={form.unidad} onChange={e => set("unidad", e.target.value)} style={S.select}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Stock mínimo</label>
              <input type="number" value={form.minimo} onChange={e => set("minimo", e.target.value)}
                placeholder="0" style={S.input} inputMode="numeric" />
            </div>
          </div>

          <label style={S.label}>Proveedor (opcional)</label>
          <input value={form.proveedor} onChange={e => set("proveedor", e.target.value)}
            placeholder="Nombre del proveedor" style={S.input} />

          <button onClick={guardar} style={S.btnPrimario}>
            {modal === "editar" ? "Guardar cambios" : "Agregar producto"}
          </button>
        </Modal>
      )}

      {/* Modal movimiento (entrada/salida) */}
      {modal === "movimiento" && productoSelMov && (
        <Modal titulo={`${productoSelMov.nombre}`} onClose={() => setModal(null)}>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>
            Stock actual: <strong style={{ color: "#3D2B1F" }}>
              {calcStock(productoSelMov.id, movimientos)} {productoSelMov.unidad}
            </strong>
          </div>

          <div style={S.row}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Tipo</label>
              <select value={formMov.tipo} onChange={e => setM("tipo", e.target.value)} style={S.select}>
                <option value="entrada">📥 Entrada (compra)</option>
                <option value="salida">📤 Salida (uso/ajuste)</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Cantidad ({productoSelMov.unidad})</label>
              <input type="number" value={formMov.cantidad} onChange={e => setM("cantidad", e.target.value)}
                placeholder="0" style={S.input} inputMode="numeric" autoFocus />
            </div>
          </div>

          <label style={S.label}>Motivo</label>
          <select value={formMov.motivo} onChange={e => setM("motivo", e.target.value)} style={S.select}>
            {formMov.tipo === "entrada"
              ? ["compra","ajuste manual","devolucion"].map(m => <option key={m} value={m}>{m}</option>)
              : ["uso en tarea","merma","vencimiento","ajuste manual"].map(m => <option key={m} value={m}>{m}</option>)
            }
          </select>

          <label style={S.label}>Fecha</label>
          <input type="date" value={formMov.fecha} onChange={e => setM("fecha", e.target.value)} style={S.input} />

          <label style={S.label}>Notas (opcional)</label>
          <input value={formMov.notas} onChange={e => setM("notas", e.target.value)}
            placeholder="Ej: Factura 1234" style={S.input} />

          <button onClick={guardarMov} style={S.btnPrimario}>Registrar movimiento</button>
        </Modal>
      )}
    </div>
  );
}

// ─── MÓDULO TAREAS ────────────────────────────────────────────────────────────
const PRIORIDADES = ["urgente", "alta", "normal", "baja"];
const ESTADOS_TAREA = ["pendiente", "en progreso", "completada"];
const RESPONSABLES = ["Juaco", "Alejandra", "Joel", "Abraham", "Hernán", "Josefa"];

function ModuloTareas({ datos, agregar, actualizar, eliminar, setDatos, inventario, agregarMovInventario }) {
  const [modal, setModal] = useState(null); // null | "nuevo" | "editar" | "confirmarInsumos"
  const [filtroEstado, setFiltroEstado] = useState("activas");
  const [tareaEditando, setTareaEditando] = useState(null);
  const [tareaCompletando, setTareaCompletando] = useState(null);

  const FORM_VACIO = {
    titulo: "", descripcion: "", prioridad: "normal", estado: "pendiente",
    responsable: "Juaco", centro: "campo_general", fechaLimite: "", insumos: [],
  };
  const [form, setForm] = useState(FORM_VACIO);
  const [nuevoInsumo, setNuevoInsumo] = useState({ producto_id: "", producto_nombre: "", cantidad: "", unidad: "" });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const abrirNuevo = () => { setForm(FORM_VACIO); setTareaEditando(null); setModal("nuevo"); };
  const abrirEditar = (t) => {
    setTareaEditando(t);
    setForm({
      titulo: t.titulo || "", descripcion: t.descripcion || "",
      prioridad: t.prioridad || "normal", estado: t.estado || "pendiente",
      responsable: t.responsable || "Juaco", centro: t.centro || "campo_general",
      fechaLimite: t.fechaLimite || t.fecha_limite || "",
      insumos: t.insumos ? (typeof t.insumos === "string" ? JSON.parse(t.insumos) : t.insumos) : [],
    });
    setModal("editar");
  };

  const guardar = () => {
    if (!form.titulo) return;
    const datos_guardar = { ...form, insumos: JSON.stringify(form.insumos), fechaCreacion: hoy() };
    if (modal === "editar" && tareaEditando) {
      actualizar({ ...tareaEditando, ...datos_guardar });
    } else {
      agregar(datos_guardar);
    }
    setModal(null); setTareaEditando(null);
  };

  const agregarInsumo = () => {
    if (!nuevoInsumo.producto_id || !nuevoInsumo.cantidad) return;
    set("insumos", [...form.insumos, { ...nuevoInsumo, cantidad: Number(nuevoInsumo.cantidad) }]);
    setNuevoInsumo({ producto_id: "", producto_nombre: "", cantidad: "", unidad: "" });
  };

  const quitarInsumo = (idx) => set("insumos", form.insumos.filter((_, i) => i !== idx));

  const cambiarEstado = (tarea, nuevoEstado) => {
    if (nuevoEstado === "completada") {
      const insumosArr = tarea.insumos
        ? (typeof tarea.insumos === "string" ? (() => { try { return JSON.parse(tarea.insumos); } catch { return []; } })() : tarea.insumos)
        : [];
      if (insumosArr.length > 0) {
        setTareaCompletando({ tarea, insumosArr });
        setModal("confirmarInsumos");
        return;
      }
    }
    const actualizados = datos.map(t => t.id === tarea.id ? { ...t, estado: nuevoEstado } : t);
    setDatos(actualizados);
  };

  const confirmarCompletado = (registrarSalidas) => {
    if (!tareaCompletando) return;
    const { tarea, insumosArr } = tareaCompletando;
    if (registrarSalidas) {
      insumosArr.forEach(ins => {
        agregarMovInventario({
          producto_id: ins.producto_id,
          producto_nombre: ins.producto_nombre,
          tipo: "salida",
          cantidad: Number(ins.cantidad),
          unidad: ins.unidad,
          motivo: "uso en tarea",
          tarea_id: tarea.id,
          tarea_titulo: tarea.titulo,
          fecha: hoy(),
          notas: `Tarea completada: ${tarea.titulo}`,
        });
      });
    }
    const actualizados = datos.map(t => t.id === tarea.id ? { ...t, estado: "completada" } : t);
    setDatos(actualizados);
    setModal(null); setTareaCompletando(null);
  };

  const filtradas = datos
    .filter(t => filtroEstado === "todas" ? true : filtroEstado === "activas" ? t.estado !== "completada" : t.estado === "completada")
    .sort((a, b) => PRIORIDADES.indexOf(a.prioridad) - PRIORIDADES.indexOf(b.prioridad));

  const coloresPrioridad = { urgente: "#c0392b", alta: "#C8852A", normal: "#4A5E3A", baja: "#888" };

  return (
    <div>
      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ ...S.seccionTitulo, padding: 0, margin: 0 }}>Tareas</h2>
        <button onClick={abrirNuevo} style={{ ...S.btnPrimario, width: "auto", padding: "10px 20px", fontSize: 14 }}>+ Nueva</button>
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
        {filtradas.map(t => {
          const insumosArr = t.insumos ? (typeof t.insumos === "string" ? (() => { try { return JSON.parse(t.insumos); } catch { return []; } })() : t.insumos) : [];
          return (
            <div key={t.id} style={{ ...S.listaItem, opacity: t.estado === "completada" ? 0.5 : 1, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={S.tag(coloresPrioridad[t.prioridad] || "#888")}>{t.prioridad}</span>
                  <span style={{ fontSize: 12, color: "#888" }}>{t.responsable}</span>
                  {insumosArr.length > 0 && <span style={S.tag("#4A5E3A")}>📦 {insumosArr.length} insumo{insumosArr.length > 1 ? "s" : ""}</span>}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{t.titulo}</div>
                {t.descripcion && <div style={{ fontSize: 12, color: "#888" }}>{t.descripcion}</div>}
                {(t.fechaLimite || t.fecha_limite) && <div style={{ fontSize: 11, color: "#C8852A" }}>📅 {t.fechaLimite || t.fecha_limite}</div>}
                <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                  <select value={t.estado}
                    onChange={e => cambiarEstado(t, e.target.value)}
                    style={{ ...S.select, width: "auto", padding: "4px 8px", fontSize: 12, marginBottom: 0 }}>
                    {ESTADOS_TAREA.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <button onClick={() => abrirEditar(t)} style={{ ...S.btnSecundario, padding: "4px 10px", fontSize: 12 }}>✏ Editar</button>
                </div>
              </div>
              <button onClick={() => eliminar(t.id)} style={{ ...S.btnDanger, marginLeft: 8 }}>✕</button>
            </div>
          );
        })}
      </div>

      {/* Modal nueva/editar tarea */}
      {(modal === "nuevo" || modal === "editar") && (
        <Modal titulo={modal === "editar" ? "Editar tarea" : "Nueva tarea"} onClose={() => setModal(null)}>
          <label style={S.label}>Título</label>
          <input value={form.titulo} onChange={e => set("titulo", e.target.value)}
            placeholder="¿Qué hay que hacer?" style={S.input} autoFocus />

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

          {/* Sección insumos */}
          <div style={{ marginTop: 8, borderTop: "1px solid #f0ece6", paddingTop: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "#3D2B1F" }}>📦 Insumos a usar (opcional)</div>
            {form.insumos.map((ins, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 13 }}>
                <span style={{ flex: 1, color: "#555" }}>{ins.producto_nombre}</span>
                <span style={{ color: "#888" }}>{ins.cantidad} {ins.unidad}</span>
                <button onClick={() => quitarInsumo(idx)} style={{ ...S.btnDanger, padding: "2px 8px" }}>✕</button>
              </div>
            ))}
            {inventario.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                <select
                  value={nuevoInsumo.producto_id}
                  onChange={e => {
                    const prod = inventario.find(p => p.id === e.target.value);
                    setNuevoInsumo(n => ({ ...n, producto_id: e.target.value, producto_nombre: prod?.nombre || "", unidad: prod?.unidad || "" }));
                  }}
                  style={{ ...S.select, flex: 2, marginBottom: 0, fontSize: 12 }}>
                  <option value="">Seleccionar producto…</option>
                  {inventario.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                <input type="number" placeholder="Cant." value={nuevoInsumo.cantidad}
                  onChange={e => setNuevoInsumo(n => ({ ...n, cantidad: e.target.value }))}
                  style={{ ...S.input, width: 70, marginBottom: 0, fontSize: 12 }} inputMode="numeric" />
                <button onClick={agregarInsumo} style={{ ...S.btnSecundario, padding: "6px 12px", fontSize: 12 }}>+ Add</button>
              </div>
            )}
            {inventario.length === 0 && <div style={{ fontSize: 12, color: "#aaa" }}>Agrega productos al inventario para asignarlos aquí.</div>}
          </div>

          <button onClick={guardar} style={{ ...S.btnPrimario, marginTop: 16 }}>
            {modal === "editar" ? "Guardar cambios" : "Crear tarea"}
          </button>
        </Modal>
      )}

      {/* Modal confirmar insumos al completar */}
      {modal === "confirmarInsumos" && tareaCompletando && (
        <Modal titulo="Confirmar uso de insumos" onClose={() => setModal(null)}>
          <div style={{ fontSize: 14, color: "#555", marginBottom: 12 }}>
            Esta tarea tiene insumos asignados. ¿Registrar el descuento del stock?
          </div>
          {tareaCompletando.insumosArr.map((ins, i) => (
            <div key={i} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid #f0ece6" }}>
              📦 {ins.producto_nombre}: <strong>−{ins.cantidad} {ins.unidad}</strong>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={() => confirmarCompletado(true)} style={S.btnPrimario}>
              ✅ Sí, descontar stock
            </button>
            <button onClick={() => confirmarCompletado(false)} style={{ ...S.btnSecundario, flex: 1 }}>
              Solo completar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MÓDULO PERSONAL ──────────────────────────────────────────────────────────
const TIPOS_TRABAJADOR = ["permanente", "temporal", "gerencial"];

function ModuloPersonal({ trabajadores, agregarTrabajador, actualizarTrabajador, eliminarTrabajador,
  registros, agregarRegistro, eliminarRegistro, finanzas = [] }) {
  const [vista, setVista] = useState("equipo");
  const [modalTrabajador, setModalTrabajador] = useState(false);
  const [modalHH, setModalHH] = useState(false);
  const [trabajadorEditando, setTrabajadorEditando] = useState(null);
  const [trabajadorResumen, setTrabajadorResumen] = useState(null); // para ver resumen mensual

  const FORM_T_VACIO = { nombre: "", tipo: "permanente", cargo: "", sueldoBase: "", valorHora: "", centro: "campo_general", activo: true };
  const [formT, setFormT] = useState(FORM_T_VACIO);

  const [formHH, setFormHH] = useState({
    trabajadorId: "", trabajadorNombre: "",
    fecha: hoy(), horas: "", actividad: "", centro: "campo_general",
    jornal: "", observacion: "", jornalEditadoManual: false,
  });

  const setT = (k, v) => setFormT(f => ({ ...f, [k]: v }));
  const setH = (k, v) => setFormHH(f => ({ ...f, [k]: v }));

  const abrirNuevoTrabajador = () => { setFormT(FORM_T_VACIO); setTrabajadorEditando(null); setModalTrabajador(true); };
  const abrirEditarTrabajador = (t) => {
    setTrabajadorEditando(t);
    setFormT({
      nombre: t.nombre || "", tipo: t.tipo || "permanente", cargo: t.cargo || "",
      sueldoBase: t.sueldoBase || "", valorHora: t.valorHora || "",
      centro: t.centro || (Array.isArray(t.centros) ? t.centros[0] : "campo_general"),
      activo: t.activo !== false,
    });
    setModalTrabajador(true);
  };

  const guardarTrabajador = () => {
    if (!formT.nombre) return;
    if (trabajadorEditando) {
      actualizarTrabajador({ ...trabajadorEditando, ...formT });
    } else {
      agregarTrabajador(formT);
    }
    setFormT(FORM_T_VACIO);
    setTrabajadorEditando(null);
    setModalTrabajador(false);
  };

  // Autocálculo del jornal cuando el trabajador es temporal con valorHora definido
  const onCambioHoras = (horas) => {
    setH("horas", horas);
    const t = trabajadores.find(x => x.id === formHH.trabajadorId);
    if (t?.tipo === "temporal" && t.valorHora && !formHH.jornalEditadoManual) {
      setH("jornal", String(Math.round(Number(horas || 0) * Number(t.valorHora))));
    }
  };

  const onSeleccionTrabajadorHH = (id) => {
    const t = trabajadores.find(x => x.id === id);
    setFormHH(f => ({
      ...f, trabajadorId: id, trabajadorNombre: t?.nombre || "",
      centro: t?.centro || f.centro, jornalEditadoManual: false,
      jornal: (t?.tipo === "temporal" && t?.valorHora && f.horas) ? String(Math.round(Number(f.horas) * Number(t.valorHora))) : f.jornal,
    }));
  };

  const guardarHH = () => {
    if (!formHH.trabajadorId || !formHH.horas) return;
    const { jornalEditadoManual, ...datosGuardar } = formHH;
    agregarRegistro(datosGuardar);
    setFormHH({ trabajadorId: "", trabajadorNombre: "", fecha: hoy(), horas: "", actividad: "", centro: "campo_general", jornal: "", observacion: "", jornalEditadoManual: false });
    setModalHH(false);
  };

  const mesActual = new Date().toISOString().slice(0, 7);
  const registrosMes = registros.filter(r => (r.fecha || "").startsWith(mesActual));
  const hhTotalesMes = registrosMes.reduce((a, b) => a + Number(b.horas || 0), 0);

  // Resumen mensual por trabajador
  const resumenTrabajador = (trabajadorId) => {
    const regs = registros.filter(r => r.trabajadorId === trabajadorId && (r.fecha || "").startsWith(mesActual));
    const horas = regs.reduce((a, b) => a + Number(b.horas || 0), 0);
    const pagado = regs.reduce((a, b) => a + Number(b.jornal || 0), 0);
    return { horas, pagado, dias: new Set(regs.map(r => r.fecha)).size, registros: regs };
  };

  // Historial de liquidaciones desde Finanzas
  const historialLiquidaciones = (trabajadorId) => {
    const liq = finanzas.filter(f =>
      f.trabajador_id === trabajadorId &&
      f.categoria === "Mano de obra" &&
      f.tipo === "gasto"
    ).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    const total = liq.reduce((a, b) => a + Number(b.monto || 0), 0);
    const promedio = liq.length > 0 ? Math.round(total / liq.length) : 0;
    return { liquidaciones: liq, total, promedio };
  };

  const coloresTipo = { gerencial: "#C8852A", permanente: "#4A5E3A", temporal: "#888" };

  return (
    <div>
      <div style={{ padding: "12px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ ...S.seccionTitulo, padding: 0, margin: 0 }}>Personal</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={abrirNuevoTrabajador} style={{ ...S.btnSecundario, padding: "8px 12px", fontSize: 13 }}>+ Persona</button>
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
          {trabajadores.map(t => {
            const r = resumenTrabajador(t.id);
            const h = historialLiquidaciones(t.id);
            const ultimaLiq = h.liquidaciones[0];
            return (
              <div key={t.id} style={{ ...S.listaItem, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{t.nombre}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>{t.cargo || t.tipo}</div>
                  {t.sueldoBase ? <div style={{ fontSize: 12, color: "#C8852A" }}>Base: ${fmt(t.sueldoBase)}/mes</div> : null}
                  {t.tipo === "temporal" && t.valorHora ? <div style={{ fontSize: 12, color: "#C8852A" }}>Valor hora: ${fmt(t.valorHora)}</div> : null}
                  {t.tipo === "temporal" && r.horas > 0 && (
                    <div style={{ fontSize: 12, color: "#4A5E3A", marginTop: 2 }}>
                      Este mes: {r.horas} hrs · {r.dias} día{r.dias !== 1 ? "s" : ""} · ${fmt(r.pagado)}
                    </div>
                  )}
                  {ultimaLiq && (
                    <div style={{ fontSize: 12, color: "#4A5E3A", marginTop: 2 }}>
                      Última liq.: {ultimaLiq.fecha} · ${fmt(ultimaLiq.monto)}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button onClick={() => abrirEditarTrabajador(t)} style={{ ...S.btnSecundario, padding: "4px 10px", fontSize: 12 }}>✏ Editar</button>
                    <button onClick={() => setTrabajadorResumen(t)} style={{ ...S.btnSecundario, padding: "4px 10px", fontSize: 12 }}>📊 Detalle</button>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <span style={S.tag(coloresTipo[t.tipo] || "#888")}>{t.tipo}</span>
                  {t.activo === false && <span style={S.tag("#888")}>inactivo</span>}
                  <button onClick={() => eliminarTrabajador(t.id)} style={S.btnDanger}>✕</button>
                </div>
              </div>
            );
          })}
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

      {/* Modal nuevo/editar trabajador */}
      {modalTrabajador && (
        <Modal titulo={trabajadorEditando ? "Editar persona" : "Agregar persona"} onClose={() => setModalTrabajador(false)}>
          <label style={S.label}>Nombre completo</label>
          <input value={formT.nombre} onChange={e => setT("nombre", e.target.value)}
            placeholder="Nombre" style={S.input} autoFocus />

          <label style={S.label}>Tipo</label>
          <select value={formT.tipo} onChange={e => setT("tipo", e.target.value)} style={S.select}>
            {TIPOS_TRABAJADOR.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <label style={S.label}>Cargo / Rol</label>
          <input value={formT.cargo} onChange={e => setT("cargo", e.target.value)}
            placeholder="Ej: Operario campo" style={S.input} />

          <label style={S.label}>Centro de costo principal</label>
          <select value={formT.centro} onChange={e => setT("centro", e.target.value)} style={S.select}>
            {CENTROS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>

          {formT.tipo === "temporal" ? (
            <>
              <label style={S.label}>Valor hora ($)</label>
              <input type="number" value={formT.valorHora} onChange={e => setT("valorHora", e.target.value)}
                placeholder="0" style={S.input} inputMode="numeric" />
              <div style={{ fontSize: 12, color: "#aaa", marginBottom: 8 }}>
                Se usará para calcular el jornal automáticamente al registrar HH.
              </div>
            </>
          ) : (
            <>
              <label style={S.label}>Sueldo base ($/mes)</label>
              <input type="number" value={formT.sueldoBase} onChange={e => setT("sueldoBase", e.target.value)}
                placeholder="0" style={S.input} inputMode="numeric" />
            </>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, color: "#555" }}>
            <input type="checkbox" checked={formT.activo} onChange={e => setT("activo", e.target.checked)} />
            Activo
          </label>

          <button onClick={guardarTrabajador} style={{ ...S.btnPrimario, marginTop: 12 }}>
            {trabajadorEditando ? "Guardar cambios" : "Agregar"}
          </button>
        </Modal>
      )}

      {/* Modal HH */}
      {modalHH && (
        <Modal titulo="Registrar horas" onClose={() => setModalHH(false)}>
          <label style={S.label}>Trabajador</label>
          <select value={formHH.trabajadorId} onChange={e => onSeleccionTrabajadorHH(e.target.value)} style={S.select}>
            <option value="">— Seleccionar —</option>
            {trabajadores.map(t => <option key={t.id} value={t.id}>{t.nombre} {t.tipo === "temporal" ? "(temporal)" : ""}</option>)}
          </select>

          <label style={S.label}>Fecha</label>
          <input type="date" value={formHH.fecha} onChange={e => setH("fecha", e.target.value)} style={S.input} />

          <div style={S.row}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Horas</label>
              <input type="number" value={formHH.horas} onChange={e => onCambioHoras(e.target.value)}
                placeholder="0" style={S.input} inputMode="decimal" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Jornal ($) {formHH.jornal && !formHH.jornalEditadoManual ? "· auto" : ""}</label>
              <input type="number" value={formHH.jornal}
                onChange={e => { setH("jornal", e.target.value); setH("jornalEditadoManual", true); }}
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

      {/* Modal resumen / historial de trabajador */}
      {trabajadorResumen && (
        <Modal titulo={trabajadorResumen.nombre} onClose={() => setTrabajadorResumen(null)}>
          {(() => {
            const h = historialLiquidaciones(trabajadorResumen.id);
            const r = resumenTrabajador(trabajadorResumen.id);
            const esTemporal = trabajadorResumen.tipo === "temporal";
            return (
              <>
                {/* Resumen estadístico */}
                <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                  {h.liquidaciones.length > 0 && (
                    <>
                      <div style={{ flex: 1, background: "#f5f0e8", borderRadius: 10, padding: 10, textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#3D2B1F" }}>{h.liquidaciones.length}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>liquidaciones</div>
                      </div>
                      <div style={{ flex: 1, background: "#f5f0e8", borderRadius: 10, padding: 10, textAlign: "center" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#C8852A" }}>${fmt(h.promedio)}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>promedio/mes</div>
                      </div>
                      <div style={{ flex: 1, background: "#f5f0e8", borderRadius: 10, padding: 10, textAlign: "center" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#4A5E3A" }}>${fmt(h.total)}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>total pagado</div>
                      </div>
                    </>
                  )}
                </div>

                {/* Historial de liquidaciones */}
                {h.liquidaciones.length > 0 ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#3D2B1F", marginBottom: 8 }}>Historial de liquidaciones</div>
                    {h.liquidaciones.map(liq => (
                      <div key={liq.id} style={{ ...S.listaItem, padding: "8px 0" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{liq.fecha}</div>
                          <div style={{ fontSize: 12, color: "#888" }}>{liq.descripcion || liq.proveedor || "Liquidación"}</div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#C8852A" }}>${fmt(liq.monto)}</div>
                      </div>
                    ))}
                  </>
                ) : (
                  <p style={{ color: "#aaa", fontSize: 13, textAlign: "center" }}>Sin liquidaciones registradas.</p>
                )}

                {/* HH para temporales */}
                {esTemporal && r.horas > 0 && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#3D2B1F", margin: "14px 0 8px" }}>HH este mes</div>
                    <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                      <div style={{ flex: 1, background: "#f5f0e8", borderRadius: 10, padding: 10, textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#3D2B1F" }}>{r.horas}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>horas</div>
                      </div>
                      <div style={{ flex: 1, background: "#f5f0e8", borderRadius: 10, padding: 10, textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#3D2B1F" }}>{r.dias}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>días</div>
                      </div>
                      <div style={{ flex: 1, background: "#f5f0e8", borderRadius: 10, padding: 10, textAlign: "center" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#C8852A" }}>${fmt(r.pagado)}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>total</div>
                      </div>
                    </div>
                    {r.registros.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")).map(reg => (
                      <div key={reg.id} style={{ ...S.listaItem, padding: "8px 0" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{reg.fecha}</div>
                          <div style={{ fontSize: 12, color: "#888" }}>{reg.actividad}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{reg.horas} hrs</div>
                          <div style={{ fontSize: 12, color: "#C8852A" }}>${fmt(reg.jornal || 0)}</div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}


// ─── MÓDULO ESCÁNER ───────────────────────────────────────────────────────────
function ModuloEscaner({ onExtraer }) {
  const inputRef = useRef(null);
  const [estado, setEstado] = useState("inicio"); // inicio | listo | analizando | resultado | error
  const [preview, setPreview] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [base64, setBase64] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const abrirSelector = () => {
    if (inputRef.current) inputRef.current.click();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Límite duro: Vercel no acepta body > 4.5 MB
    if (file.size > 8 * 1024 * 1024) {
      setErrorMsg("Imagen muy grande. Toma la foto con menor resolución o usa captura de pantalla.");
      setEstado("error");
      return;
    }

    try {
      // createImageBitmap es más compatible con iOS (HEIC, JPEG, PNG)
      const bitmap = await createImageBitmap(file);
      const MAX = 900; // máx 900px → base64 resultado queda bajo 1 MB
      let { width, height } = bitmap;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      const comprimida = canvas.toDataURL("image/jpeg", 0.75);
      // Verificar que el base64 resultante no supere 3 MB
      if (comprimida.length > 3 * 1024 * 1024) {
        setErrorMsg("No se pudo comprimir suficiente. Usa una captura de pantalla de la boleta.");
        setEstado("error");
        return;
      }
      setPreview(comprimida);
      setBase64(comprimida.split(",")[1]);
      setEstado("listo");
    } catch {
      // Fallback para browsers sin createImageBitmap
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        if (dataUrl.length > 3 * 1024 * 1024) {
          setErrorMsg("Imagen muy grande. Usa una captura de pantalla de la boleta.");
          setEstado("error");
          return;
        }
        setPreview(dataUrl);
        setBase64(dataUrl.split(",")[1]);
        setEstado("listo");
      };
      reader.onerror = () => { setErrorMsg("No se pudo leer el archivo."); setEstado("error"); };
      reader.readAsDataURL(file);
    }
  };

  const analizar = async () => {
    if (!base64) return;
    setEstado("analizando");
    setErrorMsg("");
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
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
              { type: "text", text: `Analiza este documento y extrae los datos en formato JSON estricto, sin texto adicional, sin markdown.

Primero identifica el tipo_documento: "liquidacion_sueldo" si es una liquidación de sueldo/remuneración (tiene nombre de trabajador, sueldo líquido, descuentos legales, AFP, salud, etc), o "boleta_factura" si es una boleta, factura o recibo de compra.

Si es tipo_documento "liquidacion_sueldo", responde:
{
  "tipo_documento": "liquidacion_sueldo",
  "tipo": "gasto",
  "monto": número del SUELDO LÍQUIDO A PAGAR (sin puntos ni símbolos),
  "fecha": "YYYY-MM-DD" (último día del período o fecha de pago),
  "trabajador_nombre": "nombre completo del trabajador en la liquidación",
  "periodo": "mes y año del período, ej: Junio 2026",
  "descripcion": "Liquidación de sueldo — [nombre] — [período]",
  "categoria": "Mano de obra",
  "detalles": "desglose breve si es relevante (ej: incluye comisión, horas extra, etc)"
}

Si es tipo_documento "boleta_factura", responde:
{
  "tipo_documento": "boleta_factura",
  "tipo": "gasto" o "ingreso",
  "monto": número sin puntos ni símbolos,
  "fecha": "YYYY-MM-DD",
  "descripcion": "descripción breve del documento",
  "proveedor": "nombre del proveedor o emisor",
  "categoria": "una de estas: Insumos agrícolas, Combustible, Herramientas, Maquinaria, Mano de obra, Veterinario, Alimentación animales, Cafetería, Mantenimiento, Servicios básicos, Transporte, Administrativo, Otro",
  "detalles": "cualquier información adicional relevante"
}

Si no puedes extraer un campo, usa null.` }
            ]
          }]
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${res.status}`);
      }
      const data = await res.json();
      const texto = data.content?.[0]?.text || "";
      let parsed;
      try {
        parsed = JSON.parse(texto.replace(/```json|```/g, "").trim());
      } catch {
        parsed = { error: "No se pudo parsear la respuesta", raw: texto };
      }
      setResultado(parsed);
      setEstado("resultado");
    } catch (err) {
      setErrorMsg(typeof err?.message === "string" ? err.message : JSON.stringify(err) || "Error desconocido");
      setEstado("error");
    }
  };

  const enviarAFinanzas = () => {
    if (!resultado || resultado.error) return;
    onExtraer(resultado);
    reiniciar();
  };

  const reiniciar = () => {
    setEstado("inicio");
    setPreview(null);
    setResultado(null);
    setBase64(null);
    setErrorMsg("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <h2 style={S.seccionTitulo}>Escáner IA</h2>
      <div style={S.card}>
        <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
          Saca foto o sube una boleta/factura y la IA extrae los datos automáticamente.
        </p>

        {/* Input siempre en el DOM, oculto */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          style={{ display: "none" }}
        />

        {/* ESTADO: inicio o listo */}
        {(estado === "inicio" || estado === "listo") && (
          <div>
            <button
              onClick={abrirSelector}
              style={{
                display: "block", width: "100%", background: "#f5f0e8",
                border: "2px dashed #C8852A", borderRadius: 12, padding: 24,
                textAlign: "center", cursor: "pointer", marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
              <div style={{ color: "#C8852A", fontWeight: 700 }}>
                {estado === "listo" ? "Cambiar imagen" : "Toca para subir imagen"}
              </div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Boleta, factura o recibo</div>
            </button>

            {preview && (
              <img src={preview} alt="preview"
                style={{ width: "100%", borderRadius: 8, marginBottom: 12, maxHeight: 300, objectFit: "contain" }} />
            )}

            {estado === "listo" && (
              <button onClick={analizar} style={S.btnPrimario}>🔍 Analizar con IA</button>
            )}
          </div>
        )}

        {/* ESTADO: analizando */}
        {estado === "analizando" && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
            <div style={{ color: "#C8852A", fontWeight: 700 }}>Analizando documento…</div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 8 }}>Esto puede tomar unos segundos</div>
          </div>
        )}

        {/* ESTADO: resultado */}
        {estado === "resultado" && resultado && (
          <div>
            {resultado.error ? (
              <div style={{ background: "#fff0f0", borderRadius: 10, padding: 16, marginBottom: 12 }}>
                <div style={{ color: "#c0392b", fontWeight: 700, marginBottom: 8 }}>⚠️ {resultado.error}</div>
                {resultado.raw && <div style={{ fontSize: 12, color: "#888" }}>{resultado.raw}</div>}
              </div>
            ) : (
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
            )}
            {!resultado.error && (
              <button onClick={enviarAFinanzas} style={S.btnPrimario}>✅ Enviar a Finanzas</button>
            )}
            <button onClick={reiniciar} style={{ ...S.btnSecundario, width: "100%", marginTop: 8 }}>
              🔄 Escanear otro documento
            </button>
          </div>
        )}

        {/* ESTADO: error */}
        {estado === "error" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
            <div style={{ color: "#c0392b", fontWeight: 700, marginBottom: 4 }}>Error al analizar</div>
            {errorMsg && <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>{errorMsg}</div>}
            <button onClick={abrirSelector} style={{ ...S.btnSecundario, marginTop: 4 }}>
              Intentar con otra imagen
            </button>
            <button onClick={reiniciar} style={{ ...S.btnSecundario, marginTop: 8, width: "100%" }}>
              Reiniciar
            </button>
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
  const [recargando, setRecargando] = useState(false);

  const finanzas   = useTabla("finanzas");
  const inventario = useTabla("inventario");
  const tareas     = useTabla("tareas");
  const trabajadores = useTabla("trabajadores");
  const registrosHH  = useTabla("registrosHH");
  const movInventario = useTabla("movInventario");

  const showToast = (msg) => setToast(msg);

  const recargarTodo = async () => {
    setRecargando(true);
    await Promise.all([
      finanzas.recargar(),
      inventario.recargar(),
      tareas.recargar(),
      trabajadores.recargar(),
      registrosHH.recargar(),
      movInventario.recargar(),
    ]);
    setRecargando(false);
    showToast("✅ Datos actualizados");
  };

  const [formularioEscaner, setFormularioEscaner] = useState(null);

  const agregarConToast = (tabla, msg) => (item) => {
    tabla.agregar(item);
    showToast(msg);
  };

  const handleExtraccion = (datos) => {
    setFormularioEscaner(datos);
    setTab("finanzas");
    showToast("📋 Revisa y confirma los datos extraídos");
  };

  const renderTab = () => {
    switch (tab) {
      case "dashboard":
        return <ModuloDashboard
          finanzas={finanzas.datos}
          inventario={inventario.datos}
          tareas={tareas.datos}
          personal={trabajadores.datos}
          movInventario={movInventario.datos}
          registrosHH={registrosHH.datos}
        />;
      case "finanzas":
        return <ModuloFinanzas
          datos={finanzas.datos}
          agregar={agregarConToast(finanzas, "💰 Movimiento guardado")}
          actualizar={finanzas.actualizar}
          eliminar={finanzas.eliminar}
          formularioInicial={formularioEscaner}
          onLimpiarFormulario={() => setFormularioEscaner(null)}
          inventario={inventario.datos}
          agregarMovInventario={agregarConToast(movInventario, "📦 Stock actualizado")}
          agregarProductoInventario={agregarConToast(inventario, "📦 Producto creado")}
          trabajadores={trabajadores.datos}
        />;
      case "inventario":
        return <ModuloInventario
          datos={inventario.datos}
          agregar={agregarConToast(inventario, "📦 Producto guardado")}
          actualizar={inventario.actualizar}
          eliminar={inventario.eliminar}
          movimientos={movInventario.datos}
          agregarMov={agregarConToast(movInventario, "📦 Movimiento registrado")}
        />;
      case "tareas":
        return <ModuloTareas
          datos={tareas.datos}
          agregar={agregarConToast(tareas, "✅ Tarea creada")}
          actualizar={tareas.actualizar}
          eliminar={tareas.eliminar}
          setDatos={tareas.setDatos}
          inventario={inventario.datos}
          agregarMovInventario={agregarConToast(movInventario, "📦 Stock descontado")}
        />;
      case "personal":
        return <ModuloPersonal
          trabajadores={trabajadores.datos}
          agregarTrabajador={agregarConToast(trabajadores, "👷 Persona agregada")}
          actualizarTrabajador={trabajadores.actualizar}
          eliminarTrabajador={trabajadores.eliminar}
          registros={registrosHH.datos}
          agregarRegistro={agregarConToast(registrosHH, "⏱ Horas registradas")}
          eliminarRegistro={registrosHH.eliminar}
          finanzas={finanzas.datos}
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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 12, color: "#F5F0E8aa" }}>
            {TABS.find(t => t.id === tab)?.label}
          </div>
          <button
            onClick={recargarTodo}
            disabled={recargando}
            title="Actualizar datos"
            style={{
              background: "none", border: "1.5px solid #F5F0E860", borderRadius: 8,
              color: "#F5F0E8cc", fontSize: 16, padding: "4px 8px", cursor: recargando ? "wait" : "pointer",
              opacity: recargando ? 0.5 : 1,
            }}
          >
            {recargando ? "⏳" : "🔄"}
          </button>
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
