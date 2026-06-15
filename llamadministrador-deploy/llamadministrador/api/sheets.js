const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxrVvVX69qjBNcCUwg55-JZX8huEuJx6-F-MjgrIhu8N1lP54rh13Wk7pnXryv_sfdi7g/exec";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    if (req.method === "GET") {
      const { tabla } = req.query;
      if (!tabla) return res.status(400).json({ error: "Falta parámetro tabla" });

      const r = await fetch(`${APPS_SCRIPT_URL}?tabla=${tabla}`);
      const data = await r.json();
      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      const body = req.body;
      const r = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: "Método no permitido" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
