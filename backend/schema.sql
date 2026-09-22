CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY,
    floor INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'available'
);

CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id INTEGER NOT NULL,
    entry_time TEXT NOT NULL,
    exit_time TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    fee REAL,
    amount_received REAL,
    change_given REAL,
    change_breakdown TEXT,
    FOREIGN KEY (slot_id) REFERENCES slots(id)
);

CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    floor INTEGER,
    slot_id INTEGER,
    ticket_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

