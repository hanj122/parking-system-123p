const db = require('./backend/db');
db.all(
  "SELECT * FROM slots WHERE status = 'occupied'",
  (err, rows) => {
    console.log("Occupied slots:", rows);
  }
);

