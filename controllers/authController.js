
const asyncHandler = require('express-async-handler');
const db = require('../db');
const admin = require('firebase-admin');

// Initialize Firebase Admin
try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
} catch (error) {
  // App might already be initialized in development mode
  console.log('Firebase admin initialization error (may be already initialized):', error);
}

// Update user data from Firebase
const updateUserData = asyncHandler(async (req, res) => {
  const { id: firebaseUid, name, email, picture } = req.body;
  
  try {
    // Check if user already exists
    let result = await db.query(
      'SELECT * FROM users WHERE firebase_uid = $1',
      [firebaseUid]
    );
    
    let userId;
    
    if (result.rows.length === 0) {
      // Create new user
      const newUser = await db.query(
        'INSERT INTO users (firebase_uid, name, email, picture) VALUES ($1, $2, $3, $4) RETURNING id',
        [firebaseUid, name, email, picture]
      );
      userId = newUser.rows[0].id;
    } else {
      // Update existing user
      userId = result.rows[0].id;
      await db.query(
        'UPDATE users SET name = $1, email = $2, picture = $3, updated_at = NOW() WHERE id = $4',
        [name, email, picture, userId]
      );
    }
    
    res.json({
      id: userId,
      name,
      email,
      picture
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500);
    throw new Error('Failed to update user: ' + error.message);
  }
});

// Get current user
const getCurrentUser = asyncHandler(async (req, res) => {
  try {
    const user = req.user;
    
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      picture: user.picture
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500);
    throw new Error('Failed to get user information: ' + error.message);
  }
});

// Logout
const logout = asyncHandler(async (req, res) => {
  try {
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500);
    throw new Error('Failed to log out: ' + error.message);
  }
});

module.exports = {
  updateUserData,
  getCurrentUser,
  logout
};
