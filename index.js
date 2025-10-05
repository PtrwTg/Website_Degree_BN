// index.js (หรือ server.js)
// *******************************************************************
// ************ ปรับโครงสร้างเพื่อรองรับ Vercel Serverless ************
// *******************************************************************
require('dotenv').config(); // ใช้สำหรับการทดสอบในเครื่องคุณ
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
// ไม่จำเป็นต้องกำหนด port เพราะ Vercel จัดการเอง
// const port = process.env.PORT || 5000;

// PostgreSQL Connection Pool (ใช้ DB ภายนอก)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Vercel มักจะต้องการ SSL เพื่อเชื่อมต่อ DB ภายนอก
    ssl: {
        rejectUnauthorized: false
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// *******************************************************************
// ************ Database Initialization (ถูกเรียกเพียงครั้งเดียว) ************
// *******************************************************************
let dbInitialized = false;

async function initDb() {
    if (dbInitialized) {
        // ป้องกันการรันซ้ำเมื่อเกิด Warm Start
        console.log("PostgreSQL: Database already initialized.");
        return;
    }
    try {
        const client = await pool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS guests (
                id SERIAL PRIMARY KEY,
                line_user_id TEXT NOT NULL,
                host_name TEXT NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                phone TEXT,
                date TEXT NOT NULL,
                arrival_time TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log("PostgreSQL: Guest table created/verified successfully.");
        client.release();
        dbInitialized = true; // ตั้งค่าเป็น true หลังสำเร็จ
    } catch (err) {
        console.error("PostgreSQL: Critical Error during database initialization:", err.message);
        // หาก initialization ล้มเหลว ควรแจ้งเตือน หรือหยุด
        throw new Error("DB Initialization Failed: " + err.message);
    }
}

// 1. API สำหรับลงทะเบียนแขก (POST /api/guests)
app.post('/api/guests', async (req, res) => {
    // ... (โค้ดส่วนนี้ไม่ได้เปลี่ยนแปลง) ...
    const { line_user_id, host_name, first_name, last_name, phone, date, arrival_time } = req.body;

    if (!line_user_id || !host_name || !first_name || !last_name || !date) {
        return res.status(400).json({ error: 'Missing required fields: line_user_id, host_name, first_name, last_name, date.' });
    }
    
    const query = `
        INSERT INTO guests (line_user_id, host_name, first_name, last_name, phone, date, arrival_time, created_at) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
        RETURNING id
    `;
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
    // ... (โค้ดส่วนนี้ไม่ได้เปลี่ยนแปลง) ...
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
    // ... (โค้ดส่วนนี้ไม่ได้เปลี่ยนแปลง) ...
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
    // ... (โค้ดส่วนนี้ไม่ได้เปลี่ยนแปลง) ...
    const { date } = req.params;

    try {
        const query = 'SELECT host_name, first_name, last_name, phone, arrival_time FROM guests WHERE date = $1 ORDER BY created_at ASC';
        const result = await pool.query(query, [date]);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch All Guests Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// *******************************************************************
// ************** การ Export สำหรับ Vercel (สำคัญที่สุด) **************
// *******************************************************************

// เรียก initDb ใน Global Area เพื่อให้ถูกรันเมื่อเกิด Cold Start
// แต่เราใช้ตัวแปร dbInitialized เพื่อป้องกันการรันซ้ำ
initDb(); 

// Vercel ใช้ Export Default Handler (Express App)
module.exports = app;

// หากคุณใช้ไฟล์ชื่ออื่นที่ไม่ใช่ index.js คุณอาจต้องตั้งค่าใน vercel.json
// แต่ถ้าใช้ index.js จะทำงานได้ทันที
