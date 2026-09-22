const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

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
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/dashboard.html"));
});
app.get("/admin-dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/dashboard.html"));
});
app.get("/reports", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/reports.html"));
});

// Helper to check if a number can be formed by 20, 50, 100, 500, 1000
function isValidPaymentAmount(amount) {
  if (amount <= 0 || !Number.isInteger(amount)) return false;

  // Since 100, 500, 1000 are multiples of 20 and 50 (wait, 100=50x2, 500=50x10, 1000=50x20),
  // any combination of these bills can be reduced to just combinations of 20 and 50.
  // We just need to check if amount can be written as 20x + 50y.

  // Valid amounts for 20x + 50y:
  if (amount === 10 || amount === 30) return false;
  // For anything else, if it's a multiple of 10, we can always form it (40, 50, 60, 70, 80...).
  // Wait, are there any other constraints? Only multiples of 10.
  return amount % 10 === 0;
}

// Calculate fee based on entry and exit time
function calculateFeeAndStatus(entryTime, exitTime) {
  const entryDate = new Date(entryTime);
  const exitDate = new Date(exitTime);

  const diffMs = exitDate - entryDate;
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours >= 24) {
    return { fee: 0, status: "towed" };
  }

  let crosses10PM = false;
  let tenPM = new Date(entryDate);
  tenPM.setHours(22, 0, 0, 0);

  if (entryDate > tenPM) {
    tenPM.setDate(tenPM.getDate() + 1);
  }

  if (exitDate > tenPM) {
    crosses10PM = true;
  }

  let fee = 0;

  if (crosses10PM) {
    const hoursBefore10PM = Math.ceil((tenPM - entryDate) / (1000 * 60 * 60));
    let pre10Fee = 0;
    if (hoursBefore10PM > 0) {
      pre10Fee = 50;
      if (hoursBefore10PM > 3) {
        pre10Fee += (hoursBefore10PM - 3) * 20;
      }
    }
    fee = 300 + pre10Fee;
  } else {
    const fullHours = Math.ceil(diffHours);
    if (fullHours <= 3) {
      fee = 50;
    } else {
      fee = 50 + (fullHours - 3) * 20;
    }
  }

  return { fee, status: "completed" };
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

      const { fee, status } = calculateFeeAndStatus(
        ticket.entry_time,
        exitTime,
      );
      res.json({ fee, status, entryTime: ticket.entry_time, exitTime });
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

      const { fee, status } = calculateFeeAndStatus(
        ticket.entry_time,
        exitTime,
      );

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
        logReport("payment_issue", "Invalid cash amount rejected", {
          severity: "warning",
          slotId: ticket.slot_id,
          ticketId: ticketId,
        });

        return res.status(400).json({
          error:
            "Invalid cash amount. Only 20, 50, 100, 500, 1000 bill combinations are accepted.",
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
  const totalSpacesQuery = `
    SELECT COUNT(*) AS total_spaces
    FROM slots
  `;

  const revenueQuery = `
    SELECT COALESCE(SUM(fee), 0) AS total_revenue
    FROM tickets
    WHERE status = 'completed'
  `;

  const turnoverQuery = `
    SELECT COUNT(*) AS completed_sessions
    FROM tickets
    WHERE status = 'completed'
  `;

  db.get(totalSpacesQuery, (err, spacesRow) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    db.get(revenueQuery, (err, revenueRow) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      db.get(turnoverQuery, (err, turnoverRow) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const totalSpaces = Number(spacesRow.total_spaces || 0);
        const totalRevenue = Number(revenueRow.total_revenue || 0);
        const completedSessions = Number(
          turnoverRow.completed_sessions || 0
        );

        const revenuePerAvailableSpace =
          totalSpaces > 0
            ? totalRevenue / totalSpaces
            : 0;

        const turnoverRate =
          totalSpaces > 0
            ? completedSessions / totalSpaces
            : 0;

        res.json({
          totalSpaces,
          totalRevenue,
          completedSessions,

          revenuePerAvailableSpace: Number(
            revenuePerAvailableSpace.toFixed(2)
          ),

          turnoverRate: Number(
            turnoverRate.toFixed(2)
          )
        });
      });
    });
  });
});
// GET /api/analytics/turnover
// Detailed turnover and revenue information
app.get("/api/analytics/turnover", (req, res) => {
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
        spaces,
        vehicles
      });
    });
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
