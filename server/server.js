// server/server.js  ✅ SQLite (Render-safe)

const express = require("express");
const cors = require("cors");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Serve frontend (root folder contains index.html, css/, js/, etc.)
const frontendPath = path.join(__dirname, "..");
app.use(express.static(frontendPath));

// ✅ SQLite DB file inside /server
const dbPath = path.join(__dirname, "intelliwatt.db");
const db = new sqlite3.Database(dbPath);

// ======================
// SETTINGS
// ======================
const READ_INTERVAL_SECONDS = 60; // each reading = 60 seconds usage
const DEFAULT_RATE_PER_KWH = 15;  // pesos per kWh (demo)

// --- Helpers ---
function powerCategory(powerW) {
  if (powerW >= 1000) return "High Power";
  if (powerW >= 200) return "Medium Power";
  return "Low Power";
}

// Promise helpers
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// ✅ Create tables + safe migrations
db.serialize(() => {
  // READINGS
  db.run(`
    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total_power_w REAL NOT NULL,
      temperature_c REAL NOT NULL,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  // APPLIANCES
  db.run(`
    CREATE TABLE IF NOT EXISTS appliances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      power_w REAL NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  // ENERGY LOGS (for History)
  db.run(`
    CREATE TABLE IF NOT EXISTS energy_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kwh REAL NOT NULL,
      cost REAL NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  // SETTINGS
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // default prepaid_mode = on
  db.run(`
    INSERT OR IGNORE INTO settings (key, value)
    VALUES ('prepaid_mode', 'on')
  `);

  // Safe migrations (ignore error if already exists)
  db.run(`ALTER TABLE readings ADD COLUMN created_at TEXT`, () => {});
  db.run(`ALTER TABLE readings ADD COLUMN updated_at TEXT`, () => {});

  // Fill missing timestamps
  db.run(`
    UPDATE readings
    SET created_at = COALESCE(created_at, updated_at, datetime('now'))
    WHERE created_at IS NULL
  `);

  db.run(`
    UPDATE readings
    SET updated_at = COALESCE(updated_at, created_at, datetime('now'))
    WHERE updated_at IS NULL
  `);
});

/* =========================
   ✅ TEST
========================= */
app.get("/api/test", (req, res) => {
  res.json({ message: "Backend connected ✅" });
});

/* =========================
   ✅ SETTINGS (Prepaid Mode)
========================= */
app.get("/api/settings/prepaid-mode", async (req, res) => {
  try {
    const row = await get(`SELECT value FROM settings WHERE key='prepaid_mode' LIMIT 1`);
    res.json({ prepaid_mode: row?.value || "on" });
  } catch (err) {
    console.error("GET prepaid-mode error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

app.post("/api/settings/prepaid-mode", async (req, res) => {
  try {
    const mode = String(req.body.prepaid_mode || "").toLowerCase();
    if (!["on", "off"].includes(mode)) {
      return res.status(400).json({ error: "Invalid prepaid_mode (use on/off)" });
    }

    await run(
      `INSERT INTO settings (key, value)
       VALUES ('prepaid_mode', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [mode]
    );

    res.json({ message: "Prepaid mode updated ✅", prepaid_mode: mode });
  } catch (err) {
    console.error("POST prepaid-mode error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

/* =========================
   ✅ READINGS
========================= */
app.post("/api/readings", async (req, res) => {
  try {
    const powerW = Number(req.body.power_w);
    const tempC = Number(req.body.temperature_c);

    if (!Number.isFinite(powerW) || !Number.isFinite(tempC)) {
      return res.status(400).json({ error: "Invalid power_w or temperature_c" });
    }

    const now = new Date().toISOString();

    const insert = await run(
      `INSERT INTO readings (total_power_w, temperature_c, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      [powerW, tempC, now, now]
    );

    // history chunk
    const hours = READ_INTERVAL_SECONDS / 3600;
    const kwh = (powerW / 1000) * hours;
    const cost = kwh * DEFAULT_RATE_PER_KWH;

    await run(
      `INSERT INTO energy_logs (kwh, cost, created_at) VALUES (?, ?, ?)`,
      [kwh, cost, now]
    );

    const latest = await get(
      `SELECT id, total_power_w, temperature_c, created_at, updated_at
       FROM readings WHERE id = ?`,
      [insert.lastID]
    );

    res.json({ message: "Reading saved ✅", latest });
  } catch (err) {
    console.error("POST /api/readings error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

app.get("/api/readings/latest", async (req, res) => {
  try {
    const latest = await get(
      `SELECT total_power_w, temperature_c, updated_at
       FROM readings
       ORDER BY id DESC
       LIMIT 1`
    );

    res.json(
      latest || { total_power_w: 0, temperature_c: 0, updated_at: null }
    );
  } catch (err) {
    console.error("GET /api/readings/latest error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

/* =========================
   ✅ BALANCE (still mock)
========================= */
app.get("/api/balance", (req, res) => {
  res.json({ prepaid_balance: 45.5, low_threshold: 20.0 });
});

/* =========================
   ✅ APPLIANCES
========================= */
app.get("/api/appliances", async (req, res) => {
  try {
    const rows = await all(
      `SELECT id, name, power_w, created_at
       FROM appliances
       ORDER BY id DESC`
    );

    res.json(
      rows.map((a) => ({
        ...a,
        category: powerCategory(Number(a.power_w)),
      }))
    );
  } catch (err) {
    console.error("GET /api/appliances error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

app.post("/api/appliances", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const powerW = Number(req.body.power_w);

    if (!name || !Number.isFinite(powerW)) {
      return res.status(400).json({ error: "Missing/invalid fields (name, power_w)" });
    }

    const createdAt = new Date().toISOString();

    const ins = await run(
      `INSERT INTO appliances (name, power_w, created_at) VALUES (?, ?, ?)`,
      [name, powerW, createdAt]
    );

    const appliance = await get(
      `SELECT id, name, power_w, created_at FROM appliances WHERE id = ?`,
      [ins.lastID]
    );

    res.status(201).json({
      message: "Appliance added ✅",
      appliance: {
        ...appliance,
        category: powerCategory(Number(appliance.power_w)),
      },
    });
  } catch (err) {
    console.error("POST /api/appliances error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

app.delete("/api/appliances/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    const result = await run(`DELETE FROM appliances WHERE id = ?`, [id]);
    res.json({ message: result.changes ? "Deleted ✅" : "Not found ⚠️" });
  } catch (err) {
    console.error("DELETE /api/appliances/:id error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

/* =========================
   ✅ HISTORY
========================= */
app.get("/api/history", async (req, res) => {
  try {
    const mode = String(req.query.mode || "daily").toLowerCase();
    const rate = Number(req.query.rate ?? DEFAULT_RATE_PER_KWH);

    let groupExpr;
    if (mode === "weekly") {
      groupExpr = "strftime('%Y', created_at) || '-W' || strftime('%W', created_at)";
    } else if (mode === "monthly") {
      groupExpr = "strftime('%Y-%m', created_at)";
    } else {
      groupExpr = "strftime('%Y-%m-%d', created_at)";
    }

    const rows = await all(
      `
      SELECT
        ${groupExpr} AS key,
        SUM(kwh) AS total_kwh,
        SUM(kwh) * ? AS total_cost
      FROM energy_logs
      GROUP BY key
      ORDER BY key DESC
      LIMIT 60
      `,
      [rate]
    );

    const records = rows.map((r) => ({
      date: r.key,
      kwh: Number((r.total_kwh ?? 0).toFixed(2)),
      cost: Number((r.total_cost ?? 0).toFixed(2)),
    }));

    res.json({ mode, rate, records });
  } catch (err) {
    console.error("GET /api/history error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

/* =========================
   ✅ AI CONTEXT
========================= */
app.get("/api/ai/context", async (req, res) => {
  try {
    const latest = await get(
      `SELECT total_power_w, temperature_c, updated_at
       FROM readings
       ORDER BY id DESC
       LIMIT 1`
    );

    const appliances = await all(
      `SELECT id, name, power_w, created_at
       FROM appliances
       ORDER BY id DESC`
    );

    const history7 = await all(
      `
      SELECT
        strftime('%Y-%m-%d', created_at) AS date,
        SUM(kwh) AS kwh,
        SUM(kwh) * ? AS cost
      FROM energy_logs
      GROUP BY date
      ORDER BY date DESC
      LIMIT 7
      `,
      [DEFAULT_RATE_PER_KWH]
    );

    res.json({
      latest: latest || { total_power_w: 0, temperature_c: 0, updated_at: null },
      appliances: appliances.map((a) => ({
        ...a,
        category: powerCategory(Number(a.power_w)),
      })),
      balance: { prepaid_balance: 45.5, low_threshold: 20.0 }, // still mock
      history_last_7_days: history7.map((r) => ({
        date: r.date,
        kwh: Number((r.kwh ?? 0).toFixed(2)),
        cost: Number((r.cost ?? 0).toFixed(2)),
      })),
    });
  } catch (err) {
    console.error("GET /api/ai/context error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

/* =========================
   ✅ DEFAULT ROUTE
========================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// ✅ IMPORTANT for Render
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
