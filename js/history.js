// js/history.js

const dailyBtn = document.getElementById("dailyBtn");
const weeklyBtn = document.getElementById("weeklyBtn");
const monthlyBtn = document.getElementById("monthlyBtn");

const totalKwhEl = document.getElementById("totalKwh");
const totalCostEl = document.getElementById("totalCost");
const tableBody = document.getElementById("historyTable");

// --- helpers ---
function peso(n) {
  const num = Number(n) || 0;
  return "₱" + num.toFixed(2);
}

function setActive(mode) {
  // If you prefer, you can add a CSS .active-mode style later.
  [dailyBtn, weeklyBtn, monthlyBtn].forEach((b) => b.classList.remove("active-mode"));

  if (mode === "daily") dailyBtn.classList.add("active-mode");
  if (mode === "weekly") weeklyBtn.classList.add("active-mode");
  if (mode === "monthly") monthlyBtn.classList.add("active-mode");
}

function render(records) {
  tableBody.innerHTML = "";

  if (!Array.isArray(records) || records.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="3">No records.</td></tr>`;
    return;
  }

  records.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.date ?? "-"}</td>
      <td>${Number(r.kwh ?? 0).toFixed(2)}</td>
      <td>${peso(r.cost)}</td>
    `;
    tableBody.appendChild(tr);
  });
}

// --- main loader ---
async function loadHistory(mode = "daily") {
  try {
    setActive(mode);

    totalKwhEl.textContent = "Loading...";
    totalCostEl.textContent = "Loading...";
    tableBody.innerHTML = `<tr><td colspan="3">Loading...</td></tr>`;

    const res = await fetch(`/api/history?mode=${encodeURIComponent(mode)}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || "Failed to load history");
    }

    // data expected:
    // { mode, total_kwh, total_cost, records:[{date,kwh,cost}] }
    totalKwhEl.textContent = `${Number(data.total_kwh ?? 0).toFixed(2)} kWh`;
    totalCostEl.textContent = peso(data.total_cost ?? 0);

    render(data.records);
  } catch (err) {
    console.error("History load error:", err);
    totalKwhEl.textContent = "--- kWh";
    totalCostEl.textContent = "₱---";
    tableBody.innerHTML = `<tr><td colspan="3">Failed to load. Is the backend running?</td></tr>`;
  }
}

// --- events ---
dailyBtn.addEventListener("click", () => loadHistory("daily"));
weeklyBtn.addEventListener("click", () => loadHistory("weekly"));
monthlyBtn.addEventListener("click", () => loadHistory("monthly"));

// initial
loadHistory("daily");
