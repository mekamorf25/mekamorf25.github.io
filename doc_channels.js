(function () {
    'use strict';

    if (window.edu_channels_ready) return;
    window.edu_channels_ready = true;

    const PLUGIN_NAME = 'Познавательные';

    const CHANNELS = [
        { id: '43', name: 'National Geographic' },
        { id: '91', name: 'Animal Planet' },
        { id: '64', name: 'Discovery' },
        { id: '65', name: 'History' },
        { id: '43|91|64|65', name: 'Все каналы' }
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

        button.on('hover:enter', openChannels);
        $('.menu .menu__list').eq(0).append(button);
    }

    function openChannels() {
        let items = CHANNELS.map(function (ch) {
            return {
                title: ch.name,
                onSelect: function () {
                    openList(ch);
                }
            };
        });

        Lampa.Select.show({
            title: PLUGIN_NAME,
            items: items,
            onBack: function () {
                Lampa.Controller.toggle('content');
            }
        });
    }

    function openList(channel) {
        Lampa.Activity.push({
            url: 'discover/tv',
            title: channel.name,
            component: 'category_full',
            source: 'tmdb',
            page: 1,
            card_type: true,
            networks: channel.id,
            with_genres: 99,
            sort_by: 'popularity.desc'
        });
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }
})();
