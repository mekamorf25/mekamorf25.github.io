(function () {
    'use strict';

    if (window.plugin_local_tricks_ready) return;
    window.plugin_local_tricks_ready = true;

    /* ---------- стили ---------- */
    var css = document.createElement('style');
    css.id = 'local-tricks-css';
    css.textContent = [
        /* статус на мини-карточках */
        '.serial-status__type{position:absolute;left:0;top:.8em;padding:.2em .8em;font-size:.85em;border-radius:.5em;text-transform:uppercase;font-weight:700;z-index:2;background:#ff4242;color:#fff}',
        '.serial-status__status{position:absolute;left:0;top:2.7em;padding:.2em .8em;font-size:.85em;border-radius:.5em;text-transform:uppercase;font-weight:700;z-index:2}',
        '.serial-status__status[data-status="ended"]{background:#4CAF50;color:#fff}',
        '.serial-status__status[data-status="airing"]{background:#2196F3;color:#fff}',
        '.serial-status__status[data-status="paused"],.serial-status__status[data-status="canceled"]{background:#FFC107;color:#222}',
        'body[data-status-badge-style="2"] .serial-status__type{top:0;left:0;border-radius:1.1em 0;background:rgba(0,0,0,.55)}',
        'body[data-status-badge-style="2"] .serial-status__status{top:0;left:auto;right:0;border-radius:0 1.1em;background:rgba(0,0,0,.55);color:#fff}',

        /* прогресс сезона */
        '.card--season-complete,.card--season-progress{position:absolute;left:0;bottom:.5em;z-index:12;border-radius:0 .8em .8em 0;opacity:0;transition:opacity .2s;width:fit-content;max-width:calc(100% - 1em)}',
        '.card--season-complete{background:rgba(61,161,141,.9)}',
        '.card--season-progress{background:rgba(255,193,7,.9)}',
        '.card--season-complete div,.card--season-progress div{padding:.25em .45em;font-weight:700;font-size:1em;text-transform:uppercase}',
        '.card--season-complete div{color:#fff}',
        '.card--season-progress div{color:#000}',
        '.card--season-complete.show,.card--season-progress.show{opacity:1}',

        /* часы в плеере */
        '#MyClockDiv{position:fixed;z-index:100;font-size:1.4em;font-weight:600;color:#fff;text-shadow:0 1px 4px #000;pointer-events:none;bottom:90%;right:90%}',

        /* кнопка перезагрузки чуть крупнее */
        '#RELOAD > div{width:1.75em!important;height:1.75em!important}',
        '#RELOAD svg{width:26px!important;height:26px!important}',

        /* инфо на полной карточке — компактно, как на скрине */
        '#local-full-info{margin:.55em 0 .35em;display:flex;flex-direction:column;align-items:flex-start;gap:.5em;position:relative;z-index:5}',
        '#local-full-info .local-runtime{' +
            'display:inline-block;width:auto;max-width:100%;' +
            'padding:.4em .9em;border-radius:.55em;' +
            'background:rgba(38,198,218,.28);color:#8ee8f5;' +
            'font-size:1.15em;font-weight:700;line-height:1.25;' +
            'white-space:nowrap' +
        '}',
        '#local-full-info .local-badges{display:flex;flex-wrap:wrap;gap:.45em;align-items:center}',
        '#local-full-info .local-info-badge{' +
            'display:inline-block;padding:.35em .85em;border-radius:.55em;' +
            'background:rgba(255,255,255,.14);font-size:1.08em;font-weight:700;line-height:1.2' +
        '}',
        '#local-full-info .local-info-rate{background:#f5c518;color:#111}',
        '#local-full-info .local-info-status{background:rgba(76,175,80,.38);color:#d7f0d8}'
    ].join('\n');
    document.head.appendChild(css);

    function isTv(data) {
        if (!data) return false;
        if (data.name || data.first_air_date || data.number_of_seasons) return true;
        var t = (data.type || data.media_type || '').toLowerCase();
        return t === 'tv' || t === 'serial';
    }

    function tmdbGet(path, cb) {
        try {
            var net = new Lampa.Reguest();
            net.timeout(8000);
            var lang = Lampa.Storage.get('language', 'ru');
            var url = Lampa.TMDB.api(path + (path.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + Lampa.TMDB.key() + '&language=' + lang);
            net.silent(url, function (json) { cb(json || null); }, function () { cb(null); });
        } catch (e) {
            cb(null);
        }
    }

    /* =========================================================
       НАСТРОЙКИ + КНОПКА
       ========================================================= */
    function startUi() {
        Lampa.SettingsApi.addComponent({
            component: 'Local_Tricks',
            name: 'Tweaks (local)',
            icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97s-.03-.65-.07-.97l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.39-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.22-.08-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.32-.07.65-.07.97s.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.08.74 1.69.99l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: 'Local_Tricks',
            param: { name: 'Reloadbutton', type: 'trigger', default: true },
            field: { name: 'Кнопка перезагрузки', description: 'Две оранжевые стрелки в шапке' },
            onChange: function () { placeReloadBtn(true); }
        });

        Lampa.SettingsApi.addParam({
            component: 'Local_Tricks',
            param: { name: 'full_card_info', type: 'trigger', default: true },
            field: { name: 'Инфо на полной карточке', description: 'Длительность сверху, ниже рейтинг и статус' },
            onChange: function () {}
        });

        Lampa.SettingsApi.addParam({
            component: 'Local_Tricks',
            param: { name: 'serial_status_enabled', type: 'trigger', default: true },
            field: { name: 'Статус сериала на карточках', description: 'В эфире / Завершён / Пауза' },
            onChange: function () {}
        });

        Lampa.SettingsApi.addParam({
            component: 'Local_Tricks',
            param: {
                name: 'serial_status_style',
                type: 'select',
                values: { '1': 'Вариант 1 (слева)', '2': 'Вариант 2 (углы)' },
                default: '1'
            },
            field: { name: 'Расположение статуса', description: '' },
            onChange: function (v) {
                if (String(v) === '2') document.body.setAttribute('data-status-badge-style', '2');
                else document.body.removeAttribute('data-status-badge-style');
            }
        });
        if (String(Lampa.Storage.field('serial_status_style') || '1') === '2') {
            document.body.setAttribute('data-status-badge-style', '2');
        }

        Lampa.SettingsApi.addParam({
            component: 'Local_Tricks',
            param: { name: 'season_badge_enabled', type: 'trigger', default: true },
            field: { name: 'Прогресс сезона на карточках', description: 'S2 8/12 или S2 ✓' },
            onChange: function () {}
        });

        Lampa.SettingsApi.addParam({
            component: 'Local_Tricks',
            param: { name: 'NoTrailerMainPage', type: 'trigger', default: false },
            field: { name: 'Скрыть трейлеры-новинки', description: 'Баннер на главной' },
            onChange: function () {}
        });

        Lampa.SettingsApi.addParam({
            component: 'Local_Tricks',
            param: { name: 'NavyBar', type: 'trigger', default: false },
            field: { name: 'Скрыть панель навигации', description: '' },
            onChange: function () {
                $('#no_bar').remove();
                if (Lampa.Storage.field('NavyBar') == true) {
                    $('body').append('<style id="no_bar">.navigation-bar,.navigation-bar__body{display:none!important}</style>');
                }
            }
        });
        if (Lampa.Storage.field('NavyBar') == true) {
            $('body').append('<style id="no_bar">.navigation-bar,.navigation-bar__body{display:none!important}</style>');
        }

        Lampa.SettingsApi.addParam({
            component: 'Local_Tricks',
            param: { name: 'ANIME_FIX', type: 'trigger', default: false },
            field: { name: 'Скрыть Anime в меню', description: '' },
            onChange: function () {
                $('[data-action=anime]')[Lampa.Storage.field('ANIME_FIX') == true ? 'hide' : 'show']();
            }
        });
        Lampa.SettingsApi.addParam({
            component: 'Local_Tricks',
            param: { name: 'SISI_FIX', type: 'trigger', default: false },
            field: { name: 'Скрыть «Клубничка»', description: '' },
            onChange: function () {
                var on = Lampa.Storage.field('SISI_FIX') == true;
                $('[data-action=sisi]')[on ? 'hide' : 'show']();
                $('li:contains("Клубничка")')[on ? 'hide' : 'show']();
            }
        });
        if (Lampa.Storage.field('ANIME_FIX') == true) $('[data-action=anime]').hide();
        if (Lampa.Storage.field('SISI_FIX') == true) {
            $('[data-action=sisi]').hide();
            $('li:contains("Клубничка")').hide();
        }

        Lampa.SettingsApi.addParam({
            component: 'Local_Tricks',
            param: { name: 'TORRENT_FIX', type: 'trigger', default: false },
            field: { name: 'Контрастная рамка торрентов', description: '' },
            onChange: function () {
                $('#torrent_focus_style').remove();
                if (Lampa.Storage.field('TORRENT_FIX') == true) {
                    $('body').append('<style id="torrent_focus_style">.torrent-item.focus,.torrent-item.selector.focus{outline:3px solid #00e676!important;outline-offset:2px}</style>');
                }
            }
        });
        if (Lampa.Storage.field('TORRENT_FIX') == true) {
            $('body').append('<style id="torrent_focus_style">.torrent-item.focus,.torrent-item.selector.focus{outline:3px solid #00e676!important;outline-offset:2px}</style>');
        }

        Lampa.SettingsApi.addParam({
            component: 'Local_Tricks',
            param: { name: 'ClockInPlayer', type: 'trigger', default: false },
            field: { name: 'Часы во встроенном плеере', description: '' },
            onChange: function () {}
        });
        setInterval(function () {
            if (Lampa.Storage.field('ClockInPlayer') != true) {
                $('#MyClockDiv').remove();
                return;
            }
            if (!$('.player').length) {
                $('#MyClockDiv').remove();
                return;
            }
            var t = '';
            try {
                var el = document.querySelector('.head__time-now');
                if (el) t = el.textContent;
            } catch (e) {}
            if (!t) {
                var d = new Date();
                t = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
            }
            if (!$('#MyClockDiv').length) $('.player').append('<div id="MyClockDiv"></div>');
            $('#MyClockDiv').text(t);
        }, 500);

        Lampa.SettingsApi.addParam({
            component: 'Local_Tricks',
            param: { name: 'YouTubeStyle', type: 'trigger', default: false },
            field: { name: 'Стилизация плеера', description: '' },
            onChange: function () {
                $('#YOUTUBESTYLE').remove();
                if (Lampa.Storage.field('YouTubeStyle') == true) {
                    $('body').append('<style id="YOUTUBESTYLE">.player-panel{background:rgba(0,0,0,.75)!important}.player-panel .timeline__progress{background:#f00!important}</style>');
                }
            }
        });
        if (Lampa.Storage.field('YouTubeStyle') == true) {
            $('body').append('<style id="YOUTUBESTYLE">.player-panel{background:rgba(0,0,0,.75)!important}.player-panel .timeline__progress{background:#f00!important}</style>');
        }

        setInterval(function () {
            if (Lampa.Storage.field('NoTrailerMainPage') != true) {
                $('#NoTrailerMainPage').remove();
                return;
            }
            var act = Lampa.Activity.active();
            if (!act) return;
            if (act.component === 'main' || (act.component === 'category' && act.url === 'movie')) {
                if (!$('#NoTrailerMainPage').length) {
                    $('body').append('<style id="NoTrailerMainPage">.items-line:first-child{display:none!important}</style>');
                }
            } else $('#NoTrailerMainPage').remove();
        }, 900);

        placeReloadBtn(true);
        setInterval(function () { placeReloadBtn(false); }, 2000);
    }

    /* две оранжевые стрелки, без заливки круга */
    var SVG_RELOAD =
        '<svg viewBox="0 0 24 24" width="26" height="26" xmlns="http://www.w3.org/2000/svg">' +
        '<path fill="#FF9800" d="M17.65 6.35A7.95 7.95 0 0 0 12 4V1L7 6l5 5V7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.35 1.83l1.52.87C18.7 13.72 19 12.89 19 12c0-2.21-.9-4.21-2.35-5.65zM12 17c-2.76 0-5-2.24-5-5 0-.65.13-1.26.35-1.83l-1.52-.87C5.3 10.28 5 11.11 5 12c0 3.87 3.13 7 7 7v3l5-5-5-5v3z"/>' +
        '</svg>';

    function placeReloadBtn(force) {
        var $actions = $('.head__actions').first();
        if (!$actions.length) return;

        if (Lampa.Storage.field('Reloadbutton') == false) {
            $('#RELOAD').addClass('hide');
            return;
        }

        if (force || !$('#RELOAD').length) {
            $('#RELOAD').remove();
            var $b = $('<div class="head__action selector" id="RELOAD" title="Перезагрузка">' +
                '<div style="width:1.75em;height:1.75em;display:flex;align-items:center;justify-content:center">' +
                SVG_RELOAD + '</div></div>');
            $b.on('hover:enter hover:click hover:touch', function () {
                location.reload();
            });
            $actions.append($b);
        } else {
            $('#RELOAD').removeClass('hide');
            $('#RELOAD').find('div').first().html(SVG_RELOAD);
        }
    }

    /* =========================================================
       СТАТУС НА МИНИ-КАРТОЧКАХ
       ========================================================= */
    var statusCache = {};

    function applyStatus(viewEl, data) {
        if (Lampa.Storage.field('serial_status_enabled') == false || !viewEl || !data || !isTv(data)) return;
        var old = viewEl.querySelectorAll('.serial-status__type,.serial-status__status');
        for (var i = 0; i < old.length; i++) old[i].remove();

        var type = document.createElement('div');
        type.className = 'serial-status__type';
        type.textContent = 'Сериал';
        viewEl.appendChild(type);

        function put(st) {
            if (!st || viewEl.querySelector('.serial-status__status')) return;
            var map = {
                ended: ['ended', 'Завершён'],
                'returning series': ['airing', 'В эфире'],
                airing: ['airing', 'В эфире'],
                'in production': ['airing', 'В эфире'],
                'on hiatus': ['paused', 'Пауза'],
                paused: ['paused', 'Пауза'],
                canceled: ['canceled', 'Отменён'],
                cancelled: ['canceled', 'Отменён']
            };
            var m = map[(st || '').toLowerCase()];
            if (!m) return;
            var el = document.createElement('div');
            el.className = 'serial-status__status';
            el.setAttribute('data-status', m[0]);
            el.textContent = m[1];
            viewEl.appendChild(el);
        }

        if (data.status) { put(data.status); return; }
        var id = data.id || data.tmdb_id;
        if (!id) return;
        if (statusCache[id]) { put(statusCache[id]); return; }
        tmdbGet('tv/' + id, function (json) {
            if (json && json.status) {
                statusCache[id] = json.status;
                put(json.status);
            }
        });
    }

    function processStatusCard(cardEl) {
        if (!cardEl) return;
        var data = cardEl.card_data || cardEl.data;
        var view = cardEl.querySelector && cardEl.querySelector('.card__view');
        if (view && data) applyStatus(view, data);
    }

    /* =========================================================
       ПРОГРЕСС СЕЗОНА
       ========================================================= */
    var seasonCache = {};
    try { seasonCache = JSON.parse(localStorage.getItem('localSeasonBadgeCache') || '{}'); } catch (e) {}

    function getSeasonProgress(tmdbData) {
        if (!tmdbData || !tmdbData.seasons || !tmdbData.last_episode_to_air) return null;
        var last = tmdbData.last_episode_to_air;
        var cur = null;
        for (var i = 0; i < tmdbData.seasons.length; i++) {
            if (tmdbData.seasons[i].season_number === last.season_number && tmdbData.seasons[i].season_number > 0) {
                cur = tmdbData.seasons[i];
                break;
            }
        }
        if (!cur) return null;
        var total = cur.episode_count || 0;
        var aired = last.episode_number || 0;
        return {
            seasonNumber: last.season_number,
            airedEpisodes: aired,
            totalEpisodes: total,
            isComplete: total > 0 && aired >= total
        };
    }

    function addSeasonBadge(cardEl) {
        if (Lampa.Storage.field('season_badge_enabled') == false || !cardEl || cardEl.getAttribute('data-season-processed')) return;
        var data = cardEl.card_data || cardEl.data;
        if (!data) {
            requestAnimationFrame(function () { addSeasonBadge(cardEl); });
            return;
        }
        if (!isTv(data)) return;
        var view = cardEl.querySelector('.card__view');
        if (!view) return;

        var old = view.querySelectorAll('.card--season-complete,.card--season-progress');
        for (var i = 0; i < old.length; i++) old[i].remove();

        var badge = document.createElement('div');
        badge.className = 'card--season-progress';
        badge.innerHTML = '<div>...</div>';
        view.appendChild(badge);
        cardEl.setAttribute('data-season-processed', '1');

        var id = data.id || data.tmdb_id;
        if (!id) { badge.remove(); return; }

        function render(info) {
            if (!info) { badge.remove(); return; }
            badge.className = info.isComplete ? 'card--season-complete' : 'card--season-progress';
            badge.innerHTML = '<div>' + (info.isComplete
                ? ('S' + info.seasonNumber + ' ✓')
                : ('S' + info.seasonNumber + ' ' + info.airedEpisodes + '/' + info.totalEpisodes)) + '</div>';
            setTimeout(function () { badge.classList.add('show'); }, 30);
        }

        var cached = seasonCache[id];
        if (cached && Date.now() - cached.timestamp < 86400000) {
            render(getSeasonProgress(cached.data));
            return;
        }
        tmdbGet('tv/' + id, function (json) {
            if (json) {
                seasonCache[id] = { data: json, timestamp: Date.now() };
                try { localStorage.setItem('localSeasonBadgeCache', JSON.stringify(seasonCache)); } catch (e) {}
                render(getSeasonProgress(json));
            } else badge.remove();
        });
    }

    function startBadges() {
        var obs = new MutationObserver(function (muts) {
            for (var m = 0; m < muts.length; m++) {
                var nodes = muts[m].addedNodes;
                if (!nodes) continue;
                for (var i = 0; i < nodes.length; i++) {
                    var n = nodes[i];
                    if (!n || n.nodeType !== 1) continue;
                    if (n.classList && n.classList.contains('card')) {
                        processStatusCard(n);
                        addSeasonBadge(n);
                    }
                    if (n.querySelectorAll) {
                        var cards = n.querySelectorAll('.card');
                        for (var c = 0; c < cards.length; c++) {
                            processStatusCard(cards[c]);
                            addSeasonBadge(cards[c]);
                        }
                    }
                }
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });

        Lampa.Listener.follow('full', function (e) {
            if ((e.type === 'complite' || e.type === 'complete') && e.data && e.data.movie) {
                var poster = document.querySelector('.full-start-new__poster, .full-start__poster');
                if (poster) applyStatus(poster, e.data.movie);
            }
        });
    }

    /* =========================================================
       ИНФО НА ПОЛНОЙ КАРТОЧКЕ
       Порядок: 1) длительность  2) рейтинг + статус + сезоны
       ========================================================= */
    function fmtRuntime(min) {
        if (!min || min <= 0) return '';
        var h = Math.floor(min / 60), m = min % 60;
        if (h > 0 && m > 0) return h + ' ч ' + m + ' мин';
        if (h > 0) return h + ' ч';
        return m + ' мин';
    }

    function buildFullInfo(movie) {
        if (!movie || Lampa.Storage.field('full_card_info') == false) return;

        $('#local-full-info').remove();

        var series = isTv(movie);
        var runtimeText = '';
        var parts = [];

        /* 1. Длительность — сверху */
        if (series) {
            var ep = 0;
            if (movie.episode_run_time && movie.episode_run_time.length) ep = movie.episode_run_time[0];
            else if (movie.last_episode_to_air && movie.last_episode_to_air.runtime) ep = movie.last_episode_to_air.runtime;
            if (ep) runtimeText = 'Длительность серии: ' + fmtRuntime(ep);
        } else if (movie.runtime) {
            runtimeText = 'Длительность фильма: ' + fmtRuntime(movie.runtime);
        }

        /* 2. Рейтинг и статус — снизу */
        if (movie.vote_average && movie.vote_average > 0) {
            parts.push('<span class="local-info-badge local-info-rate">★ ' + Number(movie.vote_average).toFixed(1) + ' TMDB</span>');
        }

        if (movie.status) {
            var stMap = {
                'Released': 'Выпущен',
                'Ended': 'Завершён',
                'Returning Series': 'В эфире',
                'In Production': 'В производстве',
                'Post Production': 'Постпродакшн',
                'Canceled': 'Отменён',
                'Cancelled': 'Отменён',
                'On Hiatus': 'Пауза'
            };
            parts.push('<span class="local-info-badge local-info-status">' + (stMap[movie.status] || movie.status) + '</span>');
        }

        if (series) {
            var se = [];
            if (movie.number_of_seasons) se.push(movie.number_of_seasons + ' сез.');
            if (movie.number_of_episodes) se.push(movie.number_of_episodes + ' сер.');
            if (se.length) parts.push('<span class="local-info-badge">' + se.join(' · ') + '</span>');
        }

        if (!runtimeText && !parts.length) return;

        var html = '<div id="local-full-info">';
        if (runtimeText) html += '<div class="local-runtime">' + runtimeText + '</div>';
        if (parts.length) html += '<div class="local-badges">' + parts.join('') + '</div>';
        html += '</div>';

        var places = [
            '.full-start-new__tagline',
            '.full-start__tagline',
            '.full-start-new__title',
            '.full-start__title',
            '.full-start-new__head',
            '.full-start__head',
            '.full-start-new__details',
            '.full-start__body'
        ];
        var inserted = false;
        for (var i = 0; i < places.length; i++) {
            var $el = $(places[i]).first();
            if ($el.length) {
                $el.after(html);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            var $body = $('.full-start-new, .full-start').first();
            if ($body.length) $body.prepend(html);
        }
    }

    function startFullInfo() {
        function onFull(e) {
            if (e.type !== 'complite' && e.type !== 'complete') return;
            if (!e.data || !e.data.movie) return;
            var movie = e.data.movie;
            var id = movie.id || movie.tmdb_id;
            var path = (isTv(movie) ? 'tv/' : 'movie/') + id;

            if (id) {
                tmdbGet(path, function (json) {
                    if (json) {
                        if (json.runtime) movie.runtime = json.runtime;
                        if (json.episode_run_time) movie.episode_run_time = json.episode_run_time;
                        if (json.status) movie.status = json.status;
                        if (json.vote_average) movie.vote_average = json.vote_average;
                        if (json.number_of_seasons) movie.number_of_seasons = json.number_of_seasons;
                        if (json.number_of_episodes) movie.number_of_episodes = json.number_of_episodes;
                        if (json.last_episode_to_air) movie.last_episode_to_air = json.last_episode_to_air;
                    }
                    setTimeout(function () { buildFullInfo(movie); }, 120);
                });
            } else {
                setTimeout(function () { buildFullInfo(movie); }, 120);
            }
        }

        Lampa.Listener.follow('full', onFull);
    }

    function boot() {
        startUi();
        startBadges();
        startFullInfo();
    }

    if (window.appready) boot();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') boot();
        });
    }
})();
