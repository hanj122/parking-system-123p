/**
 * ParkWise - Real-World Synthetic Database Seeder for Supabase PostgreSQL
 * 
 * Generates an authentic 30-day operational telemetry dataset:
 * - 300 Parking slots across 3 floors with motorcycle & standard car designations.
 * - Diurnal arrival curves (Morning commute, Lunch turnover, Evening peak, Overnight stays).
 * - Real Philippine plate numbers (ABC-1234) and MV file numbers.
 * - Realistic vehicle fleet (Toyota, Honda, Mitsubishi, Yamaha, etc.).
 * - ParkWise pricing rules (₱50 first 3h, ₱20/hr, ₱300 overnight after 10PM, towing logic).
 * - Cash tender denominations and change breakdowns.
 * - Operational incident reports (capacity warnings, payment completions, alerts).
 * - Active parked vehicles snapshot for current live testing.
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Helper: Random number in range [min, max]
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper: Pick random element from array
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Format Date to ISO string YYYY-MM-DDTHH:mm:ssZ
function toIso(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Vehicle Fleet Catalog
const CAR_BRANDS = [
  { brand: 'Toyota', models: ['Vios', 'Fortuner', 'Corolla Cross', 'Innova', 'Wigo'] },
  { brand: 'Honda', models: ['City', 'Civic', 'CR-V', 'HR-V', 'Brio'] },
  { brand: 'Mitsubishi', models: ['Montero Sport', 'Xpander', 'Mirage G4', 'Strada'] },
  { brand: 'Ford', models: ['Everest', 'Ranger', 'Territory'] },
  { brand: 'Nissan', models: ['Navara', 'Terra', 'Almera'] },
  { brand: 'Hyundai', models: ['Tucson', 'Creta', 'Stargazer'] },
  { brand: 'BYD', models: ['Atto 3', 'Dolphin', 'Seal'] }
];

const MC_BRANDS = [
  { brand: 'Yamaha', models: ['NMAX 155', 'Aerox 155', 'Mio Gravis', 'Sniper 155'] },
  { brand: 'Honda', models: ['Click 125i', 'ADV 160', 'PCX 160', 'Beat'] },
  { brand: 'Vespa', models: ['Sprint 150', 'Primavera 150', 'GTS 300'] }
];

const COLORS = ['Pearl White', 'Obsidian Black', 'Metallic Silver', 'Graphite Gray', 'Flame Red', 'Midnight Blue'];

function generatePlateNumber() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const prefix = pick(letters) + pick(letters) + pick(letters);
  const num = randInt(1000, 9999);
  return `${prefix}-${num}`;
}

function generateMvFile() {
  return `1301-${String(randInt(10000000000, 99999999999))}`;
}

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

function calculateCashTender(fee) {
  if (fee <= 0) return { amountReceived: 0, changeGiven: 0, breakdown: null };
  const bills = [50, 100, 200, 500, 1000];
  const tender = bills.find(b => b >= fee) || (Math.ceil(fee / 500) * 500);
  const change = tender - fee;

  const denoms = [1000, 500, 200, 100, 50, 20, 10, 5, 1];
  let remaining = change;
  const breakdown = {};
  for (const d of denoms) {
    if (remaining >= d) {
      const count = Math.floor(remaining / d);
      breakdown[d] = count;
      remaining %= d;
    }
  }
  return {
    amountReceived: tender,
    changeGiven: change,
    breakdown: JSON.stringify(breakdown)
  };
}

async function seed() {
  console.log('🚀 Starting ParkWise Synthetic Telemetry Seeder for Supabase PostgreSQL...\n');
  const client = await pool.connect();

  try {
    // 1. Ensure Slots table is initialized with 300 spaces
    console.log('1. Verifying and initializing 300 parking spaces across 3 floors...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS slots (
        id INTEGER PRIMARY KEY,
        floor INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'available',
        reserved_for TEXT DEFAULT NULL,
        capacity INTEGER NOT NULL DEFAULT 1
      );
    `);

    // Reset slots to available
    for (let i = 100; i <= 399; i++) {
      const floor = Math.floor(i / 100);
      const isMc = floor === 1 && i >= 100 && i <= 119;
      await client.query(`
        INSERT INTO slots (id, floor, status, reserved_for, capacity)
        VALUES ($1, $2, 'available', $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          floor = EXCLUDED.floor,
          reserved_for = EXCLUDED.reserved_for,
          capacity = EXCLUDED.capacity,
          status = 'available';
      `, [i, floor, isMc ? 'motorcycle' : null, isMc ? 6 : 1]);
    }
    console.log('   ✓ 300 slots initialized (Slots 100-119 reserved for motorcycles, capacity 6).\n');

    // 2. Clear old demo tickets and reports
    console.log('2. Preparing fresh telemetry tables...');
    await client.query('DELETE FROM reports;');
    await client.query('DELETE FROM tickets;');
    console.log('   ✓ Cleaned existing tickets and reports.\n');

    // 3. Generate 30 Days of Historical Completed Parking Sessions
    console.log('3. Synthesizing 30-day realistic diurnal traffic patterns...');
    const now = new Date();
    const daysToSimulate = 30;

    const ticketsBatch = [];
    const reportsBatch = [];

    let totalRevenue = 0;
    let completedCount = 0;

    for (let dayOffset = daysToSimulate; dayOffset >= 1; dayOffset--) {
      const simDate = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
      const isWeekend = simDate.getDay() === 0 || simDate.getDay() === 6;

      // Weekday: ~120-180 visits; Weekend: ~80-140 visits
      const dailyVisits = isWeekend ? randInt(85, 135) : randInt(140, 195);

      for (let v = 0; v < dailyVisits; v++) {
        // Arrival hour based on diurnal distribution
        let arrivalHour;
        const r = Math.random();
        if (!isWeekend) {
          if (r < 0.45) arrivalHour = randInt(7, 9); // Morning Peak
          else if (r < 0.70) arrivalHour = randInt(11, 13); // Lunch Peak
          else if (r < 0.88) arrivalHour = randInt(14, 18); // Afternoon
          else arrivalHour = randInt(19, 22); // Evening / Night
        } else {
          arrivalHour = randInt(10, 21); // Weekend broad curve
        }

        const arrivalMinute = randInt(0, 59);
        const entryDate = new Date(simDate);
        entryDate.setHours(arrivalHour, arrivalMinute, randInt(0, 59), 0);

        // Parking duration (hours)
        let stayHours;
        const durRoll = Math.random();
        if (durRoll < 0.35) stayHours = randInt(1, 2) + Math.random(); // Quick visit
        else if (durRoll < 0.75) stayHours = randInt(3, 5) + Math.random(); // Half-day
        else if (durRoll < 0.95) stayHours = randInt(6, 9) + Math.random(); // Full workday
        else stayHours = randInt(12, 16) + Math.random(); // Overnight stay

        const exitDate = new Date(entryDate.getTime() + stayHours * 60 * 60 * 1000);

        // Vehicle type: 20% motorcycle, 80% car
        const isMc = Math.random() < 0.20;
        let slotId;
        if (isMc) {
          slotId = randInt(100, 119); // Motorcycle slot
        } else {
          slotId = randInt(120, 399); // Car slot
        }

        const vehicleType = isMc ? 'motorcycle' : 'car';
        const brandObj = isMc ? pick(MC_BRANDS) : pick(CAR_BRANDS);
        const brand = `${brandObj.brand} ${pick(brandObj.models)}`;
        const color = pick(COLORS);
        const year = randInt(2018, 2026);
        const hasPlate = Math.random() > 0.12;
        const plate = hasPlate ? generatePlateNumber() : null;
        const mvFile = hasPlate ? null : generateMvFile();

        const { fee, status } = calculateFee(entryDate, exitDate);
        const { amountReceived, changeGiven, breakdown } = calculateCashTender(fee);

        totalRevenue += fee;
        completedCount++;

        ticketsBatch.push({
          slot_id: slotId,
          entry_time: toIso(entryDate),
          exit_time: toIso(exitDate),
          status,
          vehicle_type: vehicleType,
          brand,
          color,
          year,
          plate_number: plate,
          mv_file_number: mvFile,
          fee,
          amount_received: amountReceived,
          change_given: changeGiven,
          change_breakdown: breakdown,
          map_latitude: 14.5547 + (Math.random() - 0.5) * 0.005,
          map_longitude: 121.0244 + (Math.random() - 0.5) * 0.005
        });
      }
    }

    console.log(`   ✓ Prepared ${ticketsBatch.length} historical completed sessions (Total Revenue: ₱${totalRevenue.toLocaleString()}).`);

    // Insert historical tickets in chunks
    const CHUNK_SIZE = 100;
    for (let i = 0; i < ticketsBatch.length; i += CHUNK_SIZE) {
      const chunk = ticketsBatch.slice(i, i + CHUNK_SIZE);
      const values = [];
      const placeholders = [];
      let pIdx = 1;

      for (const t of chunk) {
        placeholders.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
        values.push(
          t.slot_id, t.entry_time, t.exit_time, t.status, t.vehicle_type,
          t.brand, t.color, t.year, t.plate_number, t.mv_file_number,
          t.fee, t.amount_received, t.change_given, t.change_breakdown,
          t.map_latitude, t.map_longitude
        );
      }

      await client.query(`
        INSERT INTO tickets (
          slot_id, entry_time, exit_time, status, vehicle_type,
          brand, color, year, plate_number, mv_file_number,
          fee, amount_received, change_given, change_breakdown,
          map_latitude, map_longitude
        ) VALUES ${placeholders.join(', ')};
      `, values);
    }
    console.log('   ✓ Historical parking sessions successfully inserted into Supabase.\n');

    // 4. Create Active Vehicles Snapshot for Current Live Testing
    console.log('4. Generating active parked vehicles snapshot for live dashboard demo...');
    const activeCarSlots = [];
    while (activeCarSlots.length < 45) {
      const s = randInt(120, 399);
      if (!activeCarSlots.includes(s)) activeCarSlots.push(s);
    }

    const activeMcSlots = [101, 102, 105, 108, 112, 115];
    const allActive = [
      ...activeCarSlots.map(s => ({ slotId: s, isMc: false })),
      ...activeMcSlots.map(s => ({ slotId: s, isMc: true }))
    ];

    for (const item of allActive) {
      const brandObj = item.isMc ? pick(MC_BRANDS) : pick(CAR_BRANDS);
      const brand = `${brandObj.brand} ${pick(brandObj.models)}`;
      const hasPlate = Math.random() > 0.15;
      const plate = hasPlate ? generatePlateNumber() : null;
      const mvFile = hasPlate ? null : generateMvFile();

      // Parked between 15 mins to 4 hours ago
      const entryTime = new Date(now.getTime() - randInt(15, 240) * 60 * 1000);

      const ticketRes = await client.query(`
        INSERT INTO tickets (
          slot_id, entry_time, status, vehicle_type,
          brand, color, year, plate_number, mv_file_number,
          map_latitude, map_longitude
        ) VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id;
      `, [
        item.slotId, toIso(entryTime), item.isMc ? 'motorcycle' : 'car',
        brand, pick(COLORS), randInt(2018, 2026), plate, mvFile,
        14.5547 + (Math.random() - 0.5) * 0.003, 121.0244 + (Math.random() - 0.5) * 0.003
      ]);

      const ticketId = ticketRes.rows[0].id;

      // Mark slot occupied
      await client.query('UPDATE slots SET status = $1 WHERE id = $2', [
        item.isMc ? 'partially_occupied' : 'occupied',
        item.slotId
      ]);

      // Add recent activity entry event
      await client.query(`
        INSERT INTO reports (type, severity, message, floor, slot_id, ticket_id, source, created_at)
        VALUES ('vehicle_entry', 'info', $1, $2, $3, $4, 'system', $5);
      `, [
        `Vehicle ${plate || mvFile} (${brand}) checked into Slot ${item.slotId}`,
        Math.floor(item.slotId / 100),
        item.slotId,
        ticketId,
        toIso(entryTime)
      ]);
    }
    console.log(`   ✓ ${allActive.length} vehicles currently parked and active across floors 1–3.\n`);

    // 5. Seed Realistic Operational Incident Reports
    console.log('5. Generating operational incident and audit reports...');
    const incidentTemplates = [
      { type: 'capacity_warning', severity: 'warning', msg: 'Floor 1 reached 88% capacity during peak rush hour' },
      { type: 'payment_issue', severity: 'warning', msg: 'Cash payment retry: Insufficient initial tender at terminal B' },
      { type: 'overnight_warning', severity: 'info', msg: 'Overnight billing threshold activated for vehicles remaining past 22:00' },
      { type: 'maintenance', severity: 'info', msg: 'Routine barrier gate diagnostic completed on Ground Floor Exit' },
      { type: 'manual_override', severity: 'info', msg: 'Operator manual override applied for VIP guest vehicle' },
    ];

    for (let r = 0; r < 20; r++) {
      const template = pick(incidentTemplates);
      const reportTime = new Date(now.getTime() - randInt(1, 14) * 24 * 60 * 60 * 1000 + randInt(0, 3600) * 1000);
      const floor = randInt(1, 3);
      await client.query(`
        INSERT INTO reports (type, severity, message, floor, source, created_at)
        VALUES ($1, $2, $3, $4, 'admin', $5);
      `, [template.type, template.severity, template.msg, floor, toIso(reportTime)]);
    }
    console.log('   ✓ Operational and audit logs generated.\n');

    console.log('================================================================');
    console.log('🎉 SUPABASE SYNTHETIC DATABASE GENERATION COMPLETE!');
    console.log(`   • 300 Parking slots configured with multi-tier capacity.`);
    console.log(`   • ${completedCount} completed sessions with authentic revenue & change.`);
    console.log(`   • ${allActive.length} live active vehicles ready for real-time demo.`);
    console.log(`   • Operational incident telemetry and audit logs generated.`);
    console.log('================================================================');

  } catch (err) {
    console.error('❌ Seeding failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
