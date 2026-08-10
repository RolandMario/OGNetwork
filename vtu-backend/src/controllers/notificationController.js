'use strict';

// src/controllers/notificationController.js

const notificationService = require('../services/notificationService');

/**
 * @desc    Register device push token for current user
 * @route   POST /api/v1/user/notifications/register
 * @access  Private
 */
exports.registerToken = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        status: 'fail',
        message: 'Push token is required.',
      });
    }

    notificationService.registerDeviceToken(req.user.id, token);

    res.status(200).json({
      status: 'success',
      message: 'Device registered for push notifications.',
    });
  } catch (error) {
    console.error('[Notification] registerToken error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Unregister device push token
 * @route   POST /api/v1/user/notifications/unregister
 * @access  Private
 */
exports.unregisterToken = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        status: 'fail',
        message: 'Push token is required.',
      });
    }

    notificationService.unregisterDeviceToken(req.user.id, token);

    res.status(200).json({
      status: 'success',
      message: 'Device unregistered from push notifications.',
    });
  } catch (error) {
    console.error('[Notification] unregisterToken error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Send test notification to current user
 * @route   POST /api/v1/user/notifications/test
 * @access  Private
 */
exports.sendTestNotification = async (req, res) => {
  try {
    const result = await notificationService.sendPushNotification(req.user.id, {
      title: '🔔 Test Notification',
      body: 'This is a test notification from OGNetwork. Push notifications are working!',
      data: { type: 'test' },
    });

    res.status(200).json({
      status: 'success',
      message: result.sent ? 'Test notification sent.' : 'No device registered.',
      data: result,
    });
  } catch (error) {
    console.error('[Notification] sendTest error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ---------------------------------------------------------------------------
// In-app notification inbox
// ---------------------------------------------------------------------------

/**
 * @desc    Get current user's notifications (newest first)
 * @route   GET /api/v1/user/notifications?page=1&limit=20
 * @access  Private
 */
exports.getMyNotifications = async (req, res) => {
  try {
    const Notification = req.models.Notification;
    const { page = 1, limit = 20 } = req.query;

    if (!Notification) {
      return res.status(500).json({ status: 'error', message: 'Notification model not available.' });
    }

    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * Number(limit))
      .limit(Math.min(Number(limit), 100))
      .lean();

    const [total, unread] = await Promise.all([
      Notification.countDocuments({ user: req.user.id }),
      Notification.countDocuments({ user: req.user.id, readAt: null }),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        notifications,
        total,
        unread,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)) || 1,
      },
    });
  } catch (error) {
    console.error('[Notification] getMyNotifications error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Get unread notification count (drives the bell badge)
 * @route   GET /api/v1/user/notifications/unread-count
 * @access  Private
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const Notification = req.models.Notification;

    if (!Notification) {
      return res.status(500).json({ status: 'error', message: 'Notification model not available.' });
    }

    const count = await Notification.countDocuments({ user: req.user.id, readAt: null });

    res.status(200).json({
      status: 'success',
      data: { count },
    });
  } catch (error) {
    console.error('[Notification] getUnreadCount error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Mark a single notification as read (owner only)
 * @route   PATCH /api/v1/user/notifications/:id/read
 * @access  Private
 */
exports.markNotificationRead = async (req, res) => {
  try {
    const Notification = req.models.Notification;
    const { id } = req.params;

    if (!Notification) {
      return res.status(500).json({ status: 'error', message: 'Notification model not available.' });
    }

    const result = await Notification.updateOne(
      { _id: id, user: req.user.id, readAt: null },
      { $set: { readAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ status: 'fail', message: 'Notification not found.' });
    }

    res.status(200).json({
      status: 'success',
      message: 'Notification marked as read.',
    });
  } catch (error) {
    console.error('[Notification] markNotificationRead error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * @desc    Mark ALL notifications as read for the current user
 * @route   PATCH /api/v1/user/notifications/read-all
 * @access  Private
 */
exports.markAllRead = async (req, res) => {
  try {
    const Notification = req.models.Notification;

    if (!Notification) {
      return res.status(500).json({ status: 'error', message: 'Notification model not available.' });
    }

    const result = await Notification.updateMany(
      { user: req.user.id, readAt: null },
      { $set: { readAt: new Date() } }
    );

    res.status(200).json({
      status: 'success',
      message: 'All notifications marked as read.',
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error) {
    console.error('[Notification] markAllRead error:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};