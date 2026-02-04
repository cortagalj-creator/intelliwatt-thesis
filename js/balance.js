let currentBalance = 0;
let threshold = 0;

async function loadBalance() {
  try {
    const s = await fetchJSON("/api/settings/prepaid-mode");
    const prepaidOn = (s.prepaid_mode || "on") === "on";

    if (!prepaidOn) {
      // Change these IDs to match your balance.html
      const balEl = document.getElementById("balance");
    if (balEl) balEl.textContent = "— (OFF)";
  return;
}

    const res = await fetch("/api/balance");
    const data = await res.json();

    currentBalance = data.prepaid_balance;
    threshold = data.low_threshold;

    document.getElementById("currentBalance").textContent = "₱" + currentBalance.toFixed(2);
    document.getElementById("thresholdValue").textContent = "₱" + threshold.toFixed(2);

    const status = document.getElementById("balanceStatus");
    if (currentBalance <= threshold) {
      status.textContent = "⚠ Low balance! Please load.";
      status.style.color = "#b91c1c";
    } else {
      status.textContent = "✅ Balance is sufficient";
      status.style.color = "green";
    }
  } catch (err) {
    console.error("Balance load error:", err);
  }
}

// Buttons (for now: prototype simulation only on frontend)
document.getElementById("saveThresholdBtn").addEventListener("click", () => {
  const val = Number(document.getElementById("thresholdInput").value);
  if (!val && val !== 0) return;

  threshold = val;
  document.getElementById("thresholdValue").textContent = "₱" + threshold.toFixed(2);
  loadBalance(); // recheck status
});

document.getElementById("addBalanceBtn").addEventListener("click", () => {
  const amount = Number(document.getElementById("addBalanceInput").value);
  if (!amount || amount <= 0) return;

  currentBalance += amount;
  document.getElementById("currentBalance").textContent = "₱" + currentBalance.toFixed(2);
  loadBalance();
});

document.getElementById("simulateBtn").addEventListener("click", () => {
  currentBalance -= 10;
  if (currentBalance < 0) currentBalance = 0;

  document.getElementById("currentBalance").textContent = "₱" + currentBalance.toFixed(2);
  loadBalance();
});

loadBalance();
setInterval(loadBalance, 4000);

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function initPrepaidToggle() {
  const toggle = document.getElementById("prepaidToggle");
  const label = document.getElementById("prepaidToggleLabel");
  if (!toggle || !label) return;

  // Load current mode
  const s = await fetchJSON("/api/settings/prepaid-mode");
  const mode = (s.prepaid_mode || "on").toLowerCase();

  toggle.checked = mode === "on";
  label.textContent = toggle.checked ? "ON" : "OFF";

  // Save when changed
  toggle.addEventListener("change", async () => {
    const newMode = toggle.checked ? "on" : "off";
    label.textContent = toggle.checked ? "ON" : "OFF";

    await fetchJSON("/api/settings/prepaid-mode", {
      method: "POST",
      body: JSON.stringify({ prepaid_mode: newMode }),
    });

    // Optional: reload the page values after switching
    if (typeof loadBalance === "function") loadBalance();
  });
}

initPrepaidToggle();

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function initPrepaidToggle() {
  const toggle = document.getElementById("prepaidToggle");
  const label = document.getElementById("prepaidToggleLabel");
  if (!toggle || !label) return;

  // Load current mode from backend
  const s = await fetchJSON("/api/settings/prepaid-mode");
  const mode = (s.prepaid_mode || "on").toLowerCase();

  toggle.checked = mode === "on";
  label.textContent = toggle.checked ? "ON" : "OFF";

  toggle.addEventListener("change", async () => {
    const newMode = toggle.checked ? "on" : "off";
    label.textContent = toggle.checked ? "ON" : "OFF";

    await fetchJSON("/api/settings/prepaid-mode", {
      method: "POST",
      body: JSON.stringify({ prepaid_mode: newMode }),
    });

    // Reload balance UI after toggling
    if (typeof loadBalance === "function") loadBalance();
  });
}

initPrepaidToggle();
