const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Route to handle video preview
app.post('/api/preview', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Command to get video info using yt-dlp
  const command = `yt-dlp --dump-json ${url}`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return res.status(500).json({ error: 'Failed to fetch video info' });
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
      res.status(500).json({ error: 'Failed to parse video info' });
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
