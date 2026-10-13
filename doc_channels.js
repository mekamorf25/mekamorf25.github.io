(function () {
    'use strict';

    if (window.edu_channels_ready) return;
    window.edu_channels_ready = true;

    const PLUGIN_NAME = 'Познавательные';

    // Сети
    const NETWORKS = [
        { id: '64|49',     name: 'Discovery' },
        { id: '43|4330',   name: 'National Geographic' },
        { id: '107',       name: 'Animal Planet' },
        { id: '65|318',    name: 'History' },
        { id: '3186',      name: 'Discovery Science' },
        { id: '43|64|107|65|3186|4330|49|318', name: 'Все каналы' }
    ];

    function init() {
        // Добавляем пункт в левое меню
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

        button.on('hover:enter', function () {
            openMain();
        });

        // Вставляем в основное меню
        $('.menu .menu__list').eq(0).append(button);
    }

    function openMain() {
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
            onBack: openMain
        });
    }

    function openCatalog(type, network) {
        Lampa.Activity.push({
            url: type === 'tv' ? 'discover/tv' : 'discover/movie',
            title: network.name + (type === 'tv' ? ' · Сериалы' : ' · Фильмы'),
            component: 'category_full',
            source: 'tmdb',
            page: 1,
            card_type: true,
            networks: network.id,
            with_genres: 99,                    // только документальные
            with_original_language: 'ru|uk',    // русский + украинский
            sort_by: 'popularity.desc'
        });
    }

    // Запуск
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                init();
            }
        });
    }
})();
