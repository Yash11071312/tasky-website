const express = require('express');
const {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
  getTaskStats,
  getRecentActivity,
} = require('../controllers/taskController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/stats', protect, getTaskStats);
router.get('/activity', protect, getRecentActivity);
router.route('/').get(protect, getTasks).post(protect, createTask);
router.route('/:id').get(protect, getTaskById).put(protect, updateTask).delete(protect, deleteTask);

module.exports = router;
