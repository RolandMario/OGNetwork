'use strict';

// src/models/Notification.js
// In-app notification inbox messages.
//
// One document is created per recipient (fan-out) when an admin broadcasts a
// message. `broadId` groups every copy of the same broadcast together so the
// admin dashboard can show one row per broadcast with a recipient count.

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    // Recipient (tenant-scoped User)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Random id shared by every copy of the same broadcast
    broadId: {
      type: String,
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    body: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ['announcement', 'transaction', 'promo', 'system'],
      default: 'announcement',
    },

    // Who the broadcast targeted ('all' = every active user)
    audience: {
      type: String,
      enum: ['all', 'user'],
      default: 'all',
    },

    // When the user opened/read it — null means unread
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'notifications',
  }
);

// Fast per-user inbox + unread-count queries
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });

module.exports = {
  schema: notificationSchema,
  modelName: 'Notification',
};