const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    proof: { type: mongoose.Schema.Types.ObjectId, ref: 'Proof', default: null },
    actor: { type: String, required: true },
    type: {
      type: String,
      enum: [
        'project_created',
        'client_joined',
        'proof_uploaded',
        'proof_approved',
        'proof_revision',
        'comment_added',
        'proof_reuploaded'
      ],
      required: true
    },
    message: { type: String, required: true, maxlength: 400 }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('Activity', activitySchema);
