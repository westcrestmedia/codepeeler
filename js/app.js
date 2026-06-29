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

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    // Fallback to local parsing if API unavailable
    log(`  ⚠ API unavailable — using local parser`, 'warn');
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
// Cube rotates at 18s/360deg = 0.333 deg/ms
// Faces: front=0, right=90, back=180, left=270
// Visible threshold: face angle within ±70deg of camera (front view)

const CUBE_PERIOD   = 18000; // ms for full rotation
const VISIBLE_RANGE = 80;    // degrees either side of 0/360 = visible
const CHAR_SPEED    = 42;    // ms per character
const LINE_PAUSE    = 200;   // ms pause after each line
const MAX_VISIBLE   = 6;     // max lines shown at once (scroll effect)

const faceAngles = {
  'face-front': 0,
  'face-right':  90,
  'face-back':  180,
  'face-left':  270,
};

// Longer, richer code per face — more characters to type
const cubeCodeLines = {
  'face-front': [
    { text: '<!DOCTYPE html>', cls: 'c-tag' },
    { text: '<html lang="en">', cls: 'c-tag' },
    { text: '<head>', cls: 'c-tag' },
    { text: '  <meta charset="UTF-8">', cls: 'c-tag' },
    { text: '  <title>CodePeeler</title>', cls: 'c-tag' },
    { text: '  <link rel="stylesheet"', cls: 'c-tag' },
    { text: '    href="style.css">', cls: 'c-str' },
    { text: '</head>', cls: 'c-tag' },
    { text: '<body>', cls: 'c-tag' },
    { text: '<nav class="navbar">', cls: 'c-tag' },
    { text: '  <a class="logo">', cls: 'c-tag' },
    { text: '    <span>⟨/⟩</span>', cls: 'c-tag' },
    { text: '    CodePeeler', cls: '' },
    { text: '  </a>', cls: 'c-tag' },
    { text: '  <ul class="links">', cls: 'c-tag' },
    { text: '    <li><a href="#tool">', cls: 'c-tag' },
    { text: '      Try Now', cls: '' },
    { text: '    </a></li>', cls: 'c-tag' },
    { text: '  </ul>', cls: 'c-tag' },
    { text: '</nav>', cls: 'c-tag' },
    { text: '<section class="hero">', cls: 'c-tag' },
    { text: '  <h1>One Messy File.</h1>', cls: 'c-tag' },
    { text: '  <p>Upload entangled HTML</p>', cls: 'c-tag' },
    { text: '  <a href="#tool">', cls: 'c-tag' },
    { text: '    Start Peeling →', cls: '' },
    { text: '  </a>', cls: 'c-tag' },
    { text: '</section>', cls: 'c-tag' },
    { text: '<script src="app.js">', cls: 'c-tag' },
    { text: '</script>', cls: 'c-tag' },
    { text: '</body>', cls: 'c-tag' },
    { text: '</html>', cls: 'c-tag' },
  ],
  'face-back': [
    { text: '/* CodePeeler Styles */', cls: 'c-comment' },
    { text: ':root {', cls: 'c-sel' },
    { text: '  --bg: #080811;', cls: 'c-prop' },
    { text: '  --cyan: #00D4FF;', cls: 'c-prop' },
    { text: '  --purple: #7B61FF;', cls: 'c-prop' },
    { text: '  --green: #00FF9C;', cls: 'c-prop' },
    { text: '}', cls: '' },
    { text: 'body {', cls: 'c-sel' },
    { text: '  background: var(--bg);', cls: 'c-prop' },
    { text: '  color: #E8E8F0;', cls: 'c-val' },
    { text: '  font-family: Inter;', cls: 'c-prop' },
    { text: '  overflow-x: hidden;', cls: 'c-prop' },
    { text: '}', cls: '' },
    { text: '.navbar {', cls: 'c-sel' },
    { text: '  position: fixed;', cls: 'c-prop' },
    { text: '  top: 0; left: 0;', cls: 'c-prop' },
    { text: '  backdrop-filter:', cls: 'c-prop' },
    { text: '    blur(20px);', cls: 'c-val' },
    { text: '  z-index: 100;', cls: 'c-prop' },
    { text: '}', cls: '' },
    { text: '.hero {', cls: 'c-sel' },
    { text: '  min-height: 100vh;', cls: 'c-prop' },
    { text: '  display: flex;', cls: 'c-prop' },
    { text: '  align-items: center;', cls: 'c-prop' },
    { text: '}', cls: '' },
    { text: '.hero-title {', cls: 'c-sel' },
    { text: '  font-size: clamp(', cls: 'c-prop' },
    { text: '    2.5rem, 6vw, 4rem);', cls: 'c-val' },
    { text: '  font-weight: 700;', cls: 'c-prop' },
    { text: '}', cls: '' },
    { text: '.btn-primary {', cls: 'c-sel' },
    { text: '  background: linear-gradient(', cls: 'c-prop' },
    { text: '    135deg, cyan, purple);', cls: 'c-val' },
    { text: '}', cls: '' },
  ],
  'face-left': [
    { text: '/* CodePeeler App */', cls: 'c-comment' },
    { text: 'const state = {', cls: 'c-kw' },
    { text: '  files: [],', cls: '' },
    { text: '  processing: false,', cls: '' },
    { text: '  outputZip: null,', cls: '' },
    { text: '};', cls: '' },
    { text: 'const $ = id =>', cls: 'c-kw' },
    { text: '  document.getElementById(id);', cls: 'c-fn' },
    { text: 'const dropzone = $("dropzone");', cls: 'c-fn' },
    { text: 'const processBtn = $("processBtn");', cls: 'c-fn' },
    { text: 'async function handleFiles(files) {', cls: 'c-kw' },
    { text: '  for (const file of files) {', cls: 'c-kw' },
    { text: '    if (file.name.endsWith(', cls: '' },
    { text: '        ".zip")) {', cls: 'c-str' },
    { text: '      await extractZip(file);', cls: 'c-fn' },
    { text: '    } else {', cls: 'c-kw' },
    { text: '      const txt =', cls: 'c-kw' },
    { text: '        await readFile(file);', cls: 'c-fn' },
    { text: '      addFile(file.name, txt);', cls: 'c-fn' },
    { text: '    }', cls: '' },
    { text: '  }', cls: '' },
    { text: '  renderFileList();', cls: 'c-fn' },
    { text: '}', cls: '' },
    { text: 'async function processFile(f) {', cls: 'c-kw' },
    { text: '  const res = await fetch(', cls: 'c-fn' },
    { text: '    API_URL, { method: "POST",', cls: 'c-str' },
    { text: '    body: JSON.stringify(f)', cls: 'c-fn' },
    { text: '  });', cls: '' },
    { text: '  return res.json();', cls: 'c-kw' },
    { text: '}', cls: '' },
    { text: 'startCubeTyping();', cls: 'c-fn' },
  ],
  'face-right': [
    { text: '/* Responsive Styles */', cls: 'c-comment' },
    { text: '@media (max-width: 900px) {', cls: 'c-at' },
    { text: '  .cube-scene {', cls: 'c-sel' },
    { text: '    display: none;', cls: 'c-prop' },
    { text: '  }', cls: '' },
    { text: '  .hero-content {', cls: 'c-sel' },
    { text: '    max-width: 100%;', cls: 'c-prop' },
    { text: '  }', cls: '' },
    { text: '  .steps-grid {', cls: 'c-sel' },
    { text: '    flex-direction: column;', cls: 'c-prop' },
    { text: '  }', cls: '' },
    { text: '  .tool-wrapper {', cls: 'c-sel' },
    { text: '    grid-template-columns: 1fr;', cls: 'c-prop' },
    { text: '  }', cls: '' },
    { text: '}', cls: '' },
    { text: '@media (max-width: 600px) {', cls: 'c-at' },
    { text: '  .hero {', cls: 'c-sel' },
    { text: '    padding: 100px 20px 60px;', cls: 'c-prop' },
    { text: '  }', cls: '' },
    { text: '  .features-grid {', cls: 'c-sel' },
    { text: '    grid-template-columns: 1fr;', cls: 'c-prop' },
    { text: '  }', cls: '' },
    { text: '  .footer-bottom {', cls: 'c-sel' },
    { text: '    flex-direction: column;', cls: 'c-prop' },
    { text: '    text-align: center;', cls: 'c-prop' },
    { text: '  }', cls: '' },
    { text: '}', cls: '' },
    { text: '@media (prefers-reduced-motion) {', cls: 'c-at' },
    { text: '  .cube { animation: none; }', cls: 'c-prop' },
    { text: '}', cls: '' },
  ],
};

