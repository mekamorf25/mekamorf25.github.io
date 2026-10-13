(function () {
    'use strict';

    if (window.edu_channels_v2) return;
    window.edu_channels_v2 = true;

    const PLUGIN_NAME = 'Познавательные';
    const PLUGIN_ID   = 'edu_channels_v2';

    // Сети (TMDB Network ID)
    const NETWORKS = [
        { id: '64|49',     name: 'Discovery' },
        { id: '43|4330',   name: 'National Geographic' },
        { id: '107',       name: 'Animal Planet' },
        { id: '65|318',    name: 'History' },
        { id: '3186',      name: 'Discovery Science' },
        { id: '43|64|107|65|3186|4330|49|318', name: 'Все каналы' }
    ];

    const LANGS = 'ru|uk';          // предпочитаемые языки
    const GENRE_DOC = 99;           // Documentary

    function init() {
        // Добавляем пункт в боковое меню
        Lampa.Listener.follow('menu', function (e) {
            if (e.type === 'start') {
                e.menu.push({
                    title: PLUGIN_NAME,
                    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`,
                    onSelect: openMainMenu
                });
            }
        });

        // Если меню уже построено
        if (Lampa.Menu && Lampa.Menu.listener) {
            // fallback
        }
    }

    function openMainMenu() {
        let items = [
            {
                title: 'Сериалы',
                subtitle: 'Документальные передачи',
                onSelect: () => openType('tv')
            },
            {
                title: 'Фильмы',
                subtitle: 'Документальные фильмы',
                onSelect: () => openType('movie')
            },
            {
                title: 'Поиск',
                subtitle: 'Поиск по всем каналам',
                onSelect: openSearch
            }
        ];

        Lampa.Select.show({
            title: PLUGIN_NAME,
            items: items,
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    function openType(type) {
        let items = NETWORKS.map(net => ({
            title: net.name,
            onSelect: () => openCatalog(type, net)
        }));

        Lampa.Select.show({
            title: type === 'tv' ? 'Сериалы' : 'Фильмы',
            items: items,
            onBack: openMainMenu
        });
    }

    function openCatalog(type, network) {
        let params = {
            url: type === 'tv' ? 'discover/tv' : 'discover/movie',
            component: 'category_full',
            source: 'tmdb',
            page: 1,
            card_type: true,
            networks: network.id,
            with_genres: GENRE_DOC,
            with_original_language: LANGS,
            sort_by: 'popularity.desc',
            // Дополнительные полезные фильтры:
            // 'vote_count.gte': 50,
            // 'first_air_date.gte': '2010-01-01'
        };

        // Добавляем название в шапку
        params.title = network.name + (type === 'tv' ? ' · Сериалы' : ' · Фильмы');

        Lampa.Activity.push(params);
    }

    function openSearch() {
        Lampa.Input.edit({
            title: 'Поиск документальных',
            value: '',
            free: true,
            nosave: true
        }, function (value) {
            if (!value || value.length < 2) return;

            let params = {
                url: 'search/multi',
                component: 'category_full',
                source: 'tmdb',
                page: 1,
                query: value,
                card_type: true,
                // Можно дополнительно фильтровать результаты по сетям, но multi-search это делает хуже
            };

            Lampa.Activity.push(params);
        });
    }

    // Запуск
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }

})();
