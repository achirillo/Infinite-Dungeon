const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { generateAndValidateScene } = require('../services/llm');

router.get('/scenes/root', (_req, res) => {
  try {
    const scene = db.getRootScene();
    if (!scene) {
      return res.status(404).json({ error: 'Root scene not found' });
    }
    const options = db.getOptions(scene.id);
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
    const options = db.getOptions(scene.id);
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
      const options = db.getOptions(scene.id);
      return res.json({ scene, options });
    }

    const ancestorChain = db.getAncestorChain(option.scene_id);
    const context = ancestorChain.map(s => ({
      option: s.option_chosen,
      content: s.content,
    }));

    const { scene: sceneText, options: optionTexts } = await generateAndValidateScene(context);

    const depth = ancestorChain[ancestorChain.length - 1].depth + 1;
    const newSceneId = db.insertScene(
      ancestorChain[ancestorChain.length - 1].id,
      option.option_text,
      sceneText,
      depth
    );

    db.insertOptions(newSceneId, optionTexts);
    db.setOptionTarget(option.id, newSceneId);

    const savedScene = db.getScene(newSceneId);
    const savedOptions = db.getOptions(newSceneId);

    res.json({ scene: savedScene, options: savedOptions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate next scene' });
  }
});

module.exports = router;