// Track per-face state
const faceStates = {};

function isFaceVisible(faceClass) {
  const startTime = faceStates[faceClass]?.startTime || cubeStartTime;
  const elapsed = (Date.now() - cubeStartTime) % CUBE_PERIOD;
  const currentAngle = (elapsed / CUBE_PERIOD) * 360; // 0..360
  const faceAngle = faceAngles[faceClass];
  // Normalize angle difference to -180..180
  let diff = ((currentAngle - faceAngle) + 360) % 360;
  if (diff > 180) diff -= 360;
  return Math.abs(diff) <= VISIBLE_RANGE;
}

let cubeStartTime = Date.now();

function initFaceState(faceClass) {
  const face = document.querySelector('.' + faceClass);
  if (!face) return;
  let container = face.querySelector('.face-code');
  if (!container) {
    container = document.createElement('div');
    container.className = 'face-code';
    face.appendChild(container);
  }
  faceStates[faceClass] = {
    container,
    lineIndex: 0,
    charIndex: 0,
    currentLineEl: null,
    typing: false,
    wasVisible: false,
    timer: null,
  };
}

function resetFace(faceClass) {
  const s = faceStates[faceClass];
  if (!s) return;
  clearTimeout(s.timer);
  s.container.innerHTML = '';
  s.lineIndex = 0;
  s.charIndex = 0;
  s.currentLineEl = null;
  s.typing = false;
}

