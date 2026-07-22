const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true }
}, { _id: false });

const settingsSchema = new mongoose.Schema({
  contacts: {
    type: [contactSchema],
    default: [
      { name: 'Rahul Tacholi', phone: '9946709455' },
      { name: 'Shinantu', phone: '8086849291' },
      { name: 'Abinav', phone: '8606839418' }
    ]
  }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
