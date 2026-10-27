const mongoose = require('mongoose');
const crypto = require('crypto');

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    designer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    clientName: { type: String, trim: true, maxlength: 80, default: '' },
    clientEmail: { type: String, trim: true, lowercase: true, default: '' },
    inviteToken: {
      type: String,
      default: () => crypto.randomBytes(18).toString('hex'),
      unique: true,
      index: true
    },
    status: { type: String, enum: ['active', 'archived'], default: 'active' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);
