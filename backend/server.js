const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { exit } = require('process');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Page routes (Clean friendly aliases) ───────────────────────────
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});
app.get('/frontpage', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});
app.get('/demo', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/demo.html'));
});
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
});
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
});
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});
app.get('/admin-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MANILA_OFFSET = 8 * HOUR;
const PEAK_WINDOWS = [[7, 10], [17, 20]];

function manilaDayStart(ts) {
    return Math.floor((ts + MANILA_OFFSET) / DAY) * DAY - MANILA_OFFSET;
}
 
function overlapsWithPeakHours(entryDate, exitDate) {
    const start = entryDate.getTime();
    const end = exitDate.getTime();
 
    for (let day = manilaDayStart(start); day <= end; day += DAY) {
        for (const [s, e] of PEAK_WINDOWS) {
            const winStart = day + s * HOUR;
            const winEnd = day + e * HOUR;
            if (start < winEnd && end > winStart) return true;
        }
    }
    return false;
}



// Calculate fee based on entry and exit time
function calculateFeeAndStatus(entryTime, exitTime) {
    const entryDate = new Date(entryTime);
    const exitDate = new Date(exitTime);
 
    const diffHours = (exitDate - entryDate) / HOUR;
 
    if (diffHours >= 24) {
        return { fee: 0, status: 'towed', PeakHour: false };
    }
 
    const PeakHour = overlapsWithPeakHours(entryDate, exitDate);
    const baseFee = PeakHour ? Math.round(50 * 1.5) : 50;
    const HourlyRate = PeakHour ? Math.round(20 * 1.5) : 20;
 
    let tenPM = manilaDayStart(entryDate.getTime()) + 22 * HOUR;
    if (entryDate.getTime() > tenPM) tenPM += DAY;
 
    let fee;
    if (exitDate.getTime() > tenPM) {
        const hoursBefore10PM = Math.ceil((tenPM - entryDate.getTime()) / HOUR);
        let pre10Fee = 0;
        if (hoursBefore10PM > 0) {
            pre10Fee = baseFee;
            if (hoursBefore10PM > 3) pre10Fee += (hoursBefore10PM - 3) * HourlyRate;
        }
        fee = 300 + pre10Fee;
    } else {
        const fullHours = Math.ceil(diffHours);
        fee = fullHours <= 3 ? baseFee : baseFee + (fullHours - 3) * HourlyRate;
    }
 
    return { fee, status: 'completed', PeakHour };
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

// GET /api/status - Get floor capacities and active tickets
app.get('/api/status', (req, res) => {
    db.all("SELECT floor, COUNT(*) as taken FROM slots WHERE status = 'occupied' GROUP BY floor", (err, floorsData) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let capacity = { 1: { total: 100, taken: 0 }, 2: { total: 100, taken: 0 }, 3: { total: 100, taken: 0 } };
        floorsData.forEach(row => {
            capacity[row.floor].taken = row.taken;
        });

        db.all("SELECT t.id, t.slot_id, t.entry_time, s.floor FROM tickets t JOIN slots s ON t.slot_id = s.id WHERE t.status = 'active' ORDER BY t.entry_time DESC", (err, tickets) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ capacity, tickets });
        });
    });
});

// POST /api/entry - Assign slot and create ticket
app.post('/api/entry', (req, res) => {
    // Fill floor 1 first, then 2, then 3
    db.get("SELECT id, floor FROM slots WHERE status = 'available' ORDER BY floor ASC, id ASC LIMIT 1", (err, slot) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!slot) return res.status(400).json({ error: 'Parking is full' });

        const entryTime = req.body.entryTime || new Date().toISOString();

        db.serialize(() => {
            db.run("UPDATE slots SET status = 'occupied' WHERE id = ?", [slot.id]);
            db.run("INSERT INTO tickets (slot_id, entry_time) VALUES (?, ?)", [slot.id, entryTime], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ticketId: this.lastID, slotId: slot.id, floor: slot.floor, entryTime });
            });
        });
    });
});

// GET /api/ticket/:id/fee - Calculate fee for display
app.get('/api/ticket/:id/fee', (req, res) => {
    const exitTime = req.query.exitTime || new Date().toISOString();
    
    db.get("SELECT * FROM tickets WHERE id = ? AND status = 'active'", [req.params.id], (err, ticket) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!ticket) return res.status(404).json({ error: 'Active ticket not found' });

        const { fee, status, PeakHour } = calculateFeeAndStatus(ticket.entry_time, exitTime);
        res.json({ fee, status, PeakHour, entryTime: ticket.entry_time, exitTime });
    });
});

// POST /api/exit - Process exit and payment
app.post('/api/exit', (req, res) => {
    const { ticketId, amountReceived, exitTime: providedExitTime } = req.body;
    const exitTime = providedExitTime || new Date().toISOString();

    db.get("SELECT * FROM tickets WHERE id = ? AND status = 'active'", [ticketId], (err, ticket) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!ticket) return res.status(404).json({ error: 'Active ticket not found' });

        const { fee, status, PeakHour } = calculateFeeAndStatus(ticket.entry_time, exitTime);

        if (status === 'towed') {
            db.serialize(() => {
                db.run("UPDATE slots SET status = 'available' WHERE id = ?", [ticket.slot_id]);
                db.run("UPDATE tickets SET exit_time = ?, status = 'towed', fee = 0 WHERE id = ?", [exitTime, ticketId], (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, status: 'towed', message: 'Vehicle was towed. No fee collected.' });
                });
            });
            return;
        }

        if (!isValidPaymentAmount(amountReceived)) {
            return res.status(400).json({ error: 'Invalid cash amount. Only 20, 50, 100, 500, 1000 bill combinations are accepted.' });
        }

        if (amountReceived < fee) {
            return res.status(400).json({ error: `Insufficient amount. Fee is ₱${fee}` });
        }

        const changeGiven = amountReceived - fee;
        const changeBreakdown = calculateChangeBreakdown(changeGiven);

        db.serialize(() => {
            db.run("UPDATE slots SET status = 'available' WHERE id = ?", [ticket.slot_id]);
            db.run("UPDATE tickets SET exit_time = ?, status = 'completed', fee = ?, amount_received = ?, change_given = ?, change_breakdown = ? WHERE id = ?", 
                [exitTime, fee, amountReceived, changeGiven, JSON.stringify(changeBreakdown), ticketId], 
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, fee, changeGiven, changeBreakdown, status: 'completed', PeakHour });
                }
            );
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

