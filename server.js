// server.js (ฉบับ PostgreSQL สำหรับ Guest Registration)
require('dotenv').config(); // ใช้สำหรับการทดสอบในเครื่องคุณ
const express = require('express');
const { Pool } = require('pg'); 
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// PostgreSQL Connection Pool (ใช้ DB ตัวเดิม)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Middleware
app.use(cors());
app.use(express.json());

// ฟังก์ชันเริ่มต้นฐานข้อมูล (สร้างตาราง guests)
async function initDb() {
    try {
        const client = await pool.connect();
        // โค้ดนี้จะสร้างตาราง guests ถ้ายังไม่มีใน DB ตัวเดิมของคุณ
        await client.query(`
            CREATE TABLE IF NOT EXISTS guests (
                id SERIAL PRIMARY KEY,
                line_user_id TEXT NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                date_of_birth TEXT,
                phone TEXT,
                visit_date TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log("PostgreSQL: Guest table initialized successfully.");
        client.release();
    } catch (err) {
        console.error("PostgreSQL: Error initializing database:", err);
    }
}

// 1. API สำหรับลงทะเบียนแขก (POST /register)
app.post('/register', async (req, res) => {
    const { line_user_id, firstName, lastName, date_of_birth, phone, visit_date } = req.body;

    if (!line_user_id || !firstName || !lastName || !visit_date) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }
    
    const query = `
        INSERT INTO guests (line_user_id, first_name, last_name, date_of_birth, phone, visit_date, created_at) 
        VALUES ($1, $2, $3, $4, $5, $6, NOW()) 
        RETURNING id
    `;
    const values = [line_user_id, firstName, lastName, date_of_birth, phone, visit_date];

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

// 2. API สำหรับดึงรายชื่อแขกที่ลงทะเบียนโดยผู้ใช้ปัจจุบัน (GET /guests)
app.get('/guests', async (req, res) => {
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId parameter.' });
    }

    try {
        const query = 'SELECT * FROM guests WHERE line_user_id = $1 ORDER BY created_at DESC';
        const result = await pool.query(query, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch Guests Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 3. API สำหรับลบรายชื่อแขก (DELETE /guest/:guestId)
app.delete('/guest/:guestId', async (req, res) => {
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

// 4. API สำหรับดึงรายชื่อแขกทั้งหมดในแต่ละวัน (GET /guests/day/:date)
app.get('/guests/day/:date', async (req, res) => {
    const { date } = req.params;

    try {
        const query = 'SELECT first_name, last_name, phone FROM guests WHERE visit_date = $1 ORDER BY created_at ASC';
        const result = await pool.query(query, [date]);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch All Guests Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// เริ่มเซิร์ฟเวอร์
app.listen(port, async () => {
    console.log(`Backend API is running on http://localhost:${port}`);
    await initDb(); // เรียก initDb เมื่อเซิร์ฟเวอร์เริ่มทำงาน
});