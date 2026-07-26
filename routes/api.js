/**
 * Core game API routes.
 *
 * Endpoints for browsing the dungeon tree, making choices that trigger scene
 * generation, and managing save progress & user settings.
 *
 * All routes are mounted under `/api`.
 *
 * @module routes/api
 */

const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { generateAndValidateScene } = require('../services/llm');

/**
 * Strip the `plan` field from option objects before sending to the client.
 * Plans are internal LLM instructions – they should not be visible to players.
 * @param {Array<{ plan: string, [key: string]: any }>} options
 * @returns {Array<Omit<object, 'plan'>>} Options without the plan field.
 */
function stripPlans(options) {
  return options.map(({ plan, ...rest }) => rest);
}

/**
 * GET /api/scenes/root
 * Returns the root scene (the dungeon entrance) and its options.
 */
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

/**
 * GET /api/scenes/:id
 * Returns a specific scene by ID and its options.
 */
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

/**
 * POST /api/scenes/:sceneId/options/:optionId/choose
 * The player chooses an option.
 * - If the option already has a target scene, return it immediately.
 * - Otherwise, generate a new scene via the LLM, store it, and return it.
 */
router.post('/scenes/:sceneId/options/:optionId/choose', async (req, res) => {
  try {
    const optionId = parseInt(req.params.optionId, 10);
    const option = db.getOption(optionId);

    if (!option || option.scene_id !== parseInt(req.params.sceneId, 10)) {
      return res.status(404).json({ error: 'Option not found' });
    }

    /** If the option already points to an existing scene, serve it directly. */
    if (option.target_scene_id) {
      const scene = db.getScene(option.target_scene_id);
      const options = stripPlans(db.getOptions(scene.id));
      return res.json({ scene, options });
    }

    /** Build the adventure history chain for the LLM prompt. */
    const ancestorChain = db.getAncestorChain(option.scene_id);
    const historySteps = ancestorChain.map(s => ({
      option: s.option_chosen,
      content: s.content,
    }));

    /** Generate and validate a new scene via the LLM. */
    const { scene: sceneText, options: optionsData } = await generateAndValidateScene(
      historySteps,
      option.plan
    );

    /** Calculate depth from the parent chain. */
    const depth = ancestorChain[ancestorChain.length - 1].depth + 1;
    /** Persist the new scene and its options to the database. */
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

/**
 * GET /api/saves/current
 * Returns the last saved scene ID for the authenticated user, or null.
 */
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

/**
 * POST /api/saves
 * Saves or updates the player's current scene position. Requires auth.
 */
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

/**
 * DELETE /api/saves
 * Clears the player's saved progress. Requires auth.
 */
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

/**
 * GET /api/settings
 * Returns the user's display settings (font size, text speed).
 * Falls back to defaults for unauthenticated visitors.
 */
router.get('/settings', (req, res) => {
  try {
    if (!req.user) return res.json({ fontSize: null, textSpeed: null });
    const settings = db.getUserSettings(req.user.id);
    res.json(settings || { fontSize: '16', textSpeed: 15 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

/**
 * PUT /api/settings
 * Saves the user's display settings. Requires auth.
 */
router.put('/settings', (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Login required' });
    const { fontSize, textSpeed } = req.body;
    const fs = String(fontSize || '16');
    const ts = textSpeed !== undefined && textSpeed !== null ? parseInt(String(textSpeed), 10) : 15;
    db.saveUserSettings(req.user.id, fs, ts);
    res.json({ saved: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

module.exports = router;
