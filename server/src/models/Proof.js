const mongoose = require('mongoose');

const proofSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    version: { type: Number, default: 1, min: 1 },
    file: {
      filename: { type: String, required: true },
      originalName: { type: String, required: true },
      mimetype: { type: String, required: true },
      size: { type: Number, required: true },
      // local: file sits in server/uploads. cloudinary: filename holds the Cloudinary public_id.
      storage: { type: String, enum: ['local', 'cloudinary'], default: 'local' },
      format: { type: String, default: '' }
    },
    // pending: waiting on client. revision: client asked for changes. approved: signed off.
    status: {
      type: String,
      enum: ['pending', 'approved', 'revision'],
      default: 'pending',
      index: true
    },
    decidedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Proof', proofSchema);
