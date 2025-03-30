const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getDrafts,
  getDraft,
  createDraft,
  updateDraft,
  deleteDraft,
  saveToDrive,
  getDraftsFromDrive
} = require('../controllers/draftController');

router.use(protect);

router.get('/google-drive', getDraftsFromDrive); // ✅ Corrected position

router.route('/')
  .get(getDrafts)
  .post(createDraft);

router.route('/:id')
  .get(getDraft)
  .put(updateDraft)
  .delete(deleteDraft);

router.post('/:id/save-to-drive', saveToDrive);

module.exports = router;
