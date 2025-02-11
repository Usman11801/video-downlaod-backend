const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 5001;

// Create downloads directory if it doesn't exist
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Add this function at the top after the imports
const isValidUrl = (url) => {
  const supportedDomains = ['instagram.com', 'tiktok.com'];
  try {
    const urlObj = new URL(url);
    return supportedDomains.some(domain => urlObj.hostname.includes(domain));
  } catch {
    return false;
  }
};

// Route to handle video previe
app.post('/api/preview', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (!isValidUrl(url)) {
    return res.status(400).json({ error: 'Only Instagram and TikTok URLs are supported' });
  }

  // Remove cookies from command since we don't need them anymore
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

// Route to handle video downloa
app.post('/api/download', (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (!isValidUrl(url)) {
    return res.status(400).json({ error: 'Only Instagram and TikTok URLs are supported' });
  }

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const outputPath = path.join(downloadsDir, `video-${Date.now()}.mp4`);
  
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  // Remove cookies from command since we don't need them anymore
  const command = `yt-dlp -f "best[ext=mp4]/best" -o "${outputPath}" "${url}" --newline --progress`;

  console.log('Starting download...');
  
  const downloadProcess = exec(command);

  downloadProcess.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
    // Look for percentage in the output
    const percentageMatch = data.match(/(\d+\.?\d*)%/);
    if (percentageMatch) {
      const progress = Math.round(parseFloat(percentageMatch[1]));
      res.write(`data: ${JSON.stringify({ progress })}\n\n`);
    }
  });

  downloadProcess.stderr.on('data', (data) => {
    console.log(`stderr: ${data}`);
  });

  downloadProcess.on('error', (error) => {
    console.error(`Error: ${error.message}`);
    res.write(`data: ${JSON.stringify({ error: 'Failed to download the video' })}\n\n`);
    res.end();
  });

  downloadProcess.on('close', async (code) => {
    console.log(`Download process exited with code ${code}`);
    
    if (code === 0 && fs.existsSync(outputPath)) {
      // Send a temporary file ID instead of the actual file
      const fileId = path.basename(outputPath);
      res.write(`data: ${JSON.stringify({
        completed: true,
        fileId: fileId
      })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Download failed' })}\n\n`);
    }
    res.end();
  });
});




// Add a new endpoint to serve the video fil
app.get('/api/download-file/:fileId', (req, res) => {
  const { fileId } = req.params;
  const filePath = path.join(downloadsDir, fileId);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(filePath, 'video.mp4', (err) => {
    if (err) {
      console.error('Error sending file:', err);
      return;
    }
    // Delete the file after sending
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) {
        console.error('Error deleting file:', unlinkErr);
      }
    });
  });
});




// Add new route for progress updates using Server-Sent Events (SSE)
app.get('/api/download-progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
});



// Welcome endpoint
app.get('/api/', (req, res) => {
  res.json({
    message: 'Welcome to the Video Downloader API',
    endpoints: {
      '/': 'Welcome message and API information',
      '/preview': 'POST - Get video information',
      '/download': 'POST - Download a video',
      '/download-file/:fileId': 'GET - Download a processed video file',
      '/download-progress': 'GET - Stream download progress updates'
    }
  });
});



// Start the server
app.listen(PORT,"0.0.0.0", () => {
  console.log(`Server running on 0.0.0.0 http://localhost:${PORT}`);
});