const db = require('./backend/db');
db.all(
  "SELECT * FROM tickets WHERE slot_id IS NULL",
  (err, rows) => {
    console.log("NULL slot_ids:", rows);
  }
);
db.all(
  "SELECT slot_id FROM tickets WHERE status = 'active'",
  (err, rows) => {
    console.log("Active slot_ids:", rows);
  }
);

