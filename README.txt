Zone & Locale Switcher (Manifest V3)
====================================

Установка в Google Chrome:
1. Распакуйте архив timezone_locale_switcher.zip в любую папку.
2. Откройте в браузере страницу: chrome://extensions
3. В правом верхнем углу включите тумблер «Режим разработчика» (Developer mode).
4. Нажмите кнопку «Загрузить распакованное расширение» (Load unpacked) и выберите распакованную папку.

Как устроены профили:
- 🇺🇸 US East — Atlanta / Ashburn (по умолчанию): пояс America/New_York (UTC-5 зимой / UTC-4 летом) и язык en-US. Атланта и Эшберн находятся в одной часовой зоне US Eastern, поэтому объединены в один основной профиль.
- 🇺🇸 US Mountain — Denver: пояс America/Denver (UTC-7 зимой / UTC-6 летом) и язык en-US.
- Дополнительно доступны US Central (Chicago/Dallas), US West (Los Angeles/Seattle), UK (London) и Europe (Frankfurt/Amsterdam).

Подсказка для «Глубокой эмуляции (CDP)»:
По умолчанию расширение работает полностью бесшумно (через синхронный перехват в MAIN world на document_start + сетевую подмену заголовка Accept-Language через declarativeNetRequest).
Если вы включаете тумблер «Глубокая эмуляция (CDP)» и хотите скрыть системную плашку Chrome об отладке, добавьте в ярлык запуска Chrome флаг:
--silent-debugger-extension-api
