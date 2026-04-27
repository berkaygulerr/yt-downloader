const express = require("express");
const { spawn, execFile } = require("child_process");
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

// Dosya adı güvenli hale getir
function sanitizeFilename(name) {
  return name
    .replace(/[\/\\:*?"<>|]/g, "_")  // Windows/Linux yasak karakterler
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 200); // çok uzun isim olmasın
}

// DOWNLOAD BAŞLAT
app.get("/download", (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "URL eksik" });

  const id = Date.now().toString();

  downloads[id] = {
    progress: 0,
    speed: "",
    eta: "",
    status: "fetching_title"
  };

  // Önce title'ı al
  execFile("yt-dlp", ["--get-title", "--no-playlist", url], (err, stdout) => {
    let title = stdout ? stdout.trim() : null;

    if (err || !title) {
      title = id; // fallback: id ile devam et
    }

    const safeTitle = sanitizeFilename(title);
    const filename = `${safeTitle}.mp4`;
    const filePath = path.join(downloadFolder, filename);

    downloads[id].status = "downloading";
    downloads[id].filename = filename;

    const ytdlp = spawn("yt-dlp", [
      "-f", "bv*[vcodec^=avc1][height<=1080]+ba[ext=m4a]/best",
      "--merge-output-format", "mp4",
      "--newline",
      "--force-ipv4",
      "--no-part",
      "-o", filePath,
      url
    ]);

    ytdlp.stdout.on("data", (data) => {
      const line = data.toString();
      const match = line.match(/(\d+\.\d+)%.*?at\s+([^\s]+).*?ETA\s+([^\s]+)/);
      if (match) {
        downloads[id].progress = parseFloat(match[1]);
        downloads[id].speed = match[2];
        downloads[id].eta = match[3];
      }
      console.log(line);
    });

    ytdlp.stderr.on("data", (data) => console.error(data.toString()));

    ytdlp.on("error", (err) => {
      console.error("spawn error:", err);
      downloads[id].status = "error";
    });

    ytdlp.on("close", () => {
      downloads[id].status = "finished";
      downloads[id].file = filename;
      console.log("Download finished:", filePath);
    });

    // Title fetch biter bitmez frontend'e id ve tahmini ismi dön
    res.json({ id, filename });
  });
});

// PROGRESS
app.get("/progress/:id", (req, res) => {
  res.json(downloads[req.params.id] || {});
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

  res.download(file, download.file, (err) => {
    if (err) console.error(err);
    fs.unlink(file, (err) => {
      if (err) console.error("delete error:", err);
      else console.log("deleted:", file);
    });
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on ${PORT}`);
});