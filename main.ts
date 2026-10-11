const PROXY = "http://1.20.101.18:80";

const client = Deno.createHttpClient({
  proxy: { url: PROXY },
});

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const target = url.searchParams.get("url");
  if (!target) return new Response("?url= required", { status: 400 });

  try {
    const t = new URL(target);

    const upstream = await fetch(target, {
      client,
      headers: {
        "User-Agent": req.headers.get("user-agent") || "Mozilla/5.0",
        "Referer": t.origin + "/",
        "Origin": t.origin,
      },
      redirect: "follow",
    });

    const ct = upstream.headers.get("content-type") || "";

    if (ct.includes("mpegurl") || target.includes(".m3u8")) {
      const text = await upstream.text();
      const self = `${url.protocol}//${url.host}`;

      const rewritten = text.split("\n").map((line) => {
        const s = line.trim();
        if (!s) return line;
        if (s.startsWith("#")) {
          return line.replace(/URI="([^"]+)"/g, (_, u) =>
            `URI="${self}/?url=${encodeURIComponent(new URL(u, t).toString())}"`
          );
        }
        return `${self}/?url=${encodeURIComponent(new URL(s, t).toString())}`;
      }).join("\n");

      return new Response(rewritten, {
        headers: {
          "content-type": "application/vnd.apple.mpegurl",
          "access-control-allow-origin": "*",
        },
      });
    }

    const headers = new Headers(upstream.headers);
    headers.set("access-control-allow-origin", "*");
    headers.delete("content-security-policy");
    headers.delete("x-frame-options");

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (e) {
    return new Response("proxy error: " + (e as Error).message, { status: 502 });
  }
});
