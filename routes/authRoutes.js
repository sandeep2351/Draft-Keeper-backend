
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  updateUserData,
  getCurrentUser,
  logout
} = require('../controllers/authController');

// New routes for Firebase auth
router.post('/update-user', protect, updateUserData);
router.get('/user', protect, getCurrentUser);
router.post('/logout', protect, logout);

module.exports = router;
