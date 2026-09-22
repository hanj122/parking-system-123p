const db = require('./backend/db'); db.all(\SELECT * FROM tickets WHERE status = 'active'\, (err, rows) => { console.log(rows); });
