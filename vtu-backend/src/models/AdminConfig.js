'use strict';

// src/models/AdminConfig.js
// Stores admin-configurable settings like airtime profit percentage

const mongoose = require('mongoose');

const adminConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    collection: 'adminconfigs',
  }
);

module.exports = {
  schema: adminConfigSchema,
  modelName: 'AdminConfig',
};