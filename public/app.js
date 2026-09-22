document.addEventListener("DOMContentLoaded", () => {
  // ── DOM refs ──────────────────────────────────────────────────────────────
  const floorsContainer = document.getElementById("floors-container");
  const ticketsList = document.getElementById("tickets-list");
  const btnEntry = document.getElementById("btn-entry");
  const btnEntryText = document.getElementById("btn-entry-text") || btnEntry;
  const simEntryTime = document.getElementById("sim-entry-time");
  const simExitTime = document.getElementById("sim-exit-time");
  const entryToast = document.getElementById("entry-toast");
  const entryToastMsg = document.getElementById("entry-toast-msg");
  const ticketMapElement = document.getElementById("ticket-map");
  const ticketMapStatus = document.getElementById("ticket-map-status");

  // Modal refs
  const modal = document.getElementById("exit-modal");
  const coTicketId = document.getElementById("co-ticket-id");
  const coSlotId = document.getElementById("co-slot-id");
  const coFloor = document.getElementById("co-floor");
  const coEntryTime = document.getElementById("co-entry-time");
  const coStatusPill = document.getElementById("co-status-pill");
  const coFeeDisplay = document.getElementById("co-fee-display");
  const cashInput = document.getElementById("cash-input");
  const paymentError = document.getElementById("payment-error");
  const paymentSection = document.getElementById("payment-section");
  const receiptSection = document.getElementById("receipt-section");
  const coChange = document.getElementById("co-change");
  const coBreakdown = document.getElementById("co-breakdown");
  const btnCancel = document.getElementById("btn-cancel");
  const btnPay = document.getElementById("btn-pay");
  const btnClose = document.getElementById("btn-close");
  const btnModalCloseX = document.getElementById("btn-modal-close-x");

  // Search elements
  const searchInput = document.getElementById("search-ticket-input");
  const btnSearch = document.getElementById("btn-search");
  const btnClearSearch = document.getElementById("btn-clear-search");

  let currentTicketId = null;
  let allTickets = [];
  let searchedTicketId = null;
  let toastTimeout = null;
  let ticketMap = null;
  let ticketMarker = null;
  let ticketMapLocation = null;

  initializeTicketMap();

  async function initializeTicketMap() {
    if (!ticketMapElement) return;

    try {
      if (!window.L) throw new Error("Leaflet failed to load");
      ticketMap = L.map(ticketMapElement).setView([14.5995, 120.9842], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(ticketMap);
      ticketMap.on("click", (event) => {
        ticketMapLocation = {
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
        };
        if (!ticketMarker) {
          ticketMarker = L.marker(event.latlng).addTo(ticketMap);
        } else {
          ticketMarker.setLatLng(event.latlng);
        }
        if (ticketMapStatus) ticketMapStatus.textContent = "Location pinned";
      });
      setTimeout(() => ticketMap.invalidateSize(), 50);
    } catch (error) {
      console.error("Ticket map failed to load:", error);
      ticketMapElement.innerHTML =
        '<p class="p-4 text-xs text-red-600">Leaflet map could not be loaded.</p>';
    }
  }

  // ── Live polling ──────────────────────────────────────────────────────────
  fetchStatus();
  setInterval(fetchStatus, 3000);

  async function loadKpis() {
    try {
      const res = await fetch("/api/kpis");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();

      const el = document.getElementById("revenue-per-space");
      if (el) {
        el.textContent = `₱${Number(data.revenuePerAvailableSpace || 0).toFixed(2)}`;
      }
    } catch (err) {
      console.error("Error loading KPI:", err);
    }
  }

  loadKpis();
  setInterval(loadKpis, 3000);

  async function loadReports() {
    try {
      const res = await fetch("/api/reports");
      if (!res.ok) throw new Error("HTTP " + res.status);

      const reports = await res.json();
      const reportsList = document.getElementById("reports-list");

      if (!reportsList) return;

      if (!reports || reports.length === 0) {
        reportsList.innerHTML =
          '<p class="text-sm text-[#6e6e73]">No parking lot reports yet.</p>';
        return;
      }

      reportsList.innerHTML = reports
        .map((report) => {
          const severityClass =
            report.severity === "critical"
              ? "text-red-600"
              : report.severity === "warning"
                ? "text-amber-600"
                : "text-emerald-600";

          return `
          <div class="border-b border-black/5 pb-3 last:border-0 last:pb-0">
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-bold uppercase tracking-wide text-[#1d1d1f]">
                ${report.type}
              </p>
              <span class="text-[10px] font-semibold uppercase ${severityClass}">
                ${report.severity}
              </span>
            </div>
            <p class="text-sm text-[#6e6e73] mt-1">${report.message}</p>
            <p class="text-[11px] text-[#8e8e93] mt-1">
              ${new Date(report.created_at).toLocaleString()}
            </p>
          </div>
        `;
        })
        .join("");
    } catch (err) {
      console.error("Error loading reports:", err);
    }
  }

  loadReports();
  setInterval(loadReports, 5000);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      allTickets = data.tickets || [];
      renderFloors(data.capacity || {});

      // If user searched for a specific ticket, filter by it
      if (searchedTicketId) {
        const found = allTickets.find((t) => t.id == searchedTicketId);
        renderTickets(found ? [found] : []);
      } else {
        // By default, display all active tickets!
        renderTickets(allTickets);
      }
    } catch (err) {
      console.error("Error fetching status:", err);
    }
  }

  // ── Search functionality ──────────────────────────────────────────────────
  if (btnSearch) btnSearch.addEventListener("click", performSearch);
  if (searchInput) {
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") performSearch();
    });
    searchInput.addEventListener("input", () => {
      if (!searchInput.value.trim() && searchedTicketId) {
        clearSearch();
      }
    });
  }
  if (btnClearSearch) {
    btnClearSearch.addEventListener("click", clearSearch);
  }

  function performSearch() {
    const val = searchInput ? searchInput.value.trim() : "";
    if (!val) {
      clearSearch();
      return;
    }
    searchedTicketId = parseInt(val, 10);
    if (btnClearSearch) btnClearSearch.classList.remove("hidden");

    const found = allTickets.find((t) => t.id === searchedTicketId);
    if (found) {
      renderTickets([found]);
    } else {
      ticketsList.innerHTML = `
              <div class="bg-white rounded-apple-2xl shadow-sm px-6 py-8 text-center border border-black/5">
                <p class="text-[#1d1d1f] text-base font-semibold mb-1">Ticket #${searchedTicketId} Not Found</p>
                <p class="text-[#6e6e73] text-[13px]">This ticket does not exist or has already been paid and exited.</p>
                <button onclick="window.clearSearchUI()" class="mt-3 px-4 py-1.5 rounded-full bg-[#f5f5f7] text-xs font-semibold text-[#1d1d1f] hover:bg-[#e5e5ea]">
                  Show All Tickets
                </button>
              </div>`;
    }
  }

  function clearSearch() {
    searchedTicketId = null;
    if (searchInput) searchInput.value = "";
    if (btnClearSearch) btnClearSearch.classList.add("hidden");
    renderTickets(allTickets);
  }
  window.clearSearchUI = clearSearch;

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderFloors(capacity) {
    if (!floorsContainer) return;
    floorsContainer.innerHTML = "";

    [1, 2, 3].forEach((floor) => {
      const cap = capacity[floor] || { total: 100, taken: 0 };
      const available = Math.max(0, cap.total - cap.taken);
      const pct = Math.round((cap.taken / cap.total) * 100);

      // Ring border color based on occupancy
      const ringColor =
        pct >= 90
          ? "border-red-500"
          : pct >= 60
            ? "border-amber-400"
            : "border-emerald-500";

      const card = document.createElement("div");
      card.className =
        "bg-white rounded-apple-2xl shadow-sm p-4 sm:p-5 flex items-center justify-between gap-4 border border-black/5 hover:border-black/10 transition-colors";
      card.innerHTML = `
              <div class="flex flex-col gap-0.5 min-w-0">
                <span class="text-[11px] font-semibold tracking-widest uppercase text-[#8e8e93]">Floor ${floor}</span>
                <p class="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1d1d1f] leading-none my-1">
                  ${available}<span class="text-sm sm:text-base font-bold text-[#8e8e93]">/100</span>
                </p>
                <p class="text-xs text-[#6e6e73] truncate">${cap.taken} slot${cap.taken !== 1 ? "s" : ""} currently occupied</p>
              </div>
              <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-4 ${ringColor} flex items-center justify-center shrink-0">
                <span class="text-xs sm:text-sm font-bold text-[#1d1d1f]">${pct}%</span>
              </div>
            `;
      floorsContainer.appendChild(card);
    });
  }

  function renderTickets(tickets) {
    if (!ticketsList) return;
    ticketsList.innerHTML = "";

    if (!tickets || tickets.length === 0) {
      ticketsList.innerHTML = `
              <div class="bg-white rounded-apple-2xl shadow-sm px-6 py-8 text-center border border-black/5">
                <div class="text-3xl mb-2">🅿️</div>
                <p class="text-[#1d1d1f] text-base font-semibold mb-1">No Active Tickets</p>
                <p class="text-[#6e6e73] text-[13px] max-w-sm mx-auto">
                  Click the <strong>"Enter Lot"</strong> button on the left to park a vehicle and issue a ticket.
                </p>
              </div>`;
      return;
    }

    tickets.forEach((t) => {
      const card = document.createElement("div");
      card.className =
        "bg-white rounded-apple-2xl shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-black/5 hover:border-black/10 transition-colors";
      card.innerHTML = `
              <div class="flex items-center gap-3.5 min-w-0">
                <div class="w-10 h-10 rounded-full bg-[#f5f5f7] flex items-center justify-center shrink-0 text-lg">
                  🎫
                </div>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="text-base font-bold tracking-tight text-[#1d1d1f]">Ticket #${t.id}</p>
                    <span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-[10px] uppercase">Active</span>
                  </div>
                  <p class="text-xs sm:text-[13px] text-[#6e6e73] font-medium">Slot ${t.slot_id} · Floor ${t.floor}</p>
                  <p class="text-[11px] sm:text-xs text-[#8e8e93] truncate">Entered: ${new Date(t.entry_time).toLocaleString()}</p>
                </div>
              </div>
              <button
                onclick="window.openCheckout(${t.id}, ${t.slot_id}, ${t.floor}, '${t.entry_time}')"
                class="w-full sm:w-auto shrink-0 px-5 py-2.5 rounded-full bg-[#1d1d1f] text-white text-xs sm:text-sm font-semibold hover:bg-[#3a3a3c] active:scale-95 transition-all duration-150 text-center cursor-pointer"
              >
                Checkout &rarr;
              </button>
            `;
      ticketsList.appendChild(card);
    });
  }

  // ── Entry button (Reliable with immediate feedback) ────────────────────────
  if (btnEntry) {
    btnEntry.addEventListener("click", async (e) => {
      e.preventDefault();

      // Read simulated entry time if specified
      const entryTime =
        simEntryTime && simEntryTime.value
          ? new Date(simEntryTime.value).toISOString()
          : new Date().toISOString();

      // Immediate UI feedback
      btnEntry.disabled = true;
      const prevContent = btnEntry.innerHTML;
      btnEntry.innerHTML = `<span>⏳</span><span>Entering...</span>`;

      try {
        const res = await fetch("/api/entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryTime,
            mapLatitude: ticketMapLocation?.latitude ?? null,
            mapLongitude: ticketMapLocation?.longitude ?? null,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          showToast(`⚠️ ${data.error || "Unable to enter lot."}`, true);
        } else {
          showToast(
            `✓ Car entered! Assigned Slot <strong>${data.slotId}</strong> (Floor ${data.floor}) — Ticket #<strong>${data.ticketId}</strong>`,
          );

          // Clear search to show the newly parked ticket right away
          searchedTicketId = null;
          if (searchInput) searchInput.value = "";
          if (btnClearSearch) btnClearSearch.classList.add("hidden");

          await fetchStatus();
        }
      } catch (err) {
        console.error("Entry error:", err);
        showToast(
          "⚠️ Could not connect to backend server. Make sure node server is running on port 3000.",
          true,
        );
      } finally {
        btnEntry.disabled = false;
        btnEntry.innerHTML = prevContent;
      }
    });
  }

  function showToast(msg, isError = false) {
    if (!entryToast || !entryToastMsg) return;

    clearTimeout(toastTimeout);
    entryToastMsg.innerHTML = msg;

    if (isError) {
      entryToast.className =
        "flex items-center gap-3 rounded-apple-xl px-5 py-3.5 shadow-sm text-sm sm:text-[15px] bg-red-50 text-red-700 border border-red-200 mb-6";
      entryToast.children[0].textContent = "⚠️";
    } else {
      entryToast.className =
        "flex items-center gap-3 rounded-apple-xl px-5 py-3.5 shadow-sm text-sm sm:text-[15px] bg-emerald-50 text-emerald-900 border border-emerald-200 mb-6";
      entryToast.children[0].textContent = "🚗";
    }

    entryToast.classList.remove("hidden");
    toastTimeout = setTimeout(() => {
      entryToast.classList.add("hidden");
    }, 5000);
  }

  // ── Checkout modal ────────────────────────────────────────────────────────
  window.openCheckout = async function (ticketId, slotId, floor, entryTime) {
    currentTicketId = ticketId;
    if (coTicketId) coTicketId.textContent = "#" + ticketId;
    if (coSlotId) coSlotId.textContent = slotId;
    if (coFloor) coFloor.textContent = floor;
    if (coEntryTime)
      coEntryTime.textContent = new Date(entryTime).toLocaleString();

    // Reset modal state
    setStatusPill("Pending");
    if (coFeeDisplay) coFeeDisplay.textContent = "₱—";
    if (cashInput) cashInput.value = "";
    if (paymentError) {
      paymentError.textContent = "";
      paymentError.classList.add("hidden");
    }
    if (paymentSection) paymentSection.classList.remove("hidden");
    if (receiptSection) {
      receiptSection.classList.remove("flex");
      receiptSection.classList.add("hidden");
    }
    if (btnCancel) btnCancel.classList.remove("hidden");
    if (btnPay) {
      btnPay.classList.remove("hidden");
      btnPay.disabled = false;
      btnPay.textContent = "Pay & Exit";
    }
    if (btnClose) btnClose.classList.add("hidden");

    if (modal) modal.classList.remove("hidden");

    // Fetch fee preview
    const exitTimeParam =
      simExitTime && simExitTime.value
        ? `?exitTime=${new Date(simExitTime.value).toISOString()}`
        : "";

    try {
      const res = await fetch(`/api/ticket/${ticketId}/fee${exitTimeParam}`);
      const data = await res.json();

      if (res.ok) {
        if (coFeeDisplay) coFeeDisplay.textContent = `₱${data.fee}`;
        setStatusPill(data.status);

        if (data.status === "towed") {
          if (paymentSection) paymentSection.classList.add("hidden");
          if (btnPay) btnPay.textContent = "Acknowledge TOWED";
        }
      } else {
        if (coFeeDisplay) coFeeDisplay.textContent = "Error";
        showPaymentError(data.error);
      }
    } catch (err) {
      console.error(err);
      showPaymentError(
        "Failed to calculate fee. Please check server connection.",
      );
    }
  };

  function setStatusPill(status) {
    if (!coStatusPill) return;
    const s = String(status).toLowerCase();
    coStatusPill.textContent = status.toUpperCase();
    coStatusPill.className = [
      "px-3 py-0.5 rounded-full text-xs font-bold tracking-wide",
      s === "towed"
        ? "bg-red-100 text-red-700"
        : s === "completed"
          ? "bg-emerald-100 text-emerald-800"
          : s === "active"
            ? "bg-emerald-50 text-emerald-700"
            : "bg-[#e5e5ea] text-[#1d1d1f]",
    ].join(" ");
  }

  function showPaymentError(msg) {
    if (!paymentError) return;
    paymentError.textContent = msg;
    paymentError.classList.remove("hidden");
  }

  function closeModal() {
    if (modal) modal.classList.add("hidden");
    currentTicketId = null;
  }

  if (btnCancel) btnCancel.addEventListener("click", closeModal);
  if (btnModalCloseX) btnModalCloseX.addEventListener("click", closeModal);
  if (btnClose)
    btnClose.addEventListener("click", () => {
      closeModal();
      fetchStatus();
    });

  // ── Payment submission ────────────────────────────────────────────────────
  if (btnPay) {
    btnPay.addEventListener("click", async () => {
      const exitTime =
        simExitTime && simExitTime.value
          ? new Date(simExitTime.value).toISOString()
          : null;
      const amountReceived = cashInput ? parseFloat(cashInput.value) : 0;

      if (paymentError) paymentError.classList.add("hidden");

      btnPay.disabled = true;
      btnPay.textContent = "Processing...";

      try {
        const res = await fetch("/api/exit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticketId: currentTicketId,
            amountReceived,
            exitTime,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          showPaymentError(data.error || "Payment failed.");
          btnPay.disabled = false;
          btnPay.textContent = "Pay & Exit";
          return;
        }

        // Payment Success — show receipt
        if (paymentSection) paymentSection.classList.add("hidden");
        if (receiptSection) {
          receiptSection.classList.remove("hidden");
          receiptSection.classList.add("flex");
        }
        if (btnCancel) btnCancel.classList.add("hidden");
        if (btnPay) btnPay.classList.add("hidden");
        if (btnClose) btnClose.classList.remove("hidden");

        if (data.status === "towed") {
          if (coChange) coChange.textContent = "0";
          if (coBreakdown)
            coBreakdown.innerHTML =
              '<p class="text-[#8e8e93] text-xs">No fee collected — vehicle was marked as towed (>24h stay).</p>';
        } else {
          if (coChange) coChange.textContent = data.changeGiven;

          if (data.changeGiven === 0) {
            if (coBreakdown)
              coBreakdown.innerHTML =
                '<p class="text-[#6e6e73] text-xs mt-1">Exact payment received — no change needed.</p>';
          } else {
            const entries = Object.entries(data.changeBreakdown || {})
              .filter(([, count]) => count > 0)
              .sort(([a], [b]) => parseInt(b) - parseInt(a));

            const rows = entries
              .map(
                ([denom, count]) => `
                          <div class="flex justify-between py-1 border-b border-dashed border-emerald-200/50 last:border-0">
                            <span class="font-semibold text-[#1d1d1f]">₱${denom} bill</span>
                            <span class="text-[#6e6e73] font-medium">× ${count}</span>
                          </div>`,
              )
              .join("");

            if (coBreakdown) {
              coBreakdown.innerHTML = `
                              <p class="text-[11px] font-semibold tracking-wider uppercase text-[#8e8e93] mb-1.5">Change Breakdown</p>
                              ${rows}`;
            }
          }
        }
      } catch (err) {
        console.error(err);
        showPaymentError("Network connection error. Please try again.");
        btnPay.disabled = false;
        btnPay.textContent = "Pay & Exit";
      }
    });
  }
});
