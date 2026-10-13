(function () {
    'use strict';

    if (window.edu_channels_ready) return;
    window.edu_channels_ready = true;

    const PLUGIN_NAME = 'Познавательные';

    const NETWORKS = [
        { id: '43',   name: 'National Geographic' },
        { id: '91',   name: 'Animal Planet' },
        { id: '64',   name: 'Discovery' },
        { id: '2087', name: 'Discovery Channel' },
        { id: '65',   name: 'History' },
        { id: '3186', name: 'Discovery Science' },
        { id: '43|91|64|2087|65|3186', name: 'Все каналы' }
    ];

    function init() {
        let button = $(`
            <li class="menu__item selector">
                <div class="menu__ico">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                </div>
                <div class="menu__text">${PLUGIN_NAME}</div>
            </li>
        `);

        button.on('hover:enter', openMain);
        $('.menu .menu__list').eq(0).append(button);
    }

    function openMain() {
        Lampa.Select.show({
            title: PLUGIN_NAME,
            items: [
                {
                    title: 'Поиск',
                    subtitle: 'Найти передачу по названию',
                    onSelect: openSearch
                },
                {
                    title: 'Сериалы / Передачи',
                    onSelect: () => openType('tv')
                },
                {
                    title: 'Научно-популярная фантастика',
                    subtitle: 'От новых к старым',
                    onSelect: openSciFi
                }
            ],
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    function openType(type) {
        let items = NETWORKS.map(net => ({
            title: net.name,
            onSelect: () => openCatalog(type, net)
        }));

        Lampa.Select.show({
            title: type === 'tv' ? 'Сериалы / Передачи' : 'Фильмы',
            items: items,
            onBack: openMain
        });
    }

    function openCatalog(type, network) {
        let params = {
            url: type === 'tv' ? 'discover/tv' : 'discover/movie',
            title: network.name + (type === 'tv' ? ' · Передачи' : ' · Фильмы'),
            component: 'category_full',
            source: 'tmdb',
            page: 1,
            card_type: true,
            networks: network.id,
            with_genres: 99,
            sort_by: 'popularity.desc'
        };

        if (type === 'tv') {
            params.with_type = 0;
        }

        Lampa.Activity.push(params);
    }

    function openSciFi() {
        Lampa.Activity.push({
            url: 'discover/movie',
            title: 'Научно-популярная фантастика',
            component: 'category_full',
            source: 'tmdb',
            page: 1,
            card_type: true,
            with_genres: 878,              // Science Fiction
            sort_by: 'primary_release_date.desc'  // от новых к старым
        });
    }

    function openSearch() {
        Lampa.Input.edit({
            title: 'Поиск передач',
            value: '',
            free: true,
            nosave: true
        }, function (query) {
            if (!query || query.length < 2) return;

            Lampa.Activity.push({
                url: 'search/tv',
                title: 'Поиск: ' + query,
                component: 'category_full',
                source: 'tmdb',
                page: 1,
                query: query,
                card_type: true
            });
        });
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', e => {
            if (e.type === 'ready') init();
        });
    }
})();
