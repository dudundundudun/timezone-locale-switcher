Zone & Locale Switcher v1.4 (Manifest V3)
=========================================

Установка / обновление в Google Chrome:
1. Откройте в браузере страницу: chrome://extensions
2. В правом верхнем углу включите тумблер «Режим разработчика» (Developer mode).
3. Нажмите «Загрузить распакованное расширение» (Load unpacked) и выберите папку проекта.
   Если расширение уже установлено — просто нажмите кнопку обновления (↻) на его карточке в chrome://extensions.

Профили (настроены под избранные серверы Quattro VPN + Япония):
Основные серверы VPN:
- 🇺🇸 США — Эшберн / Атланта (по умолчанию): America/New_York (EST/EDT) · en-US
- 🇺🇸 США — Денвер: America/Denver (MST/MDT) · en-US
- 🇩🇪 Германия — Берлин / Франкфурт: Europe/Berlin · en-US
- 🇳🇱 Нидерланды — Амстердам: Europe/Amsterdam · en-US
- 🇵🇱 Польша — Варшава: Europe/Warsaw · en-US
- 🇸🇪 Швеция — Стокгольм: Europe/Stockholm · en-US
- 🇨🇭 Швейцария — Цюрих: Europe/Zurich · en-US
- 🇯🇵 Япония — Токио: Asia/Tokyo · en-US

Дополнительные регионы (на случай автовыбора штата США и др.):
- 🇺🇸 США — Чикаго / Даллас: America/Chicago · en-US
- 🇺🇸 США — Лос-Анджелес / Сиэтл: America/Los_Angeles · en-US
- 🇬🇧 Великобритания — Лондон: Europe/London · en-GB

Подсказка для «Глубокой эмуляции (CDP)»:
По умолчанию расширение работает полностью бесшумно (синхронный перехват Date / Intl / Temporal / Navigator / SpeechSynthesis в MAIN world на document_start + сетевая подмена заголовка Accept-Language на всех запросах включая WebSocket).
Если вы включаете тумблер «Глубокая эмуляция (CDP)» (для Web Workers) и хотите скрыть системную плашку Chrome об отладке, добавьте в ярлык запуска Chrome флаг:
--silent-debugger-extension-api
