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
  { skillName: 'Communication Skills', category: 'Communication' },
  { skillName: 'Customer Service', category: 'Communication' },
  // Marketing / business extras (these names align with curated catalog keys
  // so the learning-engine fallback returns rich resources for them).
  { skillName: 'Digital Marketing', category: 'Business' },
  // Healthcare (referenced by the nurse worker + Equator Health opportunity)
  { skillName: 'Nursing', category: 'Other' },
  { skillName: 'Patient Care', category: 'Other' },
  { skillName: 'Medication Administration', category: 'Other' },
  { skillName: 'First Aid', category: 'Other' },
  { skillName: 'Laboratory Testing', category: 'Technical' },
  // Agriculture (referenced by the agronomist worker + Savannah Agri opportunity)
  { skillName: 'Crop Management', category: 'Other' },
  { skillName: 'Irrigation', category: 'Other' },
  { skillName: 'Farming', category: 'Other' },
  { skillName: 'Livestock Management', category: 'Other' },
  // Technical extras referenced by worker profiles
  { skillName: 'Docker', category: 'Technical' },
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
  // --- NEW COMPANIES ---
  {
    name: 'Nile Media Group',
    registrationNumber: 'UG-2016-MEDIA-0047',
    industry: 'Media & Creative',
    description: 'Full-service media production and digital marketing agency.',
    website: 'https://nilemedia.example.ug',
    location: 'Kampala, Uganda',
    contactEmail: 'talent@nilemedia.example.ug',
    verificationStatus: 'verified',
    trustScore: 82,
  },
  {
    name: 'Equator Health Services',
    registrationNumber: 'UG-2010-HLTH-0031',
    industry: 'Healthcare',
    description: 'Private hospital network operating across Central and Eastern Uganda.',
    website: 'https://equatorhealth.example.ug',
    location: 'Jinja, Uganda',
    contactEmail: 'recruitment@equatorhealth.example.ug',
    verificationStatus: 'verified',
    trustScore: 91,
  },
  {
    name: 'Savannah Agribusiness Ltd',
    registrationNumber: 'UG-2014-AGRI-0058',
    industry: 'Agriculture',
    description: 'Large-scale crop production, processing, and agri-logistics company.',
    location: 'Gulu, Uganda',
    contactEmail: 'hr@savannahagri.example.ug',
    verificationStatus: 'pending',
    trustScore: 65,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed a single skilled worker: user + profile + skills + experience + education + preference */
async function seedWorker({
  email,
  fullName,
  title,
  bio,
  location,
  skillNames,          // [{ name, level, classification, years }]
  experiences,         // [{ jobTitle, companyName, category, startDate, endDate, description }]
  educations,          // [{ institution, qualification, fieldOfStudy, startYear, endYear }]
  preference,          // { workStyle, remotePreference, learningWillingness, personalityTraits }
}) {
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      email,
      passwordHash: 'Worker@12345',
      fullName,
      role: 'skilled_worker',
      isEmailVerified: true,
      accountStatus: 'active',
    });
    console.log(`  Worker created: ${email}`);
  }

  const existingProfile = await Profile.findOne({ userId: user._id });
  if (existingProfile) return user;

  const profile = await Profile.create({
    userId: user._id,
    title,
    bio,
    location,
    visibility: 'public',
  });

  for (const s of skillNames) {
    const skillDoc = await Skill.findOne({ skillName: s.name });
    if (!skillDoc) continue;
    await ProfileSkill.create({
      profileId: profile._id,
      skillId: skillDoc._id,
      proficiencyLevel: s.level,
      classification: s.classification,
      numberOfYears: s.years,
    });
  }

  for (const exp of experiences) {
    await Experience.create({ profileId: profile._id, ...exp });
  }

  for (const edu of educations) {
    await Education.create({ profileId: profile._id, ...edu });
  }

  await Preference.create({ profileId: profile._id, ...preference });

  console.log(`  Profile seeded for ${email}`);
  return user;
}

/** Seed a single employer user linked to a company */
async function seedEmployer({ email, fullName, companyName, companyDocs }) {
  let employer = await User.findOne({ email });
  if (!employer) {
    employer = await User.create({
      email,
      passwordHash: 'Employer@12345',
      fullName,
      role: 'employer',
      isEmailVerified: true,
      accountStatus: 'active',
      companyId: companyDocs[companyName]._id,
    });
    console.log(`  Employer created: ${email}`);
  }
  return employer;
}

