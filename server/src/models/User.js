const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['designer', 'client'], required: true },
    studioName: { type: String, trim: true, maxlength: 80, default: '' }
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    studioName: this.studioName || ''
  };
};

module.exports = mongoose.model('User', userSchema);
