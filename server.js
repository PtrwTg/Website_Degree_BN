// server.js (ฉบับใหม่ที่รองรับ host_name และ arrival_time)
require('dotenv').config(); // ใช้สำหรับการทดสอบในเครื่องคุณ
const express = require('express');
const { Pool } = require('pg'); 
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000; // ใช้ port 5000 หรือตามที่คุณกำหนด

// PostgreSQL Connection Pool (ใช้ DB ตัวเดิม)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // สำหรับ Render/Production
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// ฟังก์ชันเริ่มต้นฐานข้อมูล (สร้างตาราง guests ใหม่)
async function initDb() {
    try {
        const client = await pool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS guests (
                id SERIAL PRIMARY KEY,
                line_user_id TEXT NOT NULL,
                host_name TEXT NOT NULL,      /* NEW: ชื่อโฮสต์ */
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                phone TEXT,
                date TEXT NOT NULL,           /* เปลี่ยนชื่อ visit_date เป็น date ตาม script.js */
                arrival_time TEXT,            /* NEW: เวลามาถึง */
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log("PostgreSQL: Guest table created/verified successfully with new structure.");
        client.release();
    } catch (err) {
        console.error("PostgreSQL: Critical Error during database initialization:", err);
    }
}

// 1. API สำหรับลงทะเบียนแขก (POST /api/guests)
app.post('/api/guests', async (req, res) => {
    // รับค่า host_name และ arrival_time
    const { line_user_id, host_name, first_name, last_name, phone, date, arrival_time } = req.body;

    if (!line_user_id || !host_name || !first_name || !last_name || !date) {
        return res.status(400).json({ error: 'Missing required fields: line_user_id, host_name, first_name, last_name, date.' });
    }
    
    const query = `
        INSERT INTO guests (line_user_id, host_name, first_name, last_name, phone, date, arrival_time, created_at) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
        RETURNING id
    `;
    // ส่ง host_name และ arrival_time เข้าไปใน Query
    const values = [line_user_id, host_name, first_name, last_name, phone, date, arrival_time];

    try {
        const result = await pool.query(query, values);
        res.status(201).json({ 
            message: 'Guest registered successfully', 
            guestId: result.rows[0].id 
        });
    } catch (err) {
        console.error('Registration Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 2. API สำหรับดึงรายชื่อแขกที่ลงทะเบียนโดย Host (GET /api/guests/by-host/:hostName)
app.get('/api/guests/by-host/:hostName', async (req, res) => {
    // เปลี่ยนจาก line_user_id เป็น host_name ตาม script.js
    const { hostName } = req.params; 

    if (!hostName) {
        return res.status(400).json({ error: 'Missing hostName parameter.' });
    }

    try {
        const query = 'SELECT * FROM guests WHERE host_name = $1 ORDER BY created_at DESC';
        const result = await pool.query(query, [hostName]);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch Guests by Host Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 3. API สำหรับลบรายชื่อแขก (DELETE /api/guests/:guestId)
app.delete('/api/guests/:guestId', async (req, res) => {
    const { guestId } = req.params;

    try {
        const query = 'DELETE FROM guests WHERE id = $1';
        const result = await pool.query(query, [guestId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Guest not found.' });
        }
        res.json({ message: 'Guest deleted successfully' });
    } catch (err) {
        console.error('Delete Guest Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 4. API สำหรับดึงรายชื่อแขกทั้งหมดในแต่ละวัน (GET /api/guests/by-date/:date)
app.get('/api/guests/by-date/:date', async (req, res) => {
    const { date } = req.params;

    try {
        // เพิ่ม host_name และ arrival_time ใน Select Query
        const query = 'SELECT host_name, first_name, last_name, phone, arrival_time FROM guests WHERE date = $1 ORDER BY created_at ASC';
        const result = await pool.query(query, [date]);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch All Guests Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// เริ่มเซิร์ฟเวอร์
app.listen(port, async () => {
    console.log(`Backend API is running on port ${port}`);
    await initDb(); // เรียก initDb เมื่อเซิร์ฟเวอร์เริ่มทำงาน
});
