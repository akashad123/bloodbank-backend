const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, default: '' }
}, { _id: false });

const settingsSchema = new mongoose.Schema({
  contacts: {
    type: [contactSchema],
    default: [
      { name: 'Rahul Tacholi', phone: '9946709455', email: '' },
      { name: 'Shinantu', phone: '8086849291', email: '' },
      { name: 'Abinav', phone: '8606839418', email: '' }
    ]
  }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
