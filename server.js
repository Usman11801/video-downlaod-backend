const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors({
  origin: '*', // Be more specific in production
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Route to handle video preview
app.post('/api/preview', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Add quotes around URL to handle special characters
  const command = `yt-dlp --dump-json "${url}"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing yt-dlp: ${error.message}`);
      console.error(`stderr: ${stderr}`);
      return res.status(500).json({ 
        error: 'Failed to fetch video info',
        details: error.message,
        stderr: stderr
      });
    }

    if (stderr) {
      console.error(`stderr: ${stderr}`);
    }

    try {
      const videoInfo = JSON.parse(stdout);
      res.json({
        title: videoInfo.title,
        thumbnail: videoInfo.thumbnail,
        description: videoInfo.description
      });
    } catch (err) {
      console.error('Error parsing video info:', err);
      console.error('Raw stdout:', stdout);
      res.status(500).json({ 
        error: 'Failed to parse video info',
        details: err.message,
        stdout: stdout
      });
    }
  });
});

// Route to handle video download
app.post('/api/download', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // Instead of downloading to filesystem, get direct video URL
    const command = `yt-dlp -f "best[ext=mp4]/best" -g "${url}"`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        return res.status(500).json({ error: 'Failed to get video URL' });
      }

      // Return the direct video URL
      res.json({ 
        videoUrl: stdout.trim(),
        title: url.split('/').pop() || 'video'
      });
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to process video' });
  }
});

// Export the express api
module.exports = app;
