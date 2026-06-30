const Task = require('../models/Task');

const PRIORITIES = ['High', 'Medium', 'Low'];
const SORTS = ['date', 'priority', 'completed', 'new'];

const sanitizeText = value => String(value || '').trim().replace(/[<>]/g, '');

const parseDueDate = value => {
  if (!value) return undefined;
  const dueDate = new Date(value);
  if (Number.isNaN(dueDate.getTime())) return null;
  return dueDate;
};

const validateTaskInput = body => {
  const title = sanitizeText(body.title || body.text);
  const description = sanitizeText(body.description);
  const category = sanitizeText(body.category || body.cat || 'Personal');
  const priority = sanitizeText(body.priority || 'Medium');
  const dueDate = parseDueDate(body.dueDate || body.date);

  if (!title) return { error: 'Task text is required' };
  if (!PRIORITIES.includes(priority)) return { error: 'Priority must be High, Medium, or Low' };
  if (dueDate === null) return { error: 'Due date must be a valid date' };

  return { data: { title, description, category, priority, dueDate } };
};

const formatTask = task => ({
  _id: task._id,
  id: task._id,
  text: task.title,
  title: task.title,
  description: task.description,
  priority: task.priority,
  category: task.category,
  cat: task.category,
  date: task.dueDate ? task.dueDate.toISOString().split('T')[0] : '',
  dueDate: task.dueDate,
  done: task.completed,
  completed: task.completed,
  completedAt: task.completedAt,
  at: task.createdAt,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});

const createTask = async (req, res) => {
  try {
    const { data, error } = validateTaskInput(req.body);
    if (error) return res.status(400).json({ message: error });

    const task = await Task.create({
      user: req.user._id,
      ...data,
      completed: Boolean(req.body.completed || req.body.done),
      completedAt: req.body.completed || req.body.done ? new Date() : undefined,
    });

    res.status(201).json(formatTask(task));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTasks = async (req, res) => {
  try {
    const search = sanitizeText(req.query.search);
    const sort = SORTS.includes(req.query.sort) ? req.query.sort : 'new';
    const completed = req.query.completed;

    const query = { user: req.user._id };
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }
    if (completed === 'true') query.completed = true;
    if (completed === 'false') query.completed = false;

    const sortMap = {
      date: { dueDate: 1, createdAt: -1 },
      priority: { priority: 1, createdAt: -1 },
      completed: { completed: 1, createdAt: -1 },
      new: { createdAt: -1 },
    };

    const tasks = await Task.find(query).sort(sortMap[sort]);
    res.json(tasks.map(formatTask));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTaskById = async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, user: req.user._id });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json(formatTask(task));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateTask = async (req, res) => {
  try {
    const currentTask = await Task.findOne({ _id: req.params.id, user: req.user._id });
    if (!currentTask) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const update = {};
    if ('title' in req.body || 'text' in req.body) {
      const title = sanitizeText(req.body.title || req.body.text);
      if (!title) return res.status(400).json({ message: 'Task text is required' });
      update.title = title;
    }
    if ('description' in req.body) update.description = sanitizeText(req.body.description);
    if ('category' in req.body || 'cat' in req.body) update.category = sanitizeText(req.body.category || req.body.cat || 'Personal');
    if ('priority' in req.body) {
      const priority = sanitizeText(req.body.priority);
      if (!PRIORITIES.includes(priority)) return res.status(400).json({ message: 'Priority must be High, Medium, or Low' });
      update.priority = priority;
    }
    if ('dueDate' in req.body || 'date' in req.body) {
      const dueDate = parseDueDate(req.body.dueDate || req.body.date);
      if (dueDate === null) return res.status(400).json({ message: 'Due date must be a valid date' });
      update.dueDate = dueDate;
    }
    if ('completed' in req.body || 'done' in req.body) {
      const completed = Boolean(req.body.completed ?? req.body.done);
      update.completed = completed;
      update.completedAt = completed ? new Date() : undefined;
    }

    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      update,
      { new: true, runValidators: true }
    );

    res.json(formatTask(task));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteTask = async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, user: req.user._id });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTaskStats = async (req, res) => {
  try {
    const [total, completed] = await Promise.all([
      Task.countDocuments({ user: req.user._id }),
      Task.countDocuments({ user: req.user._id, completed: true }),
    ]);

    res.json({
      total,
      completed,
      pending: total - completed,
      completionPercentage: total ? Math.round((completed / total) * 100) : 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getRecentActivity = async (req, res) => {
  try {
    const tasks = await Task.find({ user: req.user._id }).sort({ updatedAt: -1 }).limit(8);
    const activity = tasks.map(task => ({
      id: task._id,
      type: task.completed ? 'Task completed' : 'Task created',
      text: task.title,
      at: task.completedAt || task.createdAt,
    }));

    res.json(activity);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
  getTaskStats,
  getRecentActivity,
};
