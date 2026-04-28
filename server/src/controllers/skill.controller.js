const Skill = require('../models/Skill');
const { suggestSkills } = require('../services/skillSuggester.service');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

exports.getSkills = async (req, res) => {
  try {
    const { category, search } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (search) filter.skillName = { $regex: search, $options: 'i' };

    const skills = await Skill.find(filter).sort({ skillName: 1 });
    res.json({ skills });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch skills.' });
  }
};

exports.createSkill = async (req, res) => {
  try {
    const skill = await Skill.create(req.body);
    res.status(201).json({ skill });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: 'Skill already exists.' });
    res.status(500).json({ error: 'Failed to create skill.' });
  }
};

exports.updateSkill = async (req, res) => {
  try {
    const { skillName, category } = req.body;
    const update = {};
    if (skillName) update.skillName = skillName;
    if (category) update.category = category;

    const skill = await Skill.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found.' });
    }

    res.json({ skill });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: 'Skill with that name already exists.' });
    res.status(500).json({ error: 'Failed to update skill.' });
  }
};

exports.deleteSkill = async (req, res) => {
  try {
    const skill = await Skill.findByIdAndDelete(req.params.id);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found.' });
    }

    res.json({ message: 'Skill deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete skill.' });
  }
};

exports.suggestSkills = async (req, res) => {
  try {
    const { title = '', description = '' } = req.body || {};
    if (typeof title !== 'string' || typeof description !== 'string') {
      return res.status(400).json({ error: 'title and description must be strings.' });
    }
    const suggestions = await suggestSkills({ title, description });
    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to suggest skills.' });
  }
};

exports.createCustomSkill = async (req, res) => {
  try {
    const raw = (req.body?.name || req.body?.skillName || '').trim();
    if (!raw) return res.status(400).json({ error: 'Skill name is required.' });
    if (raw.length > 100) return res.status(400).json({ error: 'Skill name too long.' });

    const safe = new RegExp(`^${escapeRegex(raw)}$`, 'i');
    let skill = await Skill.findOne({ skillName: safe });
    if (!skill) {
      try {
        skill = await Skill.create({
          skillName: raw,
          category: 'Other',
          isCustom: true,
          source: 'employer',
        });
      } catch (err) {
        if (err.code === 11000) {
          skill = await Skill.findOne({ skillName: safe });
        } else {
          throw err;
        }
      }
    }
    res.status(201).json({ skill });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add custom skill.' });
  }
};

exports.getSkillCategories = async (req, res) => {
  try {
    const categories = await Skill.distinct('category');
    res.json({ categories: categories.sort() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch skill categories.' });
  }
};
