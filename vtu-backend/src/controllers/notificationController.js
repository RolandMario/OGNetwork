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