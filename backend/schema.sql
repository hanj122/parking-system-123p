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

