import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const root = "C:/www/andenne-bears.be";
const outDir = `${root}/ux-guerilla-test`;
const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const pageUrl = `file:///${root}/index.html`;

const viewports = [
  { name: "desktop-1366x768", width: 1366, height: 768, mobile: false },
  { name: "mobile-390x844", width: 390, height: 844, mobile: true },
];

const scenarios = [
  "Nouveau joueur senior qui cherche comment venir essayer",
  "Parent qui veut verifier l'encadrement et les infos pratiques",
  "Joueur flag qui cherche la discipline sans contact",
  "Partenaire local qui cherche le serieux du club et le contact",
  "Visiteur presse qui scanne seulement le haut de page et les CTA",
  "Benevole potentiel qui cherche le comite, les roles et le formulaire",
];

const hotspots = {
  desktop: [
    { x: 150, y: 28, rx: 110, ry: 28, w: 0.28, label: "Brand/header" },
    { x: 1130, y: 30, rx: 115, ry: 32, w: 0.34, label: "CTA header" },
    { x: 683, y: 330, rx: 260, ry: 170, w: 0.82, label: "Logo + proposition" },
    { x: 590, y: 535, rx: 150, ry: 50, w: 1, label: "CTA Venir essayer" },
    { x: 780, y: 535, rx: 170, ry: 50, w: 0.78, label: "Infos pratiques" },
    { x: 683, y: 645, rx: 330, ry: 45, w: 0.5, label: "Trust strip" },
    { x: 683, y: 900, rx: 470, ry: 130, w: 0.72, label: "Premier essai" },
    { x: 450, y: 1360, rx: 250, ry: 210, w: 0.52, label: "Pourquoi rejoindre" },
    { x: 910, y: 1360, rx: 250, ry: 210, w: 0.48, label: "Cartes rejoindre" },
    { x: 683, y: 2190, rx: 500, ry: 170, w: 0.36, label: "Galerie" },
    { x: 460, y: 3100, rx: 260, ry: 230, w: 0.64, label: "Football americain" },
    { x: 910, y: 3100, rx: 260, ry: 230, w: 0.58, label: "Flag football" },
    { x: 683, y: 4050, rx: 520, ry: 300, w: 0.9, label: "Infos pratiques" },
    { x: 683, y: 5000, rx: 450, ry: 180, w: 0.34, label: "Slogan" },
    { x: 683, y: 5700, rx: 500, ry: 250, w: 0.5, label: "Parents" },
    { x: 683, y: 6700, rx: 540, ry: 430, w: 0.44, label: "Comite staff" },
    { x: 683, y: 8070, rx: 520, ry: 280, w: 0.46, label: "Partenaires" },
    { x: 430, y: 9000, rx: 300, ry: 330, w: 0.72, label: "Contact copy" },
    { x: 910, y: 9000, rx: 300, ry: 420, w: 1, label: "Formulaire contact" },
    { x: 1260, y: 706, rx: 80, ry: 45, w: 0.42, label: "Chat flottant" },
  ],
  mobile: [
    { x: 58, y: 30, rx: 58, ry: 25, w: 0.28, label: "Brand/header" },
    { x: 352, y: 30, rx: 36, ry: 30, w: 0.54, label: "Menu mobile" },
    { x: 195, y: 330, rx: 135, ry: 150, w: 0.86, label: "Logo + proposition" },
    { x: 195, y: 545, rx: 145, ry: 48, w: 1, label: "CTA Venir essayer" },
    { x: 195, y: 610, rx: 150, ry: 48, w: 0.82, label: "Infos pratiques" },
    { x: 195, y: 760, rx: 150, ry: 85, w: 0.5, label: "Trust strip" },
    { x: 195, y: 1130, rx: 165, ry: 220, w: 0.76, label: "Premier essai" },
    { x: 195, y: 1680, rx: 165, ry: 330, w: 0.58, label: "Rejoindre" },
    { x: 195, y: 2600, rx: 170, ry: 260, w: 0.38, label: "Galerie" },
    { x: 195, y: 3650, rx: 165, ry: 420, w: 0.68, label: "Disciplines" },
    { x: 195, y: 5100, rx: 170, ry: 620, w: 0.92, label: "Infos pratiques" },
    { x: 195, y: 6650, rx: 165, ry: 340, w: 0.38, label: "Slogan" },
    { x: 195, y: 7450, rx: 165, ry: 420, w: 0.5, label: "Parents" },
    { x: 195, y: 8850, rx: 170, ry: 700, w: 0.42, label: "Comite staff" },
    { x: 195, y: 11150, rx: 170, ry: 460, w: 0.5, label: "Partenaires" },
    { x: 195, y: 12400, rx: 170, ry: 760, w: 1, label: "Formulaire contact" },
    { x: 330, y: 790, rx: 62, ry: 45, w: 0.42, label: "Chat flottant" },
  ],
};

await mkdir(outDir, { recursive: true });

async function requestJson(url) {
  const response = await fetch(url);
  return response.json();
}

async function connect(port) {
  for (let i = 0; i < 60; i += 1) {
    try {
      const tabs = await requestJson(`http://127.0.0.1:${port}/json`);
      return new WebSocket(tabs[0].webSocketDebuggerUrl);
    } catch {
      await delay(250);
    }
  }
  throw new Error("Chrome DevTools endpoint did not start.");
}

