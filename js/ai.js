async function fetchJSON(url, options = {}) {
  const res = await fetch(url, { cache: "no-store", ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${url}`);
  return data;
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function addMsg(role, text) {
  const chatBox = document.getElementById("chatBox");
  if (!chatBox) return;

  const div = document.createElement("div");
  div.className = role === "user" ? "user-msg" : "bot-msg";
  div.innerHTML = escapeHTML(text).replace(/\n/g, "<br>");
  chatBox.appendChild(div);

  chatBox.scrollTop = chatBox.scrollHeight;
}

function num(n) {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function money(n) {
  return `₱${num(n).toFixed(2)}`;
}

function buildAnswer(question, ctx) {
  const q = String(question || "").toLowerCase();

  const powerW = num(ctx.latest?.total_power_w);
  const tempC = num(ctx.latest?.temperature_c);
  const updatedAt = ctx.latest?.updated_at || null;

  const prepaid = num(ctx.balance?.prepaid_balance);
  const lowTh = num(ctx.balance?.low_threshold);

  const appliances = Array.isArray(ctx.appliances) ? ctx.appliances : [];
  const high = appliances.filter(a => (a.category || "").toLowerCase().includes("high"));
  const med = appliances.filter(a => (a.category || "").toLowerCase().includes("medium"));

  const history = Array.isArray(ctx.history_last_7_days) ? ctx.history_last_7_days : [];
  const total7kwh = history.reduce((s, r) => s + num(r.kwh), 0);
  const total7cost = history.reduce((s, r) => s + num(r.cost), 0);

  // Basic intents
  const asksBalance = q.includes("balance") || q.includes("load") || q.includes("low");
  const asksTemp = q.includes("temp") || q.includes("temperature") || q.includes("hot");
  const asksPower = q.includes("power") || q.includes("watt") || q.includes("usage");
  const asksHistory = q.includes("history") || q.includes("weekly") || q.includes("monthly") || q.includes("daily");
  const asksAppliances = q.includes("appliance") || q.includes("ac") || q.includes("aircon") || q.includes("fan") || q.includes("ref");

  const lines = [];

  // Always include live snapshot at top
  lines.push(`📍 Live now: ${powerW} W, ${tempC} °C, balance ${money(prepaid)}.`);
  if (updatedAt) lines.push(`🕒 Updated at: ${updatedAt}`);

  if (prepaid <= lowTh) {
    lines.push(`⚠️ Your balance is below the low threshold (${money(lowTh)}). Consider topping up soon.`);
  }

  if (asksBalance) {
    lines.push(`💳 Prepaid balance: ${money(prepaid)} (low threshold: ${money(lowTh)}).`);
  }

  if (asksTemp) {
    lines.push(`🌡 Room temperature: ${tempC} °C.`);
    if (tempC >= 30) lines.push(`✅ Tip: If you use aircon, set it to 24–26°C and clean filters to reduce power draw.`);
  }

  if (asksPower) {
    lines.push(`⚡ Current total power: ${powerW} W.`);
    const rate = 15;
    const cost1h = (powerW / 1000) * 1 * rate;
    lines.push(`💡 If you keep ${powerW}W for 1 hour at ₱${rate}/kWh, estimated cost ≈ ${money(cost1h)}.`);
  }

  if (asksAppliances) {
    if (appliances.length === 0) {
      lines.push(`🧾 You don’t have appliances saved yet. Add appliances so I can identify which ones are heavy users.`);
    } else {
      lines.push(`🧾 Appliances saved: ${appliances.length}.`);
      if (high.length) {
        const topHigh = high
          .sort((a, b) => num(b.power_w) - num(a.power_w))
          .slice(0, 3)
          .map(a => `${a.name} (${num(a.power_w)}W)`)
          .join(", ");
        lines.push(`🔥 High power appliances: ${topHigh}.`);
        lines.push(`✅ Tip: Use high-power appliances one at a time, and unplug idle devices when not needed.`);
      } else if (med.length) {
        lines.push(`✅ Most of your appliances are medium power. Good — focus on reducing runtime.`);
      } else {
        lines.push(`✅ Mostly low-power appliances. Savings will come from reducing hours used.`);
      }
    }
  }

  if (asksHistory) {
    if (!history.length) {
      lines.push(`📊 No history yet. Keep posting readings to build daily/weekly/monthly data.`);
    } else {
      lines.push(`📊 Last ${history.length} day(s): ${total7kwh.toFixed(2)} kWh ≈ ${money(total7cost)}.`);
      const latest = history[0];
      lines.push(`🗓 Latest record (${latest.date}): ${num(latest.kwh).toFixed(2)} kWh, cost ${money(latest.cost)}.`);
    }
  }

  // If question is generic (no intent matched), give general advice based on actual saved appliances
  if (!(asksBalance || asksTemp || asksPower || asksHistory || asksAppliances)) {
    lines.push(`Here are practical ways to reduce consumption based on your saved data:`);

    if (high.length) {
      const biggest = high.sort((a, b) => num(b.power_w) - num(a.power_w))[0];
      lines.push(`• Biggest appliance: ${biggest.name} (${num(biggest.power_w)}W). Reduce its usage time for the biggest savings.`);
    } else {
      lines.push(`• You have no “high power” appliances saved. Savings will mostly come from usage time and avoiding standby power.`);
    }

    lines.push(`• Use electric fan + ventilation before using aircon.`);
    lines.push(`• Avoid running multiple heavy loads at the same time.`);
    lines.push(`• Turn off/unplug chargers when not in use.`);
  }

  return lines.join("\n");
}

async function handleSend() {
  const input = document.getElementById("userInput");
  const text = (input?.value || "").trim();
  if (!text) return;

  addMsg("user", text);
  input.value = "";

  try {
    const ctx = await fetchJSON("/api/ai/context");
    const answer = buildAnswer(text, ctx);
    addMsg("bot", answer);
  } catch (e) {
    console.error(e);
    addMsg("bot", "⚠️ I couldn’t load live data. Make sure your backend is running on http://localhost:3000");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("sendBtn");
  const input = document.getElementById("userInput");

  if (btn) btn.addEventListener("click", handleSend);
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSend();
    });
  }
});
