// const Transaction = require('../models/Transaction');

/**
 * @desc    Get current user's transaction history with pagination and filtering
 * @route   GET /api/v1/user/transactions/my-history
 * @access  Private
 */
exports.getMyHistory = async (req, res) => {
    try {
        const userId = req.user._id; // Get ID from the logged-in user (set by protect middleware)

        // --- 1. Build Query & Pagination setup ---
        const Transaction = req.models.Transaction
        // Base query: Always filter by current user
        let queryObj = { user: userId };

        // Optional filtering via query parameters (e.g., ?status=SUCCESS&type=AIRTIME)
        if (req.query.status) {
            queryObj.status = req.query.status.toUpperCase();
        }
        if (req.query.type) {
            queryObj.type = req.query.type.toUpperCase();
        }

        // Pagination defaults
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20; // Default 20 items per page
        const skip = (page - 1) * limit;

        // --- 2. Execute Queries (Data and Count) ---

        // Fetch transactions grouped by date descending (newest first)
        const transactionsQuery = Transaction.find(queryObj)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            // We don't need to populate the user field, as they know who they are.
            .select('-__v'); // Exclude internal Mongoose version key

        const transactions = await transactionsQuery;

        // Get total count for frontend pagination UI
        const totalDocuments = await Transaction.countDocuments(queryObj);

        // --- 3. Data Formatting (Minor -> Major Unit Conversion) ---

        // The database stores Kobo. The frontend needs Naira.
        // We map over the results to create a formatted response.
        const formattedTransactions = transactions.map(tx => {
            // Convert Mongoose document to a plain JavaScript object
            const txObj = tx.toObject();

            // Add major unit fields for display
            txObj.amountMajor = (txObj.amount / 100).toFixed(2);

            // Handle balances if they exist (older records might not have them)
            if (txObj.previousBalance !== undefined) {
                txObj.previousBalanceMajor = (txObj.previousBalance / 100).toFixed(2);
            }
            if (txObj.newBalance !== undefined) {
                txObj.newBalanceMajor = (txObj.newBalance / 100).toFixed(2);
            }

            return txObj;
        });


        // --- 4. Send Response ---
        res.status(200).json({
            status: 'success',
            results: formattedTransactions.length,
            pagination: {
                totalDocuments,
                currentPage: page,
                totalPages: Math.ceil(totalDocuments / limit),
                limit
            },
            data: formattedTransactions
        });

    } catch (error) {
        console.error('Get My History Error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Unable to retrieve transaction history currently.'
        });
    }
};