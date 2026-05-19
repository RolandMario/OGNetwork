// src/services/userService.js
// Assume tenantConnection is stored on the request object by middleware

/**
 * @desc Finds a user by ID in the current tenant's database.
 * @param {object} tenantConnection - The Mongoose connection instance for the current tenant.
 * @param {string} userId - The ID of the user to find.
 */
exports.findUserById = async (tenantConnection, userId) => {
    // Check if the model is available on the connection
    const User = tenantConnection.models.User;
    if (!User) {
        throw new Error("User model not found on tenant connection.");
    }
    
    // Find the user
    return await User.findById(userId).lean();
};