
const asyncHandler = require('express-async-handler');
const admin = require('firebase-admin');
const db = require('../db');

const protect = asyncHandler(async (req, res, next) => {
  let token;
  
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];
      
      // Verify Firebase token
      const decodedToken = await admin.auth().verifyIdToken(token);
      const firebaseUid = decodedToken.uid;
      
      // Get user from database
      const result = await db.query(
        'SELECT id, firebase_uid, name, email, picture FROM users WHERE firebase_uid = $1', 
        [firebaseUid]
      );
      
      if (result.rows.length === 0) {
        // User exists in Firebase but not in our database yet
        // This can happen during first login
        // Allow the request to proceed, and user will be created in updateUserData route
        req.user = {
          firebaseUid,
          email: decodedToken.email || null,
          name: decodedToken.name || null
        };
      } else {
        req.user = result.rows[0];
      }
      
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(401);
      throw new Error('Not authorized, token failed');
    }
  } else if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }
});

module.exports = { protect };
