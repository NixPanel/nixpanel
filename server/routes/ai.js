const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { authenticateToken } = require('../middleware/auth');
const { auditLog } = require('../db/database');
const { getAnthropicApiKey } = require('../utils/apiKey');

const router = express.Router();

const SYSTEM_PROMPT = `You are NixPanel AI, an expert Linux system administration assistant integrated into the NixPanel web administration panel.

You help administrators with:
- Diagnosing system issues and interpreting logs
- Explaining Linux commands and configurations
- Recommending best practices for security and performance
- Helping with package management, service configuration, and networking
- Writing and explaining bash scripts
- Interpreting system metrics and alerts

Guidelines:
- Be concise and practical. Provide commands that can be directly used.
- Always mention security implications of suggested commands.
- When suggesting commands that modify the system, clearly warn about potential impacts.
- Format commands in code blocks for clarity.
- If asked to do something dangerous or unethical, politely decline and explain why.
- You have context that you're running in a web-based Linux admin panel called NixPanel.`;

// POST /api/ai/chat
router.post('/chat', authenticateToken, async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message required' });
  }

  if (message.length > 4000) {
    return res.status(400).json({ error: 'Message too long (max 4000 characters)' });
  }

  const anthropicApiKey = getAnthropicApiKey();
  if (!anthropicApiKey) {
    return res.status(403).json({
      error: 'AI_KEY_REQUIRED',
      message: 'Please add your Anthropic API key in Settings → AI Configuration to use AI features.',
      setupUrl: '/settings#ai-config',
    });
  }

  const client = new Anthropic({ apiKey: anthropicApiKey });

  // Sanitize and validate history
  const messages = [
    ...history
      .slice(-10) // Keep last 10 messages for context
      .filter(m => m.role && m.content && typeof m.content === 'string')
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content.slice(0, 4000),
      })),
    { role: 'user', content: message },
  ];

  try {
    // Set up streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const stream = await client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages,
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const text = chunk.delta.text;
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

    auditLog(req.user.id, req.user.username, 'AI_CHAT', 'ai', {
      messageLength: message.length,
      responseLength: fullResponse.length,
    }, req.ip);

  } catch (err) {
    console.error('[AI] Chat error:', err);

    if (err.status === 401) {
      res.write(`data: ${JSON.stringify({ error: 'Invalid API key' })}\n\n`);
    } else if (err.status === 429) {
      res.write(`data: ${JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment.' })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ error: 'AI service error. Please try again.' })}\n\n`);
    }
    res.end();
  }
});

// POST /api/ai/analyze - Analyze a log or command output
router.post('/analyze', authenticateToken, async (req, res) => {
  const { content, type = 'log' } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Content required' });
  }

  if (content.length > 8000) {
    return res.status(400).json({ error: 'Content too long (max 8000 characters)' });
  }

  const anthropicApiKey = getAnthropicApiKey();
  if (!anthropicApiKey) {
    return res.status(403).json({
      error: 'AI_KEY_REQUIRED',
      message: 'Please add your Anthropic API key in Settings → AI Configuration to use AI features.',
      setupUrl: '/settings#ai-config',
    });
  }

  const client = new Anthropic({ apiKey: anthropicApiKey });

  const prompts = {
    log: `Analyze this Linux system log and provide: 1) Summary of what happened, 2) Any errors or warnings, 3) Recommended actions if any issues found.\n\nLog content:\n${content}`,
    command: `Explain what this Linux command/output means and any important observations:\n\n${content}`,
    config: `Review this configuration file and identify: 1) What it configures, 2) Any potential issues, 3) Security concerns:\n\n${content}`,
  };

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompts[type] || prompts.log }],
    });

    res.json({ analysis: response.content[0].text });
  } catch (err) {
    console.error('[AI] Analyze error:', err);
    res.status(500).json({ error: 'Analysis failed. Check AI configuration.' });
  }
});

module.exports = router;
