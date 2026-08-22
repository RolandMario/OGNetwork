'use strict';

// src/controllers/transactionController.js

/**
 * @desc    Get transaction history for logged-in user
 * @route   GET /api/v1/user/transactions/my-history
 * @access  Private
 * @query   ?page=1&limit=20&type=AIRTIME&status=SUCCESS
 */
exports.getMyHistory = async (req, res) => {
  try {
    const Transaction = req.models.Transaction;

    // Pagination
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    // Optional filters
    const filter = { user: req.user.id };
    if (req.query.type)   filter.type   = req.query.type.toUpperCase();
    if (req.query.status) filter.status = req.query.status.toUpperCase();

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Transaction.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        transactions,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasMore:    page * limit < total,
        },
      },
    });

  } catch (error) {
    console.error('getMyHistory error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Get a single transaction for the logged-in user (receipt data)
 * @route   GET /api/v1/user/transactions/:id
 * @access  Private
 *
 * Used by the mobile app to render — and share — a receipt for any
 * transaction, including immediately after a successful purchase.
 */
exports.getTransactionById = async (req, res) => {
  try {
    const Transaction = req.models.Transaction;

    const transaction = await Transaction.findOne({
      _id:  req.params.id,
      user: req.user.id, // Users can only view their own receipts
    }).populate('user', 'fullName email phone');

    if (!transaction) {
      return res.status(404).json({
        status:  'fail',
        message: 'Transaction not found.',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { transaction },
    });

  } catch (error) {
    console.error('getTransactionById error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};