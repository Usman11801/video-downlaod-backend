const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 5001;
const ROOT_PASSWORD = "03043308478"; // Hardcoded root password (⚠️ Not Secure)

// Create downloads directory if it doesn't exist
const downloadsDir = path.join(__dirname, "downloads");
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Function to get cookies from an available browser
const getCookiesCommand = (url) => {
  const browsers = ["chrome", "firefox", "edge", "brave", "safari", "vivaldi", "whale", "chromium", "opera"];
  for (const browser of browsers) {
    const command = `echo ${ROOT_PASSWORD} | sudo -S yt-dlp --cookies-from-browser ${browser} --dump-json "${url}"`;
    try {
      execSync(command, { stdio: "ignore" }); // Test if the command runs successfully
      return command; // Return the first working command
    } catch (error) {
      continue; // Try the next browser
    }
  }
  return null; // No valid browser found
};

// **1️⃣ API Endpoint: Video Preview**
app.post("/api/preview", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  // Construct the yt-dlp command
  const command = getCookiesCommand(url);
  if (!command) {
    return res.status(500).json({ error: "No valid browser found for cookies" });
  }

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return res.status(500).json({ error: "Failed to fetch video info" });
    }

    try {
      const videoInfo = JSON.parse(stdout);
      res.json({
        title: videoInfo.title,
        thumbnail: videoInfo.thumbnail,
        description: videoInfo.description,
      });
    } catch (err) {
      console.error("Error parsing video info:", err);
      res.status(500).json({ error: "Failed to parse video info" });
    }
  });
});

// **2️⃣ API Endpoint: Video Download**
app.post("/api/download", (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const outputPath = path.join(downloadsDir, `video-${Date.now()}.mp4`);
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  const command = getCookiesCommand(url);
  if (!command) {
    return res.status(500).json({ error: "No valid browser found for cookies" });
  }

  console.log("Starting download...");
  const downloadProcess = exec(command);

  downloadProcess.stdout.on("data", (data) => {
    console.log(`stdout: ${data}`);
    const percentageMatch = data.match(/(\d+\.?\d*)%/);
    if (percentageMatch) {
      const progress = Math.round(parseFloat(percentageMatch[1]));
      res.write(`data: ${JSON.stringify({ progress })}\n\n`);
    }
  });

  downloadProcess.stderr.on("data", (data) => {
    console.log(`stderr: ${data}`);
  });

  downloadProcess.on("error", (error) => {
    console.error(`Error: ${error.message}`);
    res.write(`data: ${JSON.stringify({ error: "Failed to download the video" })}\n\n`);
    res.end();
  });

  downloadProcess.on("close", async (code) => {
    console.log(`Download process exited with code ${code}`);
    if (code === 0 && fs.existsSync(outputPath)) {
      const fileId = path.basename(outputPath);
      res.write(`data: ${JSON.stringify({ completed: true, fileId: fileId })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ error: "Download failed" })}\n\n`);
    }
    res.end();
  });
});

// **3️⃣ API Endpoint: Download Process Monitoring**
app.get("/api/download-progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
});

// **4️⃣ API Endpoint: Serve Downloaded Files**
app.get("/api/download-file/:fileId", (req, res) => {
  const { fileId } = req.params;
  const filePath = path.join(downloadsDir, fileId);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(filePath, "video.mp4", (err) => {
    if (err) {
      console.error("Error sending file:", err);
    }
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) {
        console.error("Error deleting file:", unlinkErr);
      }
    });
  });
});

// **5️⃣ API Endpoint: API Welcome Message**
app.get("/api/", (req, res) => {
  res.json({
    message: "Welcome to the Video Downloader API",
    endpoints: {
      "/": "Welcome message and API information",
      "/preview": "POST - Get video information",
      "/download": "POST - Download a video",
      "/download-file/:fileId": "GET - Download a processed video file",
      "/download-progress": "GET - Stream download progress updates",
    },
  });
});

// **Start Server**
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on 0.0.0.0 http://localhost:${PORT}`);
});
