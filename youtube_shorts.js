(function () {
    'use strict';

    // Список інстансів (можна змінювати / додавати свої)
    var INSTANCES = [
        'https://inv.nadeko.net',
        'https://invidious.nerdvpn.de',
        'https://invidious.f5.si'
    ];
    var currentInstance = INSTANCES[0];

    function getInstance() {
        return currentInstance;
    }

    function request(url, success, error) {
        var network = new Lampa.Reguest();
        network.silent(url, success, function () {
            // Якщо інстанс впав — пробуємо наступний
            var idx = INSTANCES.indexOf(currentInstance);
            if (idx < INSTANCES.length - 1) {
                currentInstance = INSTANCES[idx + 1];
                request(url.replace(INSTANCES[idx], currentInstance), success, error);
            } else if (error) error();
        });
    }

    function loadShorts(callback) {
        // Беремо короткі відео (duration=short)
        var url = getInstance() + '/api/v1/search?q=shorts&type=video&duration=short&sort_by=relevance&region=UA';
        
        request(url, function (json) {
            var results = (json || []).slice(0, 20).map(function (item) {
                return {
                    id: item.videoId,
                    title: item.title,
                    poster: item.videoThumbnails && item.videoThumbnails[0] ? item.videoThumbnails[0].url : '',
                    year: '',
                    release_year: '',
                    // Важливо для відтворення
                    url: 'https://www.youtube.com/watch?v=' + item.videoId,
                    youtube: true,
                    source: 'youtube_shorts'
                };
            });
            callback(results);
        }, function () {
            Lampa.Noty.show('Не вдалося завантажити Shorts');
            callback([]);
        });
    }

    function startPlugin() {
        // Додаємо рядок на головну
        Lampa.ContentRows.add({
            index: 3,                    // позиція на головній (можна змінити)
            screen: ['main'],
            name: 'youtube_shorts',
            call: function () {
                return function (call) {
                    loadShorts(function (results) {
                        call({
                            title: 'YouTube Shorts',
                            results: results,
                            type: 'youtube_shorts'
                        });
                    });
                };
            }
        });

        // Обробка кліку по картці
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite' && e.data && e.data.source === 'youtube_shorts') {
                // Lampa вміє грати YouTube через вбудований bridge
                Lampa.Player.play({
                    title: e.data.title,
                    url: e.data.url,
                    youtube: true
                });
            }
        });

        console.log('YouTube Shorts plugin loaded');
    }

    if (window.appready) startPlugin();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }
})();
