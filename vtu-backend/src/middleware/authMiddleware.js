const jwt = require('jsonwebtoken');
// const User = require('../models/User');

exports.protect = async (req, res, next) => {

   console.log('[PROTECT] req.models:', req.models ? Object.keys(req.models) : 'UNDEFINED');

  // const User = req.models.User;
  const User = req.models.User
  let token;
  // 1) Get token from header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

 
  if (!token) return res.status(401).json({ message: 'Not authorized to access this route' });

  try {
    // 2) Verify token — JWT_SECRET must be set in environment
    if (!process.env.JWT_SECRET) {
      console.error('[PROTECT] CRITICAL: JWT_SECRET environment variable is not set!');
      return res.status(500).json({ message: 'Server configuration error.' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 3) Check if user still exists
    const currentUser = await User.findById(decoded.id);

    console.log('[PROTECT] decoded.id:', decoded.id);
// const currentUser = await User.findById(decoded.id);
console.log('[PROTECT] user found:', currentUser ? currentUser._id : 'NULL');
    if (!currentUser) return res.status(401).json({ message: 'The user belonging to this token no longer exists.' });
    
    // Grant access
    req.user = currentUser;
    next();
  } catch (error) {
     return res.status(401).json({ message: 'Invalid token' });
  }
};


// Admin only middleware
exports.restrictTo = (...roles) => {
    return (req, res, next) => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ message: 'You do not have permission to perform this action' });
      }
      next();
    };
};