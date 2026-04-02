
import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const extensionName = 'font-manager';
const defaultSettings = {
  selectedFont: null,
  customFontId: null,
  fontSize: 0,
  scope: 'chat'
};

const BUILTIN_FONTS = [
  {
    id: 'system',
    name: '系统默认',
    family: 'inherit',
    preview: '系统默认字体 ABCabc',
    css: null
  },
  {
    id: 'lxgw',
    name: '霞鹜文楷',
    family: '"LXGW WenKai"',
    preview: '霞鹜文楷 落霞与孤鹜齐飞',
    css: '@import url("https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css");'
  },
  {
    id: 'noto-serif',
    name: '思源宋体',
    family: '"Noto Serif SC"',
    preview: '思源宋体 秋水共长天一色',
    css: '@import url("https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&display=swap");'
  },
  {
    id: 'noto-sans',
    name: '思源黑体',
    family: '"Noto Sans SC"',
    preview: '思源黑体 千里之行始于足下',
    css: '@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap");'
  },
  {
    id: 'zcool',
    name: '站酷小薇',
    family: '"ZCOOL XiaoWei"',
    preview: '站酷小薇 山高月小水落石出',
    css: '@import url("https://fonts.googleapis.com/css2?family=ZCOOL+XiaoWei&display=swap");'
  },
  {
    id: 'mashang',
    name: '马善政楷体',
    family: '"Ma Shan Zheng"',
    preview: '马善政楷 清风明月本无价',
    css: '@import url("https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap");'
  }
];

let customFonts = [];
let fontFaceStyle = null;
let injectedStyle = null;

// ========= IndexedDB 存储 =========
const FmDB = {
  db: null,
  open: function() {
    return new Promise(function(resolve) {
      if (FmDB.db) return resolve(FmDB.db);
      const req = indexedDB.open('FmFontDB', 1);
      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('fonts')) {
          db.createObjectStore('fonts', { keyPath: 'id' });
        }
      };
      req.onsuccess = function(e) {
        FmDB.db = e.target.result;
        resolve(FmDB.db);
      };
      req.onerror = function() { resolve(null); };
    });
  },
  save: async function(obj) {
    const db = await FmDB.open();
    if (!db) return false;
    return new Promise(function(resolve) {
      const tx = db.transaction('fonts', 'readwrite');
      tx.objectStore('fonts').put(obj);
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { resolve(false); };
    });
  },
  getAll: async function() {
    const db = await FmDB.open();
    if (!db) return [];
    return new Promise(function(resolve) {
      const tx = db.transaction('fonts', 'readonly');
      const req = tx.objectStore('fonts').getAll();
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { resolve([]); };
    });
  },
  remove: async function(id) {
    const db = await FmDB.open();
    if (!db) return;
    return new Promise(function(resolve) {
      const tx = db.transaction('fonts', 'readwrite');
      tx.objectStore('fonts').delete(id);
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { resolve(false); };
    });
  }
};

function getSettings() {
  if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = Object.assign({}, defaultSettings);
  }
  return extension_settings[extensionName];
}

