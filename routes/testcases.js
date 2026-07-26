const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

router.post('/sync', (req, res) => {
  const { problem_id, updated_at, test_cases } = req.body;
  
  if (!problem_id || !updated_at || !Array.isArray(test_cases)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const cacheDir = path.join(__dirname, '..', 'cache', 'problems', String(problem_id));
  fs.mkdirSync(cacheDir, { recursive: true });

  test_cases.forEach((tc, i) => {
    fs.writeFileSync(path.join(cacheDir, `${i}.in`), tc.input || '');
    fs.writeFileSync(path.join(cacheDir, `${i}.out`), tc.expected_output || '');
  });

  fs.writeFileSync(path.join(cacheDir, '.meta.json'), JSON.stringify({
    updated_at,
    count: test_cases.length
  }));

  res.json({ success: true, count: test_cases.length });
});

module.exports = router;
