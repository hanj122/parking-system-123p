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
    map_latitude REAL,
    map_longitude REAL,
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
    source TEXT NOT NULL DEFAULT 'system',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forecast_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nature TEXT NOT NULL,
    event_date TEXT NOT NULL,
    event_time TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS demand_forecasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nature TEXT NOT NULL,
    event_date TEXT NOT NULL,
    event_time TEXT NOT NULL,
    category TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    location TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
