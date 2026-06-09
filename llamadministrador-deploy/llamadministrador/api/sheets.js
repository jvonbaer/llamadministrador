// api/sheets.js — Proxy para Google Apps Script
// Vercel serverless function que evita el problema de CORS

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxrVvVX69qjBNcCUwg55-JZX8huEuJx6-F-MjgrIhu8N1lP54rh13Wk7pnXryv_sfdi7g/exec";

export default async function handler(req, res) {
  // Headers CORS para permitir requests desde la app
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Responder preflight OPTIONS
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    if (req.method === "GET") {
      // Leer datos — pasar el parámetro tabla
      const { tabla } = req.query;
      if (!tabla) return res.status(400).json({ ok: false, error: "Tabla requerida" });

      const response = await fetch(`${SCRIPT_URL}?tabla=${tabla}`);
      const data = await response.json();
      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      // Escribir datos — pasar el payload al script
      const body = req.body;

      const response = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        redirect: "follow",
      });

      const data = await response.json();
      return res.status(200).json(data);
    }

    return res.status(405).json({ ok: false, error: "Método no permitido" });

  } catch (error) {
    console.error("Proxy error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
