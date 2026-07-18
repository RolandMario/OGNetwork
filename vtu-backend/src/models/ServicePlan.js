'use strict';

// src/models/ServicePlan.js

const mongoose = require('mongoose');

const servicePlanSchema = new mongoose.Schema(
  {
    // Service type: 'airtime', 'data', 'cable', 'electricity'
    service: {
      type: String,
      enum: ['airtime', 'data', 'cable', 'electricity'],
      required: true,
      index: true,
    },

    // Provider identifier: 'mtn_gifting_data', 'dstv', 'aba-electric', etc.
    provider: {
      type: String,
      required: true,
      index: true,
    },

    // Plan code from provider: 'M1GBS', 'compact', 'aba-electric', etc.
    planCode: {
      type: String,
      required: true,
      index: true,
    },

    // Display name for users: 'MTN 1GB Data', 'DStv Compact', 'Aba Electric'
    planName: {
      type: String,
      required: true,
    },

    // Description or label
    description: String,

    // Price from provider (in Naira)
    providerPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    // Your reseller price shown to users (in Naira)
    // This is what users pay
    ourPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    // Metadata specific to service type
    // For electricity: { min_amount, max_amount, type: 'prepaid' }
    // For cable: { validity, description }
    // For data: { size, validity }
    metadata: mongoose.Schema.Types.Mixed,

    // Track if this plan is active
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Last synced from provider
    lastSyncedAt: {
      type: Date,
      default: null,
    },

    // Raw data from Peyflex for debugging
    _providerData: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
    collection: 'serviceplans',
  }
);

// Compound index for quick lookups: service + provider + planCode
servicePlanSchema.index({ service: 1, provider: 1, planCode: 1 }, { unique: true });

// Indexes for faster queries
servicePlanSchema.index({ service: 1, isActive: 1 });
servicePlanSchema.index({ provider: 1, isActive: 1 });

module.exports = {
  schema:    servicePlanSchema,
  modelName: 'ServicePlan',
};