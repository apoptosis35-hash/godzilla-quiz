/* 日本の地震リスクマップ — 本体 */
(function () {
  'use strict';

  var JSHIS_VER = 'Y2020';
  var JSHIS_WMS = 'https://www.j-shis.bosai.go.jp/map/wms/pshm/' + JSHIS_VER;
  var JSHIS_API = 'https://www.j-shis.bosai.go.jp/map/api/';
  var HZ_LABEL = { T30_I45_PS: '震度5弱以上', T30_I50_PS: '震度5強以上', T30_I55_PS: '震度6弱以上', T30_I60_PS: '震度6強以上' };
  var GSI_ATTR = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>';
  var mobile = window.matchMedia('(max-width:760px)');

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var toastTimer;
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, ms || 4000);
  }

  /* ---------- 地図 ---------- */
  var start = readHash() || { lat: 36.2, lng: 137.8, z: mobile.matches ? 5 : 6 };
  var map = L.map('map', {
    center: [start.lat, start.lng], zoom: start.z, minZoom: 4, maxZoom: 17,
    zoomControl: false, preferCanvas: true, worldCopyJump: false,
    maxBounds: [[15, 112], [52, 162]]
  });
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');

  map.createPane('hazard'); map.getPane('hazard').style.zIndex = 300;
  map.createPane('overlay'); map.getPane('overlay').style.zIndex = 320;
  map.createPane('zones'); map.getPane('zones').style.zIndex = 410;
  map.createPane('lines'); map.getPane('lines').style.zIndex = 420;
  map.createPane('pts'); map.getPane('pts').style.zIndex = 430;

  var BASES = {
    pale: ['pale', 'png', 18], std: ['std', 'png', 18],
    photo: ['seamlessphoto', 'jpg', 18], relief: ['hillshademap', 'png', 16]
  };
  var baseLayer;
  function setBase(key) {
    var b = BASES[key] || BASES.pale;
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/' + b[0] + '/{z}/{x}/{y}.' + b[1], {
      maxNativeZoom: b[2], maxZoom: 17, minZoom: 2, attribution: GSI_ATTR
    }).addTo(map);
    baseLayer.bringToBack();
  }
  setBase('pale');

  /* ---------- J-SHIS 確率論的地震動予測地図（WMS） ---------- */
  var hazardLayer = null, hazardFail = 0, hazardOk = 0, hazardWarned = false;
  function layerName(attr) { return 'P-' + JSHIS_VER + '-MAP-AVR-TTL_MTTL-' + attr; }
  // WMS 1.3.0 + EPSG:3857 で取れない場合は 1.1.1 + EPSG:900913 で再試行する
  var WMS_MODES = [
    { version: '1.3.0', crs: L.CRS.EPSG3857 },
    { version: '1.1.1', crs: L.extend({}, L.CRS.EPSG3857, { code: 'EPSG:900913' }) }
  ];
  var wmsMode = 0, currentAttr = '';
  function setHazard(attr) {
    currentAttr = attr;
    if (hazardLayer) { map.removeLayer(hazardLayer); hazardLayer = null; }
    var link = $('legendLink');
    if (!attr) { link.removeAttribute('href'); return; }
    link.href = JSHIS_WMS + '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&FORMAT=image/png&LAYER=' + encodeURIComponent(layerName(attr));
    hazardFail = 0; hazardOk = 0;
    hazardLayer = L.tileLayer.wms(JSHIS_WMS, {
      layers: layerName(attr), format: 'image/png', transparent: true,
      version: WMS_MODES[wmsMode].version, crs: WMS_MODES[wmsMode].crs,
      opacity: +$('opacity').value, pane: 'hazard', tileSize: 512, zoomOffset: -1, maxZoom: 17,
      attribution: '<a href="https://www.j-shis.bosai.go.jp/" target="_blank" rel="noopener">J-SHIS（防災科研）</a>'
    });
    hazardLayer.on('tileload', function () { hazardOk++; });
    hazardLayer.on('tileerror', function () {
      hazardFail++;
      if (hazardFail >= 4 && hazardOk === 0 && wmsMode < WMS_MODES.length - 1) {
        wmsMode++; setHazard(currentAttr); return;
      }
      if (!hazardWarned && hazardFail >= 4 && hazardOk === 0) {
        hazardWarned = true;
        toast('J-SHIS の確率地図を読み込めませんでした。時間をおいて再読み込みしてください（他の情報は表示できます）。', 7000);
      }
    });
    hazardLayer.addTo(map);
  }

  /* ---------- 国土地理院・ハザードマップポータルの重ね合わせ ---------- */
  var afmLayer = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/afm/{z}/{x}/{y}.png', {
    minZoom: 11, maxNativeZoom: 16, maxZoom: 17, pane: 'overlay', opacity: 0.9,
    attribution: '活断層図 ' + GSI_ATTR
  });
  var tsunamiLayer = L.tileLayer('https://disaportaldata.gsi.go.jp/raster/04_tsunami_newlegend_data/{z}/{x}/{y}.png', {
    minZoom: 2, maxNativeZoom: 17, maxZoom: 17, pane: 'overlay', opacity: 0.75,
    attribution: '<a href="https://disaportal.gsi.go.jp/" target="_blank" rel="noopener">ハザードマップポータル</a>'
  });

  /* ---------- 海溝型 想定震源域 ---------- */
  var RANK_COLOR = { III: '#dc2626', II: '#f59e0b', I: '#eab308', X: '#64748b' };
  var RANK_TEXT = { III: 'ランクIII（26%以上・高い）', II: 'ランクII（3〜26%・やや高い）', I: 'ランクI（3%未満）', X: 'ランクX（不明）' };
  var trenchLayer = L.layerGroup();
  var trenchById = {};
  TRENCH.forEach(function (t) {
    var c = RANK_COLOR[t.rank];
    var big = t.id === 'nankai' || t.id === 'kurilMega' || t.id === 'tsunamiEq';
    var p = L.polygon(t.poly, {
      pane: 'zones', color: c, weight: big ? 2.5 : 1.5, dashArray: big ? '6 5' : null,
      fillColor: c, fillOpacity: big ? 0.08 : 0.2
    }).bindPopup(trenchPopup(t), { maxWidth: 300 });
    p.bindTooltip(t.name + '　' + t.prob, { sticky: true, direction: 'top' });
    trenchById[t.id] = p;
    trenchLayer.addLayer(p);
  });
  function trenchPopup(t) {
    return '<b class="t">' + esc(t.name) + '</b><br>' + esc(t.mag) +
      '<br>30年以内の発生確率 <span class="pp-prob">' + esc(t.prob) + '</span><br>' +
      '<small>' + esc(RANK_TEXT[t.rank]) + '</small>' + (t.note ? '<br>' + esc(t.note) : '');
  }

  /* ---------- 主要活断層帯 ---------- */
  var faultLayer = L.layerGroup();
  FAULTS.forEach(function (f) {
    var s = f.rank === 'S';
    var halo = L.polyline(f.line, { pane: 'lines', color: '#fff', weight: s ? 8 : 6, opacity: 0.8, interactive: false });
    var ln = L.polyline(f.line, {
      pane: 'lines', color: s ? '#b91c1c' : '#7c3aed', weight: s ? 4.5 : 3.5, dashArray: s ? null : '7 5', lineCap: 'round'
    }).bindPopup('<b class="t">' + esc(f.name) + '</b><br>' + esc(f.mag) +
      '<br>30年以内の発生確率 <span class="pp-prob">' + esc(f.prob) + '</span><br><small>' +
      (s ? 'Sランク（3%以上・高い）' : 'Aランク（0.1〜3%・やや高い）') + '</small>' +
      (f.note ? '<br>' + esc(f.note) : '') +
      '<br><small>線は概略位置。詳細は「活断層図」レイヤーを拡大。</small>', { maxWidth: 300 });
    ln.bindTooltip(f.name, { sticky: true });
    faultLayer.addLayer(halo).addLayer(ln);
  });

  /* ---------- 県庁所在地 ---------- */
  function probColor(p) {
    return p >= 50 ? '#7f1d1d' : p >= 26 ? '#dc2626' : p >= 6 ? '#f97316' : p >= 3 ? '#fbbf24' : '#fde68a';
  }
  var capLayer = L.layerGroup();
  var capMarkers = [];
  CAPITALS.forEach(function (c) {
    var m = L.circleMarker([c[2], c[3]], {
      pane: 'pts', radius: 6 + Math.sqrt(c[4]) * 1.3, color: '#fff', weight: 2,
      fillColor: probColor(c[4]), fillOpacity: 0.92
    }).bindPopup('<b class="t">' + esc(c[1]) + '（' + esc(c[0]) + '）</b><br>30年以内に震度6弱以上<br><span class="pp-prob">' +
      c[4].toFixed(1) + '%</span><br><small>全国地震動予測地図2020年版・市役所付近の値</small>');
    m.bindTooltip(c[1] + ' ' + Math.round(c[4]) + '%', { permanent: true, direction: 'right', className: 'cap-label', offset: [6, 0] });
    capMarkers.push(m);
    capLayer.addLayer(m);
  });
  function updateCapLabels() {
    var show = map.getZoom() >= 7;
    capMarkers.forEach(function (m) { var t = m.getTooltip(); if (t) { t.setOpacity(show ? 1 : 0); } });
  }
  map.on('zoomend', updateCapLabels);

  /* ---------- 主な被害地震 ---------- */
  var histLayer = L.layerGroup();
  HISTORIC.forEach(function (h) {
    L.circleMarker([h[2], h[3]], {
      pane: 'pts', radius: Math.max(5, (h[4] - 5.5) * 6), color: '#0f766e', weight: 2,
      fillColor: '#14b8a6', fillOpacity: 0.3
    }).bindPopup('<b class="t">' + esc(h[1]) + '</b><br>' + esc(h[0].replace(/-/g, '/')) +
      '　M' + h[4].toFixed(1) + '　最大震度' + esc(h[5]) + (h[6] ? '<br>' + esc(h[6]) : ''), { maxWidth: 280 })
      .bindTooltip(h[0].slice(0, 4) + ' ' + h[1] + ' M' + h[4].toFixed(1), { direction: 'top' })
      .addTo(histLayer);
  });

  /* ---------- USGS 観測地震 ---------- */
  var usgsLayer = L.layerGroup(), usgsLoaded = false;
  function depthColor(d) { return d < 30 ? '#dc2626' : d < 70 ? '#f97316' : d < 150 ? '#eab308' : d < 300 ? '#22c55e' : '#3b82f6'; }
  function loadUsgs() {
    if (usgsLoaded) return; usgsLoaded = true;
    toast('1990年以降のM5.5以上の地震を読み込み中…', 2500);
    var url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=1990-01-01&minmagnitude=5.5' +
      '&minlatitude=20&maxlatitude=48&minlongitude=122&maxlongitude=150&orderby=magnitude-asc&limit=6000';
    fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (gj) {
      gj.features.forEach(function (f) {
        var c = f.geometry.coordinates, p = f.properties, d = c[2];
        L.circleMarker([c[1], c[0]], {
          pane: 'pts', radius: Math.max(2.5, (p.mag - 5) * 3.2), stroke: true, weight: 0.6, color: '#111',
          fillColor: depthColor(d), fillOpacity: 0.65
        }).bindPopup('<b class="t">M' + p.mag.toFixed(1) + '</b>　深さ ' + Math.round(d) + 'km<br>' +
          new Date(p.time).toLocaleString('ja-JP') + '<br><small>' + esc(p.place || '') + '</small>').addTo(usgsLayer);
      });
      toast(gj.features.length + '件を表示（色＝震源の深さ：赤 浅い → 青 深い）', 5000);
    }).catch(function () {
      usgsLoaded = false;
      toast('USGS の地震データを取得できませんでした。', 5000);
      $('lyUsgs').checked = false; map.removeLayer(usgsLayer);
    });
  }

  /* ---------- レイヤーの切り替え ---------- */
  var TOGGLES = {
    lyTrench: trenchLayer, lyFault: faultLayer, lyCap: capLayer, lyHist: histLayer,
    lyUsgs: usgsLayer, lyAfm: afmLayer, lyTsunami: tsunamiLayer
  };
  Object.keys(TOGGLES).forEach(function (id) {
    var el = $(id);
    function apply() {
      if (el.checked) {
        TOGGLES[id].addTo(map);
        if (id === 'lyUsgs') loadUsgs();
        if (id === 'lyCap') updateCapLabels();
        if (id === 'lyAfm' && map.getZoom() < 11) toast('活断層図は拡大（ズーム11以上）すると表示されます。主に都市圏の断層です。');
        if (id === 'lyTsunami') toast('津波浸水想定：色が濃いほど浸水が深い想定です。沿岸部を拡大してください。');
      } else map.removeLayer(TOGGLES[id]);
    }
    el.addEventListener('change', apply); apply();
  });
  document.querySelectorAll('input[name=hz]').forEach(function (r) {
    r.addEventListener('change', function () { if (r.checked) setHazard(r.value); });
  });
  document.querySelectorAll('input[name=bm]').forEach(function (r) {
    r.addEventListener('change', function () { if (r.checked) setBase(r.value); });
  });
  $('opacity').addEventListener('input', function () { if (hazardLayer) hazardLayer.setOpacity(+this.value); });
  setHazard(document.querySelector('input[name=hz]:checked').value);

  /* ---------- パネル・タブ ---------- */
  var panel = $('panel');
  function showTab(name) {
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === name); });
    document.querySelectorAll('.tab').forEach(function (s) { s.classList.toggle('on', s.id === 'tab-' + name); });
  }
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.dataset.tab); if (panel.classList.contains('min')) setSheet(''); });
  });
  function setSheet(state) {
    panel.classList.remove('min', 'max'); document.body.classList.remove('pmin', 'pmax');
    if (state) { panel.classList.add(state); document.body.classList.add('p' + state); }
    setTimeout(function () { map.invalidateSize(); }, 300);
  }
  $('grip').addEventListener('click', function () {
    setSheet(panel.classList.contains('min') ? '' : panel.classList.contains('max') ? 'min' : 'max');
  });

  /* ---------- ランキング ---------- */
  var sorted = CAPITALS.slice().sort(function (a, b) { return b[4] - a[4]; });
  $('rankList').innerHTML = sorted.map(function (c, i) {
    return '<li data-i="' + CAPITALS.indexOf(c) + '"><span class="n">' + (i + 1) + '</span><span>' + esc(c[0]) +
      ' <small style="color:var(--muted)">' + esc(c[1]) + '</small></span><span class="v">' + c[4].toFixed(1) +
      '%</span><span class="b"><i style="width:' + c[4] + '%;background:' + probColor(c[4]) + '"></i></span></li>';
  }).join('');
  $('rankList').addEventListener('click', function (e) {
    var li = e.target.closest('li'); if (!li) return;
    var c = CAPITALS[+li.dataset.i], m = capMarkers[+li.dataset.i];
    if (!$('lyCap').checked) { $('lyCap').checked = true; $('lyCap').dispatchEvent(new Event('change')); }
    if (mobile.matches) setSheet('min');
    map.flyTo([c[2], c[3]], 10, { duration: 1 });
    map.once('moveend', function () { m.openPopup(); });
  });
  var trenchSorted = TRENCH.slice().sort(function (a, b) { return firstNum(b.prob) - firstNum(a.prob); });
  function firstNum(s) { var m = String(s).match(/(\d+(?:\.\d+)?)%/) || String(s).match(/(\d+)/); return m ? +m[1] : 0; }
  $('trenchList').innerHTML = trenchSorted.map(function (t) {
    return '<li data-id="' + t.id + '"><span>' + esc(t.name) + '<small>' + esc(t.mag) + '</small></span><span class="v" style="color:' +
      RANK_COLOR[t.rank] + '">' + esc(t.prob) + '</span></li>';
  }).join('');
  $('trenchList').addEventListener('click', function (e) {
    var li = e.target.closest('li'); if (!li) return;
    var p = trenchById[li.dataset.id];
    if (!$('lyTrench').checked) { $('lyTrench').checked = true; $('lyTrench').dispatchEvent(new Event('change')); }
    if (mobile.matches) setSheet('min');
    map.flyToBounds(p.getBounds(), { padding: [40, 40], duration: 1, maxZoom: 8 });
    map.once('moveend', function () { p.openPopup(p.getBounds().getCenter()); });
  });

  /* ---------- 地点を調べる ---------- */
  var pin = null, lookupSeq = 0;
  function kmBetween(a, b) {
    var R = 6371, toR = Math.PI / 180;
    var dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  // 点から折れ線までの最短距離(km)（局所的に平面近似）
  function distToLine(p, line, closed) {
    var kx = 111.32 * Math.cos(p[0] * Math.PI / 180), ky = 110.57, best = Infinity;
    var n = line.length, segs = closed ? n : n - 1;
    for (var i = 0; i < segs; i++) {
      var a = line[i], b = line[(i + 1) % n];
      var ax = (a[1] - p[1]) * kx, ay = (a[0] - p[0]) * ky, bx = (b[1] - p[1]) * kx, by = (b[0] - p[0]) * ky;
      var dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      var t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      var x = ax + t * dx, y = ay + t * dy, d = Math.sqrt(x * x + y * y);
      if (d < best) best = d;
    }
    return best;
  }
  function inside(p, poly) {
    var x = p[1], y = p[0], c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][1], yi = poly[i][0], xj = poly[j][1], yj = poly[j][0];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  }
  function pct(v) {
    if (v == null || v === '' || isNaN(+v)) return '—';
    var x = +v * 100;
    return x >= 99.95 ? '99.9%+' : x < 0.1 ? '0.1%未満' : (x < 10 ? x.toFixed(1) : x.toFixed(0)) + '%';
  }
  function level(v) {
    var x = +v * 100;
    if (isNaN(x)) return '';
    var lv = x >= 26 ? ['非常に高い', '#7b1e5a'] : x >= 6 ? ['高い', '#dc2626'] : x >= 3 ? ['やや高い', '#ea580c'] : x >= 0.1 ? ['低め（でも油断は禁物）', '#ca8a04'] : ['低い', '#64748b'];
    return '<span class="lvl" style="background:' + lv[1] + '">' + lv[0] + '</span>';
  }
  function pickProp(props, keys) {
    for (var i = 0; i < keys.length; i++) { if (props[keys[i]] != null && props[keys[i]] !== '') return props[keys[i]]; }
    return null;
  }

  function lookup(latlng, title) {
    var p = [latlng.lat, latlng.lng], seq = ++lookupSeq;
    if (pin) map.removeLayer(pin);
    pin = L.marker(latlng, { title: title || '調べた地点' }).addTo(map);

    // 近くの想定震源（ローカル計算）
    var near = [];
    TRENCH.forEach(function (t) {
      var d = inside(p, t.poly) ? 0 : distToLine(p, t.poly, true);
      if (d <= 150) near.push({ name: t.name, prob: t.prob, d: d, kind: '海溝型' });
    });
    FAULTS.forEach(function (f) {
      var d = distToLine(p, f.line, false);
      if (d <= 60) near.push({ name: f.name, prob: f.prob, d: d, kind: '活断層' });
    });
    near.sort(function (a, b) { return a.d - b.d; });
    var nearestCap = CAPITALS.slice().sort(function (a, b) { return kmBetween(p, [a[2], a[3]]) - kmBetween(p, [b[2], b[3]]); })[0];
    var jshisLink = 'https://www.j-shis.bosai.go.jp/map/?lang=jp&center=' + p[1].toFixed(5) + ',' + p[0].toFixed(5) + '&zoom=12';

    var html = '<div class="pt"><h3>' + esc(title || '選んだ地点') + '</h3>' +
      '<div class="coord">北緯 ' + p[0].toFixed(4) + '° / 東経 ' + p[1].toFixed(4) + '°</div>' +
      '<h2>この地点が今後30年間に揺れる確率（J-SHIS）</h2><div id="ptHaz" class="hint">読み込み中…</div>' +
      '<h2>地盤の揺れやすさ（J-SHIS 表層地盤）</h2><div id="ptSoil" class="hint">読み込み中…</div>' +
      '<h2>近くの想定震源</h2>' +
      (near.length ? '<table>' + near.slice(0, 8).map(function (n) {
        return '<tr><td>' + esc(n.name) + '<br><small style="color:var(--muted)">' + n.kind + '・' +
          (n.d === 0 ? '想定震源域の真上' : '約' + Math.round(n.d) + 'km') + '</small></td><td>' + esc(n.prob) + '</td></tr>';
      }).join('') + '</table>' : '<p class="hint">半径150km以内に収録の想定震源域・半径60km以内に収録の主要活断層はありません（未知の断層による地震は日本中どこでも起こりえます）。</p>') +
      '<p class="hint">最寄りの県庁所在地：' + esc(nearestCap[1]) + '（6弱+ ' + nearestCap[4].toFixed(1) + '%、約' +
      Math.round(kmBetween(p, [nearestCap[2], nearestCap[3]])) + 'km）<br>' +
      '<a href="' + jshisLink + '" target="_blank" rel="noopener">J-SHIS Map でこの地点を詳しく見る</a></p></div>';
    $('pointInfo').className = ''; $('pointInfo').innerHTML = html;
    showTab('point');
    if (mobile.matches && panel.classList.contains('min')) setSheet('');

    var pos = 'position=' + p[1].toFixed(6) + ',' + p[0].toFixed(6) + '&epsg=4326';
    fetch(JSHIS_API + 'pshm/' + JSHIS_VER + '/AVR/TTL_MTTL/meshinfo.geojson?' + pos +
      '&attr=T30_I45_PS,T30_I50_PS,T30_I55_PS,T30_I60_PS')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (gj) {
        if (seq !== lookupSeq) return;
        var f = gj.features && gj.features[0];
        if (!f) throw new Error('nodata');
        var pr = f.properties;
        $('ptHaz').className = '';
        $('ptHaz').innerHTML = '<div class="big">' +
          ['T30_I45_PS', 'T30_I50_PS', 'T30_I55_PS', 'T30_I60_PS'].map(function (k) {
            return '<div><b>' + pct(pr[k]) + '</b><span>' + HZ_LABEL[k] + '</span></div>';
          }).join('') + '</div>震度6弱以上の確率は ' + level(pr.T30_I55_PS) +
          '<p class="hint">約250mメッシュの値（全国地震動予測地図2020年版の計算）。</p>';
      }).catch(function () {
        if (seq !== lookupSeq) return;
        $('ptHaz').innerHTML = 'この地点の数値を取得できませんでした（海上・通信エラーなど）。地図の色で確認するか、' +
          '<a href="' + jshisLink + '" target="_blank" rel="noopener">J-SHIS Map</a> で確認してください。';
      });

    fetch(JSHIS_API + 'sstrct/V3/meshinfo.geojson?' + pos)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (gj) {
        if (seq !== lookupSeq) return;
        var f = gj.features && gj.features[0];
        if (!f) throw new Error('nodata');
        var pr = f.properties;
        var arv = pickProp(pr, ['ARV', 'arv']), avs = pickProp(pr, ['AVS', 'AVS30', 'avs']), geo = pickProp(pr, ['JNAME', 'JCODE_NAME', 'jname']);
        if (arv == null && avs == null) throw new Error('nodata');
        var a = +arv, txt = isNaN(a) ? '' : a >= 2.0 ? '<b style="color:#dc2626">揺れやすい</b>（軟らかい地盤）' : a >= 1.6 ? '<b style="color:#ea580c">やや揺れやすい</b>' : '<b>比較的揺れにくい</b>（硬い地盤）';
        $('ptSoil').className = '';
        $('ptSoil').innerHTML = '<table>' +
          (geo ? '<tr><td>微地形</td><td>' + esc(geo) + '</td></tr>' : '') +
          (arv != null ? '<tr><td>地盤増幅率（大きいほど揺れが増幅）</td><td>' + a.toFixed(2) + '倍</td></tr>' : '') +
          (avs != null ? '<tr><td>AVS30（地盤の硬さ。小さいほど軟らかい）</td><td>' + Math.round(+avs) + ' m/s</td></tr>' : '') +
          '</table>' + txt;
      }).catch(function () {
        if (seq !== lookupSeq) return;
        $('ptSoil').innerHTML = '地盤データを取得できませんでした。';
      });
  }

  map.on('click', function (e) { lookup(e.latlng); });

  /* ---------- 住所検索・現在地 ---------- */
  $('search').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = $('q').value.trim(); if (!q) return;
    $('q').blur();
    fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.length) { toast('「' + q + '」が見つかりませんでした。'); return; }
        var c = res[0].geometry.coordinates, ll = L.latLng(c[1], c[0]);
        map.flyTo(ll, 13, { duration: 1.2 });
        lookup(ll, res[0].properties.title || q);
      }).catch(function () { toast('住所検索に失敗しました。'); });
  });
  $('locate').addEventListener('click', function () {
    if (!navigator.geolocation) { toast('この端末では現在地を取得できません。'); return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      var ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
      map.flyTo(ll, 13, { duration: 1.2 });
      lookup(ll, '現在地');
    }, function () { toast('現在地を取得できませんでした（位置情報の許可を確認してください）。'); }, { enableHighAccuracy: true, timeout: 10000 });
  });

  /* ---------- 表示位置をURLに保存（共有用） ---------- */
  function readHash() {
    var m = location.hash.match(/^#(\d+)\/(-?[\d.]+)\/(-?[\d.]+)/);
    return m ? { z: +m[1], lat: +m[2], lng: +m[3] } : null;
  }
  map.on('moveend', function () {
    var c = map.getCenter();
    history.replaceState(null, '', '#' + map.getZoom() + '/' + c.lat.toFixed(4) + '/' + c.lng.toFixed(4));
  });

  if (mobile.matches) setSheet('min');
  updateCapLabels();
})();
