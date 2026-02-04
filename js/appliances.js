// js/appliances.js (FINAL)

const grid = document.getElementById("applianceGrid");
const msg = document.getElementById("applianceMsg");

const nameInput = document.getElementById("nameInput");
const powerInput = document.getElementById("powerInput");
const addBtn = document.getElementById("addBtn");

function showMsg(text, isError = false) {
  msg.textContent = text || "";
  msg.style.color = !text ? "#555" : (isError ? "#b91c1c" : "#065f46");
}

// Optional: client-side preview category (backend is still source of truth)
function calcCategory(powerW) {
  const w = Number(powerW);
  if (w >= 1000) return "High Power";
  if (w >= 300) return "Medium Power";
  return "Low Power";
}

async function loadAppliances() {
  try {
    const res = await fetch("/api/appliances", { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) {
      showMsg(data?.error || "Failed to load appliances.", true);
      return;
    }

    grid.innerHTML = "";

    data.forEach((a) => {
      const card = document.createElement("div");
      card.className = "card";

      // If backend returns category, use it; otherwise compute
      const category = a.category || calcCategory(a.power_w);

      card.innerHTML = `
        <p><b>${a.name}</b></p>
        <p><b>Category:</b> ${category}</p>
        <h2>${a.power_w} W</h2>

        <div class="btn-row">
          <button class="btn btn-danger" data-id="${a.id}">Delete</button>
        </div>
      `;

      grid.appendChild(card);
    });

    // Attach delete handlers
    document.querySelectorAll(".btn-danger[data-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        await deleteAppliance(id);
      });
    });
  } catch (err) {
    console.error("Load appliances error:", err);
    showMsg("Failed to load appliances. Check backend is running.", true);
  }
}

async function addAppliance() {
  const name = nameInput.value.trim();
  const power_w = powerInput.value;

  if (!name || power_w === "") {
    showMsg("Please enter appliance name and power (Watts).", true);
    return;
  }

  try {
    addBtn.disabled = true;
    showMsg("Adding appliance...");

    const res = await fetch("/api/appliances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        power_w: Number(power_w),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      showMsg(data?.error || "Failed to add appliance.", true);
      return;
    }

    nameInput.value = "";
    powerInput.value = "";
    showMsg("Appliance added ✅");
    await loadAppliances();
  } catch (err) {
    console.error("Add appliance error:", err);
    showMsg("Failed to add appliance. Check backend.", true);
  } finally {
    addBtn.disabled = false;
  }
}

async function deleteAppliance(id) {
  const ok = confirm("Delete this appliance?");
  if (!ok) return;

  try {
    showMsg("Deleting appliance...");

    const res = await fetch(`/api/appliances/${id}`, { method: "DELETE" });
    const data = await res.json();

    if (!res.ok) {
      showMsg(data?.error || "Failed to delete appliance.", true);
      return;
    }

    showMsg(data?.message || "Deleted ✅");
    await loadAppliances();
  } catch (err) {
    console.error("Delete appliance error:", err);
    showMsg("Failed to delete appliance. Check backend.", true);
  }
}

// Events
addBtn.addEventListener("click", addAppliance);

// Initial load
loadAppliances();
