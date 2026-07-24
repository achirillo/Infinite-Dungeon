const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { generateAndValidateScene } = require('../services/llm');

function stripPlans(options) {
  return options.map(({ plan, ...rest }) => rest);
}

router.get('/scenes/root', (_req, res) => {
  try {
    const scene = db.getRootScene();
    if (!scene) {
      return res.status(404).json({ error: 'Root scene not found' });
    }
    const options = stripPlans(db.getOptions(scene.id));
    res.json({ scene, options });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load root scene' });
  }
});

router.get('/scenes/:id', (req, res) => {
  try {
    const scene = db.getScene(req.params.id);
    if (!scene) {
      return res.status(404).json({ error: 'Scene not found' });
    }
    const options = stripPlans(db.getOptions(scene.id));
    res.json({ scene, options });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load scene' });
  }
});

router.post('/scenes/:sceneId/options/:optionId/choose', async (req, res) => {
  try {
    const optionId = parseInt(req.params.optionId, 10);
    const option = db.getOption(optionId);

    if (!option || option.scene_id !== parseInt(req.params.sceneId, 10)) {
      return res.status(404).json({ error: 'Option not found' });
    }

    if (option.target_scene_id) {
      const scene = db.getScene(option.target_scene_id);
      const options = stripPlans(db.getOptions(scene.id));
      return res.json({ scene, options });
    }

    const ancestorChain = db.getAncestorChain(option.scene_id);
    const historySteps = ancestorChain.map(s => ({
      option: s.option_chosen,
      content: s.content,
    }));

    const { scene: sceneText, options: optionsData } = await generateAndValidateScene(
      historySteps,
      option.plan
    );

    const depth = ancestorChain[ancestorChain.length - 1].depth + 1;
    const newSceneId = db.insertScene(
      ancestorChain[ancestorChain.length - 1].id,
      option.option_text,
      sceneText,
      depth
    );

    db.insertOptions(newSceneId, optionsData);
    db.setOptionTarget(option.id, newSceneId);

    const savedScene = db.getScene(newSceneId);
    const savedOptions = stripPlans(db.getOptions(newSceneId));

    res.json({ scene: savedScene, options: savedOptions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate next scene' });
  }
});

router.get('/saves/current', (req, res) => {
  try {
    if (!req.user) return res.json({ sceneId: null });
    const sceneId = db.getSavedSceneId(req.user.id);
    res.json({ sceneId: sceneId || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load save' });
  }
});

router.post('/saves', (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Login required' });
    const { sceneId } = req.body;
    if (!sceneId) return res.status(400).json({ error: 'sceneId required' });
    db.saveProgress(req.user.id, sceneId);
    res.json({ saved: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

router.delete('/saves', (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Login required' });
    db.clearSave(req.user.id);
    res.json({ cleared: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to clear save' });
  }
});

module.exports = router;
