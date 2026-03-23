require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Skill = require('../models/Skill');

const skills = [
  // Technical
  { skillName: 'JavaScript', category: 'Technical' },
  { skillName: 'Python', category: 'Technical' },
  { skillName: 'React', category: 'Technical' },
  { skillName: 'Node.js', category: 'Technical' },
  { skillName: 'MongoDB', category: 'Technical' },
  { skillName: 'SQL', category: 'Technical' },
  { skillName: 'Machine Learning', category: 'Technical' },
  { skillName: 'Data Analysis', category: 'Technical' },
  { skillName: 'Mobile Development', category: 'Technical' },
  { skillName: 'Cloud Computing', category: 'Technical' },
  { skillName: 'Cybersecurity', category: 'Technical' },
  { skillName: 'DevOps', category: 'Technical' },
  { skillName: 'UI/UX Design', category: 'Technical' },
  // Trade
  { skillName: 'Plumbing', category: 'Trade' },
  { skillName: 'Electrical Wiring', category: 'Trade' },
  { skillName: 'Carpentry', category: 'Trade' },
  { skillName: 'Welding', category: 'Trade' },
  { skillName: 'Masonry', category: 'Trade' },
  { skillName: 'Painting', category: 'Trade' },
  { skillName: 'Tailoring', category: 'Trade' },
  { skillName: 'Auto Mechanics', category: 'Trade' },
  { skillName: 'HVAC', category: 'Trade' },
  { skillName: 'Roofing', category: 'Trade' },
  // Creative
  { skillName: 'Graphic Design', category: 'Creative' },
  { skillName: 'Photography', category: 'Creative' },
  { skillName: 'Video Editing', category: 'Creative' },
  { skillName: 'Content Writing', category: 'Creative' },
  { skillName: 'Music Production', category: 'Creative' },
  { skillName: 'Animation', category: 'Creative' },
  // Business
  { skillName: 'Project Management', category: 'Business' },
  { skillName: 'Marketing', category: 'Business' },
  { skillName: 'Accounting', category: 'Business' },
  { skillName: 'Sales', category: 'Business' },
  { skillName: 'Human Resources', category: 'Business' },
  { skillName: 'Supply Chain', category: 'Business' },
  { skillName: 'Business Strategy', category: 'Business' },
  // Communication
  { skillName: 'Public Speaking', category: 'Communication' },
  { skillName: 'Negotiation', category: 'Communication' },
  { skillName: 'Teaching', category: 'Communication' },
  { skillName: 'Tutoring', category: 'Communication' },
  { skillName: 'Translation', category: 'Communication' },
  // Other
  { skillName: 'Cleaning', category: 'Other' },
  { skillName: 'Cooking', category: 'Other' },
  { skillName: 'Delivery', category: 'Other' },
  { skillName: 'Driving', category: 'Other' },
  { skillName: 'Gardening', category: 'Other' },
  { skillName: 'Childcare', category: 'Other' },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sboup_dev');
    console.log('Connected to MongoDB');

    // Seed skills
    await Skill.deleteMany({});
    await Skill.insertMany(skills);
    console.log(`Seeded ${skills.length} skills`);

    // Seed admin user
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      await User.create({
        email: 'admin@skillbridge.ug',
        passwordHash: 'Admin@12345',
        fullName: 'System Admin',
        role: 'admin',
        isEmailVerified: true,
        accountStatus: 'active',
      });
      console.log('Admin user created: admin@skillbridge.ug / Admin@12345');
    }

    console.log('Seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seed();
