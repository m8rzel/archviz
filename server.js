require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

function getApiKey(req) {
  const auth = req.headers.authorization || '';
  const fromHeader = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return fromHeader || process.env.OPENAI_API_KEY || '';
}

// POST /api/analyze — send image to GPT-4o vision, get 3 DALL-E prompts
app.post('/api/analyze', async (req, res) => {
  const apiKey = getApiKey(req);
  if (!apiKey) return res.status(401).json({ error: 'Missing API key' });

  const { imageBase64, style, timeOfDay, season, environment, material, mood, detail } = req.body;

  const systemPrompt = `You are an expert architectural visualization prompt engineer.
Analyze the uploaded architectural drawing and generate exactly 3 different image-editing prompts.
These prompts will be used with gpt-image-1 to TRANSFORM the original drawing into a rendered visualization.
The model will receive the original drawing as input — so the prompts must instruct the model to preserve the exact structure, proportions, room layout, and architectural details while applying the visual style.

Parameters to incorporate:
- Render style: ${style}
- Time of day: ${timeOfDay}
- Season: ${season}
- Environment: ${environment}
- Material: ${material}
- Mood intensity: ${mood}/100 (0=neutral, 100=dramatic)
- Detail level: ${detail}/100 (0=minimal, 100=hyper-detailed)

Return ONLY valid JSON in this exact format (no markdown, no code fences):
{
  "detected": "Brief description of what you detected in the drawing",
  "prompt1": "First prompt — e.g. eye-level exterior view...",
  "prompt2": "Second prompt — different angle/perspective...",
  "prompt3": "Third prompt — yet another creative take..."
}

CRITICAL: Each prompt MUST start with "Transform this architectural drawing into..." and explicitly instruct the model to keep the exact same layout, dimensions, walls, openings, and proportions from the original drawing. Describe specific architectural elements you detect (number of rooms, window placements, roof shape, etc.) to reinforce structural fidelity. Vary camera angle, lighting, and composition across the 3 prompts. Each prompt should be 100-200 words.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this architectural drawing and generate 3 DALL-E 3 prompts based on the specified parameters.' },
              { type: 'image_url', image_url: { url: imageBase64 } },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.8,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || JSON.stringify(data),
      });
    }

    const content = data.choices?.[0]?.message?.content || '';

    // Try to parse JSON from the response (strip markdown fences if present)
    let parsed;
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({
        error: `Failed to parse GPT-4o response as JSON: ${content.slice(0, 500)}`,
      });
    }

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/render — call gpt-image-1 edit with original drawing + prompt
app.post('/api/render', async (req, res) => {
  const apiKey = getApiKey(req);
  if (!apiKey) return res.status(401).json({ error: 'Missing API key' });

  const { prompt, imageBase64 } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
  if (!imageBase64) return res.status(400).json({ error: 'Missing image' });

  try {
    // Extract raw base64 data and mime type from data URL
    const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Invalid base64 image format' });

    const mimeType = match[1];
    const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];
    const buffer = Buffer.from(match[2], 'base64');

    // Build multipart form data manually
    const FormData = (await import('node-fetch')).default.constructor;
    const { FormData: FormDataImpl } = await import('node-fetch');

    // Use built-in approach with Blob-like boundary
    const boundary = '----ArchVizBoundary' + Date.now();
    const fileName = `drawing.${ext}`;

    const parts = [];
    // image[] field
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`);
    parts.push(buffer);
    parts.push('\r\n');
    // prompt field
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}\r\n`);
    // model field
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\ngpt-image-1\r\n`);
    // size field
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n1536x1024\r\n`);
    // quality field
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="quality"\r\n\r\nhigh\r\n`);
    // n field
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="n"\r\n\r\n1\r\n`);
    // end
    parts.push(`--${boundary}--\r\n`);

    const bodyParts = parts.map(p => typeof p === 'string' ? Buffer.from(p) : p);
    const body = Buffer.concat(bodyParts);

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || JSON.stringify(data),
      });
    }

    // gpt-image-1 returns b64_json by default, or url
    const imageData = data.data?.[0];
    if (imageData?.b64_json) {
      res.json({
        url: `data:image/png;base64,${imageData.b64_json}`,
        revised_prompt: imageData.revised_prompt || null,
      });
    } else if (imageData?.url) {
      res.json({
        url: imageData.url,
        revised_prompt: imageData.revised_prompt || null,
      });
    } else {
      res.status(500).json({ error: 'No image data in response' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`ArchViz API server running on http://localhost:${PORT}`);
});
