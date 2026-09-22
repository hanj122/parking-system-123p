const db = require('./backend/db');
db.all(
  "SELECT s.floor, COUNT(DISTINCT CASE WHEN t.status = 'active' THEN s.id END) AS taken FROM slots s LEFT JOIN tickets t ON s.id = t.slot_id AND t.status = 'active' GROUP BY s.floor",
  (err, rows) => {
    console.log(rows);
  }
);
