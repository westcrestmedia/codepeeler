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
// CSS: rotateCube goes rotateX(15deg) rotateY(0→360deg) in 18s
// Face CSS transforms:
//   face-front:  rotateY(0deg)    translateZ(110px)  → visible at cube Y=0
//   face-right:  rotateY(90deg)   translateZ(110px)  → visible at cube Y=270 (360-90)
//   face-back:   rotateY(180deg)  translateZ(110px)  → visible at cube Y=180
//   face-left:   rotateY(-90deg)  translateZ(110px)  → visible at cube Y=90
// A face is "front-facing" when cubeY ≈ faceOffset (within ±75deg)

const CUBE_PERIOD  = 18000;  // ms — must match CSS animation duration
const VIS_RANGE    = 82;     // degrees half-window of visibility
const CHAR_MS      = 28;     // ms per character (faster)
const LINE_MS      = 140;    // ms pause after line complete
const MAX_LINES    = 7;      // max lines before scroll-up

// cubeY when this face points toward camera
const FACE_CAM_ANGLE = {
  'face-front': 0,
  'face-left':  90,   // rotateY(-90) on face means cube must be at +90 to bring it forward
  'face-back':  180,
  'face-right': 270,  // rotateY(+90) on face means cube must be at 270 to bring it forward
};

