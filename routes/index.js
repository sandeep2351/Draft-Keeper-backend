
const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const draftRoutes = require('./draftRoutes');

// Apply routes
router.use('/auth', authRoutes);
router.use('/drafts', draftRoutes);

// Test route
router.get('/status', (req, res) => {
  res.json({ status: 'API is running' });
});

module.exports = router;
