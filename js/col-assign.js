/**
 * MSA.ColAssign — JASP tarzı "sütun havuzu → rol kutusu" veri atama bileşeni.
 *
 * Kullanıcı adlandırılabilir sütunlardan oluşan bir tabloya veri girer/yapıştırır,
 * sonra sütunları (sürükle-bırak veya ► ◄ ile) rol kutularına taşır. Host sayfa
 * atamayı okuyup kendi uzun-formatına (operator/part/trial/measurement vb.) çevirir.
 *
 * API:
 *   const ctrl = MSA.ColAssign.mount(hostEl, {
 *     roles: [
 *       { key:'part',        label:'Parça',              multi:false, numeric:false, required:true },
 *       { key:'reference',   label:'Referans (Standart)',multi:false, numeric:true,  required:true },
 *       { key:'measurement', label:'Ölçüm',              multi:true,  numeric:true,  required:true, hint:'Her sütun bir tekrar' }
 *     ],
 *     seedCols: ['Parça','Referans','Ölçüm 1','Ölçüm 2'],  // opsiyonel başlangıç sütun adları
 *     minRows: 10,
 *     onChange: fn   // opsiyonel
 *   });
 *   ctrl.columns()        -> [{id,name,values:[...]}]
 *   ctrl.role('part')     -> [{id,name,values:[...]}] (atanan sütunlar, sırayla)
 *   ctrl.rowCount()       -> tam satır sayısı (en az bir dolu hücreli son satıra kadar)
 *   ctrl.validate()       -> {ok:bool, msg:string}
 *   ctrl.setData(cols)    -> [{name,values}] ile tabloyu doldur
 */
