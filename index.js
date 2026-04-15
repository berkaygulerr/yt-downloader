const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.static("public"));

const downloads = {};

const downloadFolder = path.join(__dirname, "downloads");
if (!fs.existsSync(downloadFolder)) {
  fs.mkdirSync(downloadFolder, { recursive: true });
}

const PORT = process.env.PORT || 3001;

// DOWNLOAD BAŞLAT
app.get("/download", (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "URL eksik" });

  const id = Date.now().toString();

  const filePath = path.join(downloadFolder, `${id}.mp4`);

  downloads[id] = {
    progress: 0,
    speed: "",
    eta: "",
    status: "downloading"
  };

  // 🔥 DIRECT DOWNLOAD (TITLE YOK → YOUTUBE BLOCK YOK)
  const ytdlp = spawn("yt-dlp", [
    "-f",
    "bv*[vcodec^=avc1][height<=1080]+ba[ext=m4a]/best",
    "--merge-output-format",
    "mp4",
    "--newline",
    "--force-ipv4",
    "--no-part",
    "-o",
    filePath,
    url
  ]);

  ytdlp.stdout.on("data", (data) => {
    const line = data.toString();

    // progress parse
    const match = line.match(/(\d+\.\d+)%.*?at\s+([^\s]+).*?ETA\s+([^\s]+)/);
    if (match) {
      downloads[id].progress = parseFloat(match[1]);
      downloads[id].speed = match[2];
      downloads[id].eta = match[3];
    }

    console.log(line);
  });

  ytdlp.stderr.on("data", (data) => {
    console.error(data.toString());
  });

  ytdlp.on("error", (err) => {
    console.error("spawn error:", err);
    downloads[id].status = "error";
  });

  ytdlp.on("close", () => {
    downloads[id].status = "finished";
    downloads[id].file = `${id}.mp4`;
    console.log("Download finished:", filePath);
  });

  res.json({ id, filename: `${id}.mp4` });
});

// PROGRESS
app.get("/progress/:id", (req, res) => {
  const id = req.params.id;
  res.json(downloads[id] || {});
});

// FILE DOWNLOAD + DELETE
app.get("/file/:id", (req, res) => {
  const download = downloads[req.params.id];

  if (!download || !download.file) {
    return res.status(404).json({ error: "Dosya yok" });
  }

  const file = path.join(downloadFolder, download.file);

  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: "Dosya bulunamadı" });
  }

  res.download(file, (err) => {
    if (err) console.error(err);

    fs.unlink(file, (err) => {
      if (err) console.error("delete error:", err);
      else console.log("deleted:", file);
    });
  });
});

// START SERVER
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on ${PORT}`);
});