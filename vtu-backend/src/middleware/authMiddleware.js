const jwt = require('jsonwebtoken');
// const User = require('../models/User');

exports.protect = async (req, res, next) => {
  const User = req.models.User
  let token;
  // 1) Get token from header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) return res.status(401).json({ message: 'Not authorized to access this route' });

  try {
    // 2) Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // 3) Check if user still exists
    const currentUser = await User.findById(decoded.id);
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