(function () {
  'use strict';

  var STYLE_ID = 'ca-styles';
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = ''
      + '.ca-wrap{font-family:inherit}'
      + '.ca-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 10px}'
      + '.ca-bar label{font-size:12.5px;color:#41506b;display:inline-flex;align-items:center;gap:5px;cursor:pointer}'
      + '.ca-btn{border:0;border-radius:8px;padding:6px 12px;font-size:12.5px;font-weight:600;cursor:pointer;background:#eef1f8;color:#41506b;display:inline-flex;align-items:center;gap:6px}'
      + '.ca-btn:hover{background:#e2e7f4}'
      + '.ca-btn.pri{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff}'
      + '.ca-grid-wrap{overflow:auto;border:1px solid #e6e9f2;border-radius:10px;max-height:340px}'
      + '.ca-grid{border-collapse:collapse;font-variant-numeric:tabular-nums;min-width:100%}'
      + '.ca-grid th,.ca-grid td{border:1px solid #e6e9f2;padding:0}'
      + '.ca-grid thead th{background:#eef1f8;position:sticky;top:0;z-index:3}'
      + '.ca-grid .ca-rownum{background:#f5f7fb;color:#8891a8;font-size:11px;font-weight:700;text-align:right;padding:4px 8px;position:sticky;left:0;z-index:2;white-space:nowrap}'
      + '.ca-grid thead .ca-corner{left:0;z-index:4}'
      + '.ca-colhdr{display:flex;align-items:center;gap:2px;padding:2px 3px}'
      + '.ca-colname{width:88px;border:1px solid #cdd4e6;border-radius:6px;padding:4px 6px;font-size:12px;font-weight:700;color:#2b3346;background:#fff;text-align:center}'
      + '.ca-colname:focus{outline:0;box-shadow:0 0 0 2px #667eea}'
      + '.ca-colx{border:0;background:transparent;color:#b3bacb;cursor:pointer;font-size:13px;line-height:1;padding:2px}'
      + '.ca-colx:hover{color:#c0392b}'
      + '.ca-cell{width:100%;min-width:88px;text-align:center;border:0;outline:0;background:transparent;padding:6px 4px;font-size:13px;font-family:inherit}'
      + '.ca-cell:focus{background:#eaf1ff;box-shadow:inset 0 0 0 2px #667eea}'
      + '.ca-grid td.ca-num-bad .ca-cell{background:#fff5f5;color:#c0392b}'
      + '.ca-assign{display:grid;grid-template-columns:1fr auto 1.25fr;gap:14px;margin-top:14px;align-items:start}'
      + '@media(max-width:760px){.ca-assign{grid-template-columns:1fr}}'
      + '.ca-box{border:1px solid #e6e9f2;border-radius:10px;background:#fff;min-height:120px}'
      + '.ca-box.drop-on{border-color:#667eea;box-shadow:0 0 0 2px rgba(102,126,234,.25)}'
      + '.ca-box-hd{font-size:11.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;padding:8px 10px;border-bottom:1px solid #eef1f8;background:#fafbff;border-radius:10px 10px 0 0}'
      + '.ca-pool{padding:8px;display:flex;flex-direction:column;gap:6px}'
      + '.ca-chip{display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid #dfe4f1;border-radius:8px;background:#f7f9ff;cursor:grab;font-size:13px;font-weight:600;color:#2b3346}'
      + '.ca-chip:hover{border-color:#c4ccea}'
      + '.ca-chip.sel{background:#e7edff;border-color:#8ea2f0}'
      + '.ca-chip .ic{color:#8891a8;font-size:14px}'
      + '.ca-chip .warn{color:#e08a00;font-size:13px;margin-left:auto}'
      + '.ca-chip.dragging{opacity:.45}'
      + '.ca-roles{display:flex;flex-direction:column;gap:12px}'
      + '.ca-role .ca-box-hd{display:flex;align-items:center;gap:6px;justify-content:space-between}'
      + '.ca-role .req{color:#c0392b;font-size:12px}'
      + '.ca-role .hint{font-weight:500;text-transform:none;letter-spacing:0;color:#9aa4bf;font-size:10.5px}'
      + '.ca-slot{padding:8px;display:flex;flex-direction:column;gap:6px;min-height:44px}'
      + '.ca-empty{color:#aab2c8;font-size:12px;font-style:italic;padding:6px 4px}'
      + '.ca-arrows{display:flex;flex-direction:column;gap:8px;justify-content:center;padding-top:34px}'
      + '.ca-arrow{border:1px solid #dfe4f1;background:#fff;border-radius:8px;width:34px;height:30px;cursor:pointer;color:#667eea;font-size:14px}'
      + '.ca-arrow:hover{background:#eef1f8}'
      + '.ca-arrow:disabled{opacity:.4;cursor:default}';
    var s = document.createElement('style'); s.id = STYLE_ID; s.textContent = css;
    document.head.appendChild(s);
  }

  function isNum(v) { if (v == null) return false; var t = String(v).trim(); if (t === '') return false; return isFinite(parseFloat(t.replace(',', '.'))) && /^[-+]?[0-9]*[.,]?[0-9]+([eE][-+]?[0-9]+)?$/.test(t); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function mount(host, opts) {
    injectStyles();
    opts = opts || {};
    var roles = opts.roles || [];
    var minRows = opts.minRows || 8;

    // ---- state ----
    var _id = 0;
    var columns = []; // {id,name,values[]}
    var assign = {};  // roleKey -> [id...]
    roles.forEach(function (r) { assign[r.key] = []; });
    var selectedPool = null;

    function newCol(name) { return { id: ++_id, name: name || ('Sütun ' + (columns.length + 1)), values: [] }; }

    // başlangıç sütunları / önyükleme
    if (opts.initial && opts.initial.columns && opts.initial.columns.length) {
      opts.initial.columns.forEach(function (c) { var nc = newCol(c.name); nc.values = (c.values || []).slice(); columns.push(nc); });
      if (opts.initial.assign) {
        for (var rk in opts.initial.assign) {
          if (!assign[rk]) continue;
          (opts.initial.assign[rk] || []).forEach(function (ci) { var col = columns[ci]; if (col) assign[rk].push(col.id); });
        }
      }
    } else {
      (opts.seedCols && opts.seedCols.length ? opts.seedCols : ['Sütun 1', 'Sütun 2', 'Sütun 3']).forEach(function (n) { columns.push(newCol(n)); });
    }
    var rows = minRows;

    // ---- DOM iskeleti ----
    host.innerHTML = '';
    var wrap = el('div', 'ca-wrap');
    var bar = el('div', 'ca-bar');
    var cbHdr = el('label', null, '<input type="checkbox" class="ca-firsthdr"> İlk yapıştırılan satır başlık');
    var bAddRow = el('button', 'ca-btn', '<i class="bi bi-plus-square"></i> Satır');
    var bAddCol = el('button', 'ca-btn', '<i class="bi bi-plus-square"></i> Sütun');
    var bClear = el('button', 'ca-btn', '<i class="bi bi-eraser"></i> Temizle');
    bar.appendChild(cbHdr); bar.appendChild(bAddRow); bar.appendChild(bAddCol); bar.appendChild(bClear);

    var gridWrap = el('div', 'ca-grid-wrap');
    var grid = el('table', 'ca-grid');
    gridWrap.appendChild(grid);

    var assignArea = el('div', 'ca-assign');
    var poolBox = el('div', 'ca-box');
    poolBox.appendChild(el('div', 'ca-box-hd', 'Sütunlar'));
    var pool = el('div', 'ca-pool'); poolBox.appendChild(pool);
    var arrows = el('div', 'ca-arrows'); // (roller kendi oklarını taşır; bu kolon boş bırakılabilir ama grid dengesi için hafif)
    var rolesBox = el('div', 'ca-roles');
    assignArea.appendChild(poolBox); assignArea.appendChild(arrows); assignArea.appendChild(rolesBox);

    wrap.appendChild(bar); wrap.appendChild(gridWrap); wrap.appendChild(assignArea);
    host.appendChild(wrap);

    // ---- yardımcılar ----
    function colById(id) { for (var i = 0; i < columns.length; i++) if (columns[i].id === id) return columns[i]; return null; }
    function roleOfCol(id) { for (var k in assign) if (assign[k].indexOf(id) !== -1) return k; return null; }
    function roleSpec(key) { for (var i = 0; i < roles.length; i++) if (roles[i].key === key) return roles[i]; return null; }
    function changed() { renderPool(); renderRoles(); if (opts.onChange) try { opts.onChange(); } catch (e) {} }

    // ---- tablo render ----
    function renderGrid() {
      var thead = '<thead><tr><th class="ca-corner ca-rownum">#</th>';
      columns.forEach(function (c) {
        thead += '<th data-col="' + c.id + '"><div class="ca-colhdr">'
          + '<input class="ca-colname" data-col="' + c.id + '" value="' + escAttr(c.name) + '">'
          + '<button class="ca-colx" data-col="' + c.id + '" title="Sütunu sil">&times;</button>'
          + '</div></th>';
      });
      thead += '</tr></thead>';
      var tb = '<tbody>';
      for (var r = 0; r < rows; r++) {
        tb += '<tr><td class="ca-rownum">' + (r + 1) + '</td>';
        columns.forEach(function (c) {
          var v = c.values[r] == null ? '' : c.values[r];
          tb += '<td data-col="' + c.id + '" data-row="' + r + '"><input class="ca-cell" data-col="' + c.id + '" data-row="' + r + '" value="' + escAttr(v) + '"></td>';
        });
        tb += '</tr>';
      }
      tb += '</tbody>';
      grid.innerHTML = thead + tb;
      markNumeric();
    }
    function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

    function markNumeric() {
      // atanan numeric rollerdeki sütun hücrelerini işaretle
      var numCols = {};
      roles.forEach(function (rl) { if (rl.numeric) assign[rl.key].forEach(function (id) { numCols[id] = true; }); });
      grid.querySelectorAll('td[data-row]').forEach(function (td) {
        var id = +td.getAttribute('data-col');
        var inp = td.querySelector('.ca-cell'); var val = inp ? inp.value : '';
        var bad = numCols[id] && val.trim() !== '' && !isNum(val);
        td.classList.toggle('ca-num-bad', !!bad);
      });
    }

    // hücre girişi -> state
    grid.addEventListener('input', function (e) {
      var t = e.target;
      if (t.classList.contains('ca-cell')) {
        var c = colById(+t.getAttribute('data-col')); var r = +t.getAttribute('data-row');
        if (c) { c.values[r] = t.value; if (opts.onChange) try { opts.onChange(); } catch (x) {} markNumeric(); }
      } else if (t.classList.contains('ca-colname')) {
        var cc = colById(+t.getAttribute('data-col')); if (cc) { cc.name = t.value; renderPool(); renderRoles(); }
      }
    });
    // sütun sil
    grid.addEventListener('click', function (e) {
      var x = e.target.closest ? e.target.closest('.ca-colx') : null;
      if (!x) return;
      var id = +x.getAttribute('data-col');
      columns = columns.filter(function (c) { return c.id !== id; });
      for (var k in assign) assign[k] = assign[k].filter(function (i) { return i !== id; });
      if (selectedPool === id) selectedPool = null;
      renderGrid(); changed();
    });
    // Excel tarzı klavye gezinme + yapıştır
    grid.addEventListener('keydown', function (e) {
      var t = e.target; if (!t.classList || !t.classList.contains('ca-cell')) return;
      var col = +t.getAttribute('data-col'), r = +t.getAttribute('data-row');
      var ci = columns.map(function (c) { return c.id; }).indexOf(col);
      function focus(rr, cc) { var c2 = columns[cc]; if (!c2) return false; if (rr >= rows) { rows = rr + 1; renderGrid(); } var el2 = grid.querySelector('.ca-cell[data-col="' + c2.id + '"][data-row="' + rr + '"]'); if (el2) { el2.focus(); el2.select(); return true; } return false; }
      if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); focus(r + 1, ci); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (r > 0) focus(r - 1, ci); }
      else if (e.key === 'ArrowLeft' && t.selectionStart === 0) { e.preventDefault(); if (ci > 0) focus(r, ci - 1); }
      else if ((e.key === 'ArrowRight' && t.selectionStart === t.value.length) || e.key === 'Tab') { if (e.key === 'Tab' && e.shiftKey) return; e.preventDefault(); if (ci < columns.length - 1) focus(r, ci + 1); else focus(r + 1, 0); }
    });
    grid.addEventListener('paste', function (e) {
      var t = e.target; if (!t.classList || !t.classList.contains('ca-cell')) return;
      var text = (e.clipboardData || window.clipboardData).getData('text');
      if (!text || (text.indexOf('\t') === -1 && text.indexOf('\n') === -1)) return; // tek hücre → normal yapıştır
      e.preventDefault();
      var startCol = columns.map(function (c) { return c.id; }).indexOf(+t.getAttribute('data-col'));
      var startRow = +t.getAttribute('data-row');
      var matrix = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map(function (l) { return l.split('\t'); });
      var firstHdr = cbHdr.querySelector('input').checked;
      if (firstHdr && matrix.length) {
        var hdr = matrix.shift();
        hdr.forEach(function (h, j) { var c = columns[startCol + j]; if (!c) { c = newCol(h); columns.push(c); } if (h.trim() !== '') c.name = h.trim(); });
      }
      matrix.forEach(function (rowArr, i) {
        rowArr.forEach(function (val, j) {
          var c = columns[startCol + j];
          if (!c) { c = newCol('Sütun ' + (columns.length + 1)); columns.push(c); }
          c.values[startRow + i] = val;
        });
      });
      var need = startRow + matrix.length; if (need > rows) rows = need;
      renderGrid(); changed();
    });

    bAddRow.addEventListener('click', function () { rows++; renderGrid(); });
    bAddCol.addEventListener('click', function () { columns.push(newCol()); renderGrid(); changed(); });
    bClear.addEventListener('click', function () {
      if (!confirm('Tüm veriler ve atamalar temizlensin mi?')) return;
      columns.forEach(function (c) { c.values = []; });
      for (var k in assign) assign[k] = [];
      selectedPool = null; rows = minRows; renderGrid(); changed();
    });

    // ---- havuz / roller ----
    function chip(c, inRole) {
      var warn = '';
      var rk = roleOfCol(c.id); var rs = rk ? roleSpec(rk) : null;
      if (rs && rs.numeric) {
        var bad = c.values.filter(function (v) { return v != null && String(v).trim() !== '' && !isNum(v); }).length;
        if (bad) warn = '<span class="warn" title="' + bad + ' sayısal olmayan değer"><i class="bi bi-exclamation-triangle-fill"></i></span>';
      }
      var d = el('div', 'ca-chip' + (selectedPool === c.id && !inRole ? ' sel' : ''));
      d.setAttribute('draggable', 'true'); d.setAttribute('data-col', c.id);
      d.innerHTML = '<i class="bi bi-' + (inRole ? 'grip-vertical' : 'table') + ' ic"></i>'
        + '<span class="nm">' + escAttr(c.name) + '</span>' + warn
        + (inRole ? '<button class="ca-colx" data-back="' + c.id + '" title="Havuza geri al" style="margin-left:auto">&times;</button>' : '');
      // drag
      d.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/col', c.id); d.classList.add('dragging'); });
      d.addEventListener('dragend', function () { d.classList.remove('dragging'); });
      if (!inRole) d.addEventListener('click', function () { selectedPool = (selectedPool === c.id ? null : c.id); renderPool(); renderRoles(); });
      else d.querySelector('[data-back]').addEventListener('click', function () { unassign(c.id); });
      return d;
    }

    function renderPool() {
      pool.innerHTML = '';
      var free = columns.filter(function (c) { return roleOfCol(c.id) === null; });
      if (!free.length) pool.appendChild(el('div', 'ca-empty', 'Tüm sütunlar atandı'));
      free.forEach(function (c) { pool.appendChild(chip(c, false)); });
    }
    function renderRoles() {
      rolesBox.innerHTML = '';
      roles.forEach(function (rl) {
        var box = el('div', 'ca-box ca-role'); box.setAttribute('data-role', rl.key);
        var hd = el('div', 'ca-box-hd');
        hd.innerHTML = '<span>' + escAttr(rl.label) + (rl.required ? ' <span class="req">*</span>' : '')
          + (rl.hint ? ' <span class="hint">(' + escAttr(rl.hint) + ')</span>' : '') + '</span>';
        var arrow = el('button', 'ca-arrow', '<i class="bi bi-arrow-right"></i>');
        arrow.disabled = !selectedPool;
        arrow.title = 'Seçili sütunu ekle';
        arrow.addEventListener('click', function () { if (selectedPool != null) assignTo(rl.key, selectedPool); });
        hd.appendChild(arrow);
        box.appendChild(hd);
        var slot = el('div', 'ca-slot');
        if (!assign[rl.key].length) slot.appendChild(el('div', 'ca-empty', 'Sütun sürükleyin ya da seçip → ile ekleyin'));
        assign[rl.key].forEach(function (id) { var c = colById(id); if (c) slot.appendChild(chip(c, true)); });
        box.appendChild(slot);
        // drop
        box.addEventListener('dragover', function (e) { e.preventDefault(); box.classList.add('drop-on'); });
        box.addEventListener('dragleave', function () { box.classList.remove('drop-on'); });
        box.addEventListener('drop', function (e) { e.preventDefault(); box.classList.remove('drop-on'); var id = +e.dataTransfer.getData('text/col'); if (id) assignTo(rl.key, id); });
        rolesBox.appendChild(box);
      });
    }
    // havuz droppable (geri alma)
    poolBox.addEventListener('dragover', function (e) { e.preventDefault(); poolBox.classList.add('drop-on'); });
    poolBox.addEventListener('dragleave', function () { poolBox.classList.remove('drop-on'); });
    poolBox.addEventListener('drop', function (e) { e.preventDefault(); poolBox.classList.remove('drop-on'); var id = +e.dataTransfer.getData('text/col'); if (id) unassign(id); });

    function assignTo(key, id) {
      var rl = roleSpec(key); if (!rl) return;
      for (var k in assign) assign[k] = assign[k].filter(function (i) { return i !== id; }); // her yerden çıkar
      if (!rl.multi) assign[key] = [];
      assign[key].push(id);
      if (selectedPool === id) selectedPool = null;
      markNumeric(); changed();
    }
    function unassign(id) { for (var k in assign) assign[k] = assign[k].filter(function (i) { return i !== id; }); markNumeric(); changed(); }

    // ---- init ----
    renderGrid(); renderPool(); renderRoles();

    // ---- public API ----
    function trimmedRowCount() {
      var last = 0;
      columns.forEach(function (c) { for (var r = 0; r < rows; r++) if (c.values[r] != null && String(c.values[r]).trim() !== '') last = Math.max(last, r + 1); });
      return last;
    }
    var ctrl = {
      columns: function () { return columns.map(function (c) { return { id: c.id, name: c.name, values: c.values.slice() }; }); },
      role: function (key) { return (assign[key] || []).map(colById).filter(Boolean).map(function (c) { return { id: c.id, name: c.name, values: c.values.slice() }; }); },
      rowCount: trimmedRowCount,
      setData: function (cols) {
        columns = (cols || []).map(function (c) { var nc = newCol(c.name); nc.values = (c.values || []).slice(); return nc; });
        for (var k in assign) assign[k] = [];
        rows = Math.max(minRows, trimmedRowCount());
        renderGrid(); changed();
      },
      validate: function () {
        for (var i = 0; i < roles.length; i++) {
          var rl = roles[i];
          if (rl.required && !assign[rl.key].length) return { ok: false, msg: '"' + rl.label + '" rolüne en az bir sütun atayın.' };
        }
        var n = trimmedRowCount();
        if (n < 1) return { ok: false, msg: 'Tabloya veri girin.' };
        // numeric roller
        for (var j = 0; j < roles.length; j++) {
          if (!roles[j].numeric) continue;
          var ids = assign[roles[j].key];
          for (var a = 0; a < ids.length; a++) {
            var c = colById(ids[a]);
            for (var r = 0; r < n; r++) { var v = c.values[r]; if (v != null && String(v).trim() !== '' && !isNum(v)) return { ok: false, msg: '"' + c.name + '" sütununda sayısal olmayan değer var: "' + v + '"' }; }
          }
        }
        return { ok: true, msg: '' };
      },
      num: function (v) { return v == null || String(v).trim() === '' ? null : parseFloat(String(v).replace(',', '.')); }
    };
    return ctrl;
  }

  window.MSA = window.MSA || {};
  window.MSA.ColAssign = { mount: mount };
})();
