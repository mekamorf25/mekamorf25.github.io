(function () {
    'use strict';

    // Защита от повторного запуска
    if (window.reload_orange_plugin) return;
    window.reload_orange_plugin = true;

    function start() {
        // Добавляем раздел в настройки
        Lampa.SettingsApi.addComponent({
            component: 'Multi_Menu_Component',
            name: 'Tweaks & Tricks',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: 'Multi_Menu_Component',
            param: {
                name: 'Reloadbutton',
                type: 'trigger',
                default: true
            },
            field: {
                name: 'Кнопка перезагрузки',
                description: 'Оранжевая иконка рядом с часами'
            },
            onChange: function () {
                toggleButton();
            }
        });

        // Функция добавления / показа кнопки
        function addButton() {
            // Если кнопка уже есть — ничего не делаем
            if ($('#RELOAD').length) {
                toggleButton();
                return;
            }

            var my_reload = $(`
                <div id="RELOAD" class="head__action selector" style="color: #FF8C00 !important;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                    </svg>
                </div>
            `);

            // Ищем контейнер действий в шапке
            var $actions = $('#app > div.head > div > div.head__actions');
            
            if ($actions.length) {
                $actions.append(my_reload);

                // Обработчик нажатия
                $('#RELOAD').on('hover:enter hover:click hover:touch', function () {
                    location.reload();
                });

                toggleButton();
            }
        }

        // Показать / скрыть в зависимости от настройки
        function toggleButton() {
            if (Lampa.Storage.field('Reloadbutton') === false) {
                $('#RELOAD').addClass('hide');
            } else {
                $('#RELOAD').removeClass('hide');
            }
        }

        // Первая попытка добавить кнопку
        addButton();

        // На всякий случай проверяем каждые 1.5 секунды (если шапка перерисовалась)
        setInterval(function () {
            if (!$('#RELOAD').length) {
                addButton();
            }
        }, 1500);
    }

    // Правильный запуск плагина
    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                start();
            }
        });
    }
})();
