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

// Helper to validate payment amount: accepts any amount from 50 to 1000
function isValidPaymentAmount(amount) {
  if (typeof amount !== "number" || isNaN(amount)) return false;
  return amount >= 50 && amount <= 1000;
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

// Calculate fee based on entry and exit time with dynamic pricing
function calculateFeeAndStatus(entryTime, exitTime) {
  const entryDate = new Date(entryTime);
  const exitDate = new Date(exitTime);

  const diffMs = exitDate - entryDate;
  if (isNaN(diffMs) || diffMs < 0) {
    return {
      fee: 0,
      status: "error",
      error: "Exit time cannot be earlier than entry time.",
      isPeak: false,
      isOvernight: false,
      rateType: "Invalid"
    };
  }

  const diffHours = diffMs / (1000 * 60 * 60);

  // 1. Towing policy (>= 24 hours stay)
  if (diffHours >= 24) {
    return {
      fee: 0,
      status: "towed",
      isPeak: false,
      isOvernight: false,
      rateType: "Towed",
      durationHours: Number(diffHours.toFixed(2))
    };
  }

  // 2. Dynamic rate determination (Peak 1.5x multiplier)
  const isPeak = checkIsPeakSession(entryDate, exitDate);
  const baseRate = isPeak ? 75 : 50;       // 1.5x surge: ₱75 vs ₱50
  const hourlyRate = isPeak ? 30 : 20;     // 1.5x surge: ₱30 vs ₱20

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
      if (hoursBefore10PM > 3) {
        pre10Fee += (hoursBefore10PM - 3) * hourlyRate;
      }
    }
    fee = 300 + pre10Fee;
  } else {
    const fullHours = Math.max(1, Math.ceil(diffHours));
    if (fullHours <= 3) {
      fee = baseRate;
    } else {
      fee = baseRate + (fullHours - 3) * hourlyRate;
    }
  }

  return {
    fee,
    status: "completed",
    isPeak,
    isOvernight: crosses10PM,
    rateType: isPeak ? "Peak Surge (1.5x)" : "Standard Rate",
    baseRate,
    hourlyRate,
    durationHours: Number(diffHours.toFixed(2))
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

// GET /api/status - Get floor capacities and active tickets
app.get("/api/status", (req, res) => {
  db.serialize(() => {
    // Keep slots table status strictly synchronized with active tickets
    db.run(
      "UPDATE slots SET status = 'available' WHERE id NOT IN (SELECT slot_id FROM tickets WHERE status = 'active')"
    );
    db.run(
      "UPDATE slots SET status = 'occupied' WHERE id IN (SELECT slot_id FROM tickets WHERE status = 'active')"
    );

    const query = `
      SELECT 
        s.floor, 
        COUNT(DISTINCT CASE WHEN t.status = 'active' THEN s.id END) AS taken
      FROM slots s
      LEFT JOIN tickets t ON s.id = t.slot_id AND t.status = 'active'
      GROUP BY s.floor
    `;

    db.all(query, (err, floorsData) => {
      if (err) return res.status(500).json({ error: err.message });

      let capacity = {
        1: { total: 100, taken: 0 },
        2: { total: 100, taken: 0 },
        3: { total: 100, taken: 0 },
      };
      (floorsData || []).forEach((row) => {
        if (capacity[row.floor]) {
          capacity[row.floor].taken = row.taken;
        }
      });

      db.all(
        "SELECT t.id, t.slot_id, t.entry_time, s.floor, t.map_latitude, t.map_longitude FROM tickets t JOIN slots s ON t.slot_id = s.id WHERE t.status = 'active' ORDER BY t.entry_time DESC",
        (err, tickets) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ capacity, tickets });
        },
      );
    });
  });
});

// POST /api/entry - Assign slot and create ticket
app.post("/api/entry", (req, res) => {
  // Fill floor 1 first, then 2, then 3
  db.get(
    "SELECT id, floor FROM slots WHERE status = 'available' ORDER BY floor ASC, id ASC LIMIT 1",
    (err, slot) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!slot) {
        logReport("capacity_issue", "Parking lot reached full capacity", {
          severity: "warning",
        });

        return res.status(400).json({ error: "Parking is full" });
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

      db.serialize(() => {
        db.run("UPDATE slots SET status = 'occupied' WHERE id = ?", [slot.id]);
        db.run(
          "INSERT INTO tickets (slot_id, entry_time, map_latitude, map_longitude) VALUES (?, ?, ?, ?)",
          [slot.id, entryTime, mapLatitude, mapLongitude],
          function (err) {
            if (err) return res.status(500).json({ error: err.message });

            logReport("vehicle_entered", "Vehicle entered lot", {
              severity: "info",
              floor: slot.floor,
              slotId: slot.id,
              ticketId: this.lastID,
            });

            res.json({
              ticketId: this.lastID,
              slotId: slot.id,
              floor: slot.floor,
              entryTime,
            });
          },
        );
      });
    },
  );
});

// GET /api/ticket/:id/fee - Calculate fee for display
app.get("/api/ticket/:id/fee", (req, res) => {
  const exitTime = req.query.exitTime || new Date().toISOString();

  db.get(
    "SELECT * FROM tickets WHERE id = ? AND status = 'active'",
    [req.params.id],
    (err, ticket) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!ticket)
        return res.status(404).json({ error: "Active ticket not found" });

      const feeResult = calculateFeeAndStatus(
        ticket.entry_time,
        exitTime,
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

      const feeResult = calculateFeeAndStatus(
        ticket.entry_time,
        exitTime,
      );
      if (feeResult.status === "error") {
        return res.status(400).json({ error: feeResult.error });
      }

      const { fee, status } = feeResult;

      if (status === "towed") {
        db.serialize(() => {
          db.run("UPDATE slots SET status = 'available' WHERE id = ?", [
            ticket.slot_id,
          ]);
          db.run(
            "UPDATE tickets SET exit_time = ?, status = 'towed', fee = 0 WHERE id = ?",
            [exitTime, ticketId],
            (err) => {
              if (err) return res.status(500).json({ error: err.message });
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
            },
          );
        });
        return;
      }

      if (!isValidPaymentAmount(amountReceived)) {
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
        db.run("UPDATE slots SET status = 'available' WHERE id = ?", [
          ticket.slot_id,
        ]);
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
          (err) => {
            if (err) return res.status(500).json({ error: err.message });
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
           t.fee, t.status AS ticket_status
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
