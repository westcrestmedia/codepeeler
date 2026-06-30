/* ═══════════════════════════════════════════
   CodePeeler — Main Application Script
   ═══════════════════════════════════════════ */

// ─── JSZip CDN (loaded inline) ───────────────
const JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

// ─── State ────────────────────────────────────
const state = {
  files: [],        // { name, content, size }
  processing: false,
  outputZip: null,
};

// ─── DOM refs ─────────────────────────────────
const $ = id => document.getElementById(id);

const dropzone      = $('dropzone');
const browseBtn     = $('browseBtn');
const fileInput     = $('fileInput');
const fileList      = $('fileList');
const fileItems     = $('fileItems');
const clearBtn      = $('clearBtn');
const processBtn    = $('processBtn');
const processBtnText= $('processBtnText');
const resultsArea   = $('resultsArea');
const statusSpinner = $('statusSpinner');
const statusText    = $('statusText');
const terminalBody  = $('terminalBody');
const downloadArea  = $('downloadArea');
const downloadBtn   = $('downloadBtn');
const downloadTitle = $('downloadTitle');
const downloadMeta  = $('downloadMeta');
const outputSummary = $('outputSummary');
const customInstructions = $('customInstructions');
const navHamburger  = $('navHamburger');
const navMobile     = $('navMobile');

// ─── Navbar scroll ────────────────────────────
window.addEventListener('scroll', () => {
  document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 40);
});

navHamburger.addEventListener('click', () => {
  navMobile.classList.toggle('open');
});

// ─── Reveal on scroll ─────────────────────────
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.12 });

document.querySelectorAll('.step-card, .feature-card, .section-header').forEach(el => {
  el.classList.add('reveal');
  revealObserver.observe(el);
});

// ─── Preset chips ─────────────────────────────
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    chip.classList.toggle('active');
    updateInstructionsFromChips();
  });
});

function updateInstructionsFromChips() {
  const parts = [];
  document.querySelectorAll('.chip.active').forEach(c => {
    const p = c.dataset.preset;
    if (p === 'separate') parts.push('Separate HTML structure, CSS styles, and JavaScript into individual files.');
    if (p === 'mobile')   parts.push('Generate responsive mobile versions (.mobile.html and .mobile.css) with proper media queries for screens under 768px.');
    if (p === 'minify')   parts.push('Minify the extracted CSS and JavaScript files.');
    if (p === 'darkmode') parts.push('Create a dark mode CSS file (dark.css) with @media (prefers-color-scheme: dark) rules.');
  });
  if (parts.length) customInstructions.value = parts.join('\n');
}

// ─── Toggle syncs with Mobile chip ────────────
$('optMobile').addEventListener('change', e => {
  const mobileChip = document.querySelector('[data-preset="mobile"]');
  if (e.target.checked) mobileChip.classList.add('active');
  else mobileChip.classList.remove('active');
  updateInstructionsFromChips();
});

// ─── File handling ────────────────────────────
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});
dropzone.addEventListener('click', () => fileInput.click());
browseBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener('change', () => handleFiles(fileInput.files));
clearBtn.addEventListener('click', clearFiles);

async function handleFiles(rawFiles) {
  for (const file of rawFiles) {
    if (file.name.endsWith('.zip')) {
      await extractZip(file);
    } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
      const content = await readFile(file);
      addFile(file.name, content, file.size);
    }
  }
  renderFileList();
}

function readFile(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsText(file);
  });
}

async function extractZip(file) {
  await loadJSZip();
  const zip = await JSZip.loadAsync(file);
  const htmlFiles = Object.entries(zip.files).filter(([name]) =>
    (name.endsWith('.html') || name.endsWith('.htm')) && !zip.files[name].dir
  );
  for (const [name, entry] of htmlFiles) {
    const content = await entry.async('string');
    const baseName = name.split('/').pop();
    addFile(baseName, content, content.length);
  }
}

function addFile(name, content, size) {
  if (state.files.find(f => f.name === name)) return; // dedupe
  state.files.push({ name, content, size });
}

function clearFiles() {
  state.files = [];
  fileInput.value = '';
  renderFileList();
}

function renderFileList() {
  const hasFiles = state.files.length > 0;
  fileList.style.display = hasFiles ? 'block' : 'none';
  dropzone.style.display = hasFiles ? 'none' : 'block';

  fileItems.innerHTML = '';
  state.files.forEach((f, i) => {
    const el = document.createElement('div');
    el.className = 'file-item';
    el.innerHTML = `
      <span class="file-item-icon">📄</span>
      <span class="file-item-name">${f.name}</span>
      <span class="file-item-size">${formatBytes(f.size)}</span>
      <button class="file-item-remove" data-i="${i}" title="Remove">✕</button>
    `;
    fileItems.appendChild(el);
  });

  fileItems.querySelectorAll('.file-item-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      state.files.splice(+btn.dataset.i, 1);
      renderFileList();
    });
  });

  // Update process button
  processBtn.disabled = !hasFiles || state.processing;
  processBtnText.textContent = hasFiles
    ? `Process ${state.files.length} file${state.files.length > 1 ? 's' : ''}`
    : 'Upload files first';
}

