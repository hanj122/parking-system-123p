const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'backend', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Opening database:', dbPath);

// Helper function to format ISO date string
function formatISO(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, '');
}

// System Fee Calculation Rules
function calculateFee(entryDate, exitDate) {
  const diffHours = (exitDate - entryDate) / (1000 * 60 * 60);

  if (diffHours >= 24) {
    return { fee: 0, status: 'towed' };
  }

  let tenPM = new Date(entryDate);
  tenPM.setHours(22, 0, 0, 0);
  if (entryDate > tenPM) {
    tenPM.setDate(tenPM.getDate() + 1);
  }

  let fee = 0;
  if (exitDate > tenPM) {
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

  return { fee, status: 'completed' };
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

function getBillsPayment(fee) {
  if (fee === 0) return { received: 0, change: 0, breakdown: '{}' };
  const bills = [50, 100, 200, 500, 1000];
  let received = bills.find((b) => b >= fee);
  if (!received) received = Math.ceil(fee / 500) * 500;
  const change = received - fee;
  const breakdown = JSON.stringify(calculateChangeBreakdown(change));
  return { received, change, breakdown };
}

// Random helper
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

db.serialize(async () => {
  console.log('1. Clearing existing tickets, reports, and forecast events...');

  db.run('DELETE FROM tickets');
  db.run('DELETE FROM reports');
  db.run('DELETE FROM demand_forecasts');
  db.run("DELETE FROM sqlite_sequence WHERE name IN ('tickets', 'reports', 'demand_forecasts')");

  // Ensure all 300 slots exist and are set to 'available'
  db.run("UPDATE slots SET status = 'available'");

  console.log('2. Generating 2-month dataset of commercial parking sessions...');

  // Start date: 60 days before September 22, 2026
  const endDate = new Date('2026-09-22T23:59:59');
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 60);

  const insertTicket = db.prepare(`
    INSERT INTO tickets (
      slot_id, entry_time, exit_time, status, fee, 
      amount_received, change_given, change_breakdown, map_latitude, map_longitude
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let totalTickets = 0;
  let totalRevenue = 0;
  let totalDurationMinutes = 0;
  let totalTowed = 0;

  // Track per-slot stats for verification
  const slotStats = {};
  for (let s = 100; s <= 399; s++) {
    slotStats[s] = { count: 0, revenue: 0, duration: 0 };
  }

  // Loop through 60 days
  for (let dayOffset = 0; dayOffset < 60; dayOffset++) {
    const currentDay = new Date(startDate);
    currentDay.setDate(currentDay.getDate() + dayOffset);

    const isWeekend = currentDay.getDay() === 0 || currentDay.getDay() === 6;
    // Weekday: 45-65 vehicles, Weekend: 55-80 vehicles
    const vehiclesToday = isWeekend ? randInt(55, 80) : randInt(45, 65);

    for (let v = 0; v < vehiclesToday; v++) {
      // Pick a slot:
      // Floor 1 (100-199): 50% probability (quick errands, highest turnover)
      // Floor 2 (200-299): 30% probability (moderate duration)
      // Floor 3 (300-399): 20% probability (longer stays)
      let slotId;
      const roll = Math.random();
      if (roll < 0.5) {
        slotId = randInt(100, 199);
      } else if (roll < 0.8) {
        slotId = randInt(200, 299);
      } else {
        slotId = randInt(300, 399);
      }

      // Pick arrival hour (clustered around peak periods)
      // 7-10 (morning peak), 11-14 (lunch peak), 17-20 (evening rush), other (normal)
      let entryHour;
      const timeRoll = Math.random();
      if (timeRoll < 0.3) {
        entryHour = randInt(7, 10);
      } else if (timeRoll < 0.6) {
        entryHour = randInt(11, 14);
      } else if (timeRoll < 0.85) {
        entryHour = randInt(17, 20);
      } else {
        entryHour = randInt(14, 16);
      }

      const entryMinute = randInt(0, 59);
      const entryTime = new Date(currentDay);
      entryTime.setHours(entryHour, entryMinute, 0, 0);

      // Duration:
      // 60% stay 1-3 hrs, 25% stay 4-8 hrs, 14% stay overnight (cross 10 PM), 1% towed (>24h)
      let durationHours;
      const durRoll = Math.random();
      let isTowed = false;

      if (durRoll < 0.60) {
        durationHours = Number((Math.random() * 2.5 + 0.5).toFixed(2)); // 30m - 3h
      } else if (durRoll < 0.85) {
        durationHours = Number((Math.random() * 4.5 + 3.2).toFixed(2)); // 3.2h - 7.7h
      } else if (durRoll < 0.985) {
        // Stays crossing past 10 PM
        const hoursUntil10PM = (22 - entryHour);
        durationHours = Number((hoursUntil10PM + Math.random() * 3 + 0.5).toFixed(2));
      } else {
        // Towed vehicle (>24h stay)
        durationHours = Number((Math.random() * 8 + 25).toFixed(2));
        isTowed = true;
      }

      const exitTime = new Date(entryTime.getTime() + durationHours * 3600 * 1000);

      // Calculate official fee
      const calc = isTowed ? { fee: 0, status: 'towed' } : calculateFee(entryTime, exitTime);
      const payment = getBillsPayment(calc.fee);

      // Manila Metro coordinates
      const lat = Number((14.55 + Math.random() * 0.05).toFixed(6));
      const lng = Number((120.98 + Math.random() * 0.06).toFixed(6));

      insertTicket.run(
        slotId,
        formatISO(entryTime),
        formatISO(exitTime),
        calc.status,
        calc.fee,
        payment.received,
        payment.change,
        payment.breakdown,
        lat,
        lng
      );

      totalTickets++;
      totalRevenue += calc.fee;
      const durationMins = Math.round(durationHours * 60);
      totalDurationMinutes += durationMins;
      if (calc.status === 'towed') totalTowed++;

      slotStats[slotId].count += 1;
      slotStats[slotId].revenue += calc.fee;
      slotStats[slotId].duration += durationMins;
    }
  }

  insertTicket.finalize();
  console.log(`✓ Inserted ${totalTickets} completed tickets across 60 days.`);

  console.log('3. Inserting operational reports...');
  const insertReport = db.prepare(`
    INSERT INTO reports (type, severity, message, floor, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const reportTemplates = [
    { type: 'Parking Issue', severity: 'info', message: 'Vehicle parked across two designated bays. Vehicle owner notified via PA.', floor: 1 },
    { type: 'Equipment Issue', severity: 'warning', message: 'Gate A boom barrier response delay of ~3 seconds observed during peak ingress.', floor: 1 },
    { type: 'Safety', severity: 'warning', message: 'Wet floor hazard detected near stairwell entrance B after heavy rain. Caution cone placed.', floor: 2 },
    { type: 'Maintenance', severity: 'info', message: 'Replaced 4 overhead LED fixtures in Section 2B. Illumination restored to standard.', floor: 2 },
    { type: 'Capacity', severity: 'warning', message: 'Floor 1 reached 92% capacity at 12:45 PM. Dynamic direction signage routed cars to Floor 2.', floor: 1 },
    { type: 'Payment', severity: 'info', message: 'Customer bill validator required routine roller cleaning on Auto-Pay Station 2.', floor: 1 },
    { type: 'Security', severity: 'info', message: 'Routine evening patrol completed on all floors. No security breaches or unattended vehicles.', floor: 3 },
    { type: 'Equipment Issue', severity: 'warning', message: 'Ticket dispenser optical sensor recalibrated after false paper-jam trigger.', floor: 1 },
    { type: 'Maintenance', severity: 'info', message: 'Repainted speed bump yellow reflective striping near Ground exit gate.', floor: 1 },
    { type: 'Parking Issue', severity: 'info', message: 'Vehicle headlight left active in slot 214. Guard alerted owner before battery drained.', floor: 2 },
    { type: 'Safety', severity: 'info', message: 'Annual fire safety inspection conducted. All 12 extinguishers verified and certified.', floor: 3 },
    { type: 'Equipment Issue', severity: 'critical', message: 'South ramp ventilation fan intermittent vibration detected. Technician scheduled.', floor: 2 },
    { type: 'Customer Concern', severity: 'info', message: 'Assisted customer locating parked car on Floor 3 using license plate search.', floor: 3 },
    { type: 'Capacity', severity: 'info', message: 'Overnight occupancy peaked at 18 vehicles. All vehicles verified in database.', floor: 1 },
    { type: 'Security', severity: 'info', message: 'CCTV camera 14 angle adjusted for clearer coverage of ramp blind spot.', floor: 2 },
    { type: 'Maintenance', severity: 'info', message: 'Drainage sump pump preventive maintenance and filter cleaning completed.', floor: 1 },
    { type: 'Parking Issue', severity: 'warning', message: 'Unregistered commercial delivery van parked in customer slot. Moved to loading bay.', floor: 1 },
    { type: 'Equipment Issue', severity: 'info', message: 'Software update applied to RFID card scanner terminal. System rebooted in 15 seconds.', floor: 1 }
  ];

  for (let i = 0; i < reportTemplates.length; i++) {
    const t = reportTemplates[i];
    const reportDate = new Date(startDate.getTime() + (i / reportTemplates.length) * 58 * 86400 * 1000);
    insertReport.run(t.type, t.severity, t.message, t.floor, 'admin', formatISO(reportDate));
  }
  insertReport.finalize();
  console.log(`✓ Inserted ${reportTemplates.length} operational reports.`);

  console.log('4. Inserting upcoming & past demand forecast events...');
  const insertForecast = db.prepare(`
    INSERT INTO demand_forecasts (nature, event_date, event_time, category, location, latitude, longitude)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const forecastEvents = [
    { nature: 'PBA Basketball Finals Game 6', date: '2026-09-24', time: '18:30', category: 'Sports', location: 'Araneta Coliseum, Cubao', lat: 14.6219, lng: 121.0531 },
    { nature: 'International Pop Artist World Tour', date: '2026-09-26', time: '19:00', category: 'Concert', location: 'SM Mall of Asia Arena, Pasay', lat: 14.5323, lng: 120.9858 },
    { nature: 'Grand Weekend Midnight Sale', date: '2026-09-27', time: '10:00', category: 'Market', location: 'SM Megamall, Ortigas', lat: 14.5842, lng: 121.0573 },
    { nature: 'Philippine Tech & AI Summit 2026', date: '2026-10-02', time: '09:00', category: 'Other', location: 'SMX Convention Center', lat: 14.5312, lng: 120.9823 },
    { nature: 'National Holiday Commemoration', date: '2026-10-05', time: '08:00', category: 'Holiday', location: 'Rizal Park, Manila', lat: 14.5831, lng: 120.9794 },
    { nature: 'University UAAP Men’s Volleyball Finals', date: '2026-10-10', time: '14:00', category: 'Sports', location: 'PhilSports Arena, Pasig', lat: 14.5772, lng: 121.0667 },
    { nature: 'Symphony Orchestra Gala Night', date: '2026-10-15', time: '20:00', category: 'Concert', location: 'CCP Complex, Pasay', lat: 14.5583, lng: 120.9897 },
    { nature: 'Annual Food & Gourmet Expo', date: '2026-10-22', time: '11:00', category: 'Market', location: 'World Trade Center Metro Manila', lat: 14.5516, lng: 120.9877 }
  ];

  for (const f of forecastEvents) {
    insertForecast.run(f.nature, f.date, f.time, f.category, f.location, f.lat, f.lng);
  }
  insertForecast.finalize();
  console.log(`✓ Inserted ${forecastEvents.length} demand forecast events.`);

  console.log('\n======================================================');
  console.log('              DATASET SUMMARY & AUDIT                 ');
  console.log('======================================================');
  const totalSpaces = 300; // 100 slots x 3 floors
  const revPerSpace = totalRevenue / totalSpaces;
  const turnover = totalTickets / totalSpaces;
  const avgDuration = totalDurationMinutes / totalTickets;

  console.log(`Total Operational Spaces (Capacity) : ${totalSpaces} slots`);
  console.log(`Total Vehicles Parked (2 Months)    : ${totalTickets}`);
  console.log(`Total Gross Revenue Collected       : ₱${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Revenue per Available Space         : ₱${revPerSpace.toFixed(2)}`);
  console.log(`Overall Space Turnover Rate         : ${turnover.toFixed(2)}x`);
  console.log(`Average Parking Duration            : ${Math.round(avgDuration)} mins (${(avgDuration / 60).toFixed(1)} hrs)`);
  console.log(`Vehicles Towed (>24h stay)          : ${totalTowed}`);
  console.log(`Active Tickets Left in Lot          : 0 (Lot is 100% available)`);
  console.log('======================================================\n');

  db.close(() => {
    console.log('Database connection closed cleanly.');
  });
});

