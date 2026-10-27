const mongoose = require('mongoose');

// A comment is either a plain thread reply or a decision (approve / request revision).
const commentSchema = new mongoose.Schema(
  {
    proof: { type: mongoose.Schema.Types.ObjectId, ref: 'Proof', required: true, index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, enum: ['designer', 'client'], required: true },
    kind: { type: String, enum: ['comment', 'approved', 'revision'], default: 'comment' },
    body: { type: String, trim: true, maxlength: 2000, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Comment', commentSchema);
