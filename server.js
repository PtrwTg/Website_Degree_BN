const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
//const port = 5000;
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// สร้างและเชื่อมต่อฐานข้อมูล
const db = new sqlite3.Database('./guests.db', (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log('Connected to the guests database.');
    db.run(`CREATE TABLE IF NOT EXISTS guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_user_id TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      gender TEXT,
      date_of_birth TEXT,
      phone TEXT,
      visit_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);

    // Migration: add phone column if it doesn't exist yet
    db.all(`PRAGMA table_info(guests)`, (err, rows) => {
      if (err) {
        console.error('Error reading table info for migration:', err.message);
        return;
      }
      const hasPhoneColumn = rows.some((col) => col.name === 'phone');
      if (!hasPhoneColumn) {
        db.run(`ALTER TABLE guests ADD COLUMN phone TEXT`, (alterErr) => {
          if (alterErr) {
            console.error('Error adding phone column:', alterErr.message);
          } else {
            console.log('Migration applied: added phone column to guests table.');
          }
        });
      }
    });
  }
});

// 1. API สำหรับลงทะเบียนแขก (POST /register)
app.post('/register', (req, res) => {
  const { line_user_id, firstName, lastName, gender, date_of_birth, phone, visit_date } = req.body;

  if (!line_user_id || !firstName || !lastName || !visit_date) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const stmt = db.prepare(`INSERT INTO guests (line_user_id, first_name, last_name, gender, date_of_birth, phone, visit_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`);
  
  stmt.run(line_user_id, firstName, lastName, gender, date_of_birth, phone, visit_date, function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({ message: 'Guest registered successfully', guestId: this.lastID });
  });

  stmt.finalize();
});

// 2. API สำหรับดึงรายชื่อแขกที่ลงทะเบียนโดยผู้ใช้ปัจจุบัน (GET /guests)
app.get('/guests', (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId parameter.' });
  }

  db.all('SELECT * FROM guests WHERE line_user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// 3. API สำหรับลบรายชื่อแขก (DELETE /guest/:guestId)
app.delete('/guest/:guestId', (req, res) => {
  const { guestId } = req.params;

  db.run('DELETE FROM guests WHERE id = ?', guestId, function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Guest not found.' });
    }
    res.json({ message: 'Guest deleted successfully' });
  });
});

// 4. API สำหรับดึงรายชื่อแขกทั้งหมดในแต่ละวัน (GET /guests/day/:date)
app.get('/guests/day/:date', (req, res) => {
  const { date } = req.params;

  db.all('SELECT first_name, last_name, gender FROM guests WHERE visit_date = ? ORDER BY created_at ASC', [date], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// เริ่มเซิร์ฟเวอร์
app.listen(port, () => {
  console.log(`Backend API is running on http://localhost:${port}`);
});