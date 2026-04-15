const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.static("public"));

const downloads = {};
const downloadFolder = path.join(__dirname, "downloads");
if (!fs.existsSync(downloadFolder)) fs.mkdirSync(downloadFolder);

const PORT = process.env.PORT || 3000;

// Dosya adı güvenli hale getirme
function sanitizeFilename(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, "") // Windows yasaklı karakterler
    .replace(/\s+/g, " ")
    .trim();
}

// DOWNLOAD BAŞLAT
app.get("/download", (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "URL eksik" });

  // Video başlığını al
  const titleProc = spawn("yt-dlp", ["--get-title", url]);

  titleProc.stdout.on("data", data => {
    let title = data.toString().trim();
    title = sanitizeFilename(title);

    const filePath = path.join(downloadFolder, title + ".mp4");

    const id = Date.now().toString();
    downloads[id] = { progress: 0, speed: "", eta: "", status: "downloading" };

    // H264 video + AAC audio indir (Premiere uyumlu)
    const ytdlp = spawn("yt-dlp", [
      "-f",
      "bv*[vcodec^=avc1][height<=1080]+ba[ext=m4a]/b[vcodec^=avc1]/b[ext=mp4]/best",
      "--merge-output-format",
      "mp4",
      "--newline",
      "-o",
      filePath,
      url
    ]);

    ytdlp.stdout.on("data", data => {
      const line = data.toString();

      const match = line.match(/(\d+\.\d+)%.*?at\s+([^\s]+).*?ETA\s+([^\s]+)/);
      if (match) {
        downloads[id].progress = parseFloat(match[1]);
        downloads[id].speed = match[2];
        downloads[id].eta = match[3];
      }

      console.log(line);
    });

    ytdlp.stderr.on("data", data => {
      console.error(data.toString());
    });

    ytdlp.on("close", () => {
      downloads[id].status = "finished";
      downloads[id].file = title + ".mp4";
      console.log("Download finished:", filePath);
    });

    res.json({ id, filename: title + ".mp4" });
  });
});

// PROGRESS
app.get("/progress/:id", (req, res) => {
  const id = req.params.id;
  res.json(downloads[id] || {});
});

// DOSYA İNDİR + SİL
app.get("/file/:id", (req, res) => {
  const download = downloads[req.params.id];
  if (!download || !download.file)
    return res.status(404).json({ error: "Dosya yok" });

  const file = path.join(downloadFolder, download.file);
  if (!fs.existsSync(file))
    return res.status(404).json({ error: "Dosya yok" });

  res.download(file, err => {
    if (err) console.error("Dosya indirme hatası:", err);

    // İndirildikten sonra sil
    fs.unlink(file, err => {
      if (err) console.error("Dosya silme hatası:", err);
      else console.log("Dosya silindi:", file);
    });
  });
});

app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT}`)
);
