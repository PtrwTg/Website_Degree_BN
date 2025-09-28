// server.js (ฉบับ MIGRATION SCRIPT: รัน ALTER TABLE อัตโนมัติในการ Deploy ครั้งแรก)
require('dotenv').config(); 
const express = require('express');
const { Pool } = require('pg'); 
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// PostgreSQL Connection Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Middleware
app.use(cors());
app.use(express.json());

// ===============================================
// ฟังก์ชันเริ่มต้นฐานข้อมูล: จัดการตารางและแก้ไขโครงสร้าง (Migration)
// ===============================================
async function initDb() {
    try {
        const client = await pool.connect();
        
        // 1. สร้างตาราง guests หากยังไม่มี (ใช้โครงสร้างเดิมเพื่อไม่ให้เกิด Error หากตารางไม่เคยมี)
        await client.query(`
            CREATE TABLE IF NOT EXISTS guests (
                id SERIAL PRIMARY KEY,
                line_user_id TEXT NOT NULL,
                host_name TEXT, 
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                date_of_birth TEXT,  
                phone TEXT,
                visit_date TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // 2. **Schema Migration: รัน ALTER TABLE เพื่อแก้ไขโครงสร้างตารางที่มีอยู่**
        
        // A. เพิ่มคอลัมน์ arrival_time (ถ้ายังไม่มี)
        try {
            await client.query(`ALTER TABLE guests ADD COLUMN arrival_time TEXT;`);
            console.log("PostgreSQL: Added column 'arrival_time'.");
        } catch (e) {
            if (!e.message.includes('column "arrival_time" already exists')) {
                console.error("Error adding arrival_time:", e.message);
            }
        }
        
        // B. ลบคอลัมน์ date_of_birth (ถ้ายังมีอยู่)
        try {
            await client.query(`ALTER TABLE guests DROP COLUMN date_of_birth;`);
            console.log("PostgreSQL: Dropped column 'date_of_birth'.");
        } catch (e) {
            if (!e.message.includes('column "date_of_birth" does not exist')) {
                console.error("Error dropping date_of_birth:", e.message);
            }
        }
        
        console.log("PostgreSQL: Database schema migration completed. Ready for production code deployment.");
        client.release();
    } catch (err) {
        console.error("PostgreSQL: Critical Error during initialization:", err);
    }
}

// เรียกใช้ฟังก์ชันเริ่มต้น DB เมื่อเริ่มต้น Server
initDb();

// ===============================================
// API Endpoints (ใช้โค้ดใหม่ที่รองรับ arrival_time)
// ===============================================

// 1. API สำหรับลงทะเบียนแขก (POST /api/guests)
app.post('/api/guests', async (req, res) => {
    const { 
        line_user_id, host_name, first_name, last_name, phone, date, arrival_time 
    } = req.body;

    if (!line_user_id || !first_name || !last_name || !date) {
        return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน: ต้องมี Line ID, ชื่อ, นามสกุล และวันที่' });
    }

    try {
        const query = `
            INSERT INTO guests (line_user_id, host_name, first_name, last_name, phone, visit_date, arrival_time) 
            VALUES ($1, $2, $3, $4, $5, $6, $7) 
            RETURNING *;
        `;
        const values = [line_user_id, host_name, first_name, last_name, phone, date, arrival_time];
        
        const result = await pool.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Registration Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 2. API สำหรับดึงรายชื่อแขกที่ลงทะเบียนโดย Host (GET /api/guests/by-host/:hostName)
app.get('/api/guests/by-host/:hostName', async (req, res) => {
    const { hostName } = req.params;

    try {
        const query = 'SELECT id, first_name, last_name, phone, visit_date as date, arrival_time FROM guests WHERE host_name = $1 ORDER BY created_at ASC';
        const result = await pool.query(query, [hostName]);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch Guests Error:', err.message);
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
        const query = 'SELECT first_name, last_name, host_name, arrival_time FROM guests WHERE visit_date = $1 ORDER BY created_at ASC';
        const result = await pool.query(query, [date]);
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch All Guests by Date Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// เริ่ม Server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
