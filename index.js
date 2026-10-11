const express = require("express");
const { HttpsProxyAgent } = require("https-proxy-agent");
const fetch = require("node-fetch");

const app = express();
const PROXY = "http://1.20.101.18:80";
const agent = new HttpsProxyAgent(PROXY);

app.get("/", async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send("?url= required");

  let t;
  try {
    t = new URL(target);
  } catch {
    return res.status(400).send("invalid url");
  }

  try {
    const upstream = await fetch(target, {
      agent,
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        Referer: t.origin + "/",
        Origin: t.origin,
      },
      redirect: "follow",
    });

    const ct = upstream.headers.get("content-type") || "";

    if (ct.includes("mpegurl") || target.includes(".m3u8")) {
      const text = await upstream.text();
      const self = `${req.protocol}://${req.get("host")}`;

      const rewritten = text
        .split("\n")
        .map((line) => {
          const s = line.trim();
          if (!s) return line;
          if (s.startsWith("#")) {
            return line.replace(/URI="([^"]+)"/g, (_, u) => {
              const abs = new URL(u, t).toString();
              return `URI="${self}/?url=${encodeURIComponent(abs)}"`;
            });
          }
          const abs = new URL(s, t).toString();
          return `${self}/?url=${encodeURIComponent(abs)}`;
        })
        .join("\n");

      res.set("Content-Type", "application/vnd.apple.mpegurl");
      res.set("Access-Control-Allow-Origin", "*");
      return res.send(rewritten);
    }

    res.status(upstream.status);
    res.set("Access-Control-Allow-Origin", "*");
    upstream.headers.forEach((v, k) => {
      if (!["content-encoding", "transfer-encoding", "connection"].includes(k.toLowerCase())) {
        res.set(k, v);
      }
    });
    upstream.body.pipe(res);
  } catch (e) {
    res.status(502).send("proxy error: " + e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("listening on " + PORT));