function typeNextChar(faceClass) {
  const s = faceStates[faceClass];
  if (!s) return;

  // Stop if face went invisible
  if (!isFaceVisible(faceClass)) {
    s.typing = false;
    resetFace(faceClass);
    return;
  }

  const lines = cubeCodeLines[faceClass];
  if (!lines) return;

  // Wrap around continuously
  if (s.lineIndex >= lines.length) {
    s.lineIndex = 0;
  }

  const { text, cls } = lines[s.lineIndex];

  // Start new line element
  if (s.charIndex === 0) {
    s.currentLineEl = document.createElement('div');
    s.currentLineEl.className = 'code-line' + (cls ? ' ' + cls : '');
    const cursor = document.createElement('span');
    cursor.className = 'cube-cursor';
    cursor.textContent = '▋';
    s.currentLineEl.appendChild(cursor);
    s.container.appendChild(s.currentLineEl);

    // Scroll effect: remove oldest line if too many visible
    const allLines = s.container.querySelectorAll('.code-line');
    if (allLines.length > MAX_VISIBLE) {
      allLines[0].remove();
    }
  }

  if (s.charIndex < text.length) {
    // Type one character
    const cursor = s.currentLineEl.querySelector('.cube-cursor');
    const textNode = document.createTextNode(text[s.charIndex]);
    s.currentLineEl.insertBefore(textNode, cursor);
    s.charIndex++;
    s.timer = setTimeout(() => typeNextChar(faceClass), CHAR_SPEED);
  } else {
    // Line done
    const cursor = s.currentLineEl.querySelector('.cube-cursor');
    if (cursor) cursor.remove();
    s.lineIndex++;
    s.charIndex = 0;
    s.currentLineEl = null;
    s.timer = setTimeout(() => typeNextChar(faceClass), LINE_PAUSE);
  }
}

function startTypingOnFace(faceClass) {
  const s = faceStates[faceClass];
  if (!s || s.typing) return;
  s.typing = true;
  typeNextChar(faceClass);
}

function startCubeTyping() {
  // Init all face states
  Object.keys(faceAngles).forEach(initFaceState);

  // Poll every 200ms to check which faces are visible
  setInterval(() => {
    Object.keys(faceAngles).forEach(faceClass => {
      const s = faceStates[faceClass];
      if (!s) return;
      const visible = isFaceVisible(faceClass);
      if (visible && !s.typing) {
        startTypingOnFace(faceClass);
      }
      // If it just became invisible, reset will happen inside typeNextChar
    });
  }, 200);
}

startCubeTyping();
