/* UAKino для Lampa — фільми й серіали українською з каталогу uakino.ax.
   МОДИФІКОВАНА ВЕРСІЯ (no-UI): без зміни меню, теми, логотипу та мови Lampa.
   Оригінал: https://uakino.ax/lampa.js
   Встановлення: Lampa → Налаштування → Розширення → Додати плагін → (цей файл / URL)
   Збережено: каталог UAKino, вхід в акаунт, плеєр, історія/обране.
   Прибрано: cleanMenu, injectTheme (тема меню), brandHead, fixLang, restore*, renderHero.
   Залишено: позначки якості (FHD/HD) і рейтинг на картках (decorateCards + badges CSS). */
(function () {
  'use strict';
  if (window.uakino_plugin_ready) return;
  window.uakino_plugin_ready = true;

  var API = 'https://uakino.ax';

  // 11.10.2026: на LG webOS (старий вебкіт у lampa.tv) глобального fetch НЕМА —
  // вхід через QR падав з «fetch is not defined». Мінімальна заміна на XHR:
  // нам потрібні лише method, headers, body та .json()/.text() у відповіді.
  var uakinoFetch = (typeof window.fetch === 'function') ? function (u, o) { return window.fetch(u, o); } : function (url, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open(opts.method || 'GET', url, true);
      if (opts.headers) for (var k in opts.headers) { try { x.setRequestHeader(k, opts.headers[k]); } catch (e) {} }
      // cache:'no-store' у XHR немає — глушимо кеш заголовком
      if (opts.cache === 'no-store') { try { x.setRequestHeader('Cache-Control', 'no-cache'); } catch (e) {} }
      x.onload = function () {
        resolve({
          ok: x.status >= 200 && x.status < 300,
          status: x.status,
          text: function () { return Promise.resolve(x.responseText); },
          json: function () { try { return Promise.resolve(JSON.parse(x.responseText)); } catch (e) { return Promise.reject(e); } },
        });
      };
      x.onerror = function () { reject(new Error('network')); };
      x.ontimeout = function () { reject(new Error('timeout')); };
      x.send(opts.body || null);
    });
  };
  var ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M10 9.5v5l4-2.5z" fill="currentColor"></path></svg>';

  function sid() {
    var s = Lampa.Storage.get('uakino_sid', '');
    if (!s) { s = 'lp' + Math.random().toString(36).slice(2) + Date.now().toString(36); Lampa.Storage.set('uakino_sid', s); }
    return s;
  }
  // Чи тягне пристрій HEVC (від цього залежить, чи пропонувати наш 4K). Android — так завжди,
  // решті (ТВ-браузери Tizen/webOS, десктоп) віримо лише на пряме питання до плеєра.
  function hevc() {
    try {
      if (Lampa.Platform.is('android')) return 1;
      var t = 'video/mp4; codecs="hvc1.1.6.L153.90"';
      if (window.MediaSource && MediaSource.isTypeSupported && MediaSource.isTypeSupported(t)) return 1;
      if (document.createElement('video').canPlayType(t)) return 1;
    } catch (e) {}
    return 0;
  }
  function getJSON(url) {
    return uakinoFetch(url, { cache: 'no-store' }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok && !j.found && r.status !== 404) throw new Error(j.error || r.status); return j; });
    });
  }
  function q(o) { return Object.keys(o).filter(function (k) { return o[k] !== undefined && o[k] !== null && o[k] !== ''; })
    .map(function (k) { return k + '=' + encodeURIComponent(o[k]); }).join('&'); }

  // ── 09.10: акаунт UAKino (вхід за QR з телефона чи сайту). Токен — лише в цій Lampa (localStorage),
  //    у CUB не синхронізується. Позиція перегляду, історія й обране — спільні з сайтом і застосунками. ──
  var STAR = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path></svg>';
  function token() { return Lampa.Storage.get('uakino_token', '') || ''; }
  function userName() {
    try { var p = JSON.parse(decodeURIComponent(escape(atob(token().split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); return p.username || ''; }
    catch (e) { return ''; }
  }
  function logout(silent) {
    Lampa.Storage.set('uakino_token', ''); cache = {};
    if (!silent) Lampa.Noty.show('UAKino: ви вийшли з акаунта');
  }
  function api(path, body) {
    var o = { cache: 'no-store', headers: { Authorization: 'Bearer ' + token() } };
    if (body) { o.method = 'POST'; o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return uakinoFetch(API + path, o).then(function (r) {
      if (r.status === 401) { logout(true); throw new Error('auth'); }
      return r.json();
    });
  }
  var cache = {};   // history / favorites — на хвилину, щоб не смикати API на кожну картку
  function cached(key, path) {
    var c = cache[key];
    if (c && Date.now() - c.t < 60000) return Promise.resolve(c.v);
    return api(path).then(function (v) { cache[key] = { t: Date.now(), v: v }; return v; });
  }
  function history() { return token() ? cached('h', '/api/user/history').then(function (d) { return d.history || []; }).catch(function () { return []; }) : Promise.resolve([]); }
  function favorites() { return token() ? cached('f', '/api/user/favorites').then(function (d) { return d.items || []; }).catch(function () { return []; }) : Promise.resolve([]); }

  function login(done) {
    var timer = 0, closed = false;
    var stop = function () { closed = true; clearInterval(timer); };
    var close = function () { stop(); Lampa.Modal.close(); if (done) done(); };
    var html = $('<div class="uakino-login" style="text-align:center;padding:.5em 0 1em">' +
      '<div class="uakino-login__qr" style="background:#fff;display:inline-block;padding:.6em;border-radius:.6em;width:13em;height:13em"></div>' +
      '<div style="margin-top:1em;font-size:1.1em;line-height:1.5">Наведіть камеру телефона на код<br>або введіть код на сторінці <b>uakino.ax/tv</b>:</div>' +
      '<div class="uakino-login__code" style="margin-top:.5em;font-size:2.2em;font-weight:700;letter-spacing:.12em">…</div>' +
      '<div class="uakino-login__hint" style="margin-top:.6em;opacity:.6">На телефоні має бути виконано вхід у UAKino</div></div>');
    var startCode = function () {
      uakinoFetch(API + '/api/auth/qr/start', { method: 'POST' }).then(function (r) { return r.json(); }).then(function (d) {
        if (closed) return;
        if (!d.code) { html.find('.uakino-login__hint').text(d.error || 'Не вдалося отримати код'); return; }
        html.find('.uakino-login__qr').html('<img src="' + API + '/hls/api/lampa/qr.svg?code=' + d.code + '" style="width:100%;height:100%;display:block">');
        html.find('.uakino-login__code').text(d.code.slice(0, 4) + ' ' + d.code.slice(4));   // як у макеті: «K7QM 2XPA» → uakino.ax/tv
        clearInterval(timer);
        timer = setInterval(function () {
          uakinoFetch(API + '/api/auth/qr/poll?code=' + d.code, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (p) {
            if (closed) return;
            if (p.status === 'approved' && p.token) {
              Lampa.Storage.set('uakino_token', p.token); cache = {};
              close();
              Lampa.Noty.show('UAKino: ви увійшли як ' + (userName() || 'користувач'));
            } else if (p.status === 'expired' || p.status === 'invalid') startCode();   // код живе 5 хв — даємо новий
          }).catch(function () {});
        }, 2500);
      }).catch(function () { html.find('.uakino-login__hint').text('Немає звʼязку з uakino.ax'); });
    };
    Lampa.Modal.open({ title: 'Вхід в UAKino', html: html, size: 'small', onBack: close });
    // із Налаштувань вікно відкривалось ПІД панеллю (z-index 20) і напівпрозорим — піднімаємо над нею
    $('.modal').css('z-index', 60);
    startCode();
  }

  // Позиція перегляду → акаунт (як плеєр сайту: від 30-ї секунди, раз на 15 с, progress — частка 0..1)
  var lastSent = 0;
  setInterval(function () {
    if (!token()) return;
    try { if (!Lampa.Player.opened()) return; } catch (e) { return; }
    var d = null; try { d = Lampa.Player.playdata(); } catch (e) {}
    if (!d || !d.uakino) return;
    var v = $('.player video').get(0) || document.querySelector('video');
    if (!v || v.paused) return;
    var D = v.duration, t = v.currentTime;
    if (!isFinite(D) || D <= 0 || t < 30 || Date.now() - lastSent < 15000) return;
    lastSent = Date.now();
    var u = d.uakino;
    api('/api/movie/watch-progress', { movie_id: u.movie, current_time: Math.floor(t), duration: Math.floor(D),
      progress: Math.min(1, t / D), season: u.season, episode: u.episode, voice: u.voice || undefined }).catch(function () {});
    delete cache.h;
  }, 5000);

  // Позиція з акаунта, якщо вона далі, ніж локальна в Lampa (дивились на сайті чи в застосунку)
  function resume(view, h) {
    if (!view || !h || !h.current_time || (h.progress || 0) >= 0.95) return view;
    if ((view.time || 0) + 30 < h.current_time) {
      view.time = h.current_time;
      if (h.duration) { view.duration = h.duration; view.percent = Math.round(h.current_time / h.duration * 100); }
    }
    return view;
  }

  function find(movie) {
    var tv = !!(movie.name || movie.number_of_seasons || movie.first_air_date);
    var date = movie.release_date || movie.first_air_date || '';
    return getJSON(API + '/hls/api/lampa/find?' + q({
      tmdb: movie.id, imdb: movie.imdb_id, type: tv ? 'tv' : 'movie', year: date.slice(0, 4),
      title: movie.title || movie.name, orig: movie.original_title || movie.original_name
    }));
  }
  function play(movieId, opt) {
    return getJSON(API + '/hls/api/play?' + q({ movie: movieId, s: sid(), hevc: hevc(), voice: opt.voice,
      season: opt.season, episode: opt.episode, q: opt.q }));
  }
  // 11.10: Lampa дивиться на розширення в адресі й лише тоді бере hls.js.
  function m3u8(u) { return u && !/\.m3u8($|\?)/.test(u) ? u + '.m3u8' : u; }

  // 12.10: тримаємо глядача Lampa в «зараз дивляться» — б'ємо heartbeat поки грає
  var uakBeatTimer = null;
  function uakBeat(movie) {
    if (uakBeatTimer) { clearInterval(uakBeatTimer); uakBeatTimer = null; }
    if (!movie) return;
    var s = sid();
    function ping() { try { uakinoFetch(API + '/hls/api/beat?movie=' + movie + '&s=' + encodeURIComponent(s), { cache: 'no-store' }).catch(function () {}); } catch (e) {} }
    function alive() {
      try { if (window.Lampa && Lampa.Player && Lampa.Player.opened) return Lampa.Player.opened(); } catch (e) {}
      return !!document.querySelector('.player, .player-video, .player-panel');
    }
    ping();
    uakBeatTimer = setInterval(function () {
      if (!alive()) { clearInterval(uakBeatTimer); uakBeatTimer = null; return; }
      ping();
    }, 25000);
  }
  function start(p, title, view, meta) {
    var url = p.manifest_abs || (API + p.manifest);
    // 11.10: hls_type змушує Lampa грати програмним HLS (hls.js). Рідний плеєр
    // тримає в пам'яті весь переглянутий фільм і на перемотці назад віддає
    // «відео недоступно» (error 4) — перевірено в браузері.
    var item = { title: title, url: m3u8(url), timeline: view, uakino: meta, hls_type: 'hlsjs' };
    if (p.subs && p.subs.length) item.subtitles = p.subs.map(function (s) { return { label: s.label, url: API + s.url }; });
    Lampa.Player.play(item);
    Lampa.Player.playlist([item]);
    try { uakBeat(meta && meta.movie); } catch (e) {}
  }
  // 09.10: тайм-коди Lampa (і синхронізація CUB): той самий ключ, що в її рідних джерел —
  // фільм = hash(оригінальна назва), серія = hash(сезон [':' якщо >10] серія оригінальна назва).
  function timeline(movie, s, e) {
    try {
      var orig = movie.original_title || movie.original_name || movie.title || movie.name || '';
      var key = s != null ? [s, s > 10 ? ':' : '', e, orig].join('') : orig;
      return Lampa.Timeline.view(Lampa.Utils.hash(key));
    } catch (err) { return undefined; }
  }
  function mark(view) {
    if (!view || !view.percent) return '';
    return view.percent >= 90 ? ' ✓' : ' • ' + view.percent + '%';
  }
  function back() { Lampa.Controller.toggle('full_start'); }
  function select(title, items, cb) {
    Lampa.Select.show({ title: title, items: items, onSelect: cb, onBack: back });
  }

  // ═══ 14.10.2026: «Дивитись» → одразу UAKino. Фільм — панель якості й озвучки, серіал — сторінка
  //     матеріалу (озвучка, сезони, серії з кадрами й датами виходу). Замість вікна «Джерело». ═══
  var TIERS = [2160, 1080, 720, 480];
  var TIER_BADGE = { 2160: '4K', 1080: 'FHD', 720: 'HD', 480: 'SD' };
  var TIER_NAME = { 2160: '2160p', 1080: '1080p', 720: '720p', 480: '480p' };
  var TIER_SUB = { 2160: '4K · потрібно від 25 Мбіт/с', 1080: 'Full HD', 720: 'HD', 480: 'Економія трафіку' };
  // Назви в меню якості плеєра Lampa — НЕ починаються з цифри: інакше Lampa підміняє адресу на
  // «video_quality_default» (1080) і ігнорує вибір глядача.
  var TIER_KEY = { 2160: '4K · 2160p', 1080: 'FHD · 1080p', 720: 'HD · 720p', 480: 'SD · 480p' };
  var MIC = '<div class="uak-qi"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"></path></svg></div>';

  function tierOf(w, h) { return (w >= 3200 || h >= 1500) ? 2160 : (w >= 1800 || h >= 1000) ? 1080 : (w >= 1200 || h >= 680) ? 720 : 480; }
  function getPrefQ() { var v = parseInt(Lampa.Storage.get('uakino_q', '0'), 10); return TIERS.indexOf(v) >= 0 ? v : 0; }
  function setPrefQ(t) { Lampa.Storage.set('uakino_q', String(t || 0)); }
  function qbadge(label, gold) { return '<div class="uak-qb' + (gold ? ' uak-qb--gold' : '') + '">' + label + '</div>'; }
  function absUrl(u) { return /^https?:/i.test(u) ? u : API + u; }

  // Варіанти якості з майстер-плейлиста (CORS * відкритий). Порожній список — просто «Авто».
  function variants(master) {
    return uakinoFetch(master, { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (t) {
      var L = t.split(/\r?\n/), out = [], seen = {};
      for (var i = 0; i < L.length; i++) {
        if (L[i].indexOf('#EXT-X-STREAM-INF') !== 0) continue;
        var m = /RESOLUTION=(\d+)x(\d+)/.exec(L[i]), u = (L[i + 1] || '').trim();
        if (!m || !u) continue;
        var tier = tierOf(+m[1], +m[2]);
        if (!seen[tier]) { seen[tier] = 1; out.push({ t: tier, url: absUrl(u) }); }
      }
      return out;
    }).catch(function () { return []; });
  }
  // Найближча доступна якість до обраної (не вище обраної, інакше найнижча вище)
  function pickVariant(vars, want) {
    if (!want || !vars.length) return null;
    var best = null;
    vars.forEach(function (v) { if (v.t <= want && (!best || v.t > best.t)) best = v; });
    if (!best) vars.forEach(function (v) { if (!best || v.t < best.t) best = v; });
    return best;
  }
  function filmItem(p, vars, want, title, view, meta) {
    var master = m3u8(p.manifest_abs || (API + p.manifest));
    var item = { title: title, url: master, timeline: view, uakino: meta, hls_type: 'hlsjs' };
    var pick = pickVariant(vars, want);
    if (pick) item.url = pick.url;
    if (vars.length > 1) {
      var map = { 'Авто': master };
      vars.forEach(function (v) { map[TIER_KEY[v.t]] = v.url; });
      item.quality = map;
    }
    if (p.subs && p.subs.length) item.subtitles = p.subs.map(function (s) { return { label: s.label, url: API + s.url }; });
    return item;
  }
  function playItem(item, meta) {
    Lampa.Player.play(item);
    Lampa.Player.playlist([item]);
    try { uakBeat(meta && meta.movie); } catch (e) {}
  }

  // ── Фільм: панель «Якість і озвучка» ──
  function filmPanel(ctx) {
    var pref = getPrefQ(), avail = {}, own4k = !!ctx.p.alt4k && hevc() === 1;
    ctx.vars.forEach(function (v) { avail[v.t] = true; });
    if (own4k) avail[2160] = true;
    if (!hevc()) delete avail[2160];   // без HEVC 4K дасть чорний екран
    var items = [{ title: 'Авто', subtitle: 'за швидкістю інтернету', template: 'selectbox_icon', icon: qbadge('AUTO'), tier: 0, selected: !pref || !avail[pref] }];
    TIERS.forEach(function (t) {
      if (avail[t]) items.push({ title: TIER_NAME[t], subtitle: TIER_SUB[t], template: 'selectbox_icon', icon: qbadge(TIER_BADGE[t], t === 2160), tier: t, selected: pref === t });
    });
    var voices = ctx.p.voices || [];
    if (voices.length > 1) items.push({ title: 'Озвучка: ' + (ctx.voice || 'українська'), subtitle: 'змінити озвучку', template: 'selectbox_icon', icon: MIC, voiceRow: true });
    if (items.length === 1) return startFilm(ctx, 0);   // вибирати нема з чого — одразу граємо
    Lampa.Select.show({
      title: ctx.name, items: items, onBack: back,
      onSelect: function (it) {
        if (it.voiceRow) return voicePanel(ctx);
        setPrefQ(it.tier);
        startFilm(ctx, it.tier);
      }
    });
  }
  function voicePanel(ctx) {
    var voices = ctx.p.voices || [];
    Lampa.Select.show({
      title: 'Озвучка', onBack: function () { filmPanel(ctx); },
      items: voices.map(function (v) { return { title: v, voice: v, selected: v === ctx.voice, template: 'selectbox_icon', icon: MIC }; }),
      onSelect: function (it) {
        Lampa.Loading.start(function () { Lampa.Loading.stop(); });
        play(ctx.f.movie_id, { voice: it.voice }).then(function (pp) {
          return variants(m3u8(pp.manifest_abs || (API + pp.manifest))).then(function (vars) {
            Lampa.Loading.stop();
            ctx.p = pp; ctx.vars = vars; ctx.voice = it.voice;
            filmPanel(ctx);
          });
        }).catch(function (e) { Lampa.Loading.stop(); Lampa.Noty.show('UAKino: ' + (e && e.message || 'помилка')); filmPanel(ctx); });
      }
    });
  }
  function startFilm(ctx, tier) {
    var meta = { movie: ctx.f.movie_id, voice: ctx.voice };
    var view = resume(timeline(ctx.movie), ctx.h);
    if (tier === 2160 && !!ctx.p.alt4k && hevc() === 1) {      // власний 4K — окремий потік
      Lampa.Loading.start(function () { Lampa.Loading.stop(); });
      return play(ctx.f.movie_id, { voice: ctx.voice, q: '2160' }).then(function (pp) {
        Lampa.Loading.stop();
        playItem(filmItem(pp, [], 0, ctx.name + ' • 4K', view, meta), meta);
      }).catch(function (e) { Lampa.Loading.stop(); Lampa.Noty.show('UAKino: ' + (e && e.message || 'помилка')); });
    }
    playItem(filmItem(ctx.p, ctx.vars, tier, ctx.name + (ctx.voice ? ' • ' + ctx.voice : ''), view, meta), meta);
  }

  // ── Серіал: окрема сторінка (озвучка, сезони, серії) ──
  function fmtDate(d) {
    if (!d) return '';
    try { return Lampa.Utils.parseTime(d).full; } catch (e) { return d; }
  }
  function SeriesPage(object) {
    var scroll, html, body, rows = [], cur = { r: 0, c: 0 };
    var st = { voice: null, season: null }, tmdbCache = {}, self = this;
    var movie = object.card, id = object.uak_id;

    function focusAt(r, c, keep) {
      if (!rows.length) return;
      r = Math.max(0, Math.min(rows.length - 1, r));
      c = Math.max(0, Math.min(rows[r].length - 1, c));
      cur.r = r; cur.c = c;
      var el = rows[r][c];
      // серії дописуються після завантаження — набір елементів для фокуса Lampa запам'ятовує один раз,
      // тож перед кожним фокусом перечитуємо його (інакше пульт не доходить до серій і не листає)
      Lampa.Controller.collectionSet(scroll.render());
      Lampa.Controller.collectionFocus(el, scroll.render());
      try { scroll.update($(el), true); } catch (e) {}
    }
    function active() { return Lampa.Activity.active() && Lampa.Activity.active().activity === self.activity; }

    function loadSeason(season) {
      if (tmdbCache[season]) return Promise.resolve(tmdbCache[season]);
      return new Promise(function (resolve) {
        var done = false, fin = function (v) { if (!done) { done = true; resolve(v || {}); } };
        setTimeout(function () { fin({}); }, 5000);
        try {
          Lampa.Api.seasons(movie, [season], function (v) {
            var eps = {};
            ((v && v[season] && v[season].episodes) || []).forEach(function (e) { eps[e.episode_number] = e; });
            tmdbCache[season] = eps; fin(eps);
          });
        } catch (e) { fin({}); }
      });
    }
    function sceneMeta(season) {
      return getJSON(API + '/api/scenes?eps=1&id=' + id + '&season=' + season).catch(function () { return {}; });
    }

    function chip(label, extra, on) {
      var el = $('<div class="uak-chip selector' + (on ? ' uak-chip--on' : '') + '"><span class="uak-chip__l">' + label + '</span>' + (extra ? '<span class="uak-chip__v">' + extra + '</span>' : '') + '</div>');
      return el;
    }

    function epsOf(voice) {
      return st.p.episodes.filter(function (e) { return (e.voice || null) === (voice || null) && e.episode != null; });
    }
    function seasonsOf(list) {
      return list.map(function (e) { return e.season; }).filter(function (s, i, a) { return a.indexOf(s) === i; }).sort(function (a, b) { return a - b; });
    }
    // 14.10: озвучки, які реально є в обраному сезоні (в різних сезонах озвучки різні)
    function voicesIn(season) {
      var have = {}, n = {};
      st.p.episodes.forEach(function (e) {
        if (e.season === season && e.episode != null) { var k = e.voice || ''; have[k] = 1; n[k] = (n[k] || 0) + 1; }
      });
      var order = (st.p.voices && st.p.voices.length) ? st.p.voices : [null];
      var out = order.filter(function (v) { return have[v || '']; });
      Object.keys(have).forEach(function (k) { if (!out.some(function (v) { return (v || '') === k; })) out.push(k || null); });
      out.count = n;
      return out;
    }
    // яку озвучку взяти, коли поточної в сезоні немає: запамʼятовану → з історії акаунта → з найбільшою к-стю серій
    function pickVoice(vs) {
      var mem = Lampa.Storage.get('uakino_voice_' + id, '');
      if (mem && vs.indexOf(mem) >= 0) return mem;
      if (st.h && st.h.voice && vs.indexOf(st.h.voice) >= 0) return st.h.voice;
      var best = vs[0];
      vs.forEach(function (v) { if ((vs.count[v || ''] || 0) > (vs.count[best || ''] || 0)) best = v; });
      return best;
    }

    function render() {
      body.empty(); rows = [];
      var all = st.p.episodes.filter(function (e) { return e.episode != null; });
      var seasons = seasonsOf(all);
      if (seasons.indexOf(st.season) < 0) st.season = seasons[0];
      var vs = voicesIn(st.season);
      if (vs.length && vs.indexOf(st.voice) < 0) {
        var nv = pickVoice(vs);
        if (st.notice && nv) Lampa.Noty.show('Сезон ' + st.season + ': озвучка ' + nv);
        st.voice = nv;
      }
      st.notice = false;
      var list = epsOf(st.voice);
      var h = st.h;
      var hs = h && h.season != null && (!h.voice || h.voice === st.voice) ? h.season : null;

      // шапка
      var uniq = {}; all.forEach(function (e) { uniq[e.season + ':' + e.episode] = 1; });
      var total = Object.keys(uniq).length;
      var meta = [movie.release_date ? movie.release_date.slice(0, 4) : (movie.first_air_date || '').slice(0, 4),
                  seasons.length ? seasons.length + ' ' + uakPlural(seasons.length, 'сезон', 'сезони', 'сезонів') : '', total ? total + ' ' + uakPlural(total, 'серія', 'серії', 'серій') : ''].filter(Boolean).join(' · ');
      body.append('<div class="uakse__head"><div class="uakse__title">' + (st.name || '') + '</div><div class="uakse__meta">' + meta + '</div></div>');

      // ряд 0: озвучка
      var r0 = [];
      var rowEl = $('<div class="uakse__row"></div>');
      var vch = chip('Озвучка', (st.voice || 'українська') + (vs.length > 1 ? ' ▾' : ''), false);
      vch.on('hover:enter', function () {
        if (vs.length < 2) return Lampa.Noty.show('У сезоні ' + st.season + ' одна озвучка');
        Lampa.Select.show({
          title: 'Озвучка · сезон ' + st.season, onBack: function () { Lampa.Controller.toggle('content'); },
          items: vs.map(function (v) { return { title: v || 'Українська', subtitle: 'Серій: ' + (vs.count[v || ''] || 0), voice: v, selected: v === st.voice, template: 'selectbox_icon', icon: MIC }; }),
          onSelect: function (it) {
            st.voice = it.voice; Lampa.Storage.set('uakino_voice_' + id, it.voice);
            Lampa.Controller.toggle('content'); render(); focusAt(0, 0);
          }
        });
      });
      rowEl.append(vch); r0.push(vch[0]);
      body.append(rowEl); rows.push(r0);

      // ряд 1: сезони
      if (seasons.length > 1) {
        var sEl = $('<div class="uakse__row uakse__seasons"></div>'), r1 = [];
        seasons.forEach(function (s) {
          var c = chip('Сезон ' + s, s === hs ? 'ви тут' : '', s === st.season);
          c.on('hover:enter', function () { st.season = s; st.notice = true; render(); focusAt(1, seasons.indexOf(s)); });
          sEl.append(c); r1.push(c[0]);
        });
        body.append(sEl); rows.push(r1);
      }

      // серії
      var listEl = $('<div class="uakse__list"></div>'); body.append(listEl);
      listEl.append('<div class="uakse__loading">Завантажуємо серії…</div>');
      var season = st.season, token = ++render.tok;
      Promise.all([loadSeason(season), sceneMeta(season)]).then(function (res) {
        if (token !== render.tok) return;
        var tm = res[0], sc = res[1], by = {};
        (sc && sc.episodes || []).forEach(function (m) { by[m.episode] = m; });
        var nx = sc && sc.next;
        listEl.empty();
        var eps = list.filter(function (e) { return e.season === season; }).sort(function (a, b) { return a.episode - b.episode; });
        var he = hs === season ? h.episode : null;
        if (nx && nx.date) listEl.append('<div class="uakse__next">Наступна серія · ' + fmtDate(nx.date) + '</div>');
        var focusIdx = rows.length;
        eps.forEach(function (e, i) {
          var t = tm[e.episode] || {}, m = by[e.episode] || {};
          var nm = t.name || m.title || e.title;
          var own = nm && !/^\s*(серія|епізод|episode)\s*\d+\s*$/i.test(nm);
          var view = timeline(movie, season, e.episode);
          if (e.episode === he) view = resume(view, h);
          var pct = view && view.percent ? Math.min(100, view.percent) : 0;
          var date = fmtDate(t.air_date) || m.date || '';
          var rt = t.runtime || m.runtime;
          var sub = [date, rt ? rt + ' хв' : ''].filter(Boolean).join(' · ');
          var img = t.still_path ? Lampa.TMDB.image('t/p/w300' + t.still_path) : (m.img ? API + m.img : '');
          var state = e.episode === he ? '<span class="uak-ep__st uak-ep__st--go">Продовжити</span>' : pct >= 90 ? '<span class="uak-ep__st uak-ep__st--ok">✓ Переглянуто</span>' : '';
          var el = $('<div class="uak-ep selector"><div class="uak-ep__img">' + (img ? '<img src="' + img + '" loading="lazy">' : '') +
            '<div class="uak-ep__num">' + e.episode + '</div>' + (pct > 0 && pct < 90 ? '<div class="uak-ep__bar"><i style="width:' + pct + '%"></i></div>' : '') + '</div>' +
            '<div class="uak-ep__body"><div class="uak-ep__name">' + (own ? nm : 'Серія ' + e.episode) + '</div>' +
            (sub ? '<div class="uak-ep__meta">' + sub + '</div>' : '') +
            (t.overview ? '<div class="uak-ep__descr">' + t.overview + '</div>' : '') + '</div>' + state + '</div>');
          el.on('hover:enter', function () { playSeason(eps, i, season, he); });
          el.on('hover:focus', function () { for (var r = 0; r < rows.length; r++) { var c = rows[r].indexOf(el[0]); if (c >= 0) { cur.r = r; cur.c = c; } } });
          listEl.append(el); rows.push([el[0]]);
          if (e.episode === he) focusIdx = rows.length - 1;
        });
        if (!eps.length) listEl.append('<div class="uakse__loading">У цьому сезоні серій поки немає</div>');
        try { Lampa.Layer.update(); } catch (er) {}
        if (render.firstFocus) { render.firstFocus = false; focusAt(eps.length ? focusIdx : 0, 0); }
      });
      // чіпи теж запам'ятовують позицію
      rows.forEach(function (row, r) { row.forEach(function (el, c) { $(el).on('hover:focus', function () { cur.r = r; cur.c = c; }); }); });
    }
    render.tok = 0; render.firstFocus = true;

    // увесь сезон — у плейлист плеєра Lampa: «наступна/попередня» серія й автоперехід.
    // Спершу відкриваємо обрану серію (швидкий старт), решта плейлиста добирається у фоні.
    function playSeason(list, idx, season, he) {
      var v = st.voice, h = st.h, items = new Array(list.length);
      function fetchEp(j) {
        var e = list[j];
        return play(id, { voice: v, season: season, episode: e.episode }).then(function (pp) {
          var view = timeline(movie, season, e.episode);
          if (e.episode === he) view = resume(view, h);
          items[j] = { title: st.name + ' • С' + season + ' С' + e.episode, url: m3u8(pp.manifest_abs || (API + pp.manifest)),
                       timeline: view, hls_type: 'hlsjs', uakino: { movie: id, voice: v, season: season, episode: e.episode } };
          if (pp.subs && pp.subs.length) items[j].subtitles = pp.subs.map(function (x) { return { label: x.label, url: API + x.url }; });
        }).catch(function () {});
      }
      Lampa.Loading.start(function () { Lampa.Loading.stop(); });
      fetchEp(idx).then(function () {
        Lampa.Loading.stop();
        if (!items[idx]) { Lampa.Noty.show('UAKino: не вдалося відкрити серію'); return; }
        Lampa.Player.play(items[idx]);
        Lampa.Player.playlist([items[idx]]);
        try { uakBeat(id); } catch (e) {}
        var queue = []; for (var j = 0; j < list.length; j++) if (j !== idx) queue.push(j);
        var worker = function () { if (!queue.length) return Promise.resolve(); return fetchEp(queue.shift()).then(worker); };
        Promise.all([worker(), worker(), worker(), worker()]).then(function () {
          try { if (Lampa.Player.opened && !Lampa.Player.opened()) return; } catch (e) {}
          Lampa.Player.playlist(items.filter(Boolean));
        });
      });
    }

    this.create = function () {
      html = $('<div class="uakse"></div>');
      scroll = new Lampa.Scroll({ mask: true, over: true, step: 250 });
      // висота блока = екран мінус шапка (інакше блок росте на весь список і не листається)
      try { scroll.minus(); } catch (e) {}
      body = $('<div class="uakse__body"></div>');
      scroll.append(body);
      html.append(scroll.render());
      self.activity.loader(true);
      Promise.all([play(id, {}), history()]).then(function (res) {
        st.p = res[0];
        st.h = res[1].filter(function (x) { return parseInt(x.id) === id; })[0] || null;
        st.name = movie.title || movie.name || res[0].title || '';
        var voices = st.p.voices && st.p.voices.length ? st.p.voices : [null];
        var memV = Lampa.Storage.get('uakino_voice_' + id, '');
        if (st.h && st.h.voice && voices.indexOf(st.h.voice) >= 0) memV = st.h.voice;
        st.voice = (memV && voices.indexOf(memV) >= 0) ? memV : ((st.p.current && st.p.current.voice) || voices[0]);
        var hs = st.h && st.h.season != null && (!st.h.voice || st.h.voice === st.voice) ? st.h.season : null;
        st.season = hs;
        try { Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(movie)); } catch (e) {}
        render();
        self.activity.loader(false);
        self.activity.toggle();
        try { Lampa.Layer.update(); } catch (e) {}
      }).catch(function (e) {
        self.activity.loader(false);
        body.html('<div class="uakse__loading">UAKino: ' + (e && e.message || 'не вдалося завантажити') + '</div>');
        self.activity.toggle();
      });
    };
    this.start = function () {
      if (!active()) return;
      Lampa.Controller.add('content', {
        toggle: function () {
          Lampa.Controller.collectionSet(scroll.render());
          if (rows.length) focusAt(cur.r, cur.c);
        },
        up: function () { if (cur.r <= 0) Lampa.Controller.toggle('head'); else focusAt(cur.r - 1, rows[cur.r - 1].length > cur.c ? cur.c : 0); },
        down: function () { if (cur.r < rows.length - 1) focusAt(cur.r + 1, 0); },
        left: function () { if (cur.c > 0) focusAt(cur.r, cur.c - 1); else Lampa.Controller.toggle('menu'); },
        right: function () { if (rows[cur.r] && cur.c < rows[cur.r].length - 1) focusAt(cur.r, cur.c + 1); },
        enter: function () { var el = rows[cur.r] && rows[cur.r][cur.c]; if (el) $(el).trigger('hover:enter'); },
        back: function () { Lampa.Activity.backward(); }
      });
      Lampa.Controller.toggle('content');
    };
    this.pause = function () {};
    this.stop = function () {};
    this.render = function () { return html; };
    this.destroy = function () { try { scroll.destroy(); } catch (e) {} html.remove(); html = null; };
  }
  Lampa.Component.add('uakino_series', SeriesPage);

  function openSeries(movie, f) {
    Lampa.Activity.push({ url: '', title: movie.title || movie.name || f.title, component: 'uakino_series', page: 1,
                          card: movie, uak_id: f.movie_id });
  }

  // стилі панелі якості й сторінки серіалу
  (function () {
    var css = ''
      + '.uak-qb{display:flex!important;align-items:center;justify-content:center;box-sizing:border-box;flex:none;width:3.9em;min-width:3.9em;height:2.1em;padding:0;border:.14em solid currentColor;border-radius:.45em;font-weight:800;font-size:.8em;line-height:1;white-space:nowrap;letter-spacing:.02em}'
      + '.uak-qi{display:flex;align-items:center;justify-content:center;flex:none;width:3.12em;height:1.7em}'
      + '.uak-qb--gold{color:#ffd84d}'
      + '.selectbox-item.focus .uak-qb--gold,.selectbox-item.hover .uak-qb--gold{color:#b88600}'
      + '.uakse{height:100%}.uakse__body{padding:1.2em 3em 3em 4.2em}'
      + '.uakse__head{margin-bottom:1em}.uakse__title{font-size:2.4em;font-weight:800;line-height:1.1}.uakse__meta{margin-top:.35em;opacity:.6;font-size:1.15em}'
      + '.uakse__row{display:flex;flex-wrap:wrap;gap:.7em;margin-bottom:1em}'
      + '.uak-chip{display:flex;align-items:baseline;gap:.55em;padding:.6em 1.2em;border-radius:2em;background:rgba(255,255,255,.1);font-size:1.15em;font-weight:600}'
      + '.uak-chip__v{opacity:.65;font-weight:500}'
      + '.uak-chip--on{background:#1F6FEB;color:#fff}.uak-chip--on .uak-chip__v{opacity:.85}'
      + '.uak-chip.focus{background:#fff;color:#0b0d12}.uak-chip.focus .uak-chip__v{opacity:.7}'
      + '.uakse__list{display:flex;flex-direction:column;gap:.7em;margin-top:1.2em}'
      + '.uakse__next{opacity:.7;font-size:1.05em;margin-bottom:.2em}'
      + '.uakse__loading{opacity:.6;font-size:1.2em;padding:1em 0}'
      + '.uak-ep{display:flex;align-items:stretch;gap:1.2em;padding:.7em;border-radius:1em;background:rgba(255,255,255,.06)}'
      + '.uak-ep__img{position:relative;flex:0 0 13em;height:7.4em;border-radius:.7em;overflow:hidden;background:linear-gradient(135deg,#1c2230,#10131b)}'
      + '.uak-ep__img img{width:100%;height:100%;object-fit:cover;display:block}'
      + '.uak-ep__num{position:absolute;left:.4em;top:.3em;font-weight:800;font-size:1.4em;text-shadow:0 1px 6px rgba(0,0,0,.8)}'
      + '.uak-ep__bar{position:absolute;left:0;right:0;bottom:0;height:.35em;background:rgba(255,255,255,.25)}'
      + '.uak-ep__bar i{display:block;height:100%;background:#1F6FEB}'
      + '.uak-ep__body{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:.3em}'
      + '.uak-ep__name{font-size:1.35em;font-weight:700}.uak-ep__meta{opacity:.6;font-size:1.05em}'
      + '.uak-ep__descr{opacity:.55;font-size:1em;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'
      + '.uak-ep__st{align-self:center;white-space:nowrap;font-size:1.05em;font-weight:700;padding:.3em .8em;border-radius:1.4em;background:rgba(255,255,255,.12)}'
      + '.uak-ep__st--go{background:#1F6FEB;color:#fff}.uak-ep__st--ok{color:#7ddc8a}'
      + '.uak-ep.focus{background:#fff;color:#0b0d12}.uak-ep.focus .uak-ep__meta,.uak-ep.focus .uak-ep__descr{opacity:.7}'
      + '.uak-ep.focus .uak-ep__st{background:rgba(0,0,0,.1)}.uak-ep.focus .uak-ep__st--go{background:#1F6FEB;color:#fff}'
      + 'body.true--mobile .uak-ep__img{flex-basis:8em;height:4.8em}body.true--mobile .uak-ep__descr{display:none}';
    var st = document.createElement('style'); st.id = 'uak-series-css'; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  })();

  function open(movie) {
    Lampa.Loading.start(function () { Lampa.Loading.stop(); });
    find(movie).then(function (f) {
      if (!f.found) { Lampa.Loading.stop(); Lampa.Noty.show('UAKino: цього фільму поки немає'); return null; }
      var name = movie.title || movie.name || f.title;
      var tv = !!(movie.name || movie.number_of_seasons || movie.first_air_date);
      if (tv) { Lampa.Loading.stop(); return openSeries(movie, f); }   // серіал — окрема сторінка
      return Promise.all([play(f.movie_id, {}), history()]).then(function (res) {
        var p = res[0];
        var h = res[1].filter(function (x) { return parseInt(x.id) === f.movie_id; })[0] || null;
        return variants(m3u8(p.manifest_abs || (API + p.manifest))).then(function (vars) {
          Lampa.Loading.stop();
          var voice = (p.current && p.current.voice) || (p.voices && p.voices[0]) || null;
          filmPanel({ movie: movie, f: f, p: p, h: h, name: name, voice: voice, vars: vars });
        });
      });
    }).catch(function (e) { Lampa.Loading.stop(); Lampa.Noty.show('UAKino: помилка ' + (e && e.message || '')); });
  }

  function addButton(e) {
    var render = e.object.activity.render();
    if (render.find('.view--uakino').length) return;
    var btn = $('<div class="full-start__button selector view--uakino" data-subtitle="uakino.ax">' + ICON + '<span>UAKino</span></div>');
    btn.on('hover:enter', function () { open(e.data.movie); });
    var anchor = render.find('.view--torrent');
    if (anchor.length) anchor.after(btn);
    else render.find('.full-start-new__buttons, .full-start__buttons').first().append(btn);
    if (token()) { addFavButton(render, e.data.movie); addColButton(render, e.data.movie); }
  }

  // 09.10: «В обране» — спільне обране акаунта UAKino (сайт, застосунки, Lampa)
  function addFavButton(render, movie) {
    Promise.all([find(movie), favorites()]).then(function (r) {
      var f = r[0];
      if (!f.found || render.find('.view--uakino-fav').length) return;
      var on = r[1].some(function (x) { return parseInt(x.id) === f.movie_id; });
      var btn = $('<div class="full-start__button selector view--uakino-fav">' + STAR + '<span></span></div>');
      var paint = function () { btn.find('span').text(on ? 'В обраному' : 'В обране'); btn.find('path').attr('fill', on ? 'currentColor' : 'none'); };
      paint();
      btn.on('hover:enter', function () {
        api('/api/user/favorites/' + (on ? 'remove' : 'add'), { movie_id: f.movie_id }).then(function () {
          on = !on; paint(); delete cache.f;
          Lampa.Noty.show(on ? 'Додано в обране UAKino' : 'Прибрано з обраного UAKino');
        }).catch(function () { Lampa.Noty.show('UAKino: увійдіть в акаунт ще раз'); });
      });
      placeBtn(render, btn, 'fav');
    }).catch(function () {});
  }
  // 14.10: «В обране» і «В підбірку» — в основний ряд поруч із «Дивитись» (а не у приховане меню «…»).
  // Рідна закладка Lampa («Вибране», локальна) при вході ховається: обране тепер одне — акаунта UAKino.
  function placeBtn(render, btn, kind) {
    var row = render.find('.full-start-new__buttons, .full-start__buttons').first();
    var play = row.find('.button--play').first();
    if (!row.length || !play.length) return;
    var fav = row.find('.view--uakino-fav');
    if (kind === 'fav') btn.insertAfter(play);
    else btn.insertAfter(fav.length ? fav : play);
    render.find('.button--book').addClass('hide');
    try { if (Lampa.Controller.enabled().name === 'full_start') Lampa.Controller.toggle('full_start'); } catch (e) {}
  }

  // ═══ 14.10.2026: особистий кабінет — окрема сторінка: профіль, історія, обране, підбірки ═══
  // Дані спільні з сайтом і застосунками (/api/user/*, /api/collections/*). Токен — лише в цій Lampa.
  function svgIco(d, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 28) + '" height="' + (size || 28) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"></path></svg>';
  }
  var CI = {
    play: 'M7 5v14l12-7z', hist: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4M12 8v4l3 2',
    fav: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
    col: 'M3 6h6l2 2h10v11H3z', globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    out: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10', plus: 'M12 5v14M5 12h14',
    star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z'
  };
  function escH(s) { return $('<div>').text(s == null ? '' : s).html(); }
  function numFmt(n) { return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function apiM(method, path, body) {
    var o = { method: method, cache: 'no-store', headers: { Authorization: 'Bearer ' + token() } };
    if (body) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return uakinoFetch(API + path, o).then(function (r) {
      if (r.status === 401) { logout(true); throw new Error('auth'); }
      return r.json();
    });
  }
  function posterUrl(p, w) {
    var m = /\/(\d+)\.webp/.exec(p || '');
    return m ? API + '/img/posters_uakino/' + m[1] + '?w=' + (w || 200) : '';
  }
  // Спільна основа сторінок із сіткою кнопок: вертикальна прокрутка + рядки для пульта
  function countCards(ids) {
    if (!ids.length) return Promise.resolve(0);
    var chunks = [];
    for (var i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
    return Promise.all(chunks.map(function (c) { return cards(c).then(function (d) { return (d.results || []).length; }).catch(function () { return 0; }); }))
      .then(function (a) { return a.reduce(function (x, y) { return x + y; }, 0); });
  }
  function PageBase(self) {
    var P = { rows: [], cur: { r: 0, c: 0 } };
    P.scroll = new Lampa.Scroll({ mask: true, over: true, step: 250 });
    try { P.scroll.minus(); } catch (e) {}
    P.html = $('<div class="uakse"></div>');
    P.body = $('<div class="uakse__body"></div>');
    P.scroll.append(P.body); P.html.append(P.scroll.render());
    P.active = function () { var a = Lampa.Activity.active(); return !!a && a.activity === self.activity; };
    P.focusAt = function (r, c) {
      if (!P.rows.length) return;
      r = Math.max(0, Math.min(P.rows.length - 1, r));
      c = Math.max(0, Math.min(P.rows[r].length - 1, c));
      P.cur.r = r; P.cur.c = c;
      var el = P.rows[r][c];
      Lampa.Controller.collectionSet(P.scroll.render());
      Lampa.Controller.collectionFocus(el, P.scroll.render());
      try { P.scroll.update($(el), true); } catch (e) {}
    };
    P.setRows = function (rows) {
      P.rows = rows;
      rows.forEach(function (row, r) { row.forEach(function (el, c) { $(el).on('hover:focus', function () { P.cur.r = r; P.cur.c = c; }); }); });
    };
    P.start = function () {
      if (!P.active()) return;
      Lampa.Controller.add('content', {
        toggle: function () { Lampa.Controller.collectionSet(P.scroll.render()); if (P.rows.length) P.focusAt(P.cur.r, P.cur.c); },
        up: function () { if (P.cur.r <= 0) Lampa.Controller.toggle('head'); else P.focusAt(P.cur.r - 1, P.cur.c); },
        down: function () { if (P.cur.r < P.rows.length - 1) P.focusAt(P.cur.r + 1, P.cur.c); },
        left: function () { if (P.cur.c > 0) P.focusAt(P.cur.r, P.cur.c - 1); else Lampa.Controller.toggle('menu'); },
        right: function () { if (P.rows[P.cur.r] && P.cur.c < P.rows[P.cur.r].length - 1) P.focusAt(P.cur.r, P.cur.c + 1); },
        enter: function () { var el = P.rows[P.cur.r] && P.rows[P.cur.r][P.cur.c]; if (el) $(el).trigger('hover:enter'); },
        back: function () { Lampa.Activity.backward(); }
      });
      Lampa.Controller.toggle('content');
    };
    return P;
  }
  function pushList(url, title) {
    Lampa.Activity.push({ url: url, title: title, component: 'category_full', source: 'uakino', page: 1 });
  }

  // ── Кабінет: профіль, лічильники, плитки розділів ──
  function CabinetPage(object) {
    var self = this, P = PageBase(this);
    function tile(icon, title, sub, onEnter, cls) {
      var el = $('<div class="uak-tile selector ' + (cls || '') + '"><div class="uak-tile__i">' + icon + '</div><div class="uak-tile__t">' + title + '</div><div class="uak-tile__s">' + sub + '</div></div>');
      el.on('hover:enter', onEnter);
      return el;
    }
    function build(res) {
      var me = res[0] || {}, st = res[1] || {}, pts = res[2] || {}, hist = res[3] || [], pub = res[4] || {};
      var nick = me.display_name || me.username || userName() || 'Користувач';
      var since = me.created_at ? new Date(me.created_at).toLocaleDateString('uk-UA') : '';
      var cont = res[6] || 0, histN = res[5] || 0;
      P.body.append('<div class="uak-cab2__head"><div class="uak-cab2__ava">' + escH(String(nick).slice(0, 1).toUpperCase()) + '</div>' +
        '<div class="uak-cab2__who"><div class="uak-cab2__nick">' + escH(nick) + '</div><div class="uak-cab2__sub">' +
        (since ? 'У UAKino з ' + since : '') + (pts.level ? (since ? ' · ' : '') + escH(pts.level) : '') + '</div></div></div>');
      var stats = $('<div class="uak-cab2__stats"></div>');
      [['Переглянуто', numFmt(st.watched_count != null ? st.watched_count : histN)], ['В обраному', numFmt(st.favorites_count)],
       ['Підбірок', numFmt(st.collections_count)], ['Коментарів', numFmt(st.comments_count)], ['Бали', numFmt(pts.balance)]].forEach(function (s) {
        stats.append('<div><small>' + s[0] + '</small><b>' + s[1] + '</b></div>');
      });
      P.body.append(stats);
      var grid = $('<div class="uak-tiles"></div>');
      var t1 = tile(svgIco(CI.play), 'Продовжити перегляд', cont ? cont + ' ' + uakPlural(cont, 'тайтл', 'тайтли', 'тайтлів') + ' на паузі' : 'Нічого на паузі', function () { pushList('continue', 'Продовжити перегляд'); });
      var t2 = tile(svgIco(CI.hist), 'Історія переглядів', numFmt(histN) + ' ' + uakPlural(histN, 'тайтл', 'тайтли', 'тайтлів'), function () { pushList('history', 'Історія переглядів'); });
      var t3 = tile(svgIco(CI.fav), 'Обране', numFmt(st.favorites_count) + ' ' + uakPlural(st.favorites_count || 0, 'тайтл', 'тайтли', 'тайтлів'), function () { pushList('favorites', 'Обране'); });
      var t4 = tile(svgIco(CI.col), 'Мої підбірки', numFmt(st.collections_count) + ' ' + uakPlural(st.collections_count || 0, 'підбірка', 'підбірки', 'підбірок'), function () { openCollections('mine'); });
      var t5 = tile(svgIco(CI.globe), 'Публічні підбірки', numFmt(pub.total) + ' від спільноти', function () { openCollections('public'); });
      var t6 = tile(svgIco(CI.out), 'Вийти з акаунта', 'Лише на цьому телевізорі', function () {
        logout(false); try { Lampa.Activity.backward(); } catch (e) {}
      }, 'uak-tile--out');
      [t1, t2, t3, t4, t5, t6].forEach(function (t) { grid.append(t); });
      P.body.append(grid);
      P.setRows([[t1[0], t2[0], t3[0]], [t4[0], t5[0], t6[0]]]);
    }
    this.create = function () {
      self.activity.loader(true);
      delete cache.h; delete cache.f;
      Promise.all([
        api('/api/auth/me').catch(function () { return {}; }),
        api('/api/users/me/stats').catch(function () { return {}; }),
        api('/api/points/balance').catch(function () { return {}; }),
        history(),
        getJSON(API + '/api/collections/public?limit=1').catch(function () { return {}; })
      ]).then(function (res) {
        var hist = res[3] || [];
        var contIds = hist.filter(function (h) { return (h.progress || 0) > 0.03 && (h.progress || 0) < 0.95; }).map(function (h) { return h.id; });
        return Promise.all([countCards(hist.map(function (h) { return h.id; })), countCards(contIds)]).then(function (n) { return res.concat(n); });
      }).then(function (res) {
        if (!token()) { self.activity.loader(false); try { Lampa.Activity.backward(); } catch (e) {} return; }
        build(res);
        try { Lampa.Background.change(''); } catch (e) {}
        self.activity.loader(false);
        self.activity.toggle();
        try { Lampa.Layer.update(); } catch (e) {}
        P.focusAt(0, 0);
      });
    };
    this.start = P.start; this.pause = function () {}; this.stop = function () {};
    this.render = function () { return P.html; };
    this.destroy = function () { try { P.scroll.destroy(); } catch (e) {} P.html.remove(); };
  }
  Lampa.Component.add('uakino_cabinet', CabinetPage);
  window.uakino_cabinet_page = function () {
    Lampa.Activity.push({ url: '', title: 'Мій кабінет', component: 'uakino_cabinet', page: 1 });
  };

  // ── Підбірки: список (мої / публічні) ──
  function openCollections(kind) {
    Lampa.Activity.push({ url: '', title: kind === 'mine' ? 'Мої підбірки' : 'Публічні підбірки', component: 'uakino_collections', page: 1, kind: kind });
  }
  function CollectionsPage(object) {
    var self = this, P = PageBase(this), kind = object.kind || 'mine', COLS = 4;
    function norm(c) {
      return { id: c.id, name: c.name, owner: c.owner_name || '', n: c.movies_count != null ? c.movies_count : (c.count != null ? c.count : (c.movies || []).length),
               posters: c.preview_posters || c.posters || [], likes: c.likes || 0 };
    }
    function colTile(c) {
      var mosaic = '';
      for (var i = 0; i < 4; i++) { var u = posterUrl(c.posters[i], 200); mosaic += '<i' + (u ? ' style="background-image:url(' + u + ')"' : '') + '></i>'; }
      var el = $('<div class="uak-col selector"><div class="uak-col__cover">' + mosaic + '</div><div class="uak-col__name">' + escH(c.name) + '</div>' +
        '<div class="uak-col__meta">' + numFmt(c.n) + ' ' + uakPlural(c.n, 'фільм', 'фільми', 'фільмів') + (kind === 'public' && c.owner ? ' · ' + escH(c.owner) : '') + '</div></div>');
      el.on('hover:enter', function () { pushList('collection:' + c.id, c.name); });
      if (kind === 'mine') el.on('hover:long', function () { removePanel(c); });
      return el;
    }
    function removePanel(c) {
      Lampa.Select.show({
        title: c.name, onBack: function () { Lampa.Controller.toggle('content'); },
        items: [{ title: 'Видалити підбірку', del: true }, { title: 'Скасувати' }],
        onSelect: function (it) {
          Lampa.Controller.toggle('content');
          if (!it.del) return;
          apiM('DELETE', '/api/user/collections/' + encodeURIComponent(c.id)).then(function () {
            Lampa.Noty.show('Підбірку «' + c.name + '» видалено');
            try { Lampa.Activity.replace(); } catch (e) { render(); }
          }).catch(function () { Lampa.Noty.show('Не вдалося видалити підбірку'); });
        }
      });
    }
    function createCol() {
      Lampa.Input.edit({ title: 'Назва підбірки', value: '', free: true, nosave: true }, function (val) {
        Lampa.Controller.toggle('content');
        val = (val || '').trim();
        if (!val) return;
        api('/api/user/collections/create', { name: val, description: '', is_public: false }).then(function (d) {
          if (d && d.id) { Lampa.Noty.show('Підбірку створено'); try { Lampa.Activity.replace(); } catch (e) {} }
          else Lampa.Noty.show((d && d.error) || 'Не вдалося створити підбірку');
        }).catch(function () { Lampa.Noty.show('Не вдалося створити підбірку'); });
      });
    }
    function render(list) {
      P.body.empty();
      P.body.append('<div class="uakse__head"><div class="uakse__title">' + (kind === 'mine' ? 'Мої підбірки' : 'Публічні підбірки') + '</div><div class="uakse__meta">' +
        (kind === 'mine' ? 'Утримуйте OK на підбірці, щоб видалити' : 'Підбірки спільноти UAKino') + '</div></div>');
      var tiles = [];
      if (kind === 'mine') {
        var add = $('<div class="uak-col uak-col--add selector"><div class="uak-col__cover uak-col__cover--add">' + svgIco(CI.plus, 56) + '</div><div class="uak-col__name">Нова підбірка</div></div>');
        add.on('hover:enter', createCol); tiles.push(add);
      }
      list.forEach(function (c) { tiles.push(colTile(c)); });
      var grid = $('<div class="uak-colgrid"></div>');
      tiles.forEach(function (t) { grid.append(t); });
      P.body.append(grid);
      if (!list.length && kind !== 'mine') P.body.append('<div class="uakse__loading">Поки що немає підбірок</div>');
      var rows = [];
      for (var i = 0; i < tiles.length; i += COLS) rows.push(tiles.slice(i, i + COLS).map(function (t) { return t[0]; }));
      P.setRows(rows);
    }
    this.create = function () {
      self.activity.loader(true);
      var p = kind === 'mine'
        ? api('/api/user/collections').then(function (d) { return (d.collections || []).map(norm); })
        : getJSON(API + '/api/collections/public?limit=40').then(function (d) { return (d.items || []).map(norm); });
      p.catch(function () { return []; }).then(function (list) {
        render(list);
        self.activity.loader(false);
        self.activity.toggle();
        try { Lampa.Layer.update(); } catch (e) {}
        P.focusAt(0, 0);
      });
    };
    this.start = P.start; this.pause = function () {}; this.stop = function () {};
    this.render = function () { return P.html; };
    this.destroy = function () { try { P.scroll.destroy(); } catch (e) {} P.html.remove(); };
  }
  Lampa.Component.add('uakino_collections', CollectionsPage);

  // ── Кнопка «В підбірку» на сторінці матеріалу ──
  function colPicker(movieId, movieName) {
    Lampa.Loading.start(function () { Lampa.Loading.stop(); });
    api('/api/user/collections').then(function (d) {
      Lampa.Loading.stop();
      var cols = d.collections || [];
      var items = [{ title: 'Нова підбірка…', create: true, template: 'selectbox_icon', icon: svgIco(CI.plus, 24) }].concat(cols.map(function (c) {
        var has = (c.movies || []).map(String).indexOf(String(movieId)) >= 0;
        return { title: c.name, subtitle: (c.movies || []).length + ' ' + uakPlural((c.movies || []).length, 'фільм', 'фільми', 'фільмів') + (has ? ' · вже тут' : ''), col: c, has: has, template: 'selectbox_icon', icon: svgIco(CI.col, 24) };
      }));
      var done = function () { Lampa.Controller.toggle('full_start'); };
      Lampa.Select.show({
        title: 'В підбірку', items: items, onBack: done,
        onSelect: function (it) {
          if (it.create) {
            return Lampa.Input.edit({ title: 'Назва підбірки', value: '', free: true, nosave: true }, function (val) {
              val = (val || '').trim(); done();
              if (!val) return;
              api('/api/user/collections/create', { name: val, description: '', is_public: false }).then(function (c) {
                if (!c || !c.id) throw new Error('create');
                return api('/api/user/collections/add', { collection_id: c.id, movie_id: String(movieId) });
              }).then(function () { Lampa.Noty.show('Додано в нову підбірку «' + val + '»'); })
                .catch(function () { Lampa.Noty.show('Не вдалося створити підбірку'); });
            });
          }
          done();
          if (it.has) return Lampa.Noty.show('Цей тайтл уже в підбірці «' + it.col.name + '»');
          api('/api/user/collections/add', { collection_id: it.col.id, movie_id: String(movieId) }).then(function (r) {
            Lampa.Noty.show(r && r.error ? r.error : 'Додано в підбірку «' + it.col.name + '»');
          }).catch(function () { Lampa.Noty.show('Не вдалося додати в підбірку'); });
        }
      });
    }).catch(function () { Lampa.Loading.stop(); Lampa.Noty.show('UAKino: увійдіть в акаунт ще раз'); });
  }
  function addColButton(render, movie) {
    find(movie).then(function (f) {
      if (!f.found || render.find('.view--uakino-col').length) return;
      var btn = $('<div class="full-start__button selector view--uakino-col">' + svgIco(CI.col, 24) + '<span>В підбірку</span></div>');
      btn.on('hover:enter', function () { colPicker(f.movie_id, movie.title || movie.name); });
      placeBtn(render, btn, 'col');
    }).catch(function () {});
  }

  // стилі кабінету й підбірок
  (function () {
    var css = ''
      + '.uak-cab2__head{display:flex;align-items:center;gap:1.2em;margin-bottom:1em}'
      + '.uak-cab2__ava{width:3.6em;height:3.6em;border-radius:50%;background:#ffd84d;color:#10131b;display:flex;align-items:center;justify-content:center;font-size:1.6em;font-weight:800}'
      + '.uak-cab2__nick{font-size:2.2em;font-weight:800;line-height:1.1}.uak-cab2__sub{opacity:.6;font-size:1.15em;margin-top:.2em}'
      + '.uak-cab2__stats{display:flex;flex-wrap:wrap;gap:.8em;margin-bottom:1.4em}'
      + '.uak-cab2__stats div{background:rgba(255,255,255,.08);border-radius:.9em;padding:.6em 1.1em;min-width:7.5em}'
      + '.uak-cab2__stats small{display:block;opacity:.6;font-size:.9em}.uak-cab2__stats b{font-size:1.5em}'
      + '.uak-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:1em}'
      + '.uak-tile{display:flex;flex-direction:column;gap:.35em;padding:1.1em 1.3em;border-radius:1.1em;background:rgba(255,255,255,.07);min-height:7.2em}'
      + '.uak-tile__i svg{width:2.1em!important;height:2.1em!important;display:block}'
      + '.uak-col__cover--add svg{width:3em!important;height:3em!important}'
      + '.uak-tile__i{opacity:.9}.uak-tile__t{font-size:1.45em;font-weight:700}.uak-tile__s{opacity:.6;font-size:1.05em}'
      + '.uak-tile.focus{background:#fff;color:#0b0d12}.uak-tile.focus .uak-tile__s{opacity:.7}'
      + '.uak-tile--out{background:rgba(214,40,40,.18)}.uak-tile--out.focus{background:#d62828;color:#fff}'
      + '.uak-colgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:1.2em}'
      + '.uak-col{border-radius:1em;padding:.5em;background:rgba(255,255,255,.06)}'
      + '.uak-col__cover{display:grid;grid-template-columns:1fr 1fr;gap:.25em;aspect-ratio:16/10;border-radius:.7em;overflow:hidden;background:#161a24}'
      + '.uak-col__cover i{display:block;background:#1d2230 center/cover no-repeat}'
      + '.uak-col__cover--add{display:flex;align-items:center;justify-content:center;opacity:.8}'
      + '.uak-col__name{font-size:1.25em;font-weight:700;margin:.5em .2em .1em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      + '.uak-col__meta{opacity:.6;font-size:1em;margin:0 .2em .3em}'
      + '.uak-col.focus{background:#fff;color:#0b0d12}.uak-col.focus .uak-col__meta{opacity:.7}'
      + 'body.true--mobile .uak-tiles{grid-template-columns:1fr 1fr}body.true--mobile .uak-colgrid{grid-template-columns:1fr 1fr}';
    var st = document.createElement('style'); st.id = 'uak-cab-css'; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  })();

  Lampa.Listener.follow('full', function (e) {
    if (e.type === 'complite') { try { addButton(e); } catch (err) { console.log('uakino', err); } }
  });

  // ── 09.10: каталог UAKino — розділ у меню Lampa, лише те, що є в нашій базі ──
  // розділи 1:1 з меню сайту; вони ж ряди на головній UAKino
  var ROWS = [['new', 'Новинки'], ['films', 'Фільми'], ['series', 'Серіали'],
              ['multserialy', 'Мультсеріали'], ['cartoons', 'Мультфільми'],
              ['dorama', 'Дорами'], ['anime', 'Аніме'], ['4k', 'У 4K'], ['top', 'Найкраще']];
  function list(cat, page, limit) {
    return getJSON(API + '/hls/api/lampa/list?' + q({ cat: cat, page: page || 1, limit: limit || 20 }));
  }
  function cards(ids) { return getJSON(API + '/hls/api/lampa/cards?ids=' + ids.join(',')); }
  function nowWatching() { return getJSON(API + '/hls/api/lampa/nowwatching?limit=24'); }
  var FEATURED = null, heroIdx = 0, heroTimer = null;
  function getFeatured() {
    if (FEATURED) return Promise.resolve(FEATURED);
    return getJSON(API + '/hls/api/lampa/featured?limit=7').then(function (d) { FEATURED = (d && d.results) || []; return FEATURED; }).catch(function () { return []; });
  }
  function heroOpen(it) {
    try {
      Lampa.Activity.push({ url: '', title: it.title, component: 'full', id: it.id,
        method: it.is_series ? 'tv' : 'movie', source: 'uakino',
        card: { id: it.id, source: 'uakino', name: it.title, title: it.title,
                original_name: it.original, original_title: it.original, overview: it.overview,
                release_date: String(it.year), first_air_date: String(it.year),
                vote_average: it.rating, uakino_id: it.uakino_id } });
    } catch (e) {}
  }
  function heroShow(box, items, i) {
    var it = items[i]; if (!it) return; box.__it = it;
    var bg = box.querySelector('.uak-hero__bg'); if (bg) bg.style.backgroundImage = 'url(' + it.backdrop + ')';
    box.querySelector('.uak-hero__title').textContent = it.title;
    var ql = qLabel(it.quality), rate = it.rating ? (Math.round(it.rating * 10) / 10).toFixed(1) : '';
    var meta = []; if (it.year) meta.push([it.year, 0]); if (ql) meta.push([ql, 0]); if (rate) meta.push(['\u2605 ' + rate, 1]);
    box.querySelector('.uak-hero__meta').innerHTML = meta.map(function (m) { return '<span' + (m[1] ? ' class="r"' : '') + '>' + m[0] + '</span>'; }).join('');
    box.querySelector('.uak-hero__desc').textContent = it.overview || '';
    var dots = box.querySelector('.uak-hero__dots'); if (dots) [].forEach.call(dots.children, function (d, k) { d.className = k === i ? 'on' : ''; });
  }
  function renderHero() { return; // no-UI: без hero-банера на головній
    if (window.UAK_NATIVE_HERO) return;   // нативний hero зі збірки
    try {
      if (!window.Lampa || !Lampa.Activity) return;
      var act = Lampa.Activity.active(); if (!act || act.component !== 'main') return;
      var page = document.querySelector('.activity--active'); if (!page) return;
      var body = page.querySelector('.scroll__body') || page.querySelector('.scroll__content'); if (!body) return;
      if (body.querySelector('.uak-hero')) return;
      getFeatured().then(function (items) {
        if (!items.length || body.querySelector('.uak-hero')) return;
        var box = document.createElement('div'); box.className = 'uak-hero';
        box.innerHTML = '<div class="uak-hero__bg"></div><div class="uak-hero__shade"></div>' +
          '<div class="uak-hero__in"><div class="uak-hero__title"></div><div class="uak-hero__meta"></div>' +
          '<div class="uak-hero__desc"></div><div class="uak-hero__btns"><div class="uak-hero__play selector">\u25B6 \u0414\u0438\u0432\u0438\u0442\u0438\u0441\u044C</div></div></div>' +
          '<div class="uak-hero__dots">' + items.map(function () { return '<i></i>'; }).join('') + '</div>';
        body.insertBefore(box, body.firstChild);
        // тримаємо прокрутку зверху, поки користувач не почав гортати: реагуємо на
        // кожну зміну скролу Lampa й повертаємо банер угору (перемагаємо фокус Lampa)
        box.__touched = false;
        var pinMo = null;
        function pinStop() { box.__touched = true; if (pinMo) { pinMo.disconnect(); pinMo = null; } }
        ['wheel', 'keydown', 'mousedown', 'touchstart'].forEach(function (ev) {
          window.addEventListener(ev, pinStop, { once: true, passive: true });
        });
        function pinZero() {
          var tr = body.style.transform;
          if (tr && tr.indexOf('translateY(0px)') < 0 && tr !== 'matrix(1, 0, 0, 1, 0, 0)') body.style.transform = 'translateY(0px)';
        }
        try {
          pinMo = new MutationObserver(function () { if (!box.__touched && document.body.contains(box)) pinZero(); });
          pinMo.observe(body, { attributes: true, attributeFilter: ['style'] });
        } catch (e) {}
        body.style.transform = 'translateY(0px)';
        setTimeout(function () { if (pinMo) { pinMo.disconnect(); pinMo = null; } }, 30000);
        heroIdx = 0; heroShow(box, items, 0);
        box.querySelector('.uak-hero__play').onclick = function () { if (box.__it) heroOpen(box.__it); };
        var dots = box.querySelector('.uak-hero__dots');
        [].forEach.call(dots.children, function (d, k) { d.onclick = function () { heroIdx = k; heroShow(box, items, k); }; });
        if (heroTimer) clearInterval(heroTimer);
        heroTimer = setInterval(function () {
          if (!document.body.contains(box)) { clearInterval(heroTimer); heroTimer = null; return; }
          heroIdx = (heroIdx + 1) % items.length; heroShow(box, items, heroIdx);
        }, 8000);
      });
    } catch (e) {}
  }
  var tmdb = function () { return Lampa.Api.sources.tmdb; };
  var source = {
    main: function (params, oncomplite, onerror) {
      // з акаунтом — спершу «Продовжити перегляд» і «Обране» (ті самі, що на сайті й у застосунку)
      var mine = [['Продовжити перегляд', history], ['Обране', favorites]].map(function (m) {
        return m[1]().then(function (items) {
          var ids = items.filter(function (x) { return m[0] === 'Обране' || (x.progress || 0) < 0.95; }).slice(0, 30).map(function (x) { return x.id; });
          return ids.length ? cards(ids).then(function (d) { return { title: m[0], results: enrichCards(d.results) }; }) : null;
        }).catch(function () { return null; });
      });
      var cat = ROWS.map(function (r) { return list(r[0], 1, 20).then(function (d) { return { title: r[1], results: enrichCards(d.results), url: r[0], source: 'uakino', total_pages: d.total_pages }; }).catch(function () { return null; }); });
      var live = nowWatching().then(function (d) { return (d.results && d.results.length) ? { title: 'Зараз дивляться', results: enrichCards(d.results), source: 'uakino' } : null; }).catch(function () { return null; });
      Promise.all([live].concat(mine, cat))
        .then(function (rows) { rows = rows.filter(function (r) { return r && r.results.length; }); rows.length ? oncomplite(rows) : onerror(); })
        .catch(onerror);
    },
    category: function (params, oncomplite, onerror) {
      if (!params.url) return source.main(params, oncomplite, onerror);
      list(params.url, params.page || 1, 30).then(function (d) {
        oncomplite({ results: d.results, total_pages: d.total_pages, source: 'uakino' });
      }).catch(onerror);
    },
    // 12.10: грід одного розділу (клік на розділ у підменю UAKino)
    category_full: function (params, oncomplite, onerror) {
      // 13.10: списки акаунта (спільні з сайтом і застосунками)
      if (params.url === 'favorites' || params.url === 'history' || params.url === 'continue') {
        return (params.url === 'favorites' ? favorites() : history()).then(function (items) {
          if (params.url === 'continue') items = items.filter(function (x) { return (x.progress || 0) > 0.03 && (x.progress || 0) < 0.95; });
          var pg = params.page || 1, per = 30, tp = Math.max(1, Math.ceil(items.length / per));
          var ids = items.slice((pg - 1) * per, pg * per).map(function (x) { return x.id; });
          if (!ids.length) return oncomplite({ results: [], total_pages: tp, page: pg, source: 'uakino' });
          return cards(ids).then(function (d) { oncomplite({ results: d.results || [], total_pages: tp, page: pg, source: 'uakino' }); });
        }).catch(onerror);
      }
      // 14.10: сторінка підбірки (власна або публічна) — картки за списком id
      if (/^collection:/.test(params.url || '')) {
        var cid = params.url.slice(11), path = '/api/collections/' + encodeURIComponent(cid);
        return (token() ? api(path) : getJSON(API + path)).then(function (d) {
          var all = d.movies || [], pg = params.page || 1, per = 30, tp = Math.max(1, Math.ceil(all.length / per));
          var ids = all.slice((pg - 1) * per, pg * per).map(function (x) { return x.id; });
          if (!ids.length) return oncomplite({ results: [], total_pages: tp, page: pg, source: 'uakino' });
          return cards(ids).then(function (r) { oncomplite(enrichPayload({ results: r.results || [], total_pages: tp, page: pg, source: 'uakino' })); });
        }).catch(onerror);
      }
      list(params.url || 'new', params.page || 1, 30).then(function (d) {
        oncomplite(enrichPayload({ results: d.results, total_pages: d.total_pages, page: params.page || 1,
                     total_results: d.total_results, source: 'uakino' }));
      }).catch(onerror);
    },
    list: function (params, oncomplite, onerror) {
      // 14.10: нативний category_full кличе саме list(): списки акаунта й підбірки віддаємо з category_full
      if (/^(favorites|history|continue|collection:)/.test(params.url || '')) return source.category_full(params, oncomplite, onerror);
      list(params.url || 'new', params.page || 1, 30).then(function (d) { oncomplite(enrichPayload(d)); }).catch(onerror);
    },
    full: function (params, oncomplite, onerror) { tmdb().full(params, oncomplite, onerror); },
    seasons: function (tv, from, oncomplite) { tmdb().seasons(tv, from, oncomplite); },
    person: function (params, oncomplite, onerror) { tmdb().person(params, oncomplite, onerror); },
    search: function (params, oncomplite) { tmdb().search ? tmdb().search(params, oncomplite) : oncomplite([]); },
    menu: function (params, oncomplite) { oncomplite([]); },
    clear: function () {}
  };
  Lampa.Api.sources.uakino = source;

  // 12.10: іконки розділів (line-style, успадковують колір меню)
  var SVG = {
    home:   '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    'new':  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.6 6.3L21 9l-5 4.2L17.5 20 12 16.5 6.5 20 8 13.2 3 9l6.4-.7z"/></svg>',
    film:   '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 4v5M17 4v5M7 20v-5M17 20v-5"/></svg>',
    tv:     '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M8 3l4 3 4-3"/></svg>',
    cartoonseries: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M12 9.5l.9 2 2.1.2-1.6 1.4.5 2L12 14l-1.9 1.1.5-2-1.6-1.4 2.1-.2z"/></svg>',
    cartoon:'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 15a4.5 4.5 0 0 0 7 0"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></svg>',
    dorama: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21C6 17 3 13 3 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 2.5C21 13 18 17 12 21z"/></svg>',
    anime:  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c3 4 6 5 9 5-2 7-5 10-9 13C8 18 5 15 3 8c3 0 6-1 9-5z"/></svg>',
    uhd:    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="5" width="20" height="14" rx="2.5"/><text x="12" y="15.5" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none">4K</text></svg>',
    top:    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4M6 4h12v5a6 6 0 0 1-12 0z"/><path d="M9 19h6M12 15v4"/></svg>'
  };
  // розділ → {назва, url, компонент, іконка}
  var MENU = [
    { t: 'Головна',      u: '',            c: 'main',          i: SVG.home },
    { t: 'Новинки',      u: 'new',         c: 'category_full', i: SVG['new'] },
    { t: 'Фільми',       u: 'films',       c: 'category_full', i: SVG.film },
    { t: 'Серіали',      u: 'series',      c: 'category_full', i: SVG.tv },
    { t: 'Мультсеріали', u: 'multserialy', c: 'category_full', i: SVG.cartoonseries },
    { t: 'Мультфільми',  u: 'cartoons',    c: 'category_full', i: SVG.cartoon },
    { t: 'Дорами',       u: 'dorama',      c: 'category_full', i: SVG.dorama },
    { t: 'Аніме',        u: 'anime',       c: 'category_full', i: SVG.anime },
    { t: 'У 4K',         u: '4k',          c: 'category_full', i: SVG.uhd },
    { t: 'Найкраще',     u: 'top',         c: 'category_full', i: SVG.top }
  ];
  // 12.10: кількість матеріалів у розділах (з нашого API) + швидкий вхід у налаштування плеєра
  function fmtNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009'); }
  function refreshCounts() {
    try {
      uakinoFetch(API + '/hls/api/lampa/counts', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
        var c = (d && d.counts) || {};
        MENU.forEach(function (m) {
          if (!m.u || m.u === 'new') return;            // «Головна» і «Новинки» без числа
          var n = c[m.u]; if (!n) return;
          var el = $('.menu [data-uak="' + m.u + '"]');
          var box = el.find('.menu__count');
          if (!box.length) { box = $('<div class="menu__count"></div>'); el.append(box); }
          box.text(fmtNum(n));
        });
      }).catch(function () {});
    } catch (e) {}
  }
  function addPlayerSettings() {
    if ($('.menu [data-uak="player-settings"]').length) return;
    var ico = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor"/></svg>';
    var item = $('<li class="menu__item selector" data-uak="player-settings"><div class="menu__ico">' + ico + '</div><div class="menu__text">\u041d\u0430\u043b\u0430\u0448\u0442\u0443\u0432\u0430\u043d\u043d\u044f \u043f\u043b\u0435\u0454\u0440\u0430</div></li>');
    item.on('hover:enter', function () { try { Lampa.Controller.toggle('settings'); setTimeout(function () { Lampa.Settings.create('player'); }, 60); } catch (e) {} });
    var anchor = $('.menu [data-action="settings"]').eq(0);
    if (anchor.length) anchor.before(item); else $('.menu .menu__list').last().append(item);
  }
  function addMenu() { if (window.UAK_NATIVE_MENU) return;
    if ($('.menu [data-uak="home"]').length) { refreshCounts(); return; }
    // додаємо пункти у зворотному порядку (prepend), щоб Головна була першою
    for (var k = MENU.length - 1; k >= 0; k--) {
      (function (m, first) {
        var item = $('<li class="menu__item selector" data-uak="' + (first ? 'home' : m.u || 'sec') + '"><div class="menu__ico">' + m.i + '</div><div class="menu__text">' + m.t + '</div></li>');
        item.on('hover:enter', function () {
          Lampa.Activity.push({ url: m.u, title: m.t === 'Головна' ? 'UAKino' : m.t,
                                component: m.c, source: 'uakino', page: 1, title_from: 'UAKino' });
        });
        $('.menu .menu__list').eq(0).prepend(item);
      })(MENU[k], k === 0);
    }
    addPlayerSettings();
    refreshCounts();
  }
  // 09.10: Налаштування → UAKino: вхід / вихід з акаунта
  function addSettings() {
    if (!Lampa.SettingsApi) return;
    Lampa.SettingsApi.addComponent({ component: 'uakino', name: 'UAKino', icon: ICON });
    Lampa.SettingsApi.addParam({
      component: 'uakino', param: { name: 'uakino_account', type: 'button' },
      field: { name: 'Акаунт UAKino', description: '' },
      onRender: function (item) {
        var u = userName();
        item.find('.settings-param__name').text(token() ? 'Вийти з акаунта' + (u ? ' (' + u + ')' : '') : 'Увійти через телефон або сайт');
        item.find('.settings-param__descr').remove();
        item.append('<div class="settings-param__descr">' + (token()
          ? 'Позиція перегляду, історія й обране спільні з uakino.ax і застосунком UAKino.'
          : 'QR-код або код для uakino.ax/qr — позиція перегляду, історія й обране стануть спільними з сайтом і застосунком.') + '</div>');
      },
      onChange: function () {
        var reopen = function () {
          try { Lampa.Settings.create('uakino'); } catch (e) { Lampa.Controller.toggle('settings_component'); }
        };
        if (token()) { logout(); reopen(); }
        else login(reopen);
      }
    });
  }

  // 12.10: чисте меню — лише наші розділи. Приховуємо стандартний непотріб Lampa.
  var KEEP = ['uakino', 'history', 'favorite', 'settings'];           // що лишаємо
  var HIDE_ACTIONS = ['main', 'movie', 'cartoon', 'tv', 'catalog', 'filter', 'relise',
    'anime', 'subscribes', 'mytorrents', 'feed', 'myperson', 'timetable', 'about',
    'console', 'edit'];                                               // що ховаємо (за data-action)
  var HIDE_TEXT = ['Спорт', 'Shots', 'Shots ', 'ТВ', 'IPTV'];         // пункти без data-action — за назвою
  // 12.10: cub-словник ламає наші назви — примусово відновлюємо з MENU
  var UAK_LABEL = {};
  // 12.10: Lampa бере назву картки з TMDB — повертаємо наш укр title з card_data
  function restoreCardTitles() { return; // no-UI: не перезаписуємо назви карток
    try {
      document.querySelectorAll('.card').forEach(function (c) {
        var d = c.card_data || c.data; if (!d || !d.uakino_id) return;
        var want = d.title || d.name; if (!want) return;
        var el = c.querySelector('.card__title');
        if (el && el.textContent !== want) el.textContent = want;
      });
    } catch (e) {}
  }
  function restoreMenuText() { return; // no-UI
    if (window.UAK_NATIVE_MENU) return;
    try {
      if (!UAK_LABEL.home) {
        MENU.forEach(function (m, i) { UAK_LABEL[(i === 0 ? 'home' : (m.u || 'sec'))] = m.t; });
      }
      $('.menu .menu__item[data-uak]').each(function () {
        var want = UAK_LABEL[$(this).attr('data-uak')];
        var el = $(this).find('.menu__text');
        if (want && el.text() !== want) el.text(want);
      });
      // стандартний пункт «Вибране» теж ламається (→«Виране»)
      $('.menu .menu__item[data-action="favorite"] .menu__text').each(function () {
        if ($(this).text() !== 'Вибране') $(this).text('Вибране');
      });
    } catch (e) {}
  }
  function cleanMenu() { return; // no-UI: не ховаємо пункти меню Lampa
    if (window.UAK_NATIVE_MENU) return;
    try {
      // CSS один раз — переживає перемальовування меню
      if (!document.getElementById('uakino-menu-css')) {
        var css = HIDE_ACTIONS.map(function (a) { return '.menu .menu__item[data-action="' + a + '"]'; }).join(',') + '{display:none!important}';
        var st = document.createElement('style'); st.id = 'uakino-menu-css'; st.textContent = css;
        document.head.appendChild(st);
      }
      // пункти без data-action — ховаємо за текстом
      $('.menu .menu__item').each(function () {
        var el = $(this);
        if (KEEP.indexOf(el.attr('data-action') || '') >= 0) return;
        var t = el.find('.menu__text').text().trim();
        if (el.attr('data-uak')) return;   // наші розділи — не чіпаємо
        if (HIDE_TEXT.indexOf(t) >= 0 || (!el.attr('data-action') && t)) el.hide();
      });
    } catch (e) { console.log('uakino clean', e); }
  }


  // 12.10: фірмова тема UAKino (сині акценти бренду замість дефолту Lampa)
  function injectTheme() { return; // no-UI: не нав'язуємо тему UAKino
    if (document.getElementById('uakino-theme')) return;
    var BLUE = '#1F6FEB', BLUE2 = '#4C9AFF', GOLD = '#ffd700';
    var css = [
      /* 12.10: картки НЕ обводимо синім — лишаємо стандартну рамку Lampa */
      /* 12.10: синій ФОН виділення прибрано — стандартне виділення Lampa */
      /* вибране/активний пункт меню */
      '.menu__item.active .menu__ico>*{fill:' + BLUE2 + '!important}',
      '.menu__item.active .menu__text{color:' + BLUE2 + '!important}',
      /* рейтинг і мітки якості — жовтий бренду */
      '.card__vote,.card__quality,.full-start__rate>div:first-child{color:' + GOLD + '!important}',
      /* перемикачі/лінки у налаштуваннях */
      '.settings-param__value,.register__enter,.simple-button--filter.focus{color:#fff}',
      /* прогрес перегляду */
      '.card__promo-text,.time-line>div,.player-panel__position{background:' + BLUE + '!important}',
      /* кнопка «Дивитись» на картці */
      '.full-start__button.button--play.focus{background:' + BLUE + '!important}',
      /* 12.10: бейджі на картках — якість, сезон/серія, живі глядачі */
      '.card__view{position:relative}',
      '.uak-q,.uak-se,.uak-live{position:absolute;z-index:6;line-height:1;border-radius:1em;font-weight:700;letter-spacing:.02em;pointer-events:none;white-space:nowrap;display:inline-flex;align-items:center}',
      '.uak-q{bottom:.3em;left:.3em;padding:.18em .5em .22em;font-size:1.3em;background:rgba(0,0,0,.5);color:' + GOLD + '}',
      '.card__vote{padding:.18em .5em .22em!important;line-height:1!important;display:inline-flex!important;align-items:center!important}',
      '.uak-se{top:.45em;left:.45em;padding:.28em .5em;font-size:1.05em;font-weight:600;background:rgba(0,0,0,.66);color:#fff}',
      '.card__type{display:none!important}',
      '.uak-live{top:.45em;right:.45em;padding:.3em .55em;font-size:1.1em;background:rgba(214,40,40,.94);color:#fff;box-shadow:0 0 0 .12em rgba(255,255,255,.18)}',
      '.uak-live i{font-style:normal;display:inline-block;width:.6em;height:.6em;margin-right:.35em;border-radius:50%;background:#fff;vertical-align:middle;animation:uakpulse 1.4s infinite}',
      '@keyframes uakpulse{0%,100%{opacity:1}50%{opacity:.35}}',
      /* 12.10: лічильник матеріалів у пунктах меню */
      '.menu__item .menu__count{margin-left:auto;flex:none;padding:.06em .42em .12em;border-radius:1em;background:rgba(255,255,255,.12);font-size:.72em;font-weight:600;line-height:1.2;opacity:.9;white-space:nowrap}','.menu__item .menu__text{min-width:0;padding-right:.35em}',
      '.menu__item.focus .menu__count,.menu__item.traverse .menu__count{background:rgba(0,0,0,.14)}',
      /* 12.10: ряд «Зараз дивляться» — нижня стрічка кількість/якість/оцінка */
      '.uak-nw .uak-q,.uak-nw .uak-se,.uak-nw .uak-live,.uak-nw .card__vote{display:none!important}',
      '.uak-bar{position:absolute;left:0;right:0;bottom:.4em;z-index:6;display:flex;justify-content:center;align-items:center;gap:.35em;pointer-events:none}',
      '.uak-bar span{line-height:1;border-radius:1em;font-size:1.15em;font-weight:700;padding:.18em .5em .22em;background:rgba(0,0,0,.6);display:inline-flex;align-items:center;white-space:nowrap}',
      '.uak-bar .b-live{background:rgba(214,40,40,.94);color:#fff}',
      '.uak-bar .b-q,.uak-bar .b-rate{color:' + GOLD + '}',
      '.uak-bar .b-live i{display:inline-block;width:.55em;height:.55em;margin-right:.3em;border-radius:50%;background:#fff;animation:uakpulse 1.4s infinite}',
      /* 12.10: промо-банер (hero) на Головній */
      '.uak-hero{position:relative;height:42vh;min-height:300px;margin:0 1.5em 1.4em;border-radius:.8em;overflow:hidden}',
      '.uak-hero__bg{position:absolute;inset:0;background-size:cover;background-position:center 18%}',
      '.uak-hero__shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,12,18,.94),rgba(10,12,18,.6) 42%,rgba(10,12,18,.08) 72%,transparent),linear-gradient(0deg,rgba(10,12,18,.92),transparent 46%)}',
      '.uak-hero__in{position:absolute;left:3.2%;bottom:8%;max-width:54%;z-index:2}',
      '.uak-hero__title{font-size:2.6em;font-weight:800;line-height:1.05;margin-bottom:.35em;text-shadow:0 2px 12px rgba(0,0,0,.6)}',
      '.uak-hero__meta{display:flex;gap:.5em;margin-bottom:.6em;font-weight:700}',
      '.uak-hero__meta span{background:rgba(255,255,255,.14);padding:.18em .6em .22em;border-radius:1em;font-size:1.05em}',
      '.uak-hero__meta span.r{color:' + GOLD + '}',
      '.uak-hero__desc{font-size:1.1em;line-height:1.4;opacity:.85;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:1em}',
      '.uak-hero__play{display:inline-flex;align-items:center;gap:.4em;background:' + BLUE + ';color:#fff;font-weight:700;font-size:1.25em;padding:.5em 1.4em .58em;border-radius:2em;cursor:pointer}',
      '.uak-hero__play.focus,.uak-hero__play:hover{background:' + GOLD + ';color:#111}',
      '.uak-hero__dots{position:absolute;right:3.2%;bottom:9%;display:flex;gap:.5em;z-index:2}',
      '.uak-hero__dots i{width:.7em;height:.7em;border-radius:50%;background:rgba(255,255,255,.35);cursor:pointer;display:block;transition:width .25s}',
      '.uak-hero__dots i.on{background:' + GOLD + ';width:1.7em;border-radius:1em}'
    ].join('\n');
    var st = document.createElement('style'); st.id = 'uakino-theme'; st.textContent = css;
    document.head.appendChild(st);
  }

  // 12.10: логотип UAKino у шапці замість стандартного значка Lampa
  var LOGO = 'https://tv.uakino.ax/img/uakino-mark.svg';
  function brandHead() { return; // no-UI: не міняємо логотип Lampa
    try {
      $('.head__logo-icon img, .head .logo-icon img, .menu__logo img').each(function () {
        if (this.getAttribute('src') !== LOGO) this.setAttribute('src', LOGO);
      });
    } catch (e) {}
  }

  // 12.10: перебиваємо кривий зовнішній переклад наших рядків
  function fixLang() { return; // no-UI: не чіпаємо мову / Lang
    try {
      var words = ['Головна', 'Новинки', 'Фільми', 'Серіали', 'Мультсеріали', 'Мультфільми',
                   'Дорами', 'Аніме', 'Найкраще', 'Вибране', 'Історія', 'Налаштування',
                   'UAKino', 'Продовжити перегляд', 'Обране'];
      var dict = {};
      words.forEach(function (w) { dict[w] = { uk: w, ru: w, en: w, be: w, zh: w, pt: w, uz: w }; });
      Lampa.Lang.add(dict);
    } catch (e) {}
  }
  // 12.10: живі глядачі (uakino_id -> к-сть), оновлюємо раз на 40 с
  var VIEWERS = {};
  function refreshViewers() {
    try {
      uakinoFetch('https://uakino.ax/hls/api/viewers', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) { VIEWERS = d.map || {}; decorateCards(); })
        .catch(function () {});
    } catch (e) {}
  }
  function qLabel(q) {
    q = String(q || '').toLowerCase(); if (!q) return '';
    if (/4k|uhd/.test(q)) return '4K';
    // 14.10: усе нижче HD (480, 360, TS, CAM…) — «SD», а не цифри «360p» на постері
    var mm = q.match(/\d{3,4}/);
    if (mm) { var h = +mm[0]; return h > 1280 ? '4K' : h >= 950 ? 'FHD' : h >= 620 ? 'HD' : 'SD'; }
    if (/fhd/.test(q)) return 'FHD';
    if (/hd/.test(q)) return 'HD';
    return 'SD';
  }
  // no-UI: щоб Lampa показувала FHD/HD на картці — заповнюємо поля якості
  function enrichCards(list) {
    (list || []).forEach(function (r) {
      if (!r) return;
      var ql = qLabel(r.uakino_quality || (typeof r.quality === 'string' ? r.quality : ''));
      if (!ql) return;
      // рядок + об'єкт — різні шаблони Lampa читають по-різному
      r.quality = ql;
      r.quality_full = ql;
      r.release_quality = ql;
      try { var o = {}; o[ql] = true; r.qualities = o; } catch (e) {}
    });
    return list;
  }
  function enrichPayload(d) {
    if (!d) return d;
    if (Array.isArray(d)) return enrichCards(d);
    if (d.results) d.results = enrichCards(d.results);
    return d;
  }

  function uakPlural(n, one, few, many) {
    n = Math.abs(n) % 100; var n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }
  function seLabel(d) {
    var ss = +d.uakino_seasons || 0, ee = +d.uakino_eps || 0;
    if (!ss && !ee) return '';
    var parts = [];
    if (ss > 1) parts.push(ss + ' ' + uakPlural(ss, 'сезон', 'сезони', 'сезонів'));
    if (ee) parts.push(ee + ' ' + uakPlural(ee, 'серія', 'серії', 'серій'));
    else if (ss === 1) parts.push('1 сезон');
    return parts.join(' · ');
  }
  // 12.10: малюємо бейджі поверх постера картки

  // no-UI: лише стилі позначок якості / рейтингу / глядачів на картках (без теми меню)
  function injectBadgesCSS() {
    if (document.getElementById('uakino-badges-css')) return;
    var GOLD = '#ffd700';
    var css = [
      '.card__vote,.card__quality,.full-start__rate>div:first-child{color:' + GOLD + '!important}',
      '.card__quality{display:inline-flex!important;align-items:center;position:absolute;z-index:5;left:.3em;bottom:.3em;padding:.18em .5em .22em;line-height:1;border-radius:.3em;font-weight:700;font-size:1.15em;background:rgba(0,0,0,.55);color:' + GOLD + '!important}',
      '.card__vote{position:absolute;z-index:5;right:.3em;bottom:.3em;padding:.18em .5em .22em!important;line-height:1!important;display:inline-flex!important;align-items:center!important;background:rgba(0,0,0,.55);border-radius:.3em;font-weight:700}',
      '.card__view{position:relative}',
      '.uak-q,.uak-se,.uak-live{position:absolute;z-index:6;line-height:1;border-radius:1em;font-weight:700;letter-spacing:.02em;pointer-events:none;white-space:nowrap;display:inline-flex;align-items:center}',
      '.uak-q{bottom:.3em;left:.3em;padding:.18em .5em .22em;font-size:1.3em;background:rgba(0,0,0,.5);color:' + GOLD + '}',
      '.card__vote{padding:.18em .5em .22em!important;line-height:1!important;display:inline-flex!important;align-items:center!important}',
      '.uak-se{top:.45em;left:.45em;padding:.28em .5em;font-size:1.05em;font-weight:600;background:rgba(0,0,0,.66);color:#fff}',
      '.uak-live{top:.45em;right:.45em;padding:.3em .55em;font-size:1.1em;background:rgba(214,40,40,.94);color:#fff;box-shadow:0 0 0 .12em rgba(255,255,255,.18)}',
      '.uak-live i{font-style:normal;display:inline-block;width:.6em;height:.6em;margin-right:.35em;border-radius:50%;background:#fff;vertical-align:middle;animation:uakpulse 1.4s infinite}',
      '@keyframes uakpulse{0%,100%{opacity:1}50%{opacity:.35}}',
      '.uak-nw .uak-q,.uak-nw .uak-se,.uak-nw .uak-live,.uak-nw .card__vote{display:none!important}',
      '.uak-bar{position:absolute;left:0;right:0;bottom:.4em;z-index:6;display:flex;justify-content:center;align-items:center;gap:.35em;pointer-events:none}',
      '.uak-bar span{line-height:1;border-radius:1em;font-size:1.15em;font-weight:700;padding:.18em .5em .22em;background:rgba(0,0,0,.6);display:inline-flex;align-items:center;white-space:nowrap}',
      '.uak-bar .b-live{background:rgba(214,40,40,.94);color:#fff}',
      '.uak-bar .b-q,.uak-bar .b-rate{color:' + GOLD + '}',
      '.uak-bar .b-live i{display:inline-block;width:.55em;height:.55em;margin-right:.3em;border-radius:50%;background:#fff;animation:uakpulse 1.4s infinite}'
    ].join('\n');
    var st = document.createElement('style');
    st.id = 'uakino-badges-css';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function decorateCards() {
    try {
      document.querySelectorAll('.card').forEach(function (c) {
        var d = c.card_data || c.data;
        if (!d && window.jQuery) {
          try { d = jQuery(c).data('data') || jQuery(c).data('card') || jQuery(c).data(); } catch (e) {}
        }
        if (!d) return;
        // працюємо і для UAKino, і якщо якість уже є в даних
        var hasUak = !!(d.uakino_id || d.uakino_quality);
        var view = c.querySelector('.card__view'); if (!view) return;
        var ql = qLabel(d.uakino_quality || (typeof d.quality === 'string' ? d.quality : '') || d.quality_full || d.release_quality);
        // якщо є нативний .card__quality — підставляємо текст, якщо порожній
        if (ql) {
          var nq = c.querySelector('.card__quality');
          if (nq && !nq.textContent.trim()) nq.textContent = ql;
          if (!nq) {
            // Lampa не намалювала — додамо свій
            nq = document.createElement('div');
            nq.className = 'card__quality';
            nq.textContent = ql;
            view.appendChild(nq);
          }
        }
        // 12.10: ряд «Зараз дивляться» — внизу одна стрічка: кількість / якість / оцінка
        if ('uakino_viewers' in d) {
          c.classList.add('uak-nw');
          var nn = VIEWERS[d.uakino_id] || d.uakino_viewers || 0;
          var rate = d.vote_average ? (Math.round(d.vote_average * 10) / 10) : 0;
          var html = '';
          if (nn > 0) html += '<span class="b-live"><i></i>' + nn + '</span>';
          if (ql) html += '<span class="b-q">' + ql + '</span>';
          if (rate) html += '<span class="b-rate">' + rate.toFixed(1) + '</span>';
          var bar = view.querySelector('.uak-bar');
          if (!bar) { bar = document.createElement('div'); bar.className = 'uak-bar'; view.appendChild(bar); }
          if (bar.getAttribute('data-k') !== html) { bar.setAttribute('data-k', html); bar.innerHTML = html; }
          return;
        }
        if (ql) {
          var q = view.querySelector('.uak-q');
          if (!q) { q = document.createElement('div'); q.className = 'uak-q'; view.appendChild(q); }
          if (q.textContent !== ql) q.textContent = ql;
        }
        var se = seLabel(d);
        if (se) {
          var e = view.querySelector('.uak-se');
          if (!e) { e = document.createElement('div'); e.className = 'uak-se'; view.appendChild(e); }
          if (e.textContent !== se) e.textContent = se;
        }
        var n = VIEWERS[d.uakino_id] || d.uakino_viewers || 0;
        var vb = view.querySelector('.uak-live');
        if (n > 0) {
          if (!vb) { vb = document.createElement('div'); vb.className = 'uak-live'; view.appendChild(vb); }
          if (vb.getAttribute('data-n') !== String(n)) { vb.setAttribute('data-n', n); vb.innerHTML = '<i></i>' + n; }
        } else if (vb) { vb.remove(); }
      });
    } catch (e) {}
  }
  function ready() {
    // no-UI: меню UAKino + акаунт; позначки якості/рейтингу на картках — так
    addMenu(); try { addSettings(); } catch (e) { console.log('uakino settings', e); }
    injectBadgesCSS();
    decorateCards();
    refreshViewers(); setInterval(refreshViewers, 40000);
    try {
      if (window.MutationObserver) new MutationObserver(function () { decorateCards(); })
        .observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (window.appready) ready();
  else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') ready(); });
})();


/* no-UI: промо-повідомлення вимкнено */
