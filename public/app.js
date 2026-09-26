document.addEventListener("DOMContentLoaded", () => {
  // ── DOM refs ──────────────────────────────────────────────────────────────
  const floorsContainer = document.getElementById("floors-container");
  const ticketsList = document.getElementById("tickets-list");
  const btnEntry = document.getElementById("btn-entry");
  const btnEntryText = document.getElementById("btn-entry-text") || btnEntry;
  const btnTypeCar = document.getElementById("btn-type-car");
  const btnTypeMotorcycle = document.getElementById("btn-type-motorcycle");
  const simEntryTime = document.getElementById("sim-entry-time");
  const simExitTime = document.getElementById("sim-exit-time");
  const entryToast = document.getElementById("entry-toast");
  const entryToastMsg = document.getElementById("entry-toast-msg");
  // Modal refs
  const modal = document.getElementById("exit-modal");
  const coTicketId = document.getElementById("co-ticket-id");
  const coVehicleType = document.getElementById("co-vehicle-type");
  const coSlotId = document.getElementById("co-slot-id");
  const coFloor = document.getElementById("co-floor");
  const coEntryTime = document.getElementById("co-entry-time");
  const coExitTime = document.getElementById("co-exit-time");
  const coRateTier = document.getElementById("co-rate-tier");
  const coStatusPill = document.getElementById("co-status-pill");
  const coFeeDisplay = document.getElementById("co-fee-display");
  const coFeeNote = document.getElementById("co-fee-note");
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

  // Fee schedules by vehicle type
  const FEE_SCHEDULES = {
    car: {
      type: "car",
      label: "Car",
      shortBadge: "CAR",
      baseHours: 3,
      baseRate: 50,
      hourlyRate: 20,
      overnightSurcharge: 300,
      towedThresholdHours: 24,
    },
    motorcycle: {
      type: "motorcycle",
      label: "Motorcycle",
      shortBadge: "MC",
      baseHours: 2,
      baseRate: 30,
      hourlyRate: 10,
      overnightSurcharge: 300,
      towedThresholdHours: 24,
    },
  };

  function getFeeSchedule(vehicleType) {
    const normalized = String(vehicleType || "car").toLowerCase().trim();
    return FEE_SCHEDULES[normalized] || FEE_SCHEDULES.car;
  }

  let selectedVehicleType = "car";
  let currentTicketId = null;
  let currentVehicleType = "car";
  let currentFee = 0;
  let allTickets = [];
  let searchedTicketId = null;
  let toastTimeout = null;
  let currentTicketsPage = 1;
  const TICKETS_PER_PAGE = 10;
  let currentTicketsData = [];

  let reservedMotorcycleSlots = [];

  function setVehicleTypeSelection(type) {
    const schedule = getFeeSchedule(type);
    selectedVehicleType = schedule.type;

    const activeClass =
      "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-apple-sm text-xs sm:text-[13px] font-semibold bg-[#1d1d1f] text-white shadow-xs transition-all cursor-pointer";
    const inactiveClass =
      "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-apple-sm text-xs sm:text-[13px] font-semibold text-[#6e6e73] hover:text-[#1d1d1f] transition-all cursor-pointer";

    if (btnTypeCar) {
      const isCar = selectedVehicleType === "car";
      btnTypeCar.className = isCar ? activeClass : inactiveClass;
      btnTypeCar.setAttribute("aria-pressed", String(isCar));
    }
    if (btnTypeMotorcycle) {
      const isMc = selectedVehicleType === "motorcycle";
      btnTypeMotorcycle.className = isMc ? activeClass : inactiveClass;
      btnTypeMotorcycle.setAttribute("aria-pressed", String(isMc));
    }
  }

  if (btnTypeCar) {
    btnTypeCar.addEventListener("click", () => setVehicleTypeSelection("car"));
  }
  if (btnTypeMotorcycle) {
    btnTypeMotorcycle.addEventListener("click", () =>
      setVehicleTypeSelection("motorcycle"),
    );
  }

  window.setQuickAmount = function(amount) {
    if (!cashInput) return;
    if (amount === 'exact') {
      cashInput.value = currentFee || getFeeSchedule(currentVehicleType).baseRate;
    } else {
      cashInput.value = amount;
    }
    if (paymentError) {
      paymentError.textContent = "";
      paymentError.classList.add("hidden");
    }
    cashInput.focus();
  };

  function goToTicketsPage(page) {
    const totalPages = Math.ceil(currentTicketsData.length / TICKETS_PER_PAGE) || 1;
    if (page < 1 || page > totalPages) return;
    currentTicketsPage = page;
    renderTickets(currentTicketsData, false);
  }
  window.goToTicketsPage = goToTicketsPage;

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
      reservedMotorcycleSlots = data.reservedMotorcycleSlots || [];
      renderFloors(data.capacity || {}, reservedMotorcycleSlots);

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
    currentTicketsPage = 1;

    const found = allTickets.find((t) => t.id === searchedTicketId);
    if (found) {
      renderTickets([found], true);
    } else {
      const ticketsPagination = document.getElementById("tickets-pagination");
      if (ticketsPagination) ticketsPagination.innerHTML = "";
      ticketsList.innerHTML = `
              <div class="bg-white rounded-apple-2xl shadow-sm px-6 py-8 text-center border border-black/5">
                <p class="text-[#1d1d1f] text-base font-semibold mb-1">Ticket #${searchedTicketId} Not Found</p>
                <p class="text-[#6e6e73] text-[13px]">This ticket does not exist or has already been paid and exited.</p>
                <button onclick="window.clearSearchUI()" class="mt-3 px-4 py-1.5 rounded-full bg-[#f5f5f7] text-xs font-semibold text-[#1d1d1f] hover:bg-[#e5e5ea] cursor-pointer">
                  Show All Tickets
                </button>
              </div>`;
    }
  }

  function clearSearch() {
    searchedTicketId = null;
    currentTicketsPage = 1;
    if (searchInput) searchInput.value = "";
    if (btnClearSearch) btnClearSearch.classList.add("hidden");
    renderTickets(allTickets, true);
  }
  window.clearSearchUI = clearSearch;

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderFloors(capacity) {
    if (!floorsContainer) return;
    floorsContainer.innerHTML = "";

    [1, 2, 3].forEach((floor) => {
      const cap = capacity[floor] || { total: 100, taken: 0 };
      const total = Number(cap.total) || 100;
      const taken = Number(cap.taken) || 0;
      const available =
        cap.available !== undefined
          ? Number(cap.available)
          : Math.max(0, total - taken);
      const pct = total > 0 ? Math.round((taken / total) * 100) : 0;

      // Ring border color based on occupancy
      const ringColor =
        pct >= 90
          ? "border-red-500"
          : pct >= 60
            ? "border-amber-400"
            : "border-emerald-500";

      const card = document.createElement("div");

      if (floor === 1) {
        const mcParked =
          cap.mcTaken !== undefined
            ? Number(cap.mcTaken)
            : allTickets.filter(
                (t) => Number(t.floor) === 1 && t.vehicle_type === "motorcycle",
              ).length;
        const mcTotal =
          cap.mcTotalCapacity !== undefined ? Number(cap.mcTotalCapacity) : 120;
        const carsParked =
          cap.carSlotsTaken !== undefined
            ? Number(cap.carSlotsTaken)
            : allTickets.filter(
                (t) => Number(t.floor) === 1 && t.vehicle_type !== "motorcycle",
              ).length;
        const carsTotal =
          cap.carSlotsTotal !== undefined ? Number(cap.carSlotsTotal) : 80;

        card.className =
          "bg-white rounded-apple-2xl shadow-sm p-4 sm:p-5 flex flex-col gap-3.5 border border-black/5 hover:border-black/10 transition-colors";
        card.innerHTML = `
              <div class="flex items-center justify-between gap-4">
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="text-[11px] font-semibold tracking-widest uppercase text-[#8e8e93]">Floor 1</span>
                  <p class="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1d1d1f] leading-none my-1">
                    ${available}<span class="text-sm sm:text-base font-bold text-[#8e8e93]">/${total}</span>
                  </p>
                  <p class="text-xs text-[#6e6e73] truncate">${taken} slot${taken !== 1 ? "s" : ""} currently occupied</p>
                </div>
                <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-4 ${ringColor} flex items-center justify-center shrink-0">
                  <span class="text-xs sm:text-sm font-bold text-[#1d1d1f]">${pct}%</span>
                </div>
              </div>
              <div class="pt-3 border-t border-[#f5f5f7] flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs sm:text-[13px] text-[#6e6e73] font-medium">
                <span><strong class="text-[#1d1d1f] font-bold tabular-nums">${mcParked}/${mcTotal}</strong> motorcycles parked</span>
                <span><strong class="text-[#1d1d1f] font-bold tabular-nums">${carsParked}/${carsTotal}</strong> cars parked</span>
              </div>
            `;
      } else {
        card.className =
          "bg-white rounded-apple-2xl shadow-sm p-4 sm:p-5 flex items-center justify-between gap-4 border border-black/5 hover:border-black/10 transition-colors";
        card.innerHTML = `
              <div class="flex flex-col gap-0.5 min-w-0">
                <span class="text-[11px] font-semibold tracking-widest uppercase text-[#8e8e93]">Floor ${floor}</span>
                <p class="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1d1d1f] leading-none my-1">
                  ${available}<span class="text-sm sm:text-base font-bold text-[#8e8e93]">/${total}</span>
                </p>
                <p class="text-xs text-[#6e6e73] truncate">${taken} slot${taken !== 1 ? "s" : ""} currently occupied</p>
              </div>
              <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-4 ${ringColor} flex items-center justify-center shrink-0">
                <span class="text-xs sm:text-sm font-bold text-[#1d1d1f]">${pct}%</span>
              </div>
            `;
      }
      floorsContainer.appendChild(card);
    });
  }

  function renderTickets(tickets, resetPage = false) {
    if (!ticketsList) return;
    currentTicketsData = tickets || [];
    const ticketsPagination = document.getElementById("tickets-pagination");

    if (!currentTicketsData || currentTicketsData.length === 0) {
      ticketsList.innerHTML = `
              <div class="bg-white rounded-apple-2xl shadow-sm px-6 py-8 text-center border border-black/5">
                <div class="text-3xl mb-2 font-bold text-parkwise-accent">P</div>
                <p class="text-[#1d1d1f] text-base font-semibold mb-1">No Active Tickets</p>
                <p class="text-[#6e6e73] text-[13px] max-w-sm mx-auto">
                  Click the <strong>"Enter Lot"</strong> button on the left to park a vehicle and issue a ticket.
                </p>
              </div>`;
      if (ticketsPagination) ticketsPagination.innerHTML = "";
      return;
    }

    const totalPages = Math.ceil(currentTicketsData.length / TICKETS_PER_PAGE) || 1;
    if (resetPage) {
      currentTicketsPage = 1;
    } else {
      if (currentTicketsPage > totalPages) currentTicketsPage = totalPages;
      if (currentTicketsPage < 1) currentTicketsPage = 1;
    }

    const startIndex = (currentTicketsPage - 1) * TICKETS_PER_PAGE;
    const endIndex = Math.min(startIndex + TICKETS_PER_PAGE, currentTicketsData.length);
    const pagedTickets = currentTicketsData.slice(startIndex, endIndex);

    ticketsList.innerHTML = "";
    pagedTickets.forEach((t) => {
      const schedule = getFeeSchedule(t.vehicle_type);
      const isReservedMcSlot =
        Boolean(t.is_reserved_motorcycle_slot) ||
        (Number(t.floor) === 1 && Number(t.slot_id) >= 100 && Number(t.slot_id) <= 120);
      let slotDetailText = `${schedule.label} · Slot ${t.slot_id} · Floor ${t.floor}`;
      if (isReservedMcSlot) {
        const used = Math.min(6, Math.max(0, Number(t.slot_motorcycle_count || 1)));
        const rem =
          t.slot_remaining !== undefined
            ? Number(t.slot_remaining)
            : Math.max(0, 6 - used);
        slotDetailText = `${schedule.label} · Slot ${t.slot_id} (${rem}/6) · Floor ${t.floor}`;
      }

      const vehicleInfoParts = [t.year, t.color, t.brand].filter(Boolean);
      const idBadge = t.plate_number
        ? `Plate: ${t.plate_number}`
        : t.mv_file_number
          ? `MV File: ${t.mv_file_number}`
          : null;
      const vehicleMetaLine = [
        vehicleInfoParts.join(" · "),
        idBadge,
      ]
        .filter(Boolean)
        .join(" · ");

      const card = document.createElement("div");
      card.className =
        "bg-white rounded-apple-2xl shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-black/5 hover:border-black/10 transition-colors";
      card.innerHTML = `
              <div class="flex items-center gap-3.5 min-w-0">
                <div class="w-10 h-10 rounded-full bg-[#f5f5f7] flex items-center justify-center shrink-0 text-xs font-bold text-[#6e6e73]">
                  ${schedule.shortBadge}
                </div>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="text-base font-bold tracking-tight text-[#1d1d1f]">Ticket #${t.id}</p>
                    <span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-[10px] uppercase">Active</span>
                    <span class="px-2 py-0.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] font-semibold text-[10px] uppercase">${schedule.label}</span>
                  </div>
                  <p class="text-xs sm:text-[13px] text-[#6e6e73] font-medium">${slotDetailText}</p>
                  ${vehicleMetaLine ? `<p class="text-xs text-[#1d1d1f] font-medium truncate">${vehicleMetaLine}</p>` : ""}
                  <p class="text-[11px] sm:text-xs text-[#8e8e93] truncate">Entered: ${new Date(t.entry_time).toLocaleString()}</p>
                </div>
              </div>
              <button
                onclick="window.openCheckout(${t.id}, ${t.slot_id}, ${t.floor}, '${t.entry_time}', '${schedule.type}')"
                class="w-full sm:w-auto shrink-0 px-5 py-2.5 rounded-full bg-[#1d1d1f] text-white text-xs sm:text-sm font-semibold hover:bg-[#3a3a3c] active:scale-95 transition-all duration-150 text-center cursor-pointer"
              >
                Checkout &rarr;
              </button>
            `;
      ticketsList.appendChild(card);
    });

    // Render pagination controls if multiple pages exist
    if (ticketsPagination) {
      if (totalPages <= 1) {
        ticketsPagination.innerHTML = "";
      } else {
        let pageBtnsHtml = "";

        // Prev button
        pageBtnsHtml += `
          <button
            onclick="window.goToTicketsPage(${currentTicketsPage - 1})"
            ${currentTicketsPage === 1 ? 'disabled class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-black/5 text-xs font-semibold text-[#8e8e93] opacity-40 cursor-not-allowed bg-[#f5f5f7] flex items-center justify-center"' : 'class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-black/5 bg-white text-xs font-semibold text-[#1d1d1f] hover:bg-[#f5f5f7] cursor-pointer shadow-xs flex items-center justify-center"'}
            title="Previous Page"
            aria-label="Previous Page"
          >
            &larr;
          </button>
        `;

        for (let p = 1; p <= totalPages; p++) {
          if (
            p === 1 ||
            p === totalPages ||
            (p >= currentTicketsPage - 1 && p <= currentTicketsPage + 1)
          ) {
            const isActive = p === currentTicketsPage;
            pageBtnsHtml += `
              <button
                onclick="window.goToTicketsPage(${p})"
                class="${
                  isActive
                    ? 'bg-[#1d1d1f] text-white font-bold'
                    : 'bg-white text-[#1d1d1f] hover:bg-[#f5f5f7] border border-black/5 font-medium'
                } w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-xs transition-colors cursor-pointer shadow-xs"
                aria-label="Go to page ${p}"
              >
                ${p}
              </button>
            `;
          } else if (
            p === currentTicketsPage - 2 ||
            p === currentTicketsPage + 2
          ) {
            pageBtnsHtml += `<span class="px-1 text-xs text-[#8e8e93]">...</span>`;
          }
        }

        // Next button
        pageBtnsHtml += `
          <button
            onclick="window.goToTicketsPage(${currentTicketsPage + 1})"
            ${currentTicketsPage === totalPages ? 'disabled class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-black/5 text-xs font-semibold text-[#8e8e93] opacity-40 cursor-not-allowed bg-[#f5f5f7] flex items-center justify-center"' : 'class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-black/5 bg-white text-xs font-semibold text-[#1d1d1f] hover:bg-[#f5f5f7] cursor-pointer shadow-xs flex items-center justify-center"'}
            title="Next Page"
            aria-label="Next Page"
          >
            &rarr;
          </button>
        `;

        ticketsPagination.innerHTML = `
          <p class="text-xs text-[#6e6e73] font-medium">
            Showing <span class="font-semibold text-[#1d1d1f]">${startIndex + 1}</span> to <span class="font-semibold text-[#1d1d1f]">${endIndex}</span> of <span class="font-semibold text-[#1d1d1f]">${currentTicketsData.length}</span> tickets
          </p>
          <div class="flex items-center gap-1.5 flex-wrap">
            ${pageBtnsHtml}
          </div>
        `;
      }
    }
  }

  // ── Vehicle Details Dialog & Region-Based Brand Filtering ─────────────────
  const CAR_BRANDS_BY_REGION = {
    Japanese: [
      "Toyota",
      "Mitsubishi",
      "Nissan",
      "Honda",
      "Suzuki",
      "Isuzu",
      "Mazda",
      "Subaru",
      "Lexus",
    ],
    Chinese: [
      "Geely",
      "BYD",
      "GAC",
      "Chery",
      "Changan",
      "Foton",
      "Jetour",
      "BAIC",
      "GWM (Great Wall Motor)",
      "MG",
      "Omoda",
      "Jaecoo",
      "Lynk & Co",
      "Deepal",
      "Denza",
      "Zeekr",
      "Xpeng",
      "Aion",
      "DFSK",
      "JAC",
      "Kaicene",
      "Hongqi",
      "Dongfeng",
      "Aito",
      "Radar",
      "Voyah",
      "FAW",
      "Haima",
    ],
    American: ["Ford", "Chevrolet", "Jeep", "Dodge", "RAM", "Tesla"],
    Korean: ["Hyundai", "Kia", "KGM/SsangYong"],
    German: ["BMW", "Mercedes-Benz", "Audi", "Porsche", "Volkswagen"],
    "European (other)": [
      "Volvo",
      "Peugeot",
      "Land Rover",
      "Jaguar",
      "MINI",
      "Lotus",
      "Ferrari",
      "Lamborghini",
      "Aston Martin",
      "Maserati",
      "Bentley",
      "Rolls-Royce",
      "Abarth",
      "Alfa Romeo",
      "Fiat",
    ],
    Indian: ["Mahindra", "Tata"],
    Vietnamese: ["VinFast"],
  };

  const MOTORCYCLE_BRANDS_BY_REGION = {
    Japanese: ["Honda", "Yamaha", "Kawasaki", "Suzuki"],
    Chinese: ["CFMOTO", "QJ Motor", "Benelli", "Bristol", "Loncin", "Rusi", "Motorstar"],
    American: ["Harley-Davidson", "Indian Motorcycle"],
    European: ["Vespa", "KTM", "Ducati", "BMW Motorrad", "Husqvarna", "Triumph", "Aprilia", "Piaggio"],
    Taiwanese: ["Kymco", "SYM"],
    Indian: ["Bajaj", "TVS", "Royal Enfield"],
  };

  const entryDetailsModal = document.getElementById("entry-details-modal");
  const entryDetailsForm = document.getElementById("entry-details-form");
  const entryModalVehicleBadge = document.getElementById("entry-modal-vehicle-badge");
  const entryBrandInput = document.getElementById("entry-brand");
  const entrySelectedBrandSummary = document.getElementById("entry-selected-brand-summary");
  const entryBrandRegionsContainer = document.getElementById("entry-brand-regions");
  const entryBrandListContainer = document.getElementById("entry-brand-list");
  const entryColorInput = document.getElementById("entry-color");
  const entryYearInput = document.getElementById("entry-year");
  const entryPlateInput = document.getElementById("entry-plate");
  const entryMvFileInput = document.getElementById("entry-mv-file");
  const entryDetailsError = document.getElementById("entry-details-error");
  const btnEntryCancel = document.getElementById("btn-entry-cancel");
  const btnEntryConfirm = document.getElementById("btn-entry-confirm");

  let selectedBrandRegion = "Japanese";
  let selectedBrandName = "Toyota";

  function getActiveBrandMap() {
    return selectedVehicleType === "motorcycle"
      ? MOTORCYCLE_BRANDS_BY_REGION
      : CAR_BRANDS_BY_REGION;
  }

  function renderBrandSelector() {
    if (!entryBrandRegionsContainer || !entryBrandListContainer) return;

    const brandMap = getActiveBrandMap();
    const regions = Object.keys(brandMap);
    if (!regions.includes(selectedBrandRegion)) {
      selectedBrandRegion = regions[0] || "Japanese";
    }

    entryBrandRegionsContainer.innerHTML = "";

    regions.forEach((region) => {
      const isActive = region === selectedBrandRegion;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(isActive));
      btn.dataset.region = region;
      btn.className = isActive
        ? "px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#1d1d1f] text-white shadow-xs transition-colors cursor-pointer"
        : "px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white text-[#6e6e73] border border-[#e5e5ea] hover:text-[#1d1d1f] hover:border-[#d2d2d7] transition-colors cursor-pointer";
      btn.textContent = region;
      btn.addEventListener("click", () => {
        selectedBrandRegion = region;
        const regionBrands = brandMap[region] || [];
        if (!regionBrands.includes(selectedBrandName) && regionBrands.length > 0) {
          selectedBrandName = regionBrands[0];
        }
        renderBrandSelector();
        entryBrandListContainer.scrollTop = 0;
      });
      entryBrandRegionsContainer.appendChild(btn);
    });

    const brands = brandMap[selectedBrandRegion] || [];
    entryBrandListContainer.innerHTML = "";

    brands.forEach((brand) => {
      const isSelected = brand === selectedBrandName;
      const itemBtn = document.createElement("button");
      itemBtn.type = "button";
      itemBtn.setAttribute("role", "option");
      itemBtn.setAttribute("aria-selected", String(isSelected));
      itemBtn.dataset.brand = brand;
      itemBtn.style.height = "36px";
      itemBtn.style.minHeight = "36px";
      itemBtn.className = isSelected
        ? "w-full px-3 flex items-center justify-between text-left text-xs font-semibold bg-[#1d1d1f]/5 text-[#1d1d1f] transition-colors cursor-pointer"
        : "w-full px-3 flex items-center justify-between text-left text-xs font-medium text-[#3a3a3c] hover:bg-[#f5f5f7] transition-colors cursor-pointer";
      itemBtn.innerHTML = `
        <span class="truncate">${brand}</span>
        ${isSelected ? '<span class="text-[11px] font-bold text-[#1d1d1f]">Selected</span>' : ""}
      `;
      itemBtn.addEventListener("click", () => {
        selectedBrandName = brand;
        renderBrandSelector();
      });
      entryBrandListContainer.appendChild(itemBtn);
    });

    if (entryBrandInput) {
      entryBrandInput.value = selectedBrandName;
    }
    if (entrySelectedBrandSummary) {
      entrySelectedBrandSummary.textContent = `${selectedBrandName} (${selectedBrandRegion})`;
    }
  }

  function openEntryDetailsModal() {
    const schedule = getFeeSchedule(selectedVehicleType);
    if (entryModalVehicleBadge) {
      entryModalVehicleBadge.textContent = schedule.label;
    }
    selectedBrandRegion = "Japanese";
    selectedBrandName = schedule.type === "motorcycle" ? "Honda" : "Toyota";
    renderBrandSelector();
    if (entryBrandListContainer) {
      entryBrandListContainer.scrollTop = 0;
    }
    if (entryColorInput) entryColorInput.value = "White";
    if (entryYearInput) entryYearInput.value = "2024";
    if (entryPlateInput) entryPlateInput.value = "";
    if (entryMvFileInput) entryMvFileInput.value = "";
    if (entryDetailsError) {
      entryDetailsError.textContent = "";
      entryDetailsError.classList.add("hidden");
    }
    if (entryDetailsModal) {
      entryDetailsModal.classList.remove("hidden");
    }
  }

  function closeEntryDetailsModal() {
    if (entryDetailsModal) {
      entryDetailsModal.classList.add("hidden");
    }
  }

  if (btnEntryCancel) {
    btnEntryCancel.addEventListener("click", closeEntryDetailsModal);
  }
  if (entryDetailsModal) {
    entryDetailsModal.addEventListener("click", (e) => {
      if (e.target === entryDetailsModal) {
        closeEntryDetailsModal();
      }
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && entryDetailsModal && !entryDetailsModal.classList.contains("hidden")) {
      closeEntryDetailsModal();
    }
  });

  if (btnEntry) {
    btnEntry.addEventListener("click", (e) => {
      e.preventDefault();
      openEntryDetailsModal();
    });
  }

  if (entryDetailsForm) {
    entryDetailsForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const entryTime =
        simEntryTime && simEntryTime.value
          ? new Date(simEntryTime.value).toISOString()
          : new Date().toISOString();

      const brand = (entryBrandInput && entryBrandInput.value) || selectedBrandName || "Toyota";
      const color = (entryColorInput && entryColorInput.value) || "White";
      const yearVal = entryYearInput && entryYearInput.value ? parseInt(entryYearInput.value, 10) : 2024;
      const plateNumber = entryPlateInput && entryPlateInput.value.trim() ? entryPlateInput.value.trim().toUpperCase() : null;
      const mvFileNumber = entryMvFileInput && entryMvFileInput.value.trim() ? entryMvFileInput.value.trim().toUpperCase() : null;

      if (btnEntryConfirm) {
        btnEntryConfirm.disabled = true;
        btnEntryConfirm.textContent = "Confirming...";
      }

      try {
        const res = await fetch("/api/entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryTime,
            vehicleType: selectedVehicleType,
            brand,
            color,
            year: Number.isInteger(yearVal) ? yearVal : 2024,
            plateNumber,
            mvFileNumber,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          if (entryDetailsError) {
            entryDetailsError.textContent = data.error || "Unable to enter lot.";
            entryDetailsError.classList.remove("hidden");
          } else {
            showToast(`! ${data.error || "Unable to enter lot."}`, true);
          }
        } else {
          closeEntryDetailsModal();
          const schedule = getFeeSchedule(data.vehicleType || selectedVehicleType);
          const remainingNote = data.isReservedMotorcycleSlot
            ? `, ${data.slotRemaining} of ${data.slotCapacity} remaining in slot`
            : "";
          const idSummary = data.plateNumber
            ? ` [${data.plateNumber}]`
            : data.mvFileNumber
              ? ` [MV: ${data.mvFileNumber}]`
              : "";
          showToast(
            `✓ ${schedule.label}${idSummary} entered! Assigned Slot <strong>${data.slotId}</strong> (Floor ${data.floor}${remainingNote}) - Ticket #<strong>${data.ticketId}</strong>`,
          );

          searchedTicketId = null;
          if (searchInput) searchInput.value = "";
          if (btnClearSearch) btnClearSearch.classList.add("hidden");

          await fetchStatus();
        }
      } catch (err) {
        console.error("Entry error:", err);
        if (entryDetailsError) {
          entryDetailsError.textContent =
            "Could not connect to backend server. Make sure node server is running on port 3000.";
          entryDetailsError.classList.remove("hidden");
        }
      } finally {
        if (btnEntryConfirm) {
          btnEntryConfirm.disabled = false;
          btnEntryConfirm.textContent = "Confirm Entry";
        }
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
      entryToast.children[0].textContent = "!";
    } else {
      entryToast.className =
        "flex items-center gap-3 rounded-apple-xl px-5 py-3.5 shadow-sm text-sm sm:text-[15px] bg-emerald-50 text-emerald-900 border border-emerald-200 mb-6";
      entryToast.children[0].textContent = "i";
    }

    entryToast.classList.remove("hidden");
    toastTimeout = setTimeout(() => {
      entryToast.classList.add("hidden");
    }, 5000);
  }

  // ── Checkout modal ────────────────────────────────────────────────────────
  window.openCheckout = async function (
    ticketId,
    slotId,
    floor,
    entryTime,
    vehicleType,
  ) {
    currentTicketId = ticketId;
    const matchedTicket = allTickets.find((t) => t.id === ticketId);
    const initialSchedule = getFeeSchedule(
      vehicleType || (matchedTicket && matchedTicket.vehicle_type) || "car",
    );
    currentVehicleType = initialSchedule.type;

    if (coTicketId) coTicketId.textContent = "#" + ticketId;
    if (coVehicleType) coVehicleType.textContent = initialSchedule.label;
    if (coSlotId) coSlotId.textContent = slotId;
    if (coFloor) coFloor.textContent = floor;
    if (coEntryTime)
      coEntryTime.textContent = new Date(entryTime).toLocaleString();

    // Reset modal state
    setStatusPill("Pending");
    if (coFeeDisplay) coFeeDisplay.textContent = "₱-";
    if (coExitTime) coExitTime.textContent = "";
    if (coRateTier) {
      coRateTier.textContent = "-";
      coRateTier.className = "px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#e5e5ea] text-[#1d1d1f]";
    }
    if (coFeeNote) coFeeNote.textContent = "";
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
    const queryParts = [`vehicleType=${encodeURIComponent(currentVehicleType)}`];
    if (simExitTime && simExitTime.value) {
      queryParts.push(
        `exitTime=${encodeURIComponent(new Date(simExitTime.value).toISOString())}`,
      );
    }
    const queryString = `?${queryParts.join("&")}`;

    try {
      const res = await fetch(`/api/ticket/${ticketId}/fee${queryString}`);
      const data = await res.json();

      if (res.ok) {
        const activeSchedule = getFeeSchedule(
          data.vehicleType || currentVehicleType,
        );
        currentVehicleType = activeSchedule.type;
        if (coVehicleType) coVehicleType.textContent = activeSchedule.label;

        currentFee = Number(data.fee) || 0;
        if (coFeeDisplay) coFeeDisplay.textContent = `₱${currentFee}`;
        setStatusPill(data.status);

        if (coExitTime && data.exitTime) {
          coExitTime.textContent = new Date(data.exitTime).toLocaleString();
        }

        if (coRateTier) {
          if (data.status === "towed") {
            coRateTier.textContent = "Towed";
            coRateTier.className = "px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700";
          } else if (data.isPeak) {
            coRateTier.textContent = "Peak Demand (1.5x)";
            coRateTier.className = "px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800";
          } else {
            coRateTier.textContent = "Standard Rate";
            coRateTier.className = "px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700";
          }
        }

        if (coFeeNote) {
          const peakBase = Math.round(activeSchedule.baseRate * 1.5);
          const peakHourly = Math.round(activeSchedule.hourlyRate * 1.5);
          if (data.status === "towed") {
            coFeeNote.textContent = "Stay exceeded 24 hours. Vehicle impounded.";
          } else if (data.isOvernight) {
            coFeeNote.textContent = `Includes ₱${activeSchedule.overnightSurcharge} overnight surcharge (${data.rateType})`;
          } else if (data.isPeak) {
            coFeeNote.textContent = `Commute surge multiplier active (${activeSchedule.label}): ₱${peakBase} first ${activeSchedule.baseHours} hrs / ₱${peakHourly} per additional hr`;
          } else {
            coFeeNote.textContent = `Standard ${activeSchedule.label.toLowerCase()} rate: ₱${activeSchedule.baseRate} first ${activeSchedule.baseHours} hrs / ₱${activeSchedule.hourlyRate} per additional hr`;
          }
        }

        if (data.status === "towed") {
          if (paymentSection) paymentSection.classList.add("hidden");
          if (btnPay) btnPay.textContent = "Acknowledge TOWED";
        }
      } else {
        if (coFeeDisplay) coFeeDisplay.textContent = "Error";
        showPaymentError(data.error || "Unable to compute fee.");
      }
    } catch (err) {
      console.error(err);
      showPaymentError(
        "Failed to calculate fee. Please check server connection.",
      );
    }
  };

  // Re-calculate checkout fee in real-time when sim-exit-time changes
  if (simExitTime) {
    simExitTime.addEventListener("change", () => {
      if (currentTicketId && modal && !modal.classList.contains("hidden")) {
        const ticket = allTickets.find((t) => t.id === currentTicketId);
        if (ticket) {
          window.openCheckout(
            ticket.id,
            ticket.slot_id,
            ticket.floor,
            ticket.entry_time,
            ticket.vehicle_type,
          );
        }
      }
    });
  }

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

      const minAllowed = Math.min(50, currentFee > 0 ? currentFee : 50);
      if (isNaN(amountReceived) || amountReceived < minAllowed || amountReceived > 1000) {
        showPaymentError(`Please input any amount from ₱${minAllowed} to ₱1,000.`);
        return;
      }

      if (currentFee > 0 && amountReceived < currentFee) {
        showPaymentError(`Insufficient amount. Total fee is ₱${currentFee}.`);
        return;
      }

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

        // Payment Success: show receipt
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
              '<p class="text-[#8e8e93] text-xs">No fee collected: vehicle was marked as towed (>24h stay).</p>';
        } else {
          if (coChange) coChange.textContent = data.changeGiven;

          if (data.changeGiven === 0) {
            if (coBreakdown)
              coBreakdown.innerHTML =
                '<p class="text-[#6e6e73] text-xs mt-1">Exact payment received: no change needed.</p>';
          } else {
            const entries = Object.entries(data.changeBreakdown || {})
              .filter(([, count]) => count > 0)
              .sort(([a], [b]) => parseInt(b) - parseInt(a));

            const rows = entries
              .map(
                ([denom, count]) => {
                  const denomNum = parseInt(denom, 10);
                  const unitLabel = denomNum >= 20 ? 'bill' : 'coin';
                  return `
                    <div class="flex justify-between py-1 border-b border-dashed border-emerald-200/50 last:border-0">
                      <span class="font-semibold text-[#1d1d1f]">₱${denom} ${unitLabel}</span>
                      <span class="text-[#6e6e73] font-medium">× ${count}</span>
                    </div>`;
                }
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