// ---------------------------------------------------------------------------
// Main seed
// ---------------------------------------------------------------------------

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sboup_dev');
    console.log('Connected to MongoDB');

    // ---- Skills ----
    for (const s of skills) {
      await Skill.updateOne({ skillName: s.skillName }, { $setOnInsert: s }, { upsert: true });
    }
    console.log(`Seeded ${skills.length} skills (upserted)`);

    // ---- Companies ----
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

    // ---- Admin ----
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

    // ====================================================================
    // EMPLOYERS
    // ====================================================================
    console.log('\n--- Seeding employers ---');

    // Original demo employer
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
      console.log(`  Demo employer created: ${employerEmail}`);
    }

    // Pearl Construction employer
    const pearlEmployer = await seedEmployer({
      email: 'employer@pearlconstruction.ug',
      fullName: 'Robert Ssali',
      companyName: 'Pearl Construction Ltd',
      companyDocs,
    });

    // Nile Media employer
    const nileEmployer = await seedEmployer({
      email: 'employer@nilemedia.ug',
      fullName: 'Amara Nakato',
      companyName: 'Nile Media Group',
      companyDocs,
    });

    // Equator Health employer
    const healthEmployer = await seedEmployer({
      email: 'employer@equatorhealth.ug',
      fullName: 'Dr. Samuel Opio',
      companyName: 'Equator Health Services',
      companyDocs,
    });

    // Savannah Agri employer
    const agriEmployer = await seedEmployer({
      email: 'employer@savannahagri.ug',
      fullName: 'Grace Atim',
      companyName: 'Savannah Agribusiness Ltd',
      companyDocs,
    });

    // ====================================================================
    // WORKERS
    // ====================================================================
    console.log('\n--- Seeding workers ---');

    // Original demo worker
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
      console.log(`  Demo skilled worker created: ${workerEmail}`);
    }

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
        { profileId: profile._id, skillId: jsSkill._id, proficiencyLevel: 'advanced', classification: 'primary', numberOfYears: 3 },
        { profileId: profile._id, skillId: reactSkill._id, proficiencyLevel: 'advanced', classification: 'primary', numberOfYears: 2 },
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

      console.log('  Original demo profile seeded');
    }

    // ---- Worker 2: Backend / Python developer ----
    await seedWorker({
      email: 'essah@demo.ug',
      fullName: 'Essah Kato',
      title: 'Backend Engineer',
      bio: 'Python and Node.js developer focused on scalable APIs and data pipelines. Open to remote and hybrid roles across East Africa.',
      location: 'Kampala, Uganda',
      skillNames: [
        { name: 'Python', level: 'advanced', classification: 'primary', years: 4 },
        { name: 'Node.js', level: 'intermediate', classification: 'primary', years: 2 },
        { name: 'MongoDB', level: 'intermediate', classification: 'secondary', years: 2 },
        { name: 'SQL', level: 'advanced', classification: 'secondary', years: 4 },
        { name: 'Docker', level: 'beginner', classification: 'secondary', years: 1 },
      ],
      experiences: [
        {
          jobTitle: 'Software Developer',
          companyName: 'DataBridge Uganda',
          category: 'Technology',
          startDate: new Date('2021-03-01'),
          endDate: new Date('2024-11-30'),
          description: 'Developed REST APIs in Python/Flask serving 50k+ daily requests. Built ETL pipelines feeding dashboards for telecom clients.',
        },
      ],
      educations: [
        {
          institution: 'Kyambogo University',
          qualification: 'BSc Information Technology',
          fieldOfStudy: 'Information Technology',
          startYear: 2017,
          endYear: 2021,
        },
      ],
      preference: {
        personalityTraits: [
          { trait: 'conscientiousness', level: 'high' },
          { trait: 'agreeableness', level: 'medium' },
        ],
        workStyle: 'independent',
        remotePreference: 'high',
        learningWillingness: 'high',
      },
    });

    // ---- Worker 3: Graphic designer / video editor ----
    await seedWorker({
      email: 'brian@demo.ug',
      fullName: 'Brian Tendo',
      title: 'Graphic Designer & Video Editor',
      bio: 'Creative professional with a strong eye for brand identity, social-media content, and short-form video. 5 years producing for NGOs and SMEs.',
      location: 'Kampala, Uganda',
      skillNames: [
        { name: 'Graphic Design', level: 'expert', classification: 'primary', years: 5 },
        { name: 'Video Editing', level: 'advanced', classification: 'primary', years: 4 },
        { name: 'Photography', level: 'intermediate', classification: 'secondary', years: 3 },
        { name: 'Content Writing', level: 'beginner', classification: 'secondary', years: 1 },
        { name: 'Animation', level: 'beginner', classification: 'secondary', years: 1 },
      ],
      experiences: [
        {
          jobTitle: 'Lead Designer',
          companyName: 'Crater Creative Studio',
          category: 'Creative',
          startDate: new Date('2020-06-01'),
          endDate: null,
          description: 'Lead visual identity projects for 20+ brands. Direct a team of two junior designers and manage client delivery.',
        },
        {
          jobTitle: 'Junior Graphic Designer',
          companyName: 'Nile Ad Agency',
          category: 'Creative',
          startDate: new Date('2019-01-01'),
          endDate: new Date('2020-05-31'),
          description: 'Created print and digital assets for advertising campaigns targeting East African markets.',
        },
      ],
      educations: [
        {
          institution: 'Makerere University Business School',
          qualification: 'Diploma in Visual Communication',
          fieldOfStudy: 'Visual Communication',
          startYear: 2016,
          endYear: 2018,
        },
      ],
      preference: {
        personalityTraits: [
          { trait: 'openness', level: 'high' },
          { trait: 'extraversion', level: 'medium' },
        ],
        workStyle: 'collaborative',
        remotePreference: 'medium',
        learningWillingness: 'high',
      },
    });

    // ---- Worker 4: Registered nurse ----
    await seedWorker({
      email: 'grace.akello@demo.ug',
      fullName: 'Grace Akello',
      title: 'Registered Nurse',
      bio: 'Dedicated nurse with 6 years of clinical experience in busy public and private hospitals. Proficient in patient triage, medication administration, and post-operative care.',
      location: 'Jinja, Uganda',
      skillNames: [
        { name: 'Nursing', level: 'advanced', classification: 'primary', years: 6 },
        { name: 'Patient Care', level: 'advanced', classification: 'primary', years: 6 },
        { name: 'Medication Administration', level: 'advanced', classification: 'primary', years: 5 },
        { name: 'First Aid', level: 'expert', classification: 'secondary', years: 6 },
        { name: 'Laboratory Testing', level: 'beginner', classification: 'secondary', years: 1 },
      ],
      experiences: [
        {
          jobTitle: 'Staff Nurse — Medical Ward',
          companyName: 'Jinja Regional Referral Hospital',
          category: 'Healthcare',
          startDate: new Date('2019-08-01'),
          endDate: new Date('2024-07-31'),
          description: 'Managed care for 20-bed medical ward. Led shift handovers, administered IV medications, and mentored student nurses.',
        },
        {
          jobTitle: 'Volunteer Nurse',
          companyName: 'Médecins Sans Frontières — Uganda',
          category: 'Healthcare',
          startDate: new Date('2018-03-01'),
          endDate: new Date('2019-06-30'),
          description: 'Provided emergency nursing support in mobile health clinics serving displaced communities in northern Uganda.',
        },
      ],
      educations: [
        {
          institution: 'Uganda Christian University',
          qualification: 'Bachelor of Nursing Science',
          fieldOfStudy: 'Nursing',
          startYear: 2014,
          endYear: 2018,
        },
      ],
      preference: {
        personalityTraits: [
          { trait: 'agreeableness', level: 'high' },
          { trait: 'conscientiousness', level: 'high' },
        ],
        workStyle: 'collaborative',
        remotePreference: 'low',
        learningWillingness: 'medium',
      },
    });

    // ---- Worker 5: Electrician (trade) ----
    await seedWorker({
      email: 'moses@demo.ug',
      fullName: 'Moses Waiswa',
      title: 'Certified Electrician',
      bio: 'Grade-1 licensed electrician with 8 years of hands-on experience in residential, commercial, and industrial installations across Kampala and Wakiso districts.',
      location: 'Wakiso, Uganda',
      skillNames: [
        { name: 'Electrical Wiring', level: 'expert', classification: 'primary', years: 8 },
        { name: 'HVAC', level: 'intermediate', classification: 'secondary', years: 3 },
        { name: 'Plumbing', level: 'beginner', classification: 'secondary', years: 2 },
        { name: 'Project Management', level: 'beginner', classification: 'secondary', years: 2 },
      ],
      experiences: [
        {
          jobTitle: 'Senior Electrician',
          companyName: 'Volt Masters Uganda',
          category: 'Trade',
          startDate: new Date('2020-01-01'),
          endDate: null,
          description: 'Supervise electrical installations for commercial fit-outs and industrial facilities. Ensure compliance with Uganda National Bureau of Standards (UNBS) wiring codes.',
        },
        {
          jobTitle: 'Electrician Apprentice → Journeyman',
          companyName: 'PowerLink Contractors',
          category: 'Trade',
          startDate: new Date('2016-04-01'),
          endDate: new Date('2019-12-31'),
          description: 'Progressed from apprentice to journeyman. Carried out low-voltage wiring, panel installations, and fault diagnosis on residential estates.',
        },
      ],
      educations: [
        {
          institution: 'Uganda Technical College — Kyema',
          qualification: 'National Certificate in Electrical Engineering',
          fieldOfStudy: 'Electrical Engineering',
          startYear: 2014,
          endYear: 2016,
        },
      ],
      preference: {
        personalityTraits: [
          { trait: 'conscientiousness', level: 'high' },
          { trait: 'neuroticism', level: 'low' },
        ],
        workStyle: 'independent',
        remotePreference: 'low',
        learningWillingness: 'medium',
      },
    });

    // ---- Worker 6: Agronomy / crop management ----
    await seedWorker({
      email: 'immaculate.aber@demo.ug',
      fullName: 'Immaculate Aber',
      title: 'Agricultural Extension Officer',
      bio: 'Experienced agronomist specialising in smallholder crop advisory, irrigation system design, and post-harvest management. Worked extensively with maize and sesame value chains in northern Uganda.',
      location: 'Wakiso, Uganda',
      skillNames: [
        { name: 'Crop Management', level: 'advanced', classification: 'primary', years: 5 },
        { name: 'Irrigation', level: 'intermediate', classification: 'primary', years: 3 },
        { name: 'Farming', level: 'advanced', classification: 'primary', years: 5 },
        { name: 'Livestock Management', level: 'beginner', classification: 'secondary', years: 1 },
        { name: 'Teaching', level: 'intermediate', classification: 'secondary', years: 4 },
      ],
      experiences: [
        {
          jobTitle: 'Field Extension Officer',
          companyName: 'Agroways Foundation Uganda',
          category: 'Agriculture',
          startDate: new Date('2020-02-01'),
          endDate: null,
          description: 'Provide technical advisory to 300+ smallholder farmers on input use, pest management, and market linkages. Lead seasonal farmer field schools for Acholi sub-region.',
        },
        {
          jobTitle: 'Junior Agronomist',
          companyName: 'National Agricultural Research Organisation (NARO)',
          category: 'Agriculture',
          startDate: new Date('2018-06-01'),
          endDate: new Date('2020-01-31'),
          description: 'Assisted in on-station and on-farm trials for drought-tolerant maize varieties. Compiled data for bi-annual research reports.',
        },
      ],
      educations: [
        {
          institution: 'Gulu University',
          qualification: 'BSc Agriculture',
          fieldOfStudy: 'Agronomy',
          startYear: 2014,
          endYear: 2018,
        },
      ],
      preference: {
        personalityTraits: [
          { trait: 'openness', level: 'high' },
          { trait: 'agreeableness', level: 'high' },
        ],
        workStyle: 'collaborative',
        remotePreference: 'low',
        learningWillingness: 'high',
      },
    });

    // ====================================================================
    // OPPORTUNITIES
    // ====================================================================
    console.log('\n--- Seeding opportunities ---');

    // Helper to avoid duplicate opportunities per employer
    const ensureOpportunity = async (filter, data) => {
      const exists = await Opportunity.findOne(filter);
      if (!exists) {
        await Opportunity.create(data);
        console.log(`  Opportunity created: "${data.title}"`);
      }
    };

    const [jsSkill, reactSkill, pySkill, nodeSkill, gfxSkill, vidSkill,
           nurseSkill, patientSkill, elecSkill, cropSkill, irrigSkill] = await Promise.all([
      Skill.findOne({ skillName: 'JavaScript' }),
      Skill.findOne({ skillName: 'React' }),
      Skill.findOne({ skillName: 'Python' }),
      Skill.findOne({ skillName: 'Node.js' }),
      Skill.findOne({ skillName: 'Graphic Design' }),
      Skill.findOne({ skillName: 'Video Editing' }),
      Skill.findOne({ skillName: 'Nursing' }),
      Skill.findOne({ skillName: 'Patient Care' }),
      Skill.findOne({ skillName: 'Electrical Wiring' }),
      Skill.findOne({ skillName: 'Crop Management' }),
      Skill.findOne({ skillName: 'Irrigation' }),
    ]);

    // Kampala Tech Hub — original opportunity
    await ensureOpportunity(
      { postedByUserId: employer._id },
      {
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
      }
    );

    // Kampala Tech Hub — second opportunity (Python / backend)
    await ensureOpportunity(
      { title: 'Python Backend Developer', postedByUserId: employer._id },
      {
        companyId: companyDocs['Kampala Tech Hub']._id,
        postedByUserId: employer._id,
        title: 'Python Backend Developer',
        category: 'formal',
        requiredSkills: [pySkill._id, nodeSkill._id],
        description: 'Design and maintain microservices powering our EdTech platform. Strong SQL and API design skills required.',
        location: 'Kampala, Uganda',
        compensationRange: { min: 2000000, max: 3500000, currency: 'UGX', period: 'monthly' },
        deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        fraudRiskScore: 8,
        status: 'published',
        experienceLevel: 'senior',
        isRemote: true,
        applicationMethod: 'internal',
      }
    );

    // Pearl Construction — site electrician
    await ensureOpportunity(
      { postedByUserId: pearlEmployer._id },
      {
        companyId: companyDocs['Pearl Construction Ltd']._id,
        postedByUserId: pearlEmployer._id,
        title: 'Site Electrician',
        category: 'formal',
        requiredSkills: [elecSkill._id],
        description: 'Oversee all electrical installations on our new commercial complex in Entebbe. Minimum Grade-2 licence required.',
        location: 'Entebbe, Uganda',
        compensationRange: { min: 800000, max: 1200000, currency: 'UGX', period: 'monthly' },
        deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
        fraudRiskScore: 12,
        status: 'published',
        experienceLevel: 'mid',
        isRemote: false,
        applicationMethod: 'external',
      }
    );

    // Nile Media — graphic designer
    await ensureOpportunity(
      { postedByUserId: nileEmployer._id },
      {
        companyId: companyDocs['Nile Media Group']._id,
        postedByUserId: nileEmployer._id,
        title: 'Graphic Designer & Content Creator',
        category: 'formal',
        requiredSkills: [gfxSkill._id, vidSkill._id],
        description: 'Produce visual content for social media, TV, and digital advertising campaigns. Proficiency in Adobe CC suite required.',
        location: 'Kampala, Uganda',
        compensationRange: { min: 900000, max: 1500000, currency: 'UGX', period: 'monthly' },
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        fraudRiskScore: 9,
        status: 'published',
        experienceLevel: 'mid',
        isRemote: false,
        applicationMethod: 'internal',
      }
    );

    // Equator Health — registered nurse
    await ensureOpportunity(
      { postedByUserId: healthEmployer._id },
      {
        companyId: companyDocs['Equator Health Services']._id,
        postedByUserId: healthEmployer._id,
        title: 'Registered Nurse — General Ward',
        category: 'formal',
        requiredSkills: [nurseSkill._id, patientSkill._id],
        description: 'Join our multidisciplinary team at Jinja branch. Minimum 2 years post-registration experience. BScN or Diploma in Nursing accepted.',
        location: 'Jinja, Uganda',
        compensationRange: { min: 1200000, max: 1800000, currency: 'UGX', period: 'monthly' },
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        fraudRiskScore: 5,
        status: 'published',
        experienceLevel: 'entry',
        isRemote: false,
        applicationMethod: 'external',
      }
    );

    // Savannah Agribusiness — field agronomist
    await ensureOpportunity(
      { postedByUserId: agriEmployer._id },
      {
        companyId: companyDocs['Savannah Agribusiness Ltd']._id,
        postedByUserId: agriEmployer._id,
        title: 'Field Agronomist',
        category: 'formal',
        requiredSkills: [cropSkill._id, irrigSkill._id],
        description: 'Support 500+ contracted out-grower farmers across Acholi sub-region. Monitor crop health, advise on inputs, and coordinate with our procurement team at harvest.',
        location: 'Gulu, Uganda',
        compensationRange: { min: 1000000, max: 1600000, currency: 'UGX', period: 'monthly' },
        deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        fraudRiskScore: 20,
        status: 'published',
        experienceLevel: 'mid',
        isRemote: false,
        applicationMethod: 'external',
      }
    );

    // ====================================================================
    // PARTIAL-MATCH OPPORTUNITIES (for demo worker JS+React+Mobile)
    // ====================================================================
    // The demo worker has JavaScript, React, and Mobile Development. The
    // opportunities below each share 2 of these skills but additionally
    // require 1-2 skills the worker lacks — producing recommendations with
    // matchScore high enough to clear the dashboard-fit bucket pre-filter
    // (>= 20 score) and aggregate to a 50-70% category mean, which makes
    // the "Close Your Skill Gaps" rail populate with real gap chips.
    // Missing-skill names deliberately align with curated catalog keys so
    // the auto-generated LearningPaths return non-empty resource lists.
    console.log('\n--- Seeding partial-match opportunities ---');

    const [tsAnaSkill, uxSkill, dmkSkill, mktSkill, csSkill, commSkill,
           pmSkill, gfxOnlySkill, cwSkill] = await Promise.all([
      Skill.findOne({ skillName: 'Data Analysis' }),
      Skill.findOne({ skillName: 'UI/UX Design' }),
      Skill.findOne({ skillName: 'Digital Marketing' }),
      Skill.findOne({ skillName: 'Marketing' }),
      Skill.findOne({ skillName: 'Customer Service' }),
      Skill.findOne({ skillName: 'Communication Skills' }),
      Skill.findOne({ skillName: 'Project Management' }),
      Skill.findOne({ skillName: 'Graphic Design' }),
      Skill.findOne({ skillName: 'Content Writing' }),
    ]);
    const mobileSkill = await Skill.findOne({ skillName: 'Mobile Development' });

    // 1. formal — UI/UX Engineer
    await ensureOpportunity(
      { title: 'UI/UX Engineer', postedByUserId: employer._id },
      {
        companyId: companyDocs['Kampala Tech Hub']._id,
        postedByUserId: employer._id,
        title: 'UI/UX Engineer',
        category: 'formal',
        requiredSkills: [jsSkill._id, reactSkill._id, uxSkill._id, tsAnaSkill._id],
        description: 'Own the design-to-implementation pipeline for our flagship product. Pair with PMs to wireframe, prototype in Figma, then ship in React. Strong eye for accessibility and data-driven design decisions.',
        location: 'Kampala, Uganda',
        compensationRange: { min: 1800000, max: 2800000, currency: 'UGX', period: 'monthly' },
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        fraudRiskScore: 8,
        status: 'published',
        experienceLevel: 'mid',
        isRemote: false,
        applicationMethod: 'internal',
      }
    );

    // 2. formal — Full Stack Developer (React + Python)
    await ensureOpportunity(
      { title: 'Full Stack Developer', postedByUserId: employer._id },
      {
        companyId: companyDocs['Kampala Tech Hub']._id,
        postedByUserId: employer._id,
        title: 'Full Stack Developer',
        category: 'formal',
        requiredSkills: [jsSkill._id, reactSkill._id, pySkill._id, tsAnaSkill._id],
        description: 'Build internal tools end-to-end: React frontend, Python (FastAPI) backend, light data-analysis dashboards on top of PostgreSQL.',
        location: 'Kampala, Uganda',
        compensationRange: { min: 2200000, max: 3500000, currency: 'UGX', period: 'monthly' },
        deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        fraudRiskScore: 10,
        status: 'published',
        experienceLevel: 'mid',
        isRemote: true,
        applicationMethod: 'internal',
      }
    );

    // 3. freelance — Mobile App Designer-Developer
    await ensureOpportunity(
      { title: 'Mobile App Designer-Developer', postedByUserId: nileEmployer._id },
      {
        companyId: companyDocs['Nile Media Group']._id,
        postedByUserId: nileEmployer._id,
        title: 'Mobile App Designer-Developer',
        category: 'freelance',
        requiredSkills: [mobileSkill._id, reactSkill._id, gfxOnlySkill._id, uxSkill._id],
        description: 'Design and ship a 2-month MVP mobile app for a regional NGO. Own both the visual design (Figma) and the React Native implementation.',
        location: 'Kampala, Uganda',
        compensationRange: { min: 800000, max: 1500000, currency: 'UGX', period: 'project' },
        deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
        fraudRiskScore: 14,
        status: 'published',
        experienceLevel: 'mid',
        isRemote: true,
        applicationMethod: 'internal',
      }
    );

    // 4. freelance — Marketing-Tech Builder
    await ensureOpportunity(
      { title: 'Marketing Landing Page Builder', postedByUserId: nileEmployer._id },
      {
        companyId: companyDocs['Nile Media Group']._id,
        postedByUserId: nileEmployer._id,
        title: 'Marketing Landing Page Builder',
        category: 'freelance',
        requiredSkills: [jsSkill._id, reactSkill._id, dmkSkill._id, cwSkill._id],
        description: 'Build and A/B-test high-converting landing pages for our client campaigns. Comfortable wearing both engineer and marketer hats.',
        location: 'Remote',
        compensationRange: { min: 300000, max: 800000, currency: 'UGX', period: 'project' },
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        fraudRiskScore: 18,
        status: 'published',
        experienceLevel: 'mid',
        isRemote: true,
        applicationMethod: 'internal',
      }
    );

    // 5. contract — Customer Portal Web Developer (3-month)
    await ensureOpportunity(
      { title: 'Customer Portal Web Developer', postedByUserId: healthEmployer._id },
      {
        companyId: companyDocs['Equator Health Services']._id,
        postedByUserId: healthEmployer._id,
        title: 'Customer Portal Web Developer',
        category: 'contract',
        requiredSkills: [jsSkill._id, reactSkill._id, csSkill._id, commSkill._id],
        description: '3-month contract to build the patient self-service portal. You will work directly with frontline customer-service staff and translate their needs into clean React UI.',
        location: 'Jinja, Uganda',
        compensationRange: { min: 1500000, max: 2200000, currency: 'UGX', period: 'monthly' },
        deadline: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000),
        fraudRiskScore: 11,
        status: 'published',
        experienceLevel: 'mid',
        isRemote: false,
        applicationMethod: 'internal',
      }
    );

    // 6. contract — Frontend + Analytics Contractor
    await ensureOpportunity(
      { title: 'Frontend + Analytics Contractor', postedByUserId: employer._id },
      {
        companyId: companyDocs['Kampala Tech Hub']._id,
        postedByUserId: employer._id,
        title: 'Frontend + Analytics Contractor',
        category: 'contract',
        requiredSkills: [jsSkill._id, reactSkill._id, tsAnaSkill._id, mktSkill._id],
        description: 'Build dashboards on top of our marketing-attribution data. Strong React + SQL + a marketer\'s instinct for the questions worth asking.',
        location: 'Remote',
        compensationRange: { min: 1700000, max: 2400000, currency: 'UGX', period: 'monthly' },
        deadline: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
        fraudRiskScore: 9,
        status: 'published',
        experienceLevel: 'mid',
        isRemote: true,
        applicationMethod: 'internal',
      }
    );

    // 7. apprenticeship — Junior Web Developer Trainee
    await ensureOpportunity(
      { title: 'Junior Web Developer Trainee', postedByUserId: employer._id },
      {
        companyId: companyDocs['Kampala Tech Hub']._id,
        postedByUserId: employer._id,
        title: 'Junior Web Developer Trainee',
        category: 'apprenticeship',
        requiredSkills: [jsSkill._id, reactSkill._id, pmSkill._id],
        description: '12-month apprenticeship pairing you with a senior engineer. You ship real features end-to-end with mentorship; you also pick up the project-management side of how feature work gets scoped.',
        location: 'Kampala, Uganda',
        compensationRange: { min: 600000, max: 900000, currency: 'UGX', period: 'monthly' },
        deadline: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000),
        fraudRiskScore: 5,
        status: 'published',
        experienceLevel: 'entry',
        isRemote: false,
        applicationMethod: 'internal',
      }
    );

    console.log('\nSeeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seed();