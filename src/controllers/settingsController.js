const Settings = require('../models/Settings');

exports.getContacts = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    res.json({ contacts: settings.contacts });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ message: 'Server error fetching contacts' });
  }
};

exports.updateContacts = async (req, res) => {
  try {
    const { contacts } = req.body;
    
    if (!Array.isArray(contacts)) {
      return res.status(400).json({ message: 'Contacts must be an array' });
    }

    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings({ contacts });
    } else {
      settings.contacts = contacts;
    }
    
    await settings.save();
    res.json({ contacts: settings.contacts });
  } catch (error) {
    console.error('Error updating contacts:', error);
    res.status(500).json({ message: 'Server error updating contacts' });
  }
};