function getCustomFontMetas() {
  try {
    const raw = localStorage.getItem('fm_custom_font_metas');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveCustomFontMetas() {
  const metas = customFonts.map(function(f) {
    return { id: f.id, name: f.name, familyName: f.familyName };
  });
  localStorage.setItem('fm_custom_font_metas', JSON.stringify(metas));
}

function ensureStyleElements() {
  if (!fontFaceStyle) {
    fontFaceStyle = document.getElementById('fm-fontface-style');
    if (!fontFaceStyle) {
      fontFaceStyle = document.createElement('style');
      fontFaceStyle.id = 'fm-fontface-style';
      document.head.appendChild(fontFaceStyle);
    }
  }
  if (!injectedStyle) {
    injectedStyle = document.getElementById('fm-injected-style');
    if (!injectedStyle) {
      injectedStyle = document.createElement('style');
      injectedStyle.id = 'fm-injected-style';
      document.head.appendChild(injectedStyle);
    }
  }
}

function registerCustomFont(font) {
  ensureStyleElements();
  fontFaceStyle.textContent += '\n@font-face { font-family: "' + font.familyName + '"; src: url(' + font.dataUrl + '); font-display: swap; }';
}

function applyFont() {
  ensureStyleElements();
  const settings = getSettings();
  let family = 'inherit';
  let importCss = '';

  if (settings.customFontId) {
    const cf = customFonts.find(function(f) { return f.id === settings.customFontId; });
    if (cf) {
      family = '"' + cf.familyName + '"';
    }
  } else if (settings.selectedFont && settings.selectedFont !== 'system') {
    const bf = BUILTIN_FONTS.find(function(f) { return f.id === settings.selectedFont; });
    if (bf) {
      family = bf.family;
      if (bf.css) importCss = bf.css;
    }
  }

  const sizeRule = settings.fontSize
    ? 'font-size: ' + settings.fontSize + 'px !important;'
    : '';

  let selector = '';
  switch (settings.scope) {
    case 'chat':
      selector = '.mes_text';
      break;
    case 'ui':
      selector = 'body, .mes_text, #chat, .drawer-content, textarea, input, select, button';
      break;
    case 'input':
      selector = '#send_textarea, .mes_text';
      break;
    default:
      selector = '.mes_text';
  }

  const familyRule = family !== 'inherit'
    ? 'font-family: ' + family + ', sans-serif !important;'
    : '';

  injectedStyle.textContent = importCss + '\n' + selector + ' { ' + familyRule + ' ' + sizeRule + ' }';
}

function renderBuiltinList() {
  const settings = getSettings();
  const container = document.getElementById('fm-builtin-list');
  if (!container) return;

  container.innerHTML = BUILTIN_FONTS.map(function(f) {
    const isActive = !settings.customFontId && settings.selectedFont === f.id;
    return '<div class="fm-font-item ' + (isActive ? 'active' : '') + '" data-font-id="' + f.id + '">' +
      '<div>' +
        '<div class="fm-font-preview" style="font-family:' + f.family + ', sans-serif">' + f.preview + '</div>' +
        '<div class="fm-font-name">' + f.name + '</div>' +
      '</div>' +
      '<div class="fm-radio"></div>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.fm-font-item').forEach(function(item) {
    item.addEventListener('click', function() {
      const id = item.dataset.fontId;
      const s = getSettings();
      s.selectedFont = id;
      s.customFontId = null;
      saveSettingsDebounced();
      applyFont();
      renderBuiltinList();
      renderCustomList();
    });
  });
}

function renderCustomList() {
  const settings = getSettings();
  const container = document.getElementById('fm-custom-list');
  if (!container) return;

  if (!customFonts.length) {
    container.innerHTML = '<div style="font-size:12px;opacity:0.5;padding:4px;">暂无自定义字体</div>';
    return;
  }

  container.innerHTML = customFonts.map(function(f, idx) {
    const isActive = settings.customFontId === f.id;
    return '<div class="fm-custom-item ' + (isActive ? 'active' : '') + '" data-idx="' + idx + '">' +
      '<div class="fm-custom-item-left" data-idx="' + idx + '">' +
        '<div class="fm-radio"></div>' +
        '<div>' +
          '<div class="fm-font-preview" style="font-family:\'' + f.familyName + '\', sans-serif">' + f.name + ' 永远相信美好</div>' +
          '<div class="fm-font-name">' + f.name + '</div>' +
        '</div>' +
      '</div>' +
      '<button class="fm-del-btn" data-delidx="' + idx + '" type="button">x</button>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.fm-custom-item-left').forEach(function(el) {
    el.addEventListener('click', function() {
      const idx = parseInt(el.dataset.idx);
      const f = customFonts[idx];
      if (!f) return;
      const s = getSettings();
      s.customFontId = f.id;
      s.selectedFont = null;
      saveSettingsDebounced();
      applyFont();
      renderBuiltinList();
      renderCustomList();
    });
  });

  container.querySelectorAll('.fm-del-btn').forEach(function(btn) {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.delidx);
      const removed = customFonts.splice(idx, 1)[0];
      if (removed) {
        await FmDB.remove(removed.id);
      }
      saveCustomFontMetas();

      const s = getSettings();
      if (removed && s.customFontId === removed.id) {
        s.customFontId = null;
        s.selectedFont = 'system';
        saveSettingsDebounced();
        applyFont();
      }
      renderBuiltinList();
      renderCustomList();
      toastr.info('已删除: ' + (removed ? removed.name : ''));
    });
  });
}

function buildSettingsHtml() {
  return '<div id="font-manager-settings">' +
    '<div class="fm-title">字体管理器</div>' +

    '<div class="fm-section">' +
      '<div class="fm-section-label">内置字体</div>' +
      '<div class="fm-font-list" id="fm-builtin-list"></div>' +
    '</div>' +

    '<div class="fm-section">' +
      '<div class="fm-section-label">自定义字体</div>' +
      '<div class="fm-upload-area" id="fm-upload-area">' +
        '点击上传字体文件 (.ttf / .otf / .woff / .woff2)' +
      '</div>' +
      '<input type="file" id="fm-font-file" accept=".ttf,.otf,.woff,.woff2" hidden>' +
      '<div class="fm-custom-list" id="fm-custom-list"></div>' +
    '</div>' +

    '<div class="fm-section">' +
      '<div class="fm-section-label">字号调整（0 = 不改）</div>' +
      '<div class="fm-range-row">' +
        '<input type="range" id="fm-font-size" min="0" max="28" step="1" value="0">' +
        '<span class="fm-range-val" id="fm-font-size-val">0</span>' +
      '</div>' +
    '</div>' +

    '<div class="fm-section">' +
      '<div class="fm-section-label">应用范围</div>' +
      '<div class="fm-scope-row" id="fm-scope-row">' +
        '<div class="fm-scope-btn" data-scope="chat">仅聊天消息</div>' +
        '<div class="fm-scope-btn" data-scope="input">聊天 + 输入框</div>' +
        '<div class="fm-scope-btn" data-scope="ui">整个页面</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function initSettingsPanel() {
  const settings = getSettings();

  const sizeSlider = document.getElementById('fm-font-size');
  const sizeVal = document.getElementById('fm-font-size-val');
  if (sizeSlider) {
    sizeSlider.value = settings.fontSize || 0;
    sizeVal.textContent = settings.fontSize || 0;
    sizeSlider.addEventListener('input', function() {
      const v = parseInt(sizeSlider.value);
      sizeVal.textContent = v;
      getSettings().fontSize = v;
      saveSettingsDebounced();
      applyFont();
    });
  }

  const scopeRow = document.getElementById('fm-scope-row');
  if (scopeRow) {
    const currentScope = settings.scope || 'chat';
    scopeRow.querySelectorAll('.fm-scope-btn').forEach(function(btn) {
      if (btn.dataset.scope === currentScope) btn.classList.add('active');
      btn.addEventListener('click', function() {
        scopeRow.querySelectorAll('.fm-scope-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        getSettings().scope = btn.dataset.scope;
        saveSettingsDebounced();
        applyFont();
      });
    });
  }

  const uploadArea = document.getElementById('fm-upload-area');
  const fileInput = document.getElementById('fm-font-file');
  if (uploadArea && fileInput) {
    uploadArea.addEventListener('click', function() {
      fileInput.click();
    });

    fileInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;

      const fontName = file.name.replace(/\.(ttf|otf|woff|woff2)$/i, '');
      const familyName = 'FM-' + fontName + '-' + Date.now();
      const fontId = 'fm-' + Date.now();

      toastr.info('正在加载: ' + fontName + ' (' + (file.size / 1024 / 1024).toFixed(1) + 'MB)');

      const reader = new FileReader();
      reader.onload = async function(ev) {
        const dataUrl = ev.target.result;

        // 存到 IndexedDB
        const saved = await FmDB.save({
          id: fontId,
          familyName: familyName,
          name: fontName,
          dataUrl: dataUrl
        });

        if (!saved) {
          toastr.error('字体存储失败');
          return;
        }

        registerCustomFont({ familyName: familyName, dataUrl: dataUrl });

        customFonts.push({
          id: fontId,
          name: fontName,
          familyName: familyName,
          dataUrl: dataUrl
        });
        saveCustomFontMetas();

        const s = getSettings();
        s.customFontId = fontId;
        s.selectedFont = null;
        saveSettingsDebounced();
        applyFont();
        renderBuiltinList();
        renderCustomList();
        toastr.success('字体已添加: ' + fontName);
      };

      reader.onerror = function() {
        toastr.error('读取字体失败');
      };

      reader.readAsDataURL(file);
      fileInput.value = '';
    });
  }

  renderBuiltinList();
  renderCustomList();
}

async function restoreCustomFonts() {
  const metas = getCustomFontMetas();
  if (!metas.length) return;

  const allFonts = await FmDB.getAll();

  for (let i = 0; i < metas.length; i++) {
    const meta = metas[i];
    const full = allFonts.find(function(f) { return f.id === meta.id; });
    if (full && full.dataUrl) {
      registerCustomFont({ familyName: full.familyName, dataUrl: full.dataUrl });
      customFonts.push({
        id: full.id,
        name: full.name,
        familyName: full.familyName,
        dataUrl: full.dataUrl
      });
    }
  }
}

jQuery(async function() {
  const settingsHtml = buildSettingsHtml();
  $('#extensions_settings2').append(settingsHtml);

  ensureStyleElements();

  const settings = getSettings();
  if (!settings.selectedFont && !settings.customFontId) {
    settings.selectedFont = 'system';
  }

  await restoreCustomFonts();
  initSettingsPanel();
  applyFont();
});
