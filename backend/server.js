const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));
app.use("/assets", express.static(path.join(__dirname, "../public/assets")));
app.use("/dashboard/assets", express.static(path.join(__dirname, "../public/assets")));

// ── Page routes (Clean friendly aliases) ───────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});
app.get("/frontpage", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});
app.get("/demo", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/demo.html"));
});
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/login.html"));
});
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/login.html"));
});
app.get(/^\/(dashboard|admin-dashboard)(\/.*)?$/, (req, res) => {
  res.sendFile(path.join(__dirname, "../public/dashboard.html"));
});
app.get("/reports", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/reports.html"));
});

// Fee schedule definitions by vehicle type
const FEE_SCHEDULES = {
  car: {
    type: "car",
    label: "Car",
    baseHours: 3,
    baseRate: 50,
    hourlyRate: 20,
    overnightSurcharge: 300,
    towedThresholdHours: 24,
  },
  motorcycle: {
    type: "motorcycle",
    label: "Motorcycle",
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

// Helper to validate payment amount: accepts any amount from minAllowed (50, or exact motorcycle fee) up to 1000
function isValidPaymentAmount(amount, fee = 50) {
  if (typeof amount !== "number" || isNaN(amount)) return false;
  const minAllowed = Math.min(50, fee > 0 ? fee : 50);
  return amount >= minAllowed && amount <= 1000;
}

// Helper to determine if a given date falls within peak demand hours
// Morning Peak: 7:00 AM - 10:00 AM (7, 8, 9)
// Evening Peak: 5:00 PM - 8:00 PM (17, 18, 19)
function isPeakHour(date) {
  const h = date.getHours();
  return (h >= 7 && h < 10) || (h >= 17 && h < 20);
}

// Checks if any portion of the stay occurred within peak demand hours
function checkIsPeakSession(entryDate, exitDate) {
  if (isPeakHour(entryDate) || isPeakHour(exitDate)) {
    return true;
  }
  let cur = new Date(entryDate.getTime() + 60 * 60 * 1000);
  while (cur < exitDate) {
    if (isPeakHour(cur)) return true;
    cur = new Date(cur.getTime() + 60 * 60 * 1000);
  }
  return false;
}

// Calculate fee based on entry, exit time, and vehicle type schedule
function calculateFeeAndStatus(entryTime, exitTime, vehicleType = "car") {
  const schedule = getFeeSchedule(vehicleType);
  const entryDate = new Date(entryTime);
  const exitDate = new Date(exitTime);

  const diffMs = exitDate - entryDate;
  if (isNaN(diffMs) || diffMs < 0) {
    return {
      fee: 0,
      status: "error",
      error: "Exit time cannot be earlier than entry time.",
      vehicleType: schedule.type,
      vehicleLabel: schedule.label,
      isPeak: false,
      isOvernight: false,
      rateType: "Invalid",
    };
  }

  const diffHours = diffMs / (1000 * 60 * 60);

  // 1. Towing policy (>= 24 hours stay)
  if (diffHours >= schedule.towedThresholdHours) {
    return {
      fee: 0,
      status: "towed",
      vehicleType: schedule.type,
      vehicleLabel: schedule.label,
      isPeak: false,
      isOvernight: false,
      rateType: "Towed",
      durationHours: Number(diffHours.toFixed(2)),
    };
  }

  // 2. Dynamic rate determination (Peak 1.5x multiplier applied to active vehicle schedule)
  const isPeak = checkIsPeakSession(entryDate, exitDate);
  const baseHours = schedule.baseHours;
  const baseRate = isPeak ? Math.round(schedule.baseRate * 1.5) : schedule.baseRate;
  const hourlyRate = isPeak ? Math.round(schedule.hourlyRate * 1.5) : schedule.hourlyRate;

  // 3. Overnight surcharge check (+₱300 after 10:00 PM)
  let crosses10PM = false;
  let tenPM = new Date(entryDate);
  tenPM.setHours(22, 0, 0, 0);

  if (entryDate >= tenPM) {
    tenPM.setDate(tenPM.getDate() + 1);
  }

  if (exitDate >= tenPM) {
    crosses10PM = true;
  }

  let fee = 0;
  if (crosses10PM) {
    const hoursBefore10PM = Math.max(0, Math.ceil((tenPM - entryDate) / (1000 * 60 * 60)));
    let pre10Fee = 0;
    if (hoursBefore10PM > 0) {
      pre10Fee = baseRate;
      if (hoursBefore10PM > baseHours) {
        pre10Fee += (hoursBefore10PM - baseHours) * hourlyRate;
      }
    }
    fee = schedule.overnightSurcharge + pre10Fee;
  } else {
    const fullHours = Math.max(1, Math.ceil(diffHours));
    if (fullHours <= baseHours) {
      fee = baseRate;
    } else {
      fee = baseRate + (fullHours - baseHours) * hourlyRate;
    }
  }

  return {
    fee,
    status: "completed",
    vehicleType: schedule.type,
    vehicleLabel: schedule.label,
    isPeak,
    isOvernight: crosses10PM,
    rateType: isPeak ? "Peak Surge (1.5x)" : "Standard Rate",
    baseHours,
    baseRate,
    hourlyRate,
    durationHours: Number(diffHours.toFixed(2)),
  };
}

function calculateChangeBreakdown(change) {
  const denominations = [1000, 500, 100, 50, 20, 10, 5, 1];
  let breakdown = {};
  let remaining = change;

  for (let denom of denominations) {
    if (remaining >= denom) {
      const count = Math.floor(remaining / denom);
      breakdown[denom] = count;
      remaining -= count * denom;
    }
  }
  return breakdown;
}

function logReport(type, message, options = {}) {
  const {
    severity = "info",
    floor = null,
    slotId = null,
    ticketId = null,
  } = options;

  db.run(
    `INSERT INTO reports (type, severity, message, floor, slot_id, ticket_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [type, severity, message, floor, slotId, ticketId],
    (err) => {
      if (err) console.error("Failed to log report:", err.message);
    },
  );
}

const MOTORCYCLE_RESERVED_FLOOR = 1;
const MOTORCYCLE_RESERVED_START = 100;
const MOTORCYCLE_RESERVED_END = 119;
const MOTORCYCLE_SLOT_CAPACITY = 6;
const STANDARD_SLOT_CAPACITY = 1;

function isMotorcycleReservedSlot(slotId, floor = 1) {
  const idNum = Number(slotId);
  const floorNum = Number(floor);
  return (
    floorNum === MOTORCYCLE_RESERVED_FLOOR &&
    idNum >= MOTORCYCLE_RESERVED_START &&
    idNum <= MOTORCYCLE_RESERVED_END
  );
}

function evaluateSlotState(row) {
  const id = Number(row.id);
  const floor = Number(row.floor);
  const carCount = Number(row.car_count || 0);
  const motorcycleCount = Number(row.mc_count || 0);
  const totalActive = Number(row.total_active || 0);
  const isReservedMotorcycle = isMotorcycleReservedSlot(id, floor);

  if (isReservedMotorcycle) {
    const capacity = MOTORCYCLE_SLOT_CAPACITY;
    const effectiveCapacity = MOTORCYCLE_SLOT_CAPACITY;
    const taken = Math.min(MOTORCYCLE_SLOT_CAPACITY, motorcycleCount);
    const remaining = Math.max(0, MOTORCYCLE_SLOT_CAPACITY - motorcycleCount);
    const canAcceptMotorcycle = motorcycleCount < MOTORCYCLE_SLOT_CAPACITY;
    const canAcceptCar = false;
    const status = remaining > 0 ? "available" : "occupied";

    return {
      id,
      floor,
      isReservedMotorcycle: true,
      reservedFor: "motorcycle",
      capacity,
      effectiveCapacity,
      carCount: 0,
      motorcycleCount,
      taken,
      remaining,
      conflictWithCar: false,
      canAcceptMotorcycle,
      canAcceptCar,
      status,
    };
  }

  const taken = totalActive > 0 ? 1 : 0;
  const remaining = totalActive === 0 ? 1 : 0;
  return {
    id,
    floor,
    isReservedMotorcycle: false,
    reservedFor: null,
    capacity: STANDARD_SLOT_CAPACITY,
    effectiveCapacity: STANDARD_SLOT_CAPACITY,
    carCount,
    motorcycleCount,
    taken,
    remaining,
    conflictWithCar: false,
    canAcceptMotorcycle: totalActive === 0,
    canAcceptCar: totalActive === 0,
    status: remaining > 0 ? "available" : "occupied",
  };
}

function syncSlotsTableStatus(callback) {
  db.serialize(() => {
    // Standard slots (not 100-119 on Floor 1): occupied when >= 1 active ticket
    db.run(
      `UPDATE slots
       SET status = CASE
         WHEN EXISTS (
           SELECT 1 FROM tickets t
           WHERE t.slot_id = slots.id AND t.status = 'active'
         ) THEN 'occupied'
         ELSE 'available'
       END
       WHERE NOT (floor = 1 AND id BETWEEN 100 AND 119)`
    );

    // Reserved motorcycle slots (100-119 on Floor 1): occupied when active motorcycle count >= 6
    db.run(
      `UPDATE slots
       SET status = CASE
         WHEN (
           SELECT COUNT(*) FROM tickets t
           WHERE t.slot_id = slots.id
             AND t.status = 'active'
             AND t.vehicle_type = 'motorcycle'
         ) >= 6 THEN 'occupied'
         ELSE 'available'
       END
       WHERE floor = 1 AND id BETWEEN 100 AND 119`,
      callback
    );
  });
}

function getEvaluatedSlots(callback) {
  syncSlotsTableStatus(() => {
    const query = `
      SELECT
        s.id,
        s.floor,
        COUNT(CASE WHEN t.status = 'active' AND COALESCE(t.vehicle_type, 'car') = 'car' THEN 1 END) AS car_count,
        COUNT(CASE WHEN t.status = 'active' AND t.vehicle_type = 'motorcycle' THEN 1 END) AS mc_count,
        COUNT(CASE WHEN t.status = 'active' THEN 1 END) AS total_active
      FROM slots s
      LEFT JOIN tickets t ON s.id = t.slot_id AND t.status = 'active'
      GROUP BY s.id, s.floor
      ORDER BY s.floor ASC, s.id ASC
    `;
    db.all(query, (err, rows) => {
      if (err) return callback(err);
      const evaluated = (rows || []).map(evaluateSlotState);
      callback(null, evaluated);
    });
  });
}

// GET /api/status - Get floor capacities, motorcycle reserved slot counters, and active tickets
app.get("/api/status", (req, res) => {
  getEvaluatedSlots((err, evaluatedSlots) => {
    if (err) return res.status(500).json({ error: err.message });

    const slotMap = new Map();
    evaluatedSlots.forEach((s) => slotMap.set(s.id, s));

    const floor1Slots = evaluatedSlots.filter((s) => s.floor === 1);
    const reservedMcSlots = floor1Slots.filter((s) => s.isReservedMotorcycle);
    const floor1StandardSlots = floor1Slots.filter((s) => !s.isReservedMotorcycle);

    const carSlotsTotal = floor1StandardSlots.length;
    const carSlotsTaken = floor1StandardSlots.reduce((acc, s) => acc + s.taken, 0);
    const carSlotsAvailable = floor1StandardSlots.reduce((acc, s) => acc + s.remaining, 0);

    const mcReservedSlotsCount = reservedMcSlots.length;
    const mcConflictSlotsCount = reservedMcSlots.filter((s) => s.conflictWithCar).length;
    const mcActiveSlotsCount = mcReservedSlotsCount - mcConflictSlotsCount;
    const mcTotalCapacity = mcReservedSlotsCount * MOTORCYCLE_SLOT_CAPACITY;
    const mcEffectiveCapacity = mcActiveSlotsCount * MOTORCYCLE_SLOT_CAPACITY;
    const mcTaken = reservedMcSlots.reduce((acc, s) => acc + s.motorcycleCount, 0);
    const mcRemaining = reservedMcSlots.reduce((acc, s) => acc + s.remaining, 0);

    const floor1Available = carSlotsAvailable + mcRemaining;
    const floor1Taken = carSlotsTaken + mcTaken + mcConflictSlotsCount;
    const floor1Total = floor1Available + floor1Taken;

    const floor2Slots = evaluatedSlots.filter((s) => s.floor === 2);
    const floor2Taken = floor2Slots.reduce((acc, s) => acc + s.taken, 0);
    const floor2Available = floor2Slots.reduce((acc, s) => acc + s.remaining, 0);

    const floor3Slots = evaluatedSlots.filter((s) => s.floor === 3);
    const floor3Taken = floor3Slots.reduce((acc, s) => acc + s.taken, 0);
    const floor3Available = floor3Slots.reduce((acc, s) => acc + s.remaining, 0);

    const capacity = {
      1: {
        total: floor1Total,
        taken: floor1Taken,
        available: floor1Available,
        carSlotsTotal,
        carSlotsTaken,
        carSlotsAvailable,
        mcSlotsRange: "100-119",
        mcSlotCapacity: MOTORCYCLE_SLOT_CAPACITY,
        mcReservedSlotsCount,
        mcConflictSlotsCount,
        mcActiveSlotsCount,
        mcTotalCapacity,
        mcEffectiveCapacity,
        mcTaken,
        mcRemaining,
      },
      2: {
        total: floor2Slots.length || 100,
        taken: floor2Taken,
        available: floor2Available,
      },
      3: {
        total: floor3Slots.length || 100,
        taken: floor3Taken,
        available: floor3Available,
      },
    };

    db.all(
      "SELECT t.id, t.slot_id, t.entry_time, COALESCE(t.vehicle_type, 'car') AS vehicle_type, t.brand, t.color, t.year, t.plate_number, t.mv_file_number, s.floor, t.map_latitude, t.map_longitude FROM tickets t JOIN slots s ON t.slot_id = s.id WHERE t.status = 'active' ORDER BY t.entry_time DESC",
      (ticketErr, tickets) => {
        if (ticketErr) return res.status(500).json({ error: ticketErr.message });

        const enrichedTickets = (tickets || []).map((t) => {
          const s = slotMap.get(Number(t.slot_id));
          return {
            ...t,
            is_reserved_motorcycle_slot: s ? s.isReservedMotorcycle : isMotorcycleReservedSlot(t.slot_id, t.floor),
            slot_capacity: s ? s.capacity : 1,
            slot_remaining: s ? s.remaining : 0,
            slot_motorcycle_count: s ? s.motorcycleCount : 0,
            slot_car_count: s ? s.carCount : 0,
            slot_conflict_with_car: s ? s.conflictWithCar : false,
          };
        });

        res.json({
          capacity,
          reservedMotorcycleSlots: reservedMcSlots,
          tickets: enrichedTickets,
        });
      }
    );
  });
});

// POST /api/entry - Assign slot and create ticket with vehicleType and motorcycle slot reservation (100-120, capacity 6)
app.post("/api/entry", (req, res) => {
  const schedule = getFeeSchedule(req.body.vehicleType);
  const vehicleType = schedule.type;

  getEvaluatedSlots((err, evaluatedSlots) => {
    if (err) return res.status(500).json({ error: err.message });

    let chosenSlot = null;

    if (vehicleType === "motorcycle") {
      // 1. Fill Floor 1 motorcycle-reserved slots (100-120) first (up to 6 motorcycles per slot, skipping legacy car conflicts)
      const reservedCandidates = evaluatedSlots
        .filter((s) => s.isReservedMotorcycle && s.canAcceptMotorcycle)
        .sort((a, b) => a.id - b.id);

      if (reservedCandidates.length > 0) {
        chosenSlot = reservedCandidates[0];
      } else {
        // 2. Fallback to standard non-reserved slots if all reserved slots 100-120 are full or blocked
        const fallbackCandidates = evaluatedSlots
          .filter((s) => !s.isReservedMotorcycle && s.canAcceptMotorcycle)
          .sort((a, b) => a.floor - b.floor || a.id - b.id);
        if (fallbackCandidates.length > 0) {
          chosenSlot = fallbackCandidates[0];
        }
      }
    } else {
      // Cars must NEVER be parked in motorcycle-reserved slots (100-120 on Floor 1)
      const carCandidates = evaluatedSlots
        .filter((s) => !s.isReservedMotorcycle && s.canAcceptCar)
        .sort((a, b) => a.floor - b.floor || a.id - b.id);
      if (carCandidates.length > 0) {
        chosenSlot = carCandidates[0];
      }
    }

    if (!chosenSlot) {
      logReport("capacity_issue", `Parking lot reached full capacity for ${schedule.label}`, {
        severity: "warning",
      });

      return res.status(400).json({
        error:
          vehicleType === "car"
            ? "No car parking slots available (slots 100-120 on Floor 1 are reserved for motorcycles)."
            : "Parking is full",
      });
    }

    const entryTime = req.body.entryTime || new Date().toISOString();
    const mapLatitude = req.body.mapLatitude ?? null;
    const mapLongitude = req.body.mapLongitude ?? null;

    if (
      (mapLatitude !== null &&
        (!Number.isFinite(Number(mapLatitude)) ||
          Number(mapLatitude) < 14.3 ||
          Number(mapLatitude) > 14.9)) ||
      (mapLongitude !== null &&
        (!Number.isFinite(Number(mapLongitude)) ||
          Number(mapLongitude) < 120.8 ||
          Number(mapLongitude) > 121.3))
    ) {
      return res
        .status(400)
        .json({ error: "Ticket map pin must be within Metro Manila." });
    }

    const newOccupied = chosenSlot.isReservedMotorcycle
      ? chosenSlot.motorcycleCount + 1
      : 1;
    const newRemaining = chosenSlot.isReservedMotorcycle
      ? Math.max(0, MOTORCYCLE_SLOT_CAPACITY - newOccupied)
      : 0;
    const newSlotStatus = newRemaining === 0 ? "occupied" : "available";

    const brand = req.body.brand ? String(req.body.brand).trim() : null;
    const color = req.body.color ? String(req.body.color).trim() : null;
    const yearVal = req.body.year ? parseInt(req.body.year, 10) : null;
    const year = Number.isInteger(yearVal) ? yearVal : null;
    const plateNumber = req.body.plateNumber
      ? String(req.body.plateNumber).trim().toUpperCase()
      : req.body.plate_number
        ? String(req.body.plate_number).trim().toUpperCase()
        : null;
    const mvFileNumber = req.body.mvFileNumber
      ? String(req.body.mvFileNumber).trim().toUpperCase()
      : req.body.mv_file_number
        ? String(req.body.mv_file_number).trim().toUpperCase()
        : null;

    db.serialize(() => {
      db.run("UPDATE slots SET status = ? WHERE id = ?", [
        newSlotStatus,
        chosenSlot.id,
      ]);
      db.run(
        "INSERT INTO tickets (slot_id, entry_time, vehicle_type, map_latitude, map_longitude, brand, color, year, plate_number, mv_file_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [chosenSlot.id, entryTime, vehicleType, mapLatitude, mapLongitude, brand, color, year, plateNumber, mvFileNumber],
        function (insertErr) {
          if (insertErr) return res.status(500).json({ error: insertErr.message });

          logReport("vehicle_entered", `${schedule.label} entered lot`, {
            severity: "info",
            floor: chosenSlot.floor,
            slotId: chosenSlot.id,
            ticketId: this.lastID,
          });

          res.json({
            ticketId: this.lastID,
            slotId: chosenSlot.id,
            floor: chosenSlot.floor,
            entryTime,
            vehicleType,
            brand,
            color,
            year,
            plateNumber,
            mvFileNumber,
            isReservedMotorcycleSlot: chosenSlot.isReservedMotorcycle,
            slotCapacity: chosenSlot.capacity,
            slotOccupied: newOccupied,
            slotRemaining: newRemaining,
          });
        },
      );
    });
  });
});

// GET /api/ticket/:id/fee - Calculate fee for display using ticket's vehicle_type
app.get("/api/ticket/:id/fee", (req, res) => {
  const exitTime = req.query.exitTime || new Date().toISOString();

  db.get(
    "SELECT * FROM tickets WHERE id = ? AND status = 'active'",
    [req.params.id],
    (err, ticket) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!ticket)
        return res.status(404).json({ error: "Active ticket not found" });

      const vehicleType = ticket.vehicle_type || req.query.vehicleType || "car";
      const feeResult = calculateFeeAndStatus(
        ticket.entry_time,
        exitTime,
        vehicleType,
      );
      if (feeResult.status === "error") {
        return res.status(400).json({ error: feeResult.error });
      }

      res.json({
        ...feeResult,
        entryTime: ticket.entry_time,
        exitTime,
      });
    },
  );
});

// POST /api/exit - Process exit and payment
app.post("/api/exit", (req, res) => {
  const { ticketId, amountReceived, exitTime: providedExitTime } = req.body;
  const exitTime = providedExitTime || new Date().toISOString();

  db.get(
    "SELECT * FROM tickets WHERE id = ? AND status = 'active'",
    [ticketId],
    (err, ticket) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!ticket)
        return res.status(404).json({ error: "Active ticket not found" });

      const vehicleType = ticket.vehicle_type || req.body.vehicleType || "car";
      const feeResult = calculateFeeAndStatus(
        ticket.entry_time,
        exitTime,
        vehicleType,
      );
      if (feeResult.status === "error") {
        return res.status(400).json({ error: feeResult.error });
      }

      const { fee, status } = feeResult;

      if (status === "towed") {
        db.serialize(() => {
          db.run(
            "UPDATE tickets SET exit_time = ?, status = 'towed', fee = 0 WHERE id = ?",
            [exitTime, ticketId],
            (updateErr) => {
              if (updateErr) return res.status(500).json({ error: updateErr.message });
              syncSlotsTableStatus(() => {
                logReport(
                  "vehicle_towed",
                  "Vehicle marked as towed after 24+ hour stay",
                  {
                    severity: "critical",
                    slotId: ticket.slot_id,
                    ticketId: ticketId,
                  },
                );
                res.json({
                  success: true,
                  status: "towed",
                  message: "Vehicle was towed. No fee collected.",
                });
              });
            },
          );
        });
        return;
      }

      if (!isValidPaymentAmount(amountReceived, fee)) {
        logReport("payment_issue", `Invalid cash amount rejected: ₱${amountReceived}`, {
          severity: "warning",
          slotId: ticket.slot_id,
          ticketId: ticketId,
        });

        return res.status(400).json({
          error:
            "Invalid cash amount. Please input an amount from ₱50 to ₱1,000.",
        });
      }

      if (amountReceived < fee) {
        return res
          .status(400)
          .json({ error: `Insufficient amount. Fee is ₱${fee}` });
      }

      const changeGiven = amountReceived - fee;
      const changeBreakdown = calculateChangeBreakdown(changeGiven);

      db.serialize(() => {
        db.run(
          "UPDATE tickets SET exit_time = ?, status = 'completed', fee = ?, amount_received = ?, change_given = ?, change_breakdown = ? WHERE id = ?",
          [
            exitTime,
            fee,
            amountReceived,
            changeGiven,
            JSON.stringify(changeBreakdown),
            ticketId,
          ],
          (updateErr) => {
            if (updateErr) return res.status(500).json({ error: updateErr.message });
            syncSlotsTableStatus(() => {
              logReport("payment_completed", "Payment completed successfully", {
                severity: "info",
                slotId: ticket.slot_id,
                ticketId: ticketId,
              });
              res.json({
                success: true,
                fee,
                changeGiven,
                changeBreakdown,
                status: "completed",
              });
            });
          },
        );
      });
    },
  );
});

// GET /api/kpis
// Dashboard KPI data
app.get("/api/kpis", (req, res) => {
  const reqDate = req.query.date;

  const totalSpacesQuery = `
    SELECT COUNT(*) AS total_spaces
    FROM slots
  `;

  const activeSpacesQuery = `
    SELECT COUNT(*) AS active_spaces
    FROM tickets
    WHERE status = 'active'
  `;

  const activeAlertsQuery = `
    SELECT COUNT(*) AS active_alerts
    FROM reports
    WHERE severity != 'info'
  `;

  const totalRevenueQuery = `
    SELECT COALESCE(SUM(fee), 0) AS total_revenue
    FROM tickets
    WHERE status = 'completed'
  `;

  const completedSessionsQuery = `
    SELECT COUNT(*) AS completed_sessions
    FROM tickets
    WHERE status = 'completed'
  `;

  db.get(totalSpacesQuery, (err, spacesRow) => {
    if (err) return res.status(500).json({ error: err.message });
    const totalSpaces = Number(spacesRow?.total_spaces || 0);

    db.get(activeSpacesQuery, (err, activeRow) => {
      if (err) return res.status(500).json({ error: err.message });
      const activeSpaces = Number(activeRow?.active_spaces || 0);

      db.get(activeAlertsQuery, (err, alertsRow) => {
        if (err) return res.status(500).json({ error: err.message });
        const activeAlerts = Number(alertsRow?.active_alerts || 0);

        db.get(totalRevenueQuery, (err, revenueRow) => {
          if (err) return res.status(500).json({ error: err.message });
          const totalRevenue = Number(revenueRow?.total_revenue || 0);

          db.get(completedSessionsQuery, (err, turnoverRow) => {
            if (err) return res.status(500).json({ error: err.message });
            const completedSessions = Number(turnoverRow?.completed_sessions || 0);

            // Determine target today & yesterday dates
            const dateQuery = reqDate
              ? `SELECT date(?) AS today, date(?, '-1 day') AS yesterday`
              : `SELECT date('now', 'localtime') AS today, date('now', '-1 day', 'localtime') AS yesterday`;
            const dateParams = reqDate ? [reqDate, reqDate] : [];

            db.get(dateQuery, dateParams, (err, dateRow) => {
              if (err) return res.status(500).json({ error: err.message });
              const todayStr = dateRow.today;
              let yesterdayStr = dateRow.yesterday;

              // Check if yesterday has tickets; if not, fallback to the latest date before today
              const fallbackQuery = `
                SELECT MAX(DATE(COALESCE(exit_time, entry_time))) AS prev_date
                FROM tickets
                WHERE DATE(COALESCE(exit_time, entry_time)) < ?
              `;

              db.get(
                "SELECT COUNT(*) AS c FROM tickets WHERE (DATE(exit_time) = ? OR (exit_time IS NULL AND DATE(entry_time) = ?))",
                [yesterdayStr, yesterdayStr],
                (err, yCountRow) => {
                  if (err) return res.status(500).json({ error: err.message });

                  const proceedWithYesterday = (effectiveYesterday) => {
                    // Aggregate scoped to date range:
                    // (DATE(exit_time) = ? OR (exit_time IS NULL AND DATE(entry_time) = ?))
                    const dailyAggregateQuery = `
                      SELECT
                        COALESCE(SUM(CASE WHEN status = 'completed' THEN fee ELSE 0 END), 0) AS revenue,
                        COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_sessions,
                        COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_sessions,
                        COUNT(*) AS total_sessions
                      FROM tickets
                      WHERE (DATE(exit_time) = ? OR (exit_time IS NULL AND DATE(entry_time) = ?))
                    `;

                    db.get(dailyAggregateQuery, [todayStr, todayStr], (err, todayStats) => {
                      if (err) return res.status(500).json({ error: err.message });

                      db.get(dailyAggregateQuery, [effectiveYesterday, effectiveYesterday], (err, yestStats) => {
                        if (err) return res.status(500).json({ error: err.message });

                        const todayRev = Number(todayStats?.revenue || 0);
                        const todayCompleted = Number(todayStats?.completed_sessions || 0);

                        const yestRev = Number(yestStats?.revenue || 0);
                        const yestCompleted = Number(yestStats?.completed_sessions || 0);

                        // Revenue per available space for today:
                        const revenuePerAvailableSpace =
                          totalSpaces > 0 ? todayRev / totalSpaces : 0;
                        const yestRevenuePerSpace =
                          totalSpaces > 0 ? yestRev / totalSpaces : 0;

                        // Revenue delta vs yesterday
                        let revenuePerAvailableSpaceDelta = "+0.0%";
                        let revenueDeltaPositive = true;
                        if (yestRevenuePerSpace > 0) {
                          const pct = ((revenuePerAvailableSpace - yestRevenuePerSpace) / yestRevenuePerSpace) * 100;
                          revenuePerAvailableSpaceDelta = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
                          revenueDeltaPositive = pct >= 0;
                        } else if (revenuePerAvailableSpace > 0) {
                          revenuePerAvailableSpaceDelta = "+100.0%";
                          revenueDeltaPositive = true;
                        }

                        // Current Occupancy: active / total * 100, rounded
                        const currentOccupancy =
                          totalSpaces > 0 ? Math.round((activeSpaces / totalSpaces) * 100) : 0;

                        // Yesterday occupancy:
                        // Estimate yesterday's occupancy from concurrent/sessions
                        const yestSessions = Number(yestStats?.total_sessions || 0);
                        const yestEstOccupancy = totalSpaces > 0 ? Math.round((yestSessions * 0.75 / totalSpaces) * 100) : 0;
                        const occDeltaVal = currentOccupancy - yestEstOccupancy;
                        const occupancyDelta = `${occDeltaVal >= 0 ? "+" : ""}${occDeltaVal.toFixed(1)}%`;

                        // Turnover Rate: completed / totalSpaces
                        const turnoverRate =
                          totalSpaces > 0 ? todayCompleted / totalSpaces : 0;
                        const yestTurnoverRate =
                          totalSpaces > 0 ? yestCompleted / totalSpaces : 0;
                        const toDiff = turnoverRate - yestTurnoverRate;
                        const turnoverRateDelta = `${toDiff >= 0 ? "+" : ""}${toDiff.toFixed(2)}x`;
                        const turnoverDeltaPositive = toDiff >= 0;

                        res.json({
                          // Existing backwards-compatible fields
                          totalSpaces,
                          totalRevenue,
                          completedSessions,
                          revenuePerAvailableSpace: Number(revenuePerAvailableSpace.toFixed(2)),
                          turnoverRate: Number(turnoverRate.toFixed(2)),

                          // Extended fields
                          activeSpaces,
                          currentOccupancy,
                          activeAlerts,

                          todayRevenue: Number(todayRev.toFixed(2)),
                          todayCompletedSessions: todayCompleted,
                          yesterdayDate: effectiveYesterday,
                          todayDate: todayStr,

                          revenuePerAvailableSpaceDelta,
                          revenueDeltaPositive,
                          occupancyDelta,
                          turnoverRateDelta,
                          turnoverDeltaPositive,
                        });
                      });
                    });
                  };

                  if (yCountRow && yCountRow.c > 0) {
                    proceedWithYesterday(yesterdayStr);
                  } else {
                    db.get(fallbackQuery, [todayStr], (err, prevRow) => {
                      if (!err && prevRow && prevRow.prev_date) {
                        proceedWithYesterday(prevRow.prev_date);
                      } else {
                        proceedWithYesterday(yesterdayStr);
                      }
                    });
                  }
                }
              );
            });
          });
        });
      });
    });
  });
});
// GET /api/analytics/turnover and /api/revenue-per-space
// Detailed turnover and revenue information
app.get(["/api/analytics/turnover", "/api/revenue-per-space"], (req, res) => {
  const date = req.query.date;

  let dateFilter = "";
  let params = [];

  if (date) {
    dateFilter = `
      AND DATE(t.exit_time) = ?
    `;
    params.push(date);
  }

  const query = `
    SELECT
      t.id AS ticket_id,
      t.slot_id,
      t.entry_time,
      t.exit_time,
      t.fee
    FROM tickets t
    WHERE t.status = 'completed'
      AND t.exit_time IS NOT NULL
      ${dateFilter}
    ORDER BY t.slot_id ASC, t.entry_time ASC
  `;

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({
        error: err.message
      });
    }

    const vehicles = rows.map((row) => {
      const entry = new Date(row.entry_time);
      const exit = new Date(row.exit_time);

      const durationMs = exit - entry;

      const durationMinutes = Math.max(
        0,
        Math.round(durationMs / 60000)
      );

      const durationHours = durationMinutes / 60;

      let turnoverLevel;

      if (durationHours <= 2) {
        turnoverLevel = "HIGH";
      } else if (durationHours <= 4) {
        turnoverLevel = "MEDIUM";
      } else {
        turnoverLevel = "LOW";
      }

      return {
        ticketId: row.ticket_id,
        slotId: row.slot_id,
        entryTime: row.entry_time,
        exitTime: row.exit_time,
        fee: Number(row.fee || 0),
        durationMinutes,
        durationHours: Number(durationHours.toFixed(2)),
        turnoverLevel
      };
    });

    const totalSpacesQuery = `
      SELECT COUNT(*) AS total_spaces
      FROM slots
    `;

    db.get(totalSpacesQuery, (spaceErr, spaceRow) => {
      if (spaceErr) {
        return res.status(500).json({
          error: spaceErr.message
        });
      }

      const totalSpaces = Number(
        spaceRow.total_spaces || 0
      );

      const totalRevenue = vehicles.reduce(
        (sum, vehicle) => sum + vehicle.fee,
        0
      );

      const totalVehicles = vehicles.length;

      const revenuePerAvailableSpace =
        totalSpaces > 0
          ? totalRevenue / totalSpaces
          : 0;

      const turnoverRate =
        totalSpaces > 0
          ? totalVehicles / totalSpaces
          : 0;

      // Group vehicles by parking space
      const spaceMap = {};

      vehicles.forEach((vehicle) => {
        if (!spaceMap[vehicle.slotId]) {
          spaceMap[vehicle.slotId] = {
            slotId: vehicle.slotId,
            vehicleCount: 0,
            totalRevenue: 0,
            totalDurationMinutes: 0
          };
        }

        spaceMap[vehicle.slotId].vehicleCount += 1;

        spaceMap[vehicle.slotId].totalRevenue +=
          vehicle.fee;

        spaceMap[vehicle.slotId].totalDurationMinutes +=
          vehicle.durationMinutes;
      });

      const spaces = Object.values(spaceMap).map((space) => {
        const averageDurationMinutes =
          space.vehicleCount > 0
            ? space.totalDurationMinutes /
              space.vehicleCount
            : 0;

        const averageDurationHours =
          averageDurationMinutes / 60;

        let turnoverLevel;

        if (averageDurationHours <= 2) {
          turnoverLevel = "HIGH";
        } else if (averageDurationHours <= 4) {
          turnoverLevel = "MEDIUM";
        } else {
          turnoverLevel = "LOW";
        }

        return {
          slotId: space.slotId,

          vehicleCount: space.vehicleCount,

          totalRevenue: Number(
            space.totalRevenue.toFixed(2)
          ),

          averageDurationMinutes: Math.round(
            averageDurationMinutes
          ),

          averageDurationHours: Number(
            averageDurationHours.toFixed(2)
          ),

          turnoverLevel
        };
      });

      const summary = { HIGH: 0, MEDIUM: 0, LOW: 0 };
      spaces.forEach((sp) => {
        if (summary[sp.turnoverLevel] !== undefined) {
          summary[sp.turnoverLevel]++;
        }
      });

      res.json({
        totalSpaces,
        totalVehicles,
        totalRevenue: Number(
          totalRevenue.toFixed(2)
        ),
        revenuePerAvailableSpace: Number(
          revenuePerAvailableSpace.toFixed(2)
        ),
        turnoverRate: Number(
          turnoverRate.toFixed(2)
        ),
        summary,
        spaces,
        vehicles
      });
    });
  });
});

// GET /api/analytics/peak-hours
app.get("/api/analytics/peak-hours", (req, res) => {
  const query = `
    SELECT strftime('%H', entry_time) AS hour, COUNT(*) AS entries
    FROM tickets
    WHERE entry_time IS NOT NULL
    GROUP BY hour
    ORDER BY hour ASC
  `;

  db.all(query, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const map = {};
    (rows || []).forEach((r) => {
      if (r.hour !== null) {
        map[r.hour] = Number(r.entries || 0);
      }
    });

    const result = [];
    for (let i = 0; i < 24; i++) {
      const h = String(i).padStart(2, "0");
      result.push({
        hour: h,
        entries: map[h] || 0,
      });
    }

    res.json(result);
  });
});

// GET /api/analytics/hourly-occupancy
app.get("/api/analytics/hourly-occupancy", (req, res) => {
  const query = `
    SELECT entry_time, exit_time
    FROM tickets
    WHERE entry_time IS NOT NULL
  `;

  db.all(query, (err, tickets) => {
    if (err) return res.status(500).json({ error: err.message });

    const daySet = new Set();
    (tickets || []).forEach((t) => {
      if (t.entry_time) {
        daySet.add(t.entry_time.slice(0, 10));
      }
    });

    const days = Array.from(daySet).sort();
    const dayCount = days.length || 1;

    const parsedTickets = (tickets || []).map((t) => ({
      entry: new Date(t.entry_time).getTime(),
      exit: t.exit_time ? new Date(t.exit_time).getTime() : Infinity,
    }));

    const result = [];
    for (let h = 0; h < 24; h++) {
      const hourStr = String(h).padStart(2, "0");
      let totalParkedAcrossDays = 0;

      for (const d of days) {
        const hourTs = new Date(`${d}T${hourStr}:00:00`).getTime();
        let parkedCount = 0;
        for (const t of parsedTickets) {
          if (t.entry <= hourTs && t.exit > hourTs) {
            parkedCount++;
          }
        }
        totalParkedAcrossDays += parkedCount;
      }

      const avgOccupancy = Math.round(totalParkedAcrossDays / dayCount);
      result.push({
        hour: hourStr,
        avgOccupancy,
      });
    }

    res.json(result);
  });
});

// GET /api/analytics/revenue-trend
app.get("/api/analytics/revenue-trend", (req, res) => {
  const query = `
    SELECT date(exit_time) AS date, SUM(fee) AS revenue
    FROM tickets
    WHERE status = 'completed' AND exit_time IS NOT NULL
    GROUP BY date(exit_time)
    ORDER BY date ASC
  `;

  db.all(query, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const result = (rows || []).map((r) => ({
      date: r.date,
      revenue: Number(r.revenue || 0),
    }));
    res.json(result);
  });
});

// GET /api/recent-events - Real-time activity feed
app.get("/api/recent-events", (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
  const query = `
    SELECT r.id, r.type, r.severity, r.message, r.floor, r.slot_id, r.ticket_id, r.source, r.created_at,
           t.vehicle_type, t.brand, t.color, t.year, t.plate_number, t.mv_file_number,
           CASE WHEN r.type = 'payment_completed' THEN t.fee ELSE NULL END AS fee,
           t.status AS ticket_status
    FROM reports r
    LEFT JOIN tickets t ON r.ticket_id = t.id
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ?
  `;
  db.all(query, [limit], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get("/api/reports", (req, res) => {
  db.all(
    `SELECT * FROM reports
     ORDER BY created_at DESC
     LIMIT 50`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    },
  );
});

// DELETE /api/reports/:id - Remove a report ticket
app.delete("/api/reports/:id", (req, res) => {
  const reportId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(reportId) || reportId <= 0) {
    return res.status(400).json({ error: "A valid report id is required." });
  }

  db.run("DELETE FROM reports WHERE id = ?", [reportId], function (err) {
    if (err) {
      console.error("Failed to delete report:", err.message);
      return res.status(500).json({ error: "Failed to delete report." });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Report not found." });
    }

    res.json({ success: true, deletedId: reportId });
  });
});

// POST /api/reports - Create a manual admin parking lot report
app.post("/api/reports", (req, res) => {
  const { type, severity = "info", message, floor = null } = req.body;

  // Validate report type
  const allowedTypes = [
    "Maintenance",
    "Equipment Issue",
    "Safety",
    "Parking Issue",
    "Customer Concern",
    "Capacity",
    "Payment",
    "Security",
    "Other",
  ];

  if (!type || !allowedTypes.includes(type)) {
    return res.status(400).json({
      error: "Please select a valid report type.",
    });
  }

  // Validate severity
  const allowedSeverities = ["info", "warning", "critical"];

  if (!allowedSeverities.includes(severity)) {
    return res.status(400).json({
      error: "Invalid severity. Use info, warning, or critical.",
    });
  }

  // Validate message
  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({
      error: "Report message is required.",
    });
  }

  if (message.trim().length > 1000) {
    return res.status(400).json({
      error: "Report message must be 1000 characters or fewer.",
    });
  }

  // Validate floor
  let normalizedFloor = null;

  if (floor !== null && floor !== "" && floor !== undefined) {
    normalizedFloor = Number(floor);

    if (![1, 2, 3].includes(normalizedFloor)) {
      return res.status(400).json({
        error: "Floor must be 1, 2, or 3.",
      });
    }
  }

  const cleanMessage = message.trim();

  db.run(
    `INSERT INTO reports
      (type, severity, message, floor, source)
     VALUES (?, ?, ?, ?, 'admin')`,
    [type, severity, cleanMessage, normalizedFloor],
    function (err) {
      if (err) {
        console.error("Failed to create report:", err.message);

        return res.status(500).json({
          error: "Failed to create parking lot report.",
        });
      }

      db.get(
        "SELECT * FROM reports WHERE id = ?",
        [this.lastID],
        (selectErr, report) => {
          if (selectErr) {
            return res.status(500).json({
              error: "Report was created but could not be retrieved.",
            });
          }

          res.status(201).json({
            success: true,
            report,
          });
        },
      );
    },
  );
});

// GET /api/demand-forecasts - List saved demand forecast events
app.get(["/api/demand-forecasts", "/api/forecasts"], (req, res) => {
  db.all(
    `SELECT * FROM demand_forecasts
     ORDER BY event_date ASC, event_time ASC
     LIMIT 100`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    },
  );
});

// DELETE /api/demand-forecasts/:id - Remove a saved forecast event
app.delete(["/api/demand-forecasts/:id", "/api/forecasts/:id"], (req, res) => {
  const forecastId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(forecastId) || forecastId <= 0) {
    return res.status(400).json({ error: "A valid forecast id is required." });
  }

  db.run(
    "DELETE FROM demand_forecasts WHERE id = ?",
    [forecastId],
    function (err) {
      if (err)
        return res
          .status(500)
          .json({ error: "Failed to delete forecast event." });
      if (this.changes === 0)
        return res.status(404).json({ error: "Forecast event not found." });
      res.json({ success: true, deletedId: forecastId });
    },
  );
});

// POST /api/demand-forecasts - Save an event for demand forecasting
app.post(["/api/demand-forecasts", "/api/forecasts"], (req, res) => {
  const { nature, date, time, category, location, latitude, longitude } =
    req.body;
  const allowedCategories = ["Concert", "Sports", "Holiday", "Market", "Other"];

  if (!nature || typeof nature !== "string" || !nature.trim()) {
    return res.status(400).json({ error: "Event nature is required." });
  }
  if (nature.trim().length > 200) {
    return res
      .status(400)
      .json({ error: "Event nature must be 200 characters or fewer." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    return res.status(400).json({ error: "A valid event date is required." });
  }
  if (!/^\d{2}:\d{2}$/.test(time || "")) {
    return res.status(400).json({ error: "A valid event time is required." });
  }
  if (!allowedCategories.includes(category)) {
    return res
      .status(400)
      .json({ error: "Please select a valid event category." });
  }

  const normalizedLatitude =
    latitude === undefined || latitude === "" ? null : Number(latitude);
  const normalizedLongitude =
    longitude === undefined || longitude === "" ? null : Number(longitude);
  if (
    (normalizedLatitude !== null &&
      (!Number.isFinite(normalizedLatitude) ||
        normalizedLatitude < 14.3 ||
        normalizedLatitude > 14.9)) ||
    (normalizedLongitude !== null &&
      (!Number.isFinite(normalizedLongitude) ||
        normalizedLongitude < 120.8 ||
        normalizedLongitude > 121.3))
  ) {
    return res
      .status(400)
      .json({ error: "Map pin must be within Metro Manila." });
  }
  if (
    location !== undefined &&
    location !== null &&
    String(location).trim().length > 120
  ) {
    return res
      .status(400)
      .json({ error: "Location must be 120 characters or fewer." });
  }

  db.run(
    `INSERT INTO demand_forecasts
      (nature, event_date, event_time, category, location, latitude, longitude)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      nature.trim(),
      date,
      time,
      category,
      location ? String(location).trim() : null,
      normalizedLatitude,
      normalizedLongitude,
    ],
    function (err) {
      if (err)
        return res
          .status(500)
          .json({ error: "Failed to save forecast event." });

      db.get(
        "SELECT * FROM demand_forecasts WHERE id = ?",
        [this.lastID],
        (selectErr, event) => {
          if (selectErr)
            return res.status(500).json({ error: selectErr.message });
          res.status(201).json({ success: true, event });
        },
      );
    },
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
