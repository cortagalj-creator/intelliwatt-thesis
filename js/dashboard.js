// js/dashboard.js

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed: ${url} (${res.status})`);
  return res.json();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// Optional: if you add <p id="updatedAt"></p> somewhere in index.html
function setUpdatedAt(iso) {
  const el = document.getElementById("updatedAt");
  if (!el) return;
  if (!iso) {
    el.textContent = "";
    return;
  }
  const d = new Date(iso);
  el.textContent = `Updated: ${d.toLocaleString()}`;
}

let hasLoadedOnce = false;

async function loadDashboard() {
  try {
    // 1) Readings (power + temp)
    const readings = await fetchJSON("/api/readings/latest");
    const powerW = Number(readings.total_power_w ?? 0);
    const tempC = Number(readings.temperature_c ?? 0);

    setText("power", `${powerW} W`);
    setText("temp", `${tempC} °C`);
    setUpdatedAt(readings.updated_at);

    // 2) Balance
    const bal = await fetchJSON("/api/balance");
    const prepaid = Number(bal.prepaid_balance ?? 0);
    setText("balance", `₱${prepaid.toFixed(2)}`);

    // 3) Estimated cost (backend calculates)
    const hours = 1; // demo assumption
    const rate = 15; // ₱/kWh demo

    const costData = await fetchJSON(
      `/api/cost/estimate?power_w=${encodeURIComponent(powerW)}&hours=${hours}&rate=${rate}`
    );

    setText("cost", `₱${Number(costData.cost ?? 0).toFixed(2)}`);

    hasLoadedOnce = true;
  } catch (err) {
    console.error("Dashboard load error:", err);

    // Only blank out the UI if we NEVER successfully loaded before
    if (!hasLoadedOnce) {
      setText("power", "---");
      setText("temp", "---");
      setText("balance", "---");
      setText("cost", "---");
      setUpdatedAt("");
    }
  }
}

// First load + auto refresh
loadDashboard();
setInterval(loadDashboard, 3000);