async function waitForOpen(ws) {
  if (ws.readyState === WebSocket.OPEN) return;
  await Promise.race([
    new Promise((resolve) => ws.addEventListener("open", resolve, { once: true })),
    delay(5000).then(() => {
      throw new Error("WebSocket connection timed out.");
    }),
  ]);
}

function rpc(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  return (method, params = {}) =>
    Promise.race([
      new Promise((resolve, reject) => {
        const callId = ++id;
        pending.set(callId, { resolve, reject });
        ws.send(JSON.stringify({ id: callId, method, params }));
      }),
      delay(30000).then(() => {
        throw new Error(`${method} timed out.`);
      }),
    ]);
}

async function getPageSize(viewport) {
  const port = 9400 + Math.floor(Math.random() * 1000);
  const userDataDir = `${outDir}/.chrome-${viewport.name}-${Date.now()}`;
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--allow-file-access-from-files",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${viewport.width},${viewport.height}`,
    "about:blank",
  ]);

  try {
    const ws = await connect(port);
    await waitForOpen(ws);
    const send = rpc(ws);
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
      screenOrientation: viewport.mobile
        ? { type: "portraitPrimary", angle: 0 }
        : { type: "landscapePrimary", angle: 0 },
    });
    await send("Page.navigate", { url: pageUrl });
    await delay(5000);
    const measured = await send("Runtime.evaluate", {
      expression: `JSON.stringify({
        width: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth, window.innerWidth),
        height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, window.innerHeight),
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight
      })`,
      returnByValue: true,
    });
    const content = JSON.parse(measured.result.value);
    ws.close();
    return { width: Math.round(content.width), height: Math.round(content.height) };
  } finally {
    chrome.kill();
  }
}

function runChromeScreenshot({ viewport, htmlPath, outputPath }) {
  return new Promise((resolve, reject) => {
    const chrome = spawn(chromePath, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--allow-file-access-from-files",
      "--force-device-scale-factor=1",
      "--virtual-time-budget=3500",
      `--window-size=${viewport.width},${viewport.height}`,
      `--screenshot=${outputPath}`,
      `file:///${htmlPath.replaceAll("\\", "/")}`,
    ]);
    let stderr = "";
    chrome.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    chrome.on("error", reject);
    chrome.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `Chrome exited with ${code}`));
    });
  });
}

async function captureSegments(viewport) {
    const { width, height } = await getPageSize(viewport);
    const segments = [];

    const yPositions = [];
    for (let y = 0; y < height; y += viewport.height) {
      yPositions.push(y);
    }
    const lastY = Math.max(0, height - viewport.height);
    if (!yPositions.includes(lastY)) {
      yPositions.push(lastY);
    }

    for (const y of yPositions) {
      const segmentHeight = Math.min(viewport.height, height - y);
      const path = `${outDir}/${viewport.name}-segment-${String(segments.length + 1).padStart(2, "0")}.png`;
      const htmlPath = `${outDir}/${viewport.name}-capture-${String(segments.length + 1).padStart(2, "0")}.html`;
      const source = await readFile(`${root}/index.html`, "utf8");
      const withBase = source.replace("<head>", `<head>\n    <base href="file:///${root}/">`);
      const captureHtml = withBase.replace(
        "</body>",
        `<script>window.addEventListener('load',()=>{setTimeout(()=>window.scrollTo(0,${y}),250);});</script></body>`
      );
      await writeFile(htmlPath, captureHtml);
      await runChromeScreenshot({ viewport, htmlPath, outputPath: path });
      segments.push({ path, y, width, height: segmentHeight });
    }

    return {
      name: viewport.name,
      width,
      height,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      mode: viewport.mobile ? "mobile" : "desktop",
      segments,
      hotspots: hotspots[viewport.mobile ? "mobile" : "desktop"],
      screenshotPath: `${outDir}/homepage-${viewport.name}.png`,
      heatmapPath: `${outDir}/heatmap-${viewport.name}.png`,
    };
}

const results = [];
for (const viewport of viewports) {
  console.log(`Capturing ${viewport.name}`);
  results.push(await captureSegments(viewport));
}

await writeFile(`${outDir}/heatmap-manifest.json`, JSON.stringify({ results, scenarios }, null, 2));
await writeFile(
  `${outDir}/rapport-guerilla-heatmap.md`,
  `# Guerilla test simule - Andenne Bears

Date: 2026-04-27

## Viewports

- Desktop: 1366 x 768, laptop HD courant.
- Mobile: 390 x 844, viewport iPhone moderne courant.

## Faux agents

${scenarios.map((scenario, index) => `${index + 1}. ${scenario}`).join("\n")}

## Lecture rapide

- Les zones les plus chaudes sont les CTA d'essai, les infos pratiques et le formulaire de contact.
- Sur mobile, l'attention se concentre davantage sur le hero, le menu, puis les blocs qui repondent directement a la question "comment essayer ?".
- Les sections comite/staff et partenaires recoivent une attention plus qualifiante que massive: utiles pour rassurer, moins decisives pour l'action immediate.

## Fichiers generes

${results.map((r) => `- ${r.name}: ${r.heatmapPath}`).join("\n")}
`
);

console.log(JSON.stringify(results.map(({ name, width, height, segments }) => ({ name, width, height, segments: segments.length })), null, 2));
