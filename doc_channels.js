(function () {
    'use strict';

    if (window.edu_channels_ready) return;
    window.edu_channels_ready = true;

    const PLUGIN_NAME = 'Познавательные';

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
                    title: 'Документальные передачи',
                    subtitle: 'Все документальные сериалы',
                    onSelect: () => openCatalog()
                },
                {
                    title: 'Поиск',
                    subtitle: 'Найти по названию',
                    onSelect: openSearch
                }
            ],
            onBack: () => Lampa.Controller.toggle('content')
        });
    }

    function openCatalog() {
        Lampa.Activity.push({
            url: 'discover/tv',
            title: 'Документальные передачи',
            component: 'category_full',
            source: 'cub',
            page: 1,
            card_type: true,
            with_genres: 99,          // Documentary
            sort_by: 'popularity.desc'
        });
    }

    function openSearch() {
        Lampa.Input.edit({
            title: 'Поиск документальных передач',
            value: '',
            free: true,
            nosave: true
        }, function (query) {
            if (!query || query.length < 2) return;

            Lampa.Activity.push({
                url: 'search/tv',
                title: 'Поиск: ' + query,
                component: 'category_full',
                source: 'cub',
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