// ─── Process ─────────────────────────────────
processBtn.addEventListener('click', startProcessing);

async function startProcessing() {
  if (!state.files.length || state.processing) return;
  state.processing = true;
  processBtn.disabled = true;

  const opts = {
    html:   $('optHtml').checked,
    css:    $('optCss').checked,
    js:     $('optJs').checked,
    mobile: $('optMobile').checked,
    links:  $('optLinks').checked,
  };

  const instructions = customInstructions.value.trim() ||
    'Separate HTML, CSS, and JS into individual files per page.';

  // Show results panel
  resultsArea.style.display = 'block';
  downloadArea.style.display = 'none';
  terminalBody.innerHTML = '';
  statusSpinner.className = 'status-spinner';
  statusText.textContent = 'Processing your files...';
  resultsArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  log('Initializing CodePeeler...', 'info');
  log(`Found ${state.files.length} HTML file(s) to process.`, 'info');
  log(`Options: HTML=${opts.html}, CSS=${opts.css}, JS=${opts.js}, Mobile=${opts.mobile}`, 'info');
  log(`Instructions: "${instructions.slice(0, 80)}..."`, 'info');
  log('', '');

  await loadJSZip();
  const zip = new JSZip();
  const outputFolder = zip.folder('codepeeler-output');
  const stats = { html: 0, css: 0, js: 0, mobile: 0 };

  for (const file of state.files) {
    log(`Processing: ${file.name}`, 'file');
    try {
      const result = await processFileWithAI(file, opts, instructions);
      const base = file.name.replace(/\.(html|htm)$/i, '');

      if (opts.html) {
        outputFolder.file(`${base}.html`, result.html);
        stats.html++;
      }
      if (opts.css && result.css.trim()) {
        outputFolder.file(`${base}.css`, result.css);
        stats.css++;
        log(`  ✔ ${base}.css extracted (${formatBytes(result.css.length)})`, 'success');
      }
      if (opts.js && result.js.trim()) {
        outputFolder.file(`${base}.js`, result.js);
        stats.js++;
        log(`  ✔ ${base}.js extracted (${formatBytes(result.js.length)})`, 'success');
      }
      if (opts.mobile && result.mobileHtml) {
        outputFolder.file(`${base}.mobile.html`, result.mobileHtml);
        outputFolder.file(`${base}.mobile.css`, result.mobileCss);
        stats.mobile++;
        log(`  ✔ ${base}.mobile.html + .mobile.css generated`, 'success');
      }
      log(`  ✔ ${base}.html saved`, 'success');
    } catch (err) {
      log(`  ✖ Error: ${err.message}`, 'error');
    }
  }

  log('', '');
  log('Packaging output ZIP...', 'info');

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  state.outputZip = blob;

  log(`Done! ${Object.values(stats).reduce((a,b)=>a+b,0)} files created.`, 'success');

  // Update UI
  statusSpinner.className = 'status-spinner done';
  statusText.textContent = '✓ Processing complete!';

  const totalFiles = stats.html + stats.css + stats.js + stats.mobile * 2;
  downloadTitle.textContent = 'codepeeler-output.zip';
  downloadMeta.textContent = `${totalFiles} files ready · ${formatBytes(blob.size)}`;

  outputSummary.innerHTML = `
    <div class="summary-item"><div class="summary-label">HTML Files</div><div class="summary-value" style="color:var(--cyan)">${stats.html}</div></div>
    <div class="summary-item"><div class="summary-label">CSS Files</div><div class="summary-value" style="color:var(--purple)">${stats.css}</div></div>
    <div class="summary-item"><div class="summary-label">JS Files</div><div class="summary-value" style="color:var(--orange)">${stats.js}</div></div>
    <div class="summary-item"><div class="summary-label">Mobile Versions</div><div class="summary-value" style="color:var(--green)">${stats.mobile}</div></div>
  `;

  downloadArea.style.display = 'block';
  state.processing = false;
  processBtn.disabled = false;
  processBtnText.textContent = `Process ${state.files.length} file${state.files.length > 1 ? 's' : ''}`;
}

// ─── AI Processing ────────────────────────────
async function processFileWithAI(file, opts, instructions) {
  const prompt = buildPrompt(file.content, opts, instructions);

  log(`  → Sending to AI (${formatBytes(file.content.length)})...`, 'info');

  const WORKER_URL = 'https://codepeeler-proxy.aakif2015.workers.dev';

  let response;
  try {
    response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
  } catch (networkErr) {
    // Network-level failure (CORS, offline, blocked request, etc.)
    log(`  ⚠ AI unreachable (${networkErr.message}) — using local parser`, 'warn');
    return localParse(file.content, opts);
  }

  if (!response.ok) {
    // Fallback to local parsing if API unavailable
    log(`  ⚠ API unavailable (HTTP ${response.status}) — using local parser`, 'warn');
    return localParse(file.content, opts);
  }

  const data = await response.json();
  const text = data.content?.map(c => c.text || '').join('') || '';

  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = clean.indexOf('{');
    const jsonEnd = clean.lastIndexOf('}');
    const parsed = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
    return parsed;
  } catch {
    log(`  ⚠ AI parse error — using local parser`, 'warn');
    return localParse(file.content, opts);
  }
}

