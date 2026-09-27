> Ручные запросы перенесены из исходного Python-проекта без изменения API-семантики.
> Упоминания Python-файлов ниже сохраняют происхождение примеров. TypeScript-сценарии
> сопоставлены в `../../docs/parity-matrix.json` (от корня репозитория: `docs/parity-matrix.json`).
> Для нового проекта запустите `npm run api:start`, перенесите выведенный адрес в `base_url`;
> после ручной проверки выполните `npm run api:stop`.

# SDET API: cURL и Postman

Пакет подготовлен 7 сентября 2026 по OpenAPI, client.py и deterministic API tests чистого interview repository. Запросы к challenge API при подготовке пакета не выполнялись. Чистый repository не изменялся.

## Импорт

В Postman откройте Import и выберите `SDET_Interview.postman_collection.json`, `local-dev.postman_environment.json` и `local-prod.postman_environment.json`. Выберите environment **SDET local dev** или **SDET local prod**. Можно также вставлять отдельные команды из CURL_REQUESTS.md в Import. [Документация Postman](https://learning.postman.com/docs/getting-started/importing-and-exporting/importing-data/).

Начните с папки **01 — Пять операций и CRUD**. Отправляйте по одному запросу кнопкой Send. Это ручная библиотека: автоматических HTTP-вызовов, создания fixture, cleanup и response assertions нет. Поэтому общая кнопка Run для всей коллекции не заменяет автоматическую suite: сценарии требуют разного исходного состояния.

## Переменные

| Переменная                               | Значение по умолчанию / назначение                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `base_url`                               | `http://127.0.0.1:3000`, без `/dev` или `/prod`, без завершающего `/`                               |
| `env`                                    | `dev` или `prod` — логические prefix одного локального приложения                                   |
| `auth_token`                             | `mysecrettoken` — публичное значение по умолчанию из Settings; замените, если запуск настроен иначе |
| `email`                                  | Основной CRUD fixture, например `boka.postman.dev@example.com`                                      |
| `second_email`, `renamed_email`          | Дополнительные ключи для conflict/rename                                                            |
| `missing_email`                          | Заведомо несуществующий ключ, не создавайте его                                                     |
| `auth_email`                             | Fixture для auth DELETE                                                                             |
| `candidate_email`                        | Свободный ключ для POST validation; освобождайте перед следующим case                               |
| `validation_email`                       | Существующий fixture для PUT validation                                                             |
| `body_email`, `media_email`, `raw_email` | Fixture для body/media-type упражнений                                                              |
| `plus_email`, `percent_email`            | Email с `+` и `%` для проверки URL encoding                                                         |
| `isolation_email`                        | Один и тот же ключ в dev и prod, только для папки 08                                                |

Все значения доступны в импортированном environment. Чтобы повторить сценарий, задайте новый email или удалите только свой предыдущий fixture. POST с тем же email не является reset: контракт ожидает 409, BUG-003 может вернуть 500. Смена environment переключает также учебные email. Папка 08 намеренно обращается к обоим prefix.

Скрипт коллекции только вычисляет локальные `*_path` через `encodeURIComponent`. Меняйте исходный email обычным текстом, не вводите `%40` вместо `@` в переменную email. В body используется исходный email; в path — закодированный. В запросах отключено дополнительное URL encoding, чтобы избежать повторного кодирования `%`.

## Ответы и состояние

- GET list: 200 и JSON-массив User.
- POST: 201 и User; в негативных сценариях — 400 или 409.
- GET user: 200 и User; для отсутствующего ключа — 404.
- PUT: 200 и User; негативные сценарии — 400, 404 или 409. PUT содержит все три поля: name, email, age.
- DELETE: заголовок именно `Authentication: <token>`, без Bearer; ожидаем 204 без тела, либо 401/404 с ErrorResponse.

Заголовок Authentication обязателен только у DELETE в данном OpenAPI. В коллекции явно выбран No Auth: заголовки указаны непосредственно в запросах, поэтому missing/empty/invalid случаи не получают скрытую авторизацию.

Ожидаемые статусы описывают контракт и ожидания соответствующих тестов. Задокументированные отклонения BUG-001…009 указаны в описаниях. Они не изменяют контрактные ожидания и не объявляются PASS. Пакет не переносит exact-signature XFAIL gate из pytest.

После PUT читайте того же пользователя и сравнивайте конкретные значения. После DELETE проверяйте отсутствие своего email в GET list: GET отсутствующего пользователя имеет BUG-004. Перед каждым auth-case создавайте fixture заново при необходимости: BUG-001 в dev может удалить его даже без валидного токена.

Пустой заголовок в cURL отправляется как `--header 'Authentication;'`. Запись `Authentication:` без значения в cURL удаляет/подавляет заголовок, а не воспроизводит empty-token. В коллекции пустой Authentication представлен заголовком со значением пустая строка.

## Покрытие

Папки 01–08 содержат запросы для всех пяти OpenAPI operations и всех deterministic API test functions, включая 15 POST и 15 PUT validation mutations, границы age, empty name, auth, body shape, media type, rename, конфликты, encoding и environment isolation. Unit tests тестовой инфраструктуры не являются отдельными API operations. Источник каждого case указан в Description; в библиотеке также есть вспомогательные GET/DELETE для ручной диагностики и cleanup.

Папка 09 содержит дополнительные no body / JSON null / malformed JSON запросы. JSON null имеется в unit-тесте клиента на MockTransport; это не доказательство отдельного E2E-покрытия сервера. Сгенерированные Schemathesis inputs не перечисляются как конечный полный набор.

## Проверка пакета

Проверено: официальная JSON Schema Postman v2.1; все 5 операций и объявленные статусы; ссылки на 22 deterministic API test functions и все их parameter ids; переменные dev/prod; кодирование email; эквивалентность 107 команд cURL и запросов коллекции по method, URL, headers и body. Живой импорт в интерфейс Postman и ответы challenge API не проверялись.
