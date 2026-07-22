const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';
const MAX_RETRIES = 3;

let _client = null;

function getClient() {
  if (!_client) {
    const defaultHeaders = {};
    if (process.env.LLM_HTTP_REFERER) {
      defaultHeaders['HTTP-Referer'] = process.env.LLM_HTTP_REFERER;
    }
    if (process.env.LLM_APP_TITLE) {
      defaultHeaders['X-Title'] = process.env.LLM_APP_TITLE;
    }

    _client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      defaultHeaders: Object.keys(defaultHeaders).length > 0 ? defaultHeaders : undefined,
    });
  }
  return _client;
}

function loadPrompt(filename) {
  return fs.readFileSync(path.join(__dirname, '..', 'prompts', filename), 'utf-8');
}

async function generateScene(historySteps, chosenPlan) {
  const systemPrompt = loadPrompt('generation.txt');
  const formatPrompt = loadPrompt('format.txt');

  let userContent = 'The following is the history of this adventure so far. ';
  userContent += 'Generate the next scene and options for the player.\n\n';

  for (const step of historySteps) {
    if (step.option) {
      userContent += `Player chose: "${step.option}"\n`;
    }
    if (step.content) {
      userContent += `Scene: ${step.content}\n\n`;
    }
  }

  if (chosenPlan) {
    userContent += `\nPlan for the most recent choice: "${chosenPlan}"\nFollow this plan when writing the outcome.\n\n`;
  }

  userContent += formatPrompt;

  const response = await getClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.8,
  });

  return response.choices[0].message.content;
}

async function validateScene(sceneContent) {
  const systemPrompt = loadPrompt('validation.txt');
  const userContent = `Review the following generated scene and decide if it follows all guidelines.\n\n---\n${sceneContent}\n---\n\nRespond with ONLY the word "YES" or "NO".`;

  const response = await getClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0,
  });

  return response.choices[0].message.content.trim().toUpperCase() === 'YES';
}

function parseSceneResponse(rawResponse) {
  const cleaned = rawResponse.trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (!parsed.scene || typeof parsed.scene !== 'string' || parsed.scene.trim().length === 0) {
    throw new Error('Missing or empty scene text');
  }

  let rawOptions = parsed.options;
  if (!Array.isArray(rawOptions) || rawOptions.length < 2) {
    throw new Error('Options must be an array with at least 2 entries');
  }

  const options = rawOptions.map(opt => {
    if (typeof opt === 'string') {
      return { text: opt.trim(), plan: null };
    }
    return {
      text: (opt.text || '').trim(),
      plan: (opt.plan || null),
    };
  }).filter(o => o.text.length > 0);

  if (options.length < 2) {
    throw new Error('Not enough valid options after parsing');
  }

  return {
    scene: parsed.scene.trim(),
    options,
  };
}

async function generateAndValidateScene(historySteps, chosenPlan) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const rawResponse = await generateScene(historySteps, chosenPlan);

      const parsed = parseSceneResponse(rawResponse);
      const fullOutput = [
        `Scene: ${parsed.scene}`,
        ...parsed.options.map((o, i) => `${i + 1}. ${o.text}    [Plan: ${o.plan}]`),
      ].join('\n');

      const isValid = await validateScene(fullOutput);
      if (isValid) {
        return parsed;
      }

      console.log(`Validation failed on attempt ${attempt}/${MAX_RETRIES}`);
    } catch (err) {
      console.error(`Attempt ${attempt}/${MAX_RETRIES} error:`, err.message);
    }
  }

  throw new Error('Failed to generate a valid scene after maximum retries');
}

module.exports = { generateAndValidateScene };