function buildPrompt(htmlContent, opts, instructions) {
  // Limit content to avoid token issues in demo
  const content = htmlContent.slice(0, 8000);
  return `You are a code separator. Analyze this HTML file and separate it into parts.

USER INSTRUCTIONS: ${instructions}

HTML FILE CONTENT:
\`\`\`html
${content}
\`\`\`

Respond with ONLY a valid JSON object (no markdown, no explanation) with these keys:
{
  "html": "clean HTML with <link> and <script> tags instead of inline styles/scripts",
  "css": "all extracted CSS from <style> tags combined",
  "js": "all extracted JavaScript from <script> tags combined",
  "mobileHtml": "responsive mobile HTML version (if mobile generation was requested)",
  "mobileCss": "mobile-specific CSS with media queries (if mobile generation was requested)"
}

Rules:
- Remove all <style> tags from html and replace with <link rel='stylesheet' href='[filename].css'>
- Remove all inline <script> tags from html and replace with <script src='[filename].js'></script>
- Keep external CDN script tags in html
- Combine all CSS into css field
- Combine all JS into js field
- For mobile: add viewport meta, responsive meta queries, stack columns on mobile
- Return empty string "" for fields that have no content`;
}

// ─── Local parser (fallback without API) ──────
function localParse(htmlContent, opts) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // Extract CSS
  let cssContent = '';
  doc.querySelectorAll('style').forEach(el => {
    cssContent += el.textContent + '\n\n';
    if (opts.links) el.remove();
  });

  // Extract JS (inline scripts only, not src)
  let jsContent = '';
  doc.querySelectorAll('script:not([src])').forEach(el => {
    jsContent += el.textContent + '\n\n';
    if (opts.links) el.remove();
  });

  // Inject link tags if needed
  if (opts.links && opts.css && cssContent.trim()) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'style.css';
    doc.head.appendChild(link);
  }
  if (opts.links && opts.js && jsContent.trim()) {
    const script = doc.createElement('script');
    script.src = 'script.js';
    doc.body.appendChild(script);
  }

  const cleanHtml = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;

  // Mobile version
  let mobileHtml = '', mobileCss = '';
  if (opts.mobile) {
    mobileCss = `/* Mobile Styles */
@media (max-width: 768px) {
  body { font-size: 16px; padding: 0 16px; }
  .container, [class*="container"] { width: 100% !important; padding: 0 16px; }
  [class*="col-"], [class*="column"] { width: 100% !important; float: none !important; }
  img { max-width: 100%; height: auto; }
  nav, [class*="nav"] { flex-direction: column; }
  table { display: block; overflow-x: auto; }
  h1 { font-size: 1.8rem; }
  h2 { font-size: 1.4rem; }
}

/* Touch targets */
@media (max-width: 768px) {
  a, button, [role="button"] { min-height: 44px; min-width: 44px; }
}
`;
    mobileHtml = cleanHtml.replace(
      '<head>',
      '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    ).replace(
      '</head>',
      '<link rel="stylesheet" href="mobile.css">\n</head>'
    );
  }

  return { html: cleanHtml, css: cssContent, js: jsContent, mobileHtml, mobileCss };
}

// ─── Download ─────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (!state.outputZip) return;
  const url = URL.createObjectURL(state.outputZip);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'codepeeler-output.zip';
  a.click();
  URL.revokeObjectURL(url);
});

// ─── Terminal log helper ──────────────────────
function log(msg, type = '') {
  const line = document.createElement('div');
  line.className = `log-line ${type ? 'log-' + type : ''}`;
  line.textContent = msg;
  terminalBody.appendChild(line);
  terminalBody.scrollTop = terminalBody.scrollHeight;
}

