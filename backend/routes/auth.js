const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/Users');
const { sendWelcomeEmail } = require('../utils/emailService');

// Middleware di autenticazione
const auth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Token non fornito' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Aggiungi l'ID dell'utente alla richiesta
        req.userId = decoded.id;
        next();
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token non valido o scaduto' });
        }
        res.status(500).json({ error: err.message });
    }
};

// funzione generazione JWT
const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user._id, 
            email: user.email,
            role: user.role 
        }, 
        process.env.JWT_SECRET || 'your-secret-key', 
        { expiresIn: '24h' }
    );
};

// Login Locale
router.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) return next(err);
        if (!user) {
            return res.status(400).json({ message: info.message });
        }

        const token = generateToken(user);
        const userToSend = {
            _id: user._id,
            email: user.email,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
            profileImage: user.profileImage
        };
        res.json({ user: userToSend, token });
    })(req, res, next);
});

// Registrazione Locale 
router.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Utente già registrato' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ 
            firstName, 
            lastName, 
            email, 
            password: hashedPassword 
        });
        await newUser.save();

        // Invia email di benvenuto
        await sendWelcomeEmail(newUser);

        const userToSend = {
            _id: newUser._id,
            email: newUser.email,
            role: newUser.role,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            profileImage: newUser.profileImage
        };

        const token = generateToken(newUser);
        res.status(201).json({ user: userToSend, token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint per ottenere le informazioni dell'utente corrente
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Token non fornito' });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'Utente non trovato' });
        }
        
        res.json({ user });
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token non valido o scaduto' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Login Google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', passport.authenticate('google', { failureRedirect: 'http://localhost:3000/login' }), (req, res) => {
    const token = generateToken(req.user);
    res.redirect(`http://localhost:3000/login?token=${token}`);
});

// Endpoint per verificare lo stato dell'autenticazione
router.get('/check', (req, res) => {
    res.json({ user: req.user });
});

module.exports = { router, auth }; 