const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { query } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend files
const frontendPath = path.join(__dirname, "..");
app.use(express.static(frontendPath));

/* =========================
   ⚙️ SETTINGS
========================= */
const READ_INTERVAL_SECONDS = 60;
const DEFAULT_RATE_PER_KWH = 15;

/* =========================
   🧠 HELPERS
========================= */
function powerCategory(powerW) {
  if (powerW >= 1000) return "High Power";
  if (powerW >= 200) return "Medium Power";
  return "Low Power";
}

/* =========================
   🗄️ INIT DATABASE (runs schema.sql)
========================= */
async function initDB() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  await query(schema);
  console.log("✅ DB schema ensured");
}

/* =========================
   🧪 TEST ENDPOINT
========================= */
app.get("/api/test", (req, res) => {
  res.json({ message: "Backend connected ✅" });
});

/* =========================
   🔧 SETTINGS (Prepaid Mode)
========================= */
app.get("/api/settings/prepaid-mode", async (req, res) => {
  const r = await query(`SELECT value FROM settings WHERE key='prepaid_mode'`);
  res.json({ prepaid_mode: r.rows[0]?.value || "on" });
});

app.post("/api/settings/prepaid-mode", async (req, res) => {
  const mode = String(req.body.prepaid_mode || "").toLowerCase();
  if (!["on", "off"].includes(mode)) {
    return res.status(400).json({ error: "Invalid prepaid_mode" });
  }
  await query(
    `INSERT INTO settings (key,value) VALUES ('prepaid_mode',$1)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    [mode]
  );
  res.json({ message: "Updated", prepaid_mode: mode });
});

/* =========================
   ⚡ READINGS
========================= */
app.post("/api/readings", async (req, res) => {
  const powerW = Number(req.body.power_w);
  const tempC = Number(req.body.temperature_c);
  const now = new Date();

  await query(
    `INSERT INTO readings (total_power_w, temperature_c, created_at, updated_at)
     VALUES ($1,$2,$3,$4)`,
    [powerW, tempC, now, now]
  );

  const hours = READ_INTERVAL_SECONDS / 3600;
  const kwh = (powerW / 1000) * hours;
  const cost = kwh * DEFAULT_RATE_PER_KWH;

  await query(
    `INSERT INTO energy_logs (kwh, cost, created_at)
     VALUES ($1,$2,$3)`,
    [kwh, cost, now]
  );

  res.json({ message: "Reading saved" });
});

app.get("/api/readings/latest", async (req, res) => {
  const r = await query(
    `SELECT total_power_w, temperature_c, updated_at
     FROM readings ORDER BY id DESC LIMIT 1`
  );
  res.json(r.rows[0] || { total_power_w: 0, temperature_c: 0 });
});

/* =========================
   💳 BALANCE (mock)
========================= */
app.get("/api/balance", (req, res) => {
  res.json({ prepaid_balance: 45.5, low_threshold: 20.0 });
});

/* =========================
   🔌 APPLIANCES
========================= */
app.get("/api/appliances", async (req, res) => {
  const r = await query(`SELECT * FROM appliances ORDER BY id DESC`);
  const rows = r.rows.map(a => ({
    ...a,
    category: powerCategory(a.power_w)
  }));
  res.json(rows);
});

app.post("/api/appliances", async (req, res) => {
  const { name, power_w } = req.body;
  const r = await query(
    `INSERT INTO appliances (name, power_w) VALUES ($1,$2) RETURNING *`,
    [name, power_w]
  );
  const a = r.rows[0];
  res.json({ appliance: { ...a, category: powerCategory(a.power_w) } });
});

app.delete("/api/appliances/:id", async (req, res) => {
  await query(`DELETE FROM appliances WHERE id=$1`, [req.params.id]);
  res.json({ message: "Deleted" });
});

/* =========================
   📊 HISTORY
========================= */
app.get("/api/history", async (req, res) => {
  const mode = req.query.mode || "daily";
  let group;

  if (mode === "weekly")
    group = `to_char(created_at,'IYYY-IW')`;
  else if (mode === "monthly")
    group = `to_char(created_at,'YYYY-MM')`;
  else
    group = `to_char(created_at,'YYYY-MM-DD')`;

  const r = await query(`
    SELECT ${group} AS key,
           SUM(kwh) AS total_kwh,
           SUM(cost) AS total_cost
    FROM energy_logs
    GROUP BY key
    ORDER BY key DESC
    LIMIT 60
  `);

  res.json({ records: r.rows });
});

/* =========================
   🤖 AI CONTEXT
========================= */
app.get("/api/ai/context", async (req, res) => {
  const latest = await query(`SELECT * FROM readings ORDER BY id DESC LIMIT 1`);
  const appliances = await query(`SELECT * FROM appliances`);
  const history = await query(`
    SELECT to_char(created_at,'YYYY-MM-DD') AS date,
           SUM(kwh) AS kwh,
           SUM(cost) AS cost
    FROM energy_logs
    GROUP BY date
    ORDER BY date DESC
    LIMIT 7
  `);

  res.json({
    latest: latest.rows[0],
    appliances: appliances.rows,
    history_last_7_days: history.rows
  });
});

/* =========================
   🚀 START SERVER
========================= */
const PORT = process.env.PORT || 3000;

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});