const FACE_CODE = {
  'face-front': [
    { t: '<!DOCTYPE html>',              c: 'c-tag' },
    { t: '<html lang="en">',             c: 'c-tag' },
    { t: '<head>',                       c: 'c-tag' },
    { t: '  <meta charset="UTF-8">',     c: 'c-tag' },
    { t: '  <meta name="viewport"',      c: 'c-tag' },
    { t: '    content="width=device-width">', c: 'c-str' },
    { t: '  <title>CodePeeler</title>',  c: 'c-tag' },
    { t: '  <link rel="stylesheet"',     c: 'c-tag' },
    { t: '        href="css/style.css">', c: 'c-str' },
    { t: '</head>',                      c: 'c-tag' },
    { t: '<body>',                       c: 'c-tag' },
    { t: '<nav class="navbar" id="navbar">', c: 'c-tag' },
    { t: '  <div class="nav-inner">',    c: 'c-tag' },
    { t: '    <a href="#" class="nav-logo">', c: 'c-tag' },
    { t: '      <span>⟨/⟩</span>',      c: 'c-tag' },
    { t: '      CodePeeler',             c: '' },
    { t: '    </a>',                     c: 'c-tag' },
    { t: '    <ul class="nav-links">',   c: 'c-tag' },
    { t: '      <li><a href="#tool">',   c: 'c-tag' },
    { t: '        Try Now',              c: '' },
    { t: '      </a></li>',             c: 'c-tag' },
    { t: '    </ul>',                    c: 'c-tag' },
    { t: '  </div>',                     c: 'c-tag' },
    { t: '</nav>',                       c: 'c-tag' },
    { t: '<section class="hero">',       c: 'c-tag' },
    { t: '  <div class="hero-content">', c: 'c-tag' },
    { t: '    <h1>One Messy File.</h1>', c: 'c-tag' },
    { t: '    <p>Perfect Output.</p>',   c: 'c-tag' },
    { t: '    <a href="#tool"',          c: 'c-tag' },
    { t: '       class="btn btn-primary">', c: 'c-str' },
    { t: '      Start Peeling →',        c: '' },
    { t: '    </a>',                     c: 'c-tag' },
    { t: '  </div>',                     c: 'c-tag' },
    { t: '</section>',                   c: 'c-tag' },
    { t: '<script src="js/app.js">',     c: 'c-tag' },
    { t: '</script>',                    c: 'c-tag' },
    { t: '</body>',                      c: 'c-tag' },
    { t: '</html>',                      c: 'c-tag' },
  ],
  'face-left': [
    { t: '/* CodePeeler — app.js */',    c: 'c-comment' },
    { t: "const API = 'https://",        c: 'c-str' },
    { t: "  api.anthropic.com/v1';",     c: 'c-str' },
    { t: 'const state = {',              c: 'c-kw' },
    { t: '  files: [],',                 c: '' },
    { t: '  processing: false,',         c: '' },
    { t: '  outputZip: null,',           c: '' },
    { t: '};',                           c: '' },
    { t: 'const $ = id =>',              c: 'c-kw' },
    { t: '  document.getElementById(id);', c: 'c-fn' },
    { t: 'const dropzone = $("dropzone");', c: 'c-fn' },
    { t: 'const processBtn =',           c: 'c-kw' },
    { t: '  $("processBtn");',           c: 'c-fn' },
    { t: 'async function handleFiles(rawFiles) {', c: 'c-kw' },
    { t: '  for (const f of rawFiles) {', c: 'c-kw' },
    { t: '    if (f.name.endsWith(".zip")) {', c: 'c-str' },
    { t: '      await extractZip(f);',   c: 'c-fn' },
    { t: '    } else if (f.name',        c: 'c-kw' },
    { t: '      .endsWith(".html")) {',  c: 'c-str' },
    { t: '      const txt =',            c: 'c-kw' },
    { t: '        await readFile(f);',   c: 'c-fn' },
    { t: '      addFile(f.name, txt);',  c: 'c-fn' },
    { t: '    }',                        c: '' },
    { t: '  }',                          c: '' },
    { t: '  renderFileList();',          c: 'c-fn' },
    { t: '}',                            c: '' },
    { t: 'processBtn.addEventListener(', c: 'c-fn' },
    { t: "  'click', startProcessing);", c: 'c-str' },
    { t: 'async function startProcessing() {', c: 'c-kw' },
    { t: '  if (!state.files.length) return;', c: '' },
    { t: '  state.processing = true;',   c: '' },
    { t: '  const zip = new JSZip();',   c: 'c-fn' },
    { t: '  for (const file of state.files) {', c: 'c-kw' },
    { t: '    const result =',           c: 'c-kw' },
    { t: '      await processFileWithAI(file);', c: 'c-fn' },
    { t: '    zip.file(file.name, result.html);', c: 'c-fn' },
    { t: '  }',                          c: '' },
    { t: '  const blob = await zip',     c: 'c-fn' },
    { t: "    .generateAsync({type:'blob'});", c: 'c-str' },
    { t: '  state.outputZip = blob;',    c: '' },
    { t: '}',                            c: '' },
  ],
  'face-back': [
    { t: '/* CodePeeler — style.css */', c: 'c-comment' },
    { t: ':root {',                      c: 'c-sel' },
    { t: '  --bg:     #080811;',         c: 'c-prop' },
    { t: '  --cyan:   #00D4FF;',         c: 'c-prop' },
    { t: '  --purple: #7B61FF;',         c: 'c-prop' },
    { t: '  --green:  #00FF9C;',         c: 'c-prop' },
    { t: '  --orange: #FFB86C;',         c: 'c-prop' },
    { t: '  --radius: 12px;',            c: 'c-prop' },
    { t: '}',                            c: '' },
    { t: 'body {',                       c: 'c-sel' },
    { t: '  background: var(--bg);',     c: 'c-prop' },
    { t: '  color: #E8E8F0;',            c: 'c-val' },
    { t: "  font-family: 'Inter',sans-serif;", c: 'c-prop' },
    { t: '  overflow-x: hidden;',        c: 'c-prop' },
    { t: '}',                            c: '' },
    { t: '.navbar {',                    c: 'c-sel' },
    { t: '  position: fixed;',           c: 'c-prop' },
    { t: '  top: 0; left: 0; right: 0;', c: 'c-prop' },
    { t: '  backdrop-filter: blur(20px);', c: 'c-val' },
    { t: '  z-index: 100;',              c: 'c-prop' },
    { t: '  border-bottom: 1px solid',  c: 'c-prop' },
    { t: '    var(--border);',           c: 'c-val' },
    { t: '}',                            c: '' },
    { t: '.hero {',                      c: 'c-sel' },
    { t: '  min-height: 100vh;',         c: 'c-prop' },
    { t: '  display: flex;',             c: 'c-prop' },
    { t: '  align-items: center;',       c: 'c-prop' },
    { t: '  padding: 120px 24px 80px;',  c: 'c-prop' },
    { t: '}',                            c: '' },
    { t: '.hero-title {',                c: 'c-sel' },
    { t: '  font-size: clamp(',          c: 'c-prop' },
    { t: '    2.5rem, 6vw, 4rem);',      c: 'c-val' },
    { t: '  font-weight: 700;',          c: 'c-prop' },
    { t: '  color: #fff;',               c: 'c-val' },
    { t: '}',                            c: '' },
    { t: '.btn-primary {',               c: 'c-sel' },
    { t: '  background: linear-gradient(', c: 'c-prop' },
    { t: '    135deg,',                  c: '' },
    { t: '    var(--cyan),',             c: 'c-val' },
    { t: '    var(--purple));',          c: 'c-val' },
    { t: '  color: #000;',               c: 'c-val' },
    { t: '}',                            c: '' },
  ],
  'face-right': [
    { t: '/* Responsive — mobile.css */', c: 'c-comment' },
    { t: '@media (max-width: 900px) {',  c: 'c-at' },
    { t: '  .cube-scene {',              c: 'c-sel' },
    { t: '    display: none;',           c: 'c-prop' },
    { t: '  }',                          c: '' },
    { t: '  .nav-links, .btn-nav {',     c: 'c-sel' },
    { t: '    display: none;',           c: 'c-prop' },
    { t: '  }',                          c: '' },
    { t: '  .nav-hamburger {',           c: 'c-sel' },
    { t: '    display: flex;',           c: 'c-prop' },
    { t: '  }',                          c: '' },
    { t: '  .steps-grid {',              c: 'c-sel' },
    { t: '    flex-direction: column;',  c: 'c-prop' },
    { t: '  }',                          c: '' },
    { t: '  .features-grid {',           c: 'c-sel' },
    { t: '    grid-template-columns:',   c: 'c-prop' },
    { t: '      1fr 1fr;',               c: 'c-val' },
    { t: '  }',                          c: '' },
    { t: '  .tool-wrapper {',            c: 'c-sel' },
    { t: '    grid-template-columns:',   c: 'c-prop' },
    { t: '      1fr;',                   c: 'c-val' },
    { t: '  }',                          c: '' },
    { t: '}',                            c: '' },
    { t: '@media (max-width: 600px) {',  c: 'c-at' },
    { t: '  .hero {',                    c: 'c-sel' },
    { t: '    padding: 100px 20px 60px;', c: 'c-prop' },
    { t: '  }',                          c: '' },
    { t: '  h1 { font-size: 2rem; }',    c: 'c-prop' },
    { t: '  .footer-bottom {',           c: 'c-sel' },
    { t: '    flex-direction: column;',  c: 'c-prop' },
    { t: '    text-align: center;',      c: 'c-prop' },
    { t: '  }',                          c: '' },
    { t: '}',                            c: '' },
    { t: '@media (prefers-reduced-motion) {', c: 'c-at' },
    { t: '  .cube { animation: none; }', c: 'c-prop' },
    { t: '  .reveal { opacity: 1; }',    c: 'c-prop' },
    { t: '}',                            c: '' },
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