// ─── JSZip loader ─────────────────────────────
let jszipLoaded = false;
function loadJSZip() {
  if (jszipLoaded || typeof JSZip !== 'undefined') { jszipLoaded = true; return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSZIP_CDN;
    s.onload = () => { jszipLoaded = true; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ─── Utility ──────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ─── Cube Typing Animation ────────────────────
// CSS: rotateCube goes rotateX(15deg) rotateY(0→360deg) in 18s
// Face CSS transforms:
//   face-front:  rotateY(0deg)    translateZ(110px)  → visible at cube Y=0
//   face-right:  rotateY(90deg)   translateZ(110px)  → visible at cube Y=270 (360-90)
//   face-back:   rotateY(180deg)  translateZ(110px)  → visible at cube Y=180
//   face-left:   rotateY(-90deg)  translateZ(110px)  → visible at cube Y=90
// A face is "front-facing" when cubeY ≈ faceOffset (within ±75deg)

const CUBE_PERIOD  = 18000;  // ms — must match CSS animation duration
const VIS_RANGE    = 82;     // degrees half-window of visibility
const CHAR_MS      = 22;     // ms per character — smooth, readable
const LINE_MS      = 110;    // ms pause after line complete — relaxed
const MAX_LINES    = 12;     // fills full face height at 0.56rem font

// cubeY when this face points toward camera
const FACE_CAM_ANGLE = {
  'face-front': 0,
  'face-left':  90,   // rotateY(-90) on face means cube must be at +90 to bring it forward
  'face-back':  180,
  'face-right': 270,  // rotateY(+90) on face means cube must be at 270 to bring it forward
};

const FACE_CODE = {
  'face-front': [
    { t: '<!DOCTYPE html>',                  c: 'c-tag' },
    { t: '<html lang="en">',                 c: 'c-tag' },
    { t: '<head>',                           c: 'c-tag' },
    { t: '  <meta charset="UTF-8">',         c: 'c-tag' },
    { t: '  <meta name="viewport"',          c: 'c-tag' },
    { t: '    content="width=device-width">',c: 'c-str' },
    { t: '  <title>CodePeeler</title>',      c: 'c-yellow' },
    { t: '  <link rel="stylesheet"',         c: 'c-tag' },
    { t: '    href="css/style.css">',        c: 'c-str' },
    { t: '  <script src="app.js"',           c: 'c-yellow' },
    { t: '    defer></script>',              c: 'c-yellow' },
    { t: '</head>',                          c: 'c-tag' },
    { t: '<body class="dark">',              c: 'c-tag' },
    { t: '<!-- NAVBAR -->',                  c: 'c-comment' },
    { t: '<nav class="navbar" id="nav">',    c: 'c-tag' },
    { t: '  <div class="nav-inner">',        c: 'c-tag' },
    { t: '    <a href="#" class="logo">',    c: 'c-tag' },
    { t: '      <span class="icon">⟨/⟩</span>', c: 'c-red' },
    { t: '      CodePeeler',                 c: 'c-white' },
    { t: '    </a>',                         c: 'c-tag' },
    { t: '    <ul class="nav-links">',       c: 'c-tag' },
    { t: '      <li>',                       c: 'c-tag' },
    { t: '        <a href="#tool">',         c: 'c-tag' },
    { t: '          Try Now',                c: 'c-yellow' },
    { t: '        </a>',                     c: 'c-tag' },
    { t: '      </li>',                      c: 'c-tag' },
    { t: '      <li>',                       c: 'c-tag' },
    { t: '        <a href="#features">',     c: 'c-tag' },
    { t: '          Features',               c: 'c-yellow' },
    { t: '        </a>',                     c: 'c-tag' },
    { t: '      </li>',                      c: 'c-tag' },
    { t: '    </ul>',                        c: 'c-tag' },
    { t: '    <button class="btn-nav">',     c: 'c-tag' },
    { t: '      Try Free →',                 c: 'c-str' },
    { t: '    </button>',                    c: 'c-tag' },
    { t: '  </div>',                         c: 'c-tag' },
    { t: '</nav>',                           c: 'c-tag' },
    { t: '<!-- HERO SECTION -->',            c: 'c-comment' },
    { t: '<section class="hero" id="hero">', c: 'c-tag' },
    { t: '  <div class="cube-scene">',       c: 'c-red' },
    { t: '    <div class="cube">',           c: 'c-red' },
    { t: '      <div class="face-front">',   c: 'c-yellow' },
    { t: '        &lt;HTML&gt;',             c: 'c-tag' },
    { t: '      </div>',                     c: 'c-tag' },
    { t: '      <div class="face-back">',    c: 'c-yellow' },
    { t: '        .CSS {}',                  c: 'c-sel' },
    { t: '      </div>',                     c: 'c-tag' },
    { t: '    </div>',                       c: 'c-tag' },
    { t: '  </div>',                         c: 'c-tag' },
    { t: '  <div class="hero-content">',     c: 'c-tag' },
    { t: '    <span class="badge">',         c: 'c-tag' },
    { t: '      AI-Powered',                 c: 'c-yellow' },
    { t: '    </span>',                      c: 'c-tag' },
    { t: '    <h1 class="hero-title">',      c: 'c-tag' },
    { t: '      One Messy File.',            c: 'c-red' },
    { t: '    </h1>',                        c: 'c-tag' },
    { t: '    <span class="gradient">',      c: 'c-tag' },
    { t: '      Perfect Output.',            c: 'c-yellow' },
    { t: '    </span>',                      c: 'c-tag' },
    { t: '    <p class="subtitle">',         c: 'c-tag' },
    { t: '      Upload your files...',       c: 'c-white' },
    { t: '    </p>',                         c: 'c-tag' },
    { t: '    <div class="hero-actions">',   c: 'c-tag' },
    { t: '      <a href="#tool"',            c: 'c-tag' },
    { t: '      class="btn btn-primary">',   c: 'c-str' },
    { t: '        Start Peeling →',          c: 'c-yellow' },
    { t: '      </a>',                       c: 'c-tag' },
    { t: '    </div>',                       c: 'c-tag' },
    { t: '    <div class="hero-stats">',     c: 'c-tag' },
    { t: '      <div class="stat">',         c: 'c-tag' },
    { t: '        <span>40+</span>',         c: 'c-red' },
    { t: '        Pages at once',            c: 'c-white' },
    { t: '      </div>',                     c: 'c-tag' },
    { t: '    </div>',                       c: 'c-tag' },
    { t: '  </div>',                         c: 'c-tag' },
    { t: '</section>',                       c: 'c-tag' },
    { t: '</body>',                          c: 'c-tag' },
    { t: '</html>',                          c: 'c-tag' },
  ],
  'face-left': [
    { t: '// CodePeeler — app.js',           c: 'c-comment' },
    { t: "// v2.0 | MIT License",            c: 'c-comment' },
    { t: "'use strict';",                    c: 'c-yellow' },
    { t: '',                                 c: '' },
    { t: 'const API_URL =',                  c: 'c-kw' },
    { t: "  'https://api.anthropic.com';",   c: 'c-str' },
    { t: 'const MODEL =',                    c: 'c-kw' },
    { t: "  'claude-sonnet-4-6';",           c: 'c-red' },
    { t: '',                                 c: '' },
    { t: 'const state = {',                  c: 'c-kw' },
    { t: '  files:      [],',                c: 'c-white' },
    { t: '  processing: false,',             c: 'c-yellow' },
    { t: '  outputZip:  null,',              c: 'c-white' },
    { t: '  errors:     0,',                 c: 'c-red' },
    { t: '};',                               c: '' },
    { t: '',                                 c: '' },
    { t: 'const $ = id =>',                  c: 'c-kw' },
    { t: '  document.getElementById(id);',   c: 'c-fn' },
    { t: '',                                 c: '' },
    { t: '// DOM references',                c: 'c-comment' },
    { t: 'const dropzone   = $("dropzone");',c: 'c-fn' },
    { t: 'const processBtn = $("processBtn");', c: 'c-fn' },
    { t: 'const fileInput  = $("fileInput");',   c: 'c-fn' },
    { t: 'const terminal   = $("terminalBody");', c: 'c-fn' },
    { t: '',                                 c: '' },
    { t: '// File handling',                 c: 'c-comment' },
    { t: 'async function handleFiles(raw) {',c: 'c-kw' },
    { t: '  for (const f of raw) {',         c: 'c-kw' },
    { t: '    if (f.size > 10_000_000) {',   c: 'c-red' },
    { t: "      log('File too large','err');",c: 'c-red' },
    { t: '      state.errors++;',            c: 'c-red' },
    { t: '      continue;',                  c: 'c-kw' },
    { t: '    }',                            c: '' },
    { t: "    if (f.name.endsWith('.zip')){", c: 'c-str' },
    { t: '      await extractZip(f);',       c: 'c-fn' },
    { t: "    } else if (/\\.html?$/.test(", c: 'c-str' },
    { t: '      f.name)) {',                 c: 'c-yellow' },
    { t: '      const txt = await read(f);', c: 'c-fn' },
    { t: '      addFile(f.name, txt);',      c: 'c-fn' },
    { t: '    }',                            c: '' },
    { t: '  }',                              c: '' },
    { t: '  renderFileList();',              c: 'c-fn' },
    { t: '}',                               c: '' },
    { t: '',                                 c: '' },
    { t: '// AI Processing',                 c: 'c-comment' },
    { t: 'async function processAI(file) {', c: 'c-kw' },
    { t: '  const res = await fetch(',       c: 'c-fn' },
    { t: '    API_URL + "/v1/messages",',    c: 'c-str' },
    { t: '    { method: "POST",',            c: 'c-yellow' },
    { t: '      headers: {',                 c: 'c-white' },
    { t: '        "Content-Type":',          c: 'c-str' },
    { t: '        "application/json"',       c: 'c-str' },
    { t: '      },',                         c: '' },
    { t: '      body: JSON.stringify({',     c: 'c-fn' },
    { t: '        model: MODEL,',            c: 'c-red' },
    { t: '        max_tokens: 1000,',        c: 'c-num' },
    { t: '        messages: [msg]',          c: 'c-yellow' },
    { t: '      })',                         c: '' },
    { t: '    }',                            c: '' },
    { t: '  );',                             c: '' },
    { t: '  if (!res.ok) {',                 c: 'c-red' },
    { t: "    log('API error','err');",      c: 'c-red' },
    { t: '    return localParse(file);',     c: 'c-fn' },
    { t: '  }',                              c: '' },
    { t: '  const data = await res.json();', c: 'c-fn' },
    { t: '  return parseResult(data);',      c: 'c-fn' },
    { t: '}',                               c: '' },
    { t: '',                                 c: '' },
    { t: '// ZIP builder',                   c: 'c-comment' },
    { t: 'async function buildZip(files) {', c: 'c-kw' },
    { t: '  const zip = new JSZip();',       c: 'c-fn' },
    { t: '  const out = zip.folder(',        c: 'c-fn' },
    { t: "    'codepeeler-output');",        c: 'c-str' },
    { t: '  for (const [k,v] of',           c: 'c-kw' },
    { t: '    Object.entries(files)) {',     c: 'c-fn' },
    { t: '    out.file(k, v);',              c: 'c-yellow' },
    { t: '  }',                              c: '' },
    { t: '  return zip.generateAsync({',     c: 'c-fn' },
    { t: "    type: 'blob',",               c: 'c-str' },
    { t: "    compression: 'DEFLATE'",       c: 'c-yellow' },
    { t: '  });',                            c: '' },
    { t: '}',                               c: '' },
  ],
  'face-back': [
    { t: '/* CodePeeler — style.css */',  c: 'c-comment' },
    { t: '/* v2.0 Full Redesign */',      c: 'c-comment' },
    { t: ':root {',                       c: 'c-sel' },
    { t: '  --bg:     #080811;',          c: 'c-yellow' },
    { t: '  --cyan:   #00D4FF;',          c: 'c-prop' },
    { t: '  --purple: #7B61FF;',          c: 'c-kw' },
    { t: '  --green:  #00FF9C;',          c: 'c-str' },
    { t: '  --orange: #FFB86C;',          c: 'c-fn' },
    { t: '  --red:    #FF4444;',          c: 'c-red' },
    { t: '  --yellow: #FFD700;',          c: 'c-yellow' },
    { t: '  --radius: 12px;',             c: 'c-prop' },
    { t: '}',                             c: '' },
    { t: 'body {',                        c: 'c-sel' },
    { t: '  background: var(--bg);',      c: 'c-prop' },
    { t: '  color: #E8E8F0;',             c: 'c-yellow' },
    { t: "  font-family: 'Inter',sans;",  c: 'c-prop' },
    { t: '  overflow-x: hidden;',         c: 'c-prop' },
    { t: '  margin: 0; padding: 0;',      c: 'c-white' },
    { t: '}',                             c: '' },
    { t: '.navbar {',                     c: 'c-sel' },
    { t: '  position: fixed;',            c: 'c-prop' },
    { t: '  top: 0; left: 0; right: 0;',  c: 'c-yellow' },
    { t: '  z-index: 100;',              c: 'c-num' },
    { t: '  backdrop-filter:',            c: 'c-prop' },
    { t: '    blur(20px);',               c: 'c-red' },
    { t: '  border-bottom: 1px solid',    c: 'c-prop' },
    { t: '    rgba(255,255,255,0.07);',   c: 'c-white' },
    { t: '}',                             c: '' },
    { t: '.hero {',                       c: 'c-sel' },
    { t: '  min-height: 100vh;',          c: 'c-prop' },
    { t: '  display: flex;',              c: 'c-yellow' },
    { t: '  align-items: center;',        c: 'c-prop' },
    { t: '  padding: 120px 24px 80px;',   c: 'c-num' },
    { t: '  position: relative;',         c: 'c-prop' },
    { t: '}',                             c: '' },
    { t: '.hero-title {',                 c: 'c-sel' },
    { t: '  font-size: clamp(',           c: 'c-prop' },
    { t: '    2.5rem, 6vw, 4rem);',       c: 'c-red' },
    { t: '  font-weight: 700;',           c: 'c-yellow' },
    { t: '  color: #fff;',                c: 'c-white' },
    { t: '  line-height: 1.1;',           c: 'c-prop' },
    { t: '}',                             c: '' },
    { t: '.title-gradient {',             c: 'c-sel' },
    { t: '  background: linear-gradient(', c: 'c-prop' },
    { t: '    135deg,',                   c: 'c-num' },
    { t: '    var(--cyan),',              c: 'c-prop' },
    { t: '    var(--purple));',           c: 'c-kw' },
    { t: '  -webkit-background-clip:',    c: 'c-prop' },
    { t: '    text;',                     c: 'c-yellow' },
    { t: '  -webkit-text-fill-color:',    c: 'c-prop' },
    { t: '    transparent;',              c: 'c-red' },
    { t: '}',                             c: '' },
    { t: '.btn-primary {',                c: 'c-sel' },
    { t: '  background:',                 c: 'c-prop' },
    { t: '    linear-gradient(',          c: 'c-fn' },
    { t: '    135deg,',                   c: 'c-num' },
    { t: '    var(--cyan),',              c: 'c-prop' },
    { t: '    var(--purple));',           c: 'c-yellow' },
    { t: '  color: #000;',               c: 'c-red' },
    { t: '  border: none;',              c: 'c-prop' },
    { t: '  cursor: pointer;',           c: 'c-white' },
    { t: '  border-radius: 12px;',       c: 'c-prop' },
    { t: '  box-shadow: 0 4px 24px',     c: 'c-prop' },
    { t: '    rgba(0,212,255,0.3);',      c: 'c-yellow' },
    { t: '}',                             c: '' },
    { t: '.btn-primary:hover {',          c: 'c-sel' },
    { t: '  transform: translateY(-2px);',c: 'c-red' },
    { t: '  box-shadow: 0 8px 32px',     c: 'c-prop' },
    { t: '    rgba(0,212,255,0.45);',     c: 'c-num' },
    { t: '}',                             c: '' },
    { t: '.cube-scene {',                 c: 'c-sel' },
    { t: '  position: absolute;',         c: 'c-prop' },
    { t: '  right: 8%; top: 50%;',        c: 'c-yellow' },
    { t: '  transform: translateY(-50%);',c: 'c-red' },
    { t: '  width: 220px;',               c: 'c-num' },
    { t: '  height: 220px;',              c: 'c-num' },
    { t: '  perspective: 700px;',         c: 'c-prop' },
    { t: '}',                             c: '' },
    { t: '.cube {',                       c: 'c-sel' },
    { t: '  transform-style:',            c: 'c-prop' },
    { t: '    preserve-3d;',              c: 'c-yellow' },
    { t: '  animation: rotateCube',       c: 'c-fn' },
    { t: '    18s linear infinite;',      c: 'c-red' },
    { t: '}',                             c: '' },
    { t: '@keyframes rotateCube {',       c: 'c-at' },
    { t: '  0%   { transform:',           c: 'c-kw' },
    { t: '    rotateX(15deg)',             c: 'c-yellow' },
    { t: '    rotateY(0deg); }',          c: 'c-yellow' },
    { t: '  100% { transform:',           c: 'c-kw' },
    { t: '    rotateX(15deg)',             c: 'c-red' },
    { t: '    rotateY(360deg); }',        c: 'c-red' },
    { t: '}',                             c: '' },
  ],
  'face-right': [
    { t: '/* mobile.css — Responsive */', c: 'c-comment' },
    { t: '/* CodePeeler v2 */',           c: 'c-comment' },
    { t: '',                              c: '' },
    { t: '/* Base reset */',              c: 'c-comment' },
    { t: '*, *::before,',                 c: 'c-sel' },
    { t: '*::after {',                    c: 'c-sel' },
    { t: '  box-sizing: border-box;',     c: 'c-prop' },
    { t: '  margin: 0;',                  c: 'c-yellow' },
    { t: '  padding: 0;',                 c: 'c-yellow' },
    { t: '}',                             c: '' },
    { t: '',                              c: '' },
    { t: '@media (max-width: 900px) {',   c: 'c-at' },
    { t: '  /* Hide 3D cube on mobile */', c: 'c-comment' },
    { t: '  .cube-scene {',               c: 'c-sel' },
    { t: '    display: none;',            c: 'c-red' },
    { t: '  }',                           c: '' },
    { t: '  .nav-links,',                 c: 'c-sel' },
    { t: '  .btn-nav {',                  c: 'c-sel' },
    { t: '    display: none;',            c: 'c-red' },
    { t: '  }',                           c: '' },
    { t: '  .nav-hamburger {',            c: 'c-sel' },
    { t: '    display: flex;',            c: 'c-str' },
    { t: '  }',                           c: '' },
    { t: '  .steps-grid {',              c: 'c-sel' },
    { t: '    flex-direction: column;',   c: 'c-yellow' },
    { t: '  }',                           c: '' },
    { t: '  .features-grid {',            c: 'c-sel' },
    { t: '    grid-template-columns:',    c: 'c-prop' },
    { t: '      1fr 1fr;',                c: 'c-num' },
    { t: '  }',                           c: '' },
    { t: '  .tool-wrapper {',             c: 'c-sel' },
    { t: '    grid-template-columns:',    c: 'c-prop' },
    { t: '      1fr;',                    c: 'c-red' },
    { t: '  }',                           c: '' },
    { t: '  .footer-inner {',             c: 'c-sel' },
    { t: '    flex-direction: column;',   c: 'c-yellow' },
    { t: '    gap: 40px;',                c: 'c-num' },
    { t: '  }',                           c: '' },
    { t: '}',                             c: '' },
    { t: '',                              c: '' },
    { t: '@media (max-width: 600px) {',   c: 'c-at' },
    { t: '  .features-grid {',            c: 'c-sel' },
    { t: '    grid-template-columns: 1fr;', c: 'c-red' },
    { t: '  }',                           c: '' },
    { t: '  .hero {',                     c: 'c-sel' },
    { t: '    padding:',                  c: 'c-prop' },
    { t: '      100px 20px 60px;',        c: 'c-yellow' },
    { t: '  }',                           c: '' },
    { t: '  h1 {',                        c: 'c-sel' },
    { t: '    font-size: 2rem;',          c: 'c-red' },
    { t: '  }',                           c: '' },
    { t: '  h2 {',                        c: 'c-sel' },
    { t: '    font-size: 1.4rem;',        c: 'c-yellow' },
    { t: '  }',                           c: '' },
    { t: '  .hero-stats {',               c: 'c-sel' },
    { t: '    gap: 16px;',                c: 'c-num' },
    { t: '    flex-wrap: wrap;',          c: 'c-prop' },
    { t: '  }',                           c: '' },
    { t: '  .stat-num {',                 c: 'c-sel' },
    { t: '    font-size: 1.2rem;',        c: 'c-red' },
    { t: '  }',                           c: '' },
    { t: '  .footer-bottom {',            c: 'c-sel' },
    { t: '    flex-direction: column;',   c: 'c-yellow' },
    { t: '    text-align: center;',       c: 'c-prop' },
    { t: '  }',                           c: '' },
    { t: '  .download-card {',            c: 'c-sel' },
    { t: '    flex-direction: column;',   c: 'c-yellow' },
    { t: '  }',                           c: '' },
    { t: '}',                             c: '' },
    { t: '',                              c: '' },
    { t: '@media (prefers-color-scheme:',  c: 'c-at' },
    { t: '  dark) {',                     c: 'c-at' },
    { t: '  :root {',                     c: 'c-sel' },
    { t: '    --bg: #04040A;',             c: 'c-prop' },
    { t: '    --text: #F0F0FF;',           c: 'c-white' },
    { t: '  }',                           c: '' },
    { t: '}',                             c: '' },
    { t: '',                              c: '' },
    { t: '@media (prefers-reduced-motion',  c: 'c-at' },
    { t: '    : reduce) {',              c: 'c-at' },
    { t: '  .cube {',                     c: 'c-sel' },
    { t: '    animation: none;',          c: 'c-red' },
    { t: '    transform:',                c: 'c-prop' },
    { t: '      rotateX(20deg)',           c: 'c-yellow' },
    { t: '      rotateY(30deg);',         c: 'c-yellow' },
    { t: '  }',                           c: '' },
    { t: '  .reveal {',                   c: 'c-sel' },
    { t: '    opacity: 1;',               c: 'c-num' },
    { t: '    transform: none;',          c: 'c-red' },
    { t: '  }',                           c: '' },
    { t: '}',                             c: '' },
  ],
};

// Per-face animation state
const faceState = {};
let cubeStartTime = Date.now();

function angularDiff(a, b) {
  // shortest angular distance from b to a, result in -180..180
  let d = ((a - b) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

function getFaceVisibility(faceKey) {
  const elapsed = (Date.now() - cubeStartTime) % CUBE_PERIOD;
  const cubeY = (elapsed / CUBE_PERIOD) * 360; // 0..360
  const targetAngle = FACE_CAM_ANGLE[faceKey];
  const diff = Math.abs(angularDiff(cubeY, targetAngle));
  // Also compute how far into the visible window we are (0=just entering, 1=dead center)
  const visibility = Math.max(0, 1 - diff / VIS_RANGE);
  return { visible: diff < VIS_RANGE, diff, visibility };
}

function getFaceContainer(faceKey) {
  const face = document.querySelector('.' + faceKey);
  if (!face) return null;
  let container = face.querySelector('.face-code');
  if (!container) {
    container = document.createElement('div');
    container.className = 'face-code';
    face.appendChild(container);
  }
  return container;
}

function resetFaceState(faceKey) {
  const s = faceState[faceKey];
  if (!s) return;
  clearTimeout(s.timer);
  s.lineIdx = 0;
  s.charIdx = 0;
  s.curEl = null;
  s.active = false;
  const container = getFaceContainer(faceKey);
  if (container) container.innerHTML = '';
}

function typeChar(faceKey) {
  const s = faceState[faceKey];
  if (!s || !s.active) return;

  const { visible } = getFaceVisibility(faceKey);
  if (!visible) {
    resetFaceState(faceKey);
    return;
  }

  const lines = FACE_CODE[faceKey];
  const container = getFaceContainer(faceKey);
  if (!container) return;

  // Loop back to start seamlessly
  if (s.lineIdx >= lines.length) s.lineIdx = 0;

  const { t, c } = lines[s.lineIdx];

  // New line — create element
  if (s.charIdx === 0) {
    s.curEl = document.createElement('div');
    s.curEl.className = 'code-line' + (c ? ' ' + c : '');
    // cursor span
    const cur = document.createElement('span');
    cur.className = 'cube-cursor';
    cur.textContent = '▋';
    s.curEl.appendChild(cur);
    container.appendChild(s.curEl);

    // Scroll-up: remove oldest line if over max
    const allLines = container.querySelectorAll('.code-line');
    if (allLines.length > MAX_LINES) {
      allLines[0].remove();
    }
  }

  if (s.charIdx < t.length) {
    const cur = s.curEl.querySelector('.cube-cursor');
    s.curEl.insertBefore(document.createTextNode(t[s.charIdx]), cur);
    s.charIdx++;
    s.timer = setTimeout(() => typeChar(faceKey), CHAR_MS);
  } else {
    // Line done — remove cursor, next line
    const cur = s.curEl.querySelector('.cube-cursor');
    if (cur) cur.remove();
    s.lineIdx++;
    s.charIdx = 0;
    s.curEl = null;
    s.timer = setTimeout(() => typeChar(faceKey), LINE_MS);
  }
}

function startCubeTyping() {
  // Init state for all faces
  Object.keys(FACE_CAM_ANGLE).forEach(key => {
    faceState[key] = {
      lineIdx: 0, charIdx: 0,
      curEl: null, active: false,
      timer: null,
    };
  });

  // Poll every 100ms — check visibility and start/stop typing
  setInterval(() => {
    Object.keys(FACE_CAM_ANGLE).forEach(key => {
      const { visible } = getFaceVisibility(key);
      const s = faceState[key];
      if (visible && !s.active) {
        s.active = true;
        typeChar(key);
      }
      // reset is handled inside typeChar when !visible
    });
  }, 100);
}

startCubeTyping();
