require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Skill = require('../models/Skill');
const Company = require('../models/Company');
const Profile = require('../models/Profile');
const ProfileSkill = require('../models/ProfileSkill');
const Experience = require('../models/Experience');
const Education = require('../models/Education');
const Preference = require('../models/Preference');
const Opportunity = require('../models/Opportunity');

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

const companies = [
  {
    name: 'Kampala Tech Hub',
    registrationNumber: 'UG-2018-TECH-0012',
    industry: 'Technology',
    description: 'Innovation hub for software engineering talent.',
    website: 'https://kampalatech.example.ug',
    location: 'Kampala, Uganda',
    contactEmail: 'hr@kampalatech.example.ug',
    verificationStatus: 'verified',
    trustScore: 85,
  },
  {
    name: 'Pearl Construction Ltd',
    registrationNumber: 'UG-2012-CONST-0094',
    industry: 'Construction',
    description: 'Civil construction firm specialising in commercial builds.',
    location: 'Entebbe, Uganda',
    contactEmail: 'jobs@pearlconstruction.example.ug',
    verificationStatus: 'verified',
    trustScore: 78,
  },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sboup_dev');
    console.log('Connected to MongoDB');

    // Seed skills (upsert)
    for (const s of skills) {
      await Skill.updateOne({ skillName: s.skillName }, { $setOnInsert: s }, { upsert: true });
    }
    console.log(`Seeded ${skills.length} skills (upserted)`);

    // Seed companies
    const companyDocs = {};
    for (const c of companies) {
      const doc = await Company.findOneAndUpdate(
        { name: c.name },
        { $setOnInsert: c },
        { upsert: true, new: true }
      );
      companyDocs[c.name] = doc;
    }
    console.log(`Seeded ${companies.length} companies`);

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

    // Seed demo employer linked to Kampala Tech Hub
    const employerEmail = 'employer@demo.ug';
    let employer = await User.findOne({ email: employerEmail });
    if (!employer) {
      employer = await User.create({
        email: employerEmail,
        passwordHash: 'Employer@12345',
        fullName: 'Jane Employer',
        role: 'employer',
        isEmailVerified: true,
        accountStatus: 'active',
        companyId: companyDocs['Kampala Tech Hub']._id,
      });
      console.log(`Demo employer created: ${employerEmail} / Employer@12345`);
    }

    // Seed demo skilled worker
    const workerEmail = 'worker@demo.ug';
    let worker = await User.findOne({ email: workerEmail });
    if (!worker) {
      worker = await User.create({
        email: workerEmail,
        passwordHash: 'Worker@12345',
        fullName: 'John Worker',
        role: 'skilled_worker',
        isEmailVerified: true,
        accountStatus: 'active',
      });
      console.log(`Demo skilled worker created: ${workerEmail} / Worker@12345`);
    }

    // Worker profile + related documents
    let profile = await Profile.findOne({ userId: worker._id });
    if (!profile) {
      profile = await Profile.create({
        userId: worker._id,
        title: 'Frontend Developer',
        bio: 'Passionate React developer with 3+ years of experience.',
        location: 'Kampala, Uganda',
        visibility: 'public',
      });

      const jsSkill = await Skill.findOne({ skillName: 'JavaScript' });
      const reactSkill = await Skill.findOne({ skillName: 'React' });
      await ProfileSkill.insertMany([
        {
          profileId: profile._id,
          skillId: jsSkill._id,
          proficiencyLevel: 'advanced',
          classification: 'primary',
          numberOfYears: 3,
        },
        {
          profileId: profile._id,
          skillId: reactSkill._id,
          proficiencyLevel: 'advanced',
          classification: 'primary',
          numberOfYears: 2,
        },
      ]);

      await Experience.create({
        profileId: profile._id,
        jobTitle: 'Junior Frontend Developer',
        companyName: 'Acme Startup',
        category: 'Technology',
        startDate: new Date('2022-02-01'),
        endDate: new Date('2024-06-30'),
        description: 'Built internal dashboards using React and Tailwind.',
      });

      await Education.create({
        profileId: profile._id,
        institution: 'Makerere University',
        qualification: 'BSc Computer Science',
        fieldOfStudy: 'Computer Science',
        startYear: 2018,
        endYear: 2022,
      });

      await Preference.create({
        profileId: profile._id,
        personalityTraits: [
          { trait: 'conscientiousness', level: 'high' },
          { trait: 'openness', level: 'high' },
        ],
        workStyle: 'collaborative',
        remotePreference: 'high',
        learningWillingness: 'high',
      });

      console.log('Demo profile, skills, experience, education and preference seeded');
    }

    // Seed a sample published Opportunity for the demo employer
    const existingOpp = await Opportunity.findOne({ postedByUserId: employer._id });
    if (!existingOpp) {
      const jsSkill = await Skill.findOne({ skillName: 'JavaScript' });
      const reactSkill = await Skill.findOne({ skillName: 'React' });
      await Opportunity.create({
        companyId: companyDocs['Kampala Tech Hub']._id,
        postedByUserId: employer._id,
        title: 'React Frontend Engineer',
        category: 'formal',
        requiredSkills: [jsSkill._id, reactSkill._id],
        description: 'Build responsive dashboards for enterprise clients using React and Tailwind.',
        location: 'Kampala, Uganda',
        compensationRange: { min: 1500000, max: 2500000, currency: 'UGX', period: 'monthly' },
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        fraudRiskScore: 10,
        status: 'published',
        experienceLevel: 'mid',
        isRemote: false,
        applicationMethod: 'internal',
      });
      console.log('Demo opportunity seeded');
    }

    console.log('Seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seed();
