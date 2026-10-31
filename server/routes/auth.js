const express  = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { pool }  = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function safeUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    let { name, email, password, role, adminCode } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password and role are required.' });
    }

    email = email.toLowerCase().trim();
    name  = name.trim();

    if (!['student', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'role must be "student" or "admin".' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    if (role === 'admin') {
      if (!adminCode || adminCode !== process.env.ADMIN_SIGNUP_CODE) {
        return res.status(403).json({ error: 'Invalid authority access code.' });
      }
    }

    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, hash, role]
    );

    const user  = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user: safeUser(user) });
  } catch (err) {
    console.error('signup error:', err);
    res.status(500).json({ error: err.message || 'Server error. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    email = email.toLowerCase().trim();

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user   = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'No account found with that email.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    const token = signToken(user);
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: err.message || 'Server error. Please try again.' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('me error:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

module.exports = router;

