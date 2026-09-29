-- ParkWise PostgreSQL (Supabase) Database Schema
-- Converted from SQLite to pure PostgreSQL syntax

CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY,
    floor INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    reserved_for TEXT DEFAULT NULL,
    capacity INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    slot_id INTEGER NOT NULL REFERENCES slots(id),
    entry_time TEXT NOT NULL,
    exit_time TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    vehicle_type TEXT NOT NULL DEFAULT 'car',
    brand TEXT,
    color TEXT,
    year INTEGER,
    plate_number TEXT,
    mv_file_number TEXT,
    fee REAL,
    amount_received REAL,
    change_given REAL,
    change_breakdown TEXT,
    map_latitude REAL,
    map_longitude REAL
);

CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    floor INTEGER,
    slot_id INTEGER,
    ticket_id INTEGER,
    source TEXT NOT NULL DEFAULT 'system',
    created_at TEXT NOT NULL DEFAULT TO_CHAR(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);

CREATE TABLE IF NOT EXISTS report_slots (
    report_id INTEGER NOT NULL,
    slot_id INTEGER NOT NULL,
    PRIMARY KEY (report_id, slot_id),
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
    FOREIGN KEY (slot_id) REFERENCES slots(id)
);

CREATE TABLE IF NOT EXISTS forecast_events (
    id SERIAL PRIMARY KEY,
    nature TEXT NOT NULL,
    event_date TEXT NOT NULL,
    event_time TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT TO_CHAR(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);

CREATE TABLE IF NOT EXISTS demand_forecasts (
    id SERIAL PRIMARY KEY,
    nature TEXT NOT NULL,
    event_date TEXT NOT NULL,
    event_time TEXT NOT NULL,
    category TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    location TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    external_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lot_location (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    radius_km REAL NOT NULL DEFAULT 3.0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes for Analytics & Dashboard Queries
CREATE INDEX IF NOT EXISTS idx_tickets_slot_id ON tickets(slot_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_entry_time ON tickets(entry_time);
CREATE INDEX IF NOT EXISTS idx_tickets_exit_time ON tickets(exit_time);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);
CREATE INDEX IF NOT EXISTS idx_slots_floor ON slots(floor);
