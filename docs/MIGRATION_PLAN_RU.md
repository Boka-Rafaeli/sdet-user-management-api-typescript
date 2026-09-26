**План переноса SDET API project на TypeScript**

Дата анализа: 25 сентября 2026 года. Это план реализации отдельного репозитория. Исходный Python-проект при подготовке плана не изменялся; приложение и тесты не запускались.

Обновление от 26 сентября 2026 года: усиление unit-тестов и интеграционных проверок тестовой инфраструктуры включено в обязательный объём реализации по запросу пользователя.

**Вывод и границы задачи**

Перенос реализуем. Рекомендованный язык — TypeScript: строгие типы полезны для конфигурации, HTTP-ответов, результатов проверок и генерации сценариев. JavaScript тоже подходит, но потребует больше проверок этих соглашений вручную.

В `submission/` находится тестовая инфраструктура для внешнего User Management API, а не исходный код сервера. Новый репозиторий реализует весь функционал этой инфраструктуры на TypeScript и использует тот же внешний Docker-образ приложения. Переписывание самого API не входит в этот перенос: его исходников в рассматриваемом проекте нет.

В итоговом репозитории тесты, клиент, генератор, обработчики отчётов и исполняемые вспомогательные скрипты работают без Python и Schemathesis. OpenAPI и CI остаются YAML, зависимости и Postman — JSON, документация — Markdown. Docker остаётся способом запуска тестируемого приложения.

Наиболее трудоёмкая часть — замена Schemathesis. Можно сохранить функции и классы проверок, используемые этим проектом. Сам по себе fast-check не является готовой заменой Schemathesis: нужен слой чтения OpenAPI, построения запросов, проверок и отчётности. Идентичные случайные примеры, алгоритмы минимизации, внутреннюю структуру Schemathesis NDJSON и побайтовое совпадение HTML нельзя обещать при смене движка. Если требование подразумевает именно такую идентичность, приведённый план функционального переноса её не обеспечивает.

**Что обнаружено в исходниках**

| Область | Текущая функциональность |
|---|---|
| API | OpenAPI 3.0.3; пять операций: list, create, get, update, delete; окружения `/dev` и `/prod` |
| Детерминированные сценарии | 55 параметризованных случаев для одного окружения: CRUD — 7, authentication — 4, request body — 6, validation — 38 |
| Изоляция | 1 сценарий с одинаковым email в dev/prod одного экземпляра приложения |
| Инфраструктура | 37 unit cases: клиент, contract oracle, traces, known bugs, generated resources, scrubber, CI и документация evidence |
| Контракт | Проверка статуса, объявления операции/ответа, Content-Type, JSON/schema/format, пустого тела 204 |
| Дефекты | BUG-001…BUG-009 и отдельное наблюдение OBS-001; строгий локальный режим и точная CI-классификация известных дефектов |
| Генерация | examples, coverage, fuzzing; `--checks all`; детерминированность; один worker; лимиты 20 examples и 20 failures |
| Состояние | UUID email, environment-scoped cleanup; подготовка настоящих пользователей для generated PUT/DELETE |
| Диагностика | Независимые HTTP/contract traces; редактирование чувствительных данных |
| Отчёты | Самодостаточный HTML, JUnit, generated NDJSON, container logs и image digest |
| CI | quality job + matrix dev/prod/isolation, ручной выбор scope, independent failures, артефакты на 14 дней |
| Защита evidence | Проверка и очистка NDJSON до upload, запрет публикации непроверенных данных, SHA-pinned Actions, read-only permissions |
| Ручная работа | Postman collection, environments, request index и cURL-примеры из `interview-prep/postman/` |

Числа сценариев получены статическим анализом, включая параметризацию. Исторический результат из `submission/README.md`: dev — 35 PASS / 20 XFAIL; prod — 38 PASS / 17 XFAIL; isolation — 1 PASS. Это не результаты нового запуска и не гарантия поведения текущего тега `latest`.

**Предлагаемый стек**

| Назначение | Решение |
|---|---|
| Runtime | Поддерживаемый Node.js LTS; конкретную версию зафиксировать при реализации |
| Язык | TypeScript со strict type checking |
| Runner, fixtures, assertions | Playwright Test в режиме API-тестов |
| HTTP | Тонкий клиент с внедряемым transport; базовый кандидат — Playwright APIRequestContext |
| OpenAPI | YAML parser + Ajv; совместимость форматов проверяется отдельно |
| Генерация | fast-check + небольшой OpenAPI-aware слой для текущего контракта |
| Отчётность | JUnit и переносимый single-file HTML; явная классификация XFAIL; versioned NDJSON |
| Quality | Type checking, ESLint, Prettier, unit tests, test collection |
| Установка | Зафиксированные зависимости, package-lock.json, npm ci |
| Автоматизация | GitHub Actions, прежняя логика Docker/окружений/artifacts |

Playwright поддерживает HTTP API testing без открытия страницы: [официальная документация](https://playwright.dev/docs/api-testing). Его стандартные репортёры и расширение отчётности описаны [здесь](https://playwright.dev/docs/test-reporters). Переносимый single-file HTML и строгую XFAIL-семантику необходимо реализовать и проверить явно, а не считать свойствами стандартного репортёра.

Основы генерации fast-check описаны в [документации arbitraries](https://fast-check.dev/docs/core-blocks/arbitraries/), форматы Ajv — в [документации formats](https://ajv.js.org/guide/formats.html). Версии зависимостей и совместимость будут проверены перед фиксацией lockfile.

**Правила сохранения поведения**

1. Сохранить все исходные сценарии и параметры. Создать таблицу `исходный test ID → TypeScript test ID → проверяемая функция → результат сравнения`. Одного совпадения общего числа тестов недостаточно.
2. Сохранить контракт без усиления: не добавлять `minLength`, запрет дополнительных полей, приведение типов или автоматические значения по умолчанию. Отдельно сравнить `format: email` с текущим Python FormatChecker; если Ajv строже, использовать явно описанный адаптер совместимости.
3. Сохранить HTTP-семантику: `Authentication`, отсутствие/пустое/неверное значение токена, отсутствие тела против JSON `null`, raw body и Content-Type, disabled redirects, timeout, полный percent encoding email. Не терять `/dev` или `/prod` при сборке URL.
4. Сохранить порядок contract checks: status → declared operation/response → media type/empty body → JSON → schema. Клиент возвращает ответ и не подменяет собой contract oracle.
5. Сохранить exact known-bug gate: локально нарушения FAIL; в baseline mode только совпавшая status/body/state-сигнатура становится XFAIL. Новый дефект, ошибка транспорта/подготовки, исключение в teardown детерминированного теста или исправленное поведение остаются блокирующими. Широкий `test.fail()` для всего сценария недопустим. Проверить также exit code и представление результата в отчётах.
6. Сохранить уникальность тестовых данных и cleanup после провала. Для проверки dev/prod isolation использовать один сервер с двумя prefix. Исторический fixture вызывает DELETE, но не проверяет его статус: возможное усиление контроля cleanup описать отдельно от обязательного переноса.
7. Для generated exploration составить явный список активных проверок Schemathesis 4.25.2 с `--checks all` и сопоставить каждую применимую проверку с TS-реализацией. Все пять операций, позитивные/негативные случаи, примеры, границы и неподдерживаемые методы должны оставаться видимыми в coverage matrix.
8. До generated PUT/DELETE с корректным path создавать и считывать принадлежащий запуску ресурс. Намеренно неверные path не заменять. Позитивный PUT использует email подготовленного ресурса; переименованные ключи тоже учитываются при очистке. Исходная generated cleanup выполняется best-effort: подавляет HTTP transport errors и не проверяет DELETE status. Её усиление должно быть отдельным явно описанным изменением.
9. Генерация имеет фиксированный seed, воспроизводимый replay, минимизацию контрпримеров и ограничения работы. Сохранить лимиты исходного runner с документированным учётом phases: не подменять `max-examples` обещанием ровно 20 суммарных HTTP-запросов на операцию.
10. Сохранить диагностическую ценность HTML/JUnit/NDJSON. HTML открывается отдельно без дополнительных файлов. Новый NDJSON имеет описанную схему; семантическая эквивалентность evidence не означает совместимость с потребителями внутренней схемы Schemathesis.
11. Сохранить NDJSON scrub-and-verify gate: рекурсивная очистка полей, исходных и URL-encoded секретов; UTF-8/JSON validation; отклонение symlink, выхода за корень, пустых/повреждённых записей, недоступных файлов и отсутствующих secret env; атомарная запись. В случае ошибки upload dev/prod evidence запрещён.
12. Нарушения API, найденные generated exploration, остаются информационными. Ошибки инфраструктуры и неполное выполнение блокируют CI. Generated exploration выполняется отдельным CI-шагом и выполняется после падения deterministic suite, если приложение готово. Детерминированные проверки, инфраструктура и безопасность evidence блокируют CI.

**Обязательное усиление проверок тестовой инфраструктуры**

Сохранить назначение всех 37 исходных unit cases и дополнительно закрыть следующие риски. Новые проверки добавляются вместе с соответствующим модулем, а не откладываются до завершения переноса. Для каждого пункта завести запись `риск → test ID → ожидаемый результат → коммит → evidence`; пометить, какие проверки перенесены, а какие добавлены при миграции.

| ID / приоритет | Область | Обязательные дополнительные проверки | Коммиты |
|---|---|---|---|
| U01 / высокий | NDJSON и файловые ошибки | Отклонение symlink в корне и на месте NDJSON, пустой записи и невалидного UTF-8; сбои записи/атомарной замены; исходный файл остаётся целым, временный файл удаляется, результат сообщает об ошибке. Отсутствие NDJSON и пустой файл допустимы согласно исходному поведению; пустая строка-запись отклоняется. Проверить исходные и URL/plus-encoded варианты секретов. Гарантия атомарности относится к каждому файлу отдельно. | 23 |
| U02 / высокий | HTTP-клиент | Сохранение `/dev`/`/prod`, percent encoding email, default/missing/empty/incorrect token, отсутствие тела против JSON `null`; передача настроенного timeout и запрета redirects в transport; сетевое исключение не скрывается. Проверять получившийся запрос на границе собственного клиента. | 04 |
| U03 / высокий | Конфигурация | Приоритет CLI над env, defaults, недопустимое окружение, URL, нечисловой/неположительный timeout; независимость настроек dev/prod. Подмена переменных окружения восстанавливается после каждого теста. | 03 |
| U04 / высокий | OpenAPI-адаптер | Набор контрольных значений для совместимости email с исходным валидатором; строка с числом не превращается в integer; boolean не принимается как integer; дополнительные поля и пустое имя допустимы согласно контракту; валидация не добавляет defaults и не меняет проверяемые данные. | 05 |
| U05 / высокий | Generated resources | Сбои reset/create останавливают подготовку; при корректном path и негативном PUT body негативное значение сохраняется, возможный новый email учитывается для cleanup; очистка переименованных ключей, повторный `close()` и продолжение очистки остальных ресурсов после сетевой ошибки. Сохранить исходную best-effort семантику generated cleanup. | 21 |
| U06 / высокий | Собственный генератор | На небольших контрольных OpenAPI-схемах проверить discovery операций, examples, границы, required fields и позитивные/негативные категории. Негативный пример действительно нарушает целевое ограничение; подготовка ресурсов не исправляет его случайно. При одинаковых seed/config/version воспроизводится последовательность входов, replay воспроизводит контрольный сбой, минимизация сохраняет его, ограничения phases/examples/failures соблюдаются. | 19–22 |

Unit-проверки используют подготовленные ответы, внедряемые transport/clock и временные файлы; настоящий challenge API для них не требуется. Проверки файловой системы можно выделить как component tests, сохранив их в быстром локальном quality-наборе. Проверяется собственная логика и настройка библиотек. Повторять весь набор тестов Ajv, Playwright или fast-check не требуется; ожидаемые результаты контрольных случаев задаются независимо от проверяемой реализации.

Следующие пункты относятся к отдельным интеграционным проверкам инфраструктуры:

| ID / приоритет | Что запускается | Что должно быть доказано | Коммиты |
|---|---|---|---|
| I01 / высокий | Маленькая управляемая suite через настоящий test runner | Strict/baseline mode и affected environment дают правильные результаты. Только exact signature становится XFAIL; changed/fixed behavior, async/setup/transport errors и исключение в teardown детерминированного теста блокируют запуск. Проверить согласованность результата runner, process exit code, HTML и JUnit. Тесты чистой функции классификации остаются отдельными. | 08–09 |
| I02 / высокий | Контролируемые CI-запуски с намеренными сбоями | После deterministic failure и успешной readiness выполняется generated exploration, а job сохраняет блокирующий статус. При scrub failure dev/prod artifact upload не выполняется. Найденные нарушения API информационны; ошибка генератора, неподдержанная схема или неполное выполнение блокируют job. Cleanup выполняется при ошибках. Сохранить evidence выполнения веток, а не только проверки текста YAML. | 24 |

Критерий качества — обнаружение конкретных опасных ошибок. Количество tests и процент покрытия можно использовать для поиска пробелов, но они не заменяют эти проверки и не являются самостоятельной целью. Новое покрытие не должно незаметно менять контракт API, baseline policy или политику cleanup: изменения поведения фиксируются отдельно от добавления тестов.

**Пошаговая история нового репозитория — ориентировочно 26 коммитов**

Каждая строка — самостоятельный функциональный коммит. Реализация модуля и необходимые проверки включаются в один коммит. При существенном увеличении объёма пункт делится на дополнительные смысловые коммиты.

| № | Сообщение коммита | Результат и проверка |
|---|---|---|
| 01 | `docs(plan): define migration scope and parity matrix` | Исходный OpenAPI, inventory тестов, полный каталог применимых `--checks all` и оценка их замены, границы переноса и критерии приёмки |
| 02 | `chore(tooling): bootstrap strict TypeScript workspace` | Node/TS, Playwright, ESLint/Prettier, lockfile, npm commands, базовый quality workflow; чистая установка и typecheck |
| 03 | `feat(config): add environment settings and CLI options` | BASE_URL, TEST_ENV, AUTH_TOKEN, timeout, flags и CLI precedence; полный набор U03 |
| 04 | `feat(client): implement user API transport` | Пять методов API, raw requests, token/body sentinels, encoding, timeout и redirects; проверки через подменный transport, включая U02 |
| 05 | `feat(contract): validate responses against OpenAPI` | Локальные refs, status/content/schema/format/204; проверки ошибочных ответов и совместимости адаптера U04 |
| 06 | `feat(runtime): add Docker lifecycle and readiness commands` | TS-команды запуска/остановки своего контейнера, bounded readiness и запись image digest; smoke readiness |
| 07 | `feat(fixtures): add owned test data and cleanup` | Factories UUID, dev/prod clients, управление ресурсами; проверка cleanup при успехе и ошибке |
| 08 | `feat(baseline): classify exact known-defect signatures` | Асинхронный strict/baseline gate, баг/environment metadata; unit cases и начало I01 через настоящий runner с проверкой exit code |
| 09 | `feat(reports): add JUnit and standalone HTML output` | Переносимый HTML, JUnit, PASS/FAIL/XFAIL; завершение I01 с проверкой отчётов на управляемых сбоях |
| 10 | `test(crud): cover create read list delete and conflicts` | CRUD без PUT, missing users, duplicate email, удаление и проверка состояния |
| 11 | `test(update): verify persistence and email changes` | PUT same-key/rename/conflict/not-found; read-after-write и точные defect signatures |
| 12 | `test(validation): cover POST schema boundaries` | POST missing/null/wrong-type fields, возраст и email, пустое имя согласно контракту |
| 13 | `test(validation): cover PUT schema boundaries` | Аналогичная PUT matrix с исходным состоянием и соответствующими baseline-проверками |
| 14 | `test(protocol): cover raw bodies and encoded email paths` | E2E array/string bodies, unsupported media type, `%2B`/`%25`; JSON null сохраняется как исходная unit-проверка клиента из шага 04 |
| 15 | `test(auth): verify DELETE authorization behavior` | Missing/empty/incorrect token, public reads и dev-only bypass; проверка состояния после запроса |
| 16 | `test(isolation): verify dev and prod independence` | Одинаковый email в двух окружениях, изменение/удаление в dev и проверка prod |
| 17 | `feat(trace): add redacted HTTP diagnostics` | Opt-in requests/responses, исключение заголовков, рекурсивное скрытие секретов и тишина по умолчанию |
| 18 | `feat(trace): explain OpenAPI contract decisions` | Независимый contract trace с PASS/FAIL по этапам; сопоставление с HTTP exchange |
| 19 | `feat(generation): derive examples and coverage from OpenAPI` | Discovery операций, examples, границы, negative inputs, unsupported methods и явный каталог проверок; контрольные схемы U06 |
| 20 | `feat(generation): add seeded fuzzing and replay` | fast-check, seed, shrinking/replay, один worker; проверки воспроизводимости и ограничений U06 |
| 21 | `feat(generation): provision users for stateful operations` | Reset/create/read seed users, valid-path injection, positive PUT email, cleanup; ошибочные ветви U05 и сохранение негативных случаев U06 |
| 22 | `feat(generation): emit bounded run evidence` | TS CLI собирает phases/checks/resources; JUnit/NDJSON, counters, failure bounds; завершение U06 и проверка интеграции generated-компонентов |
| 23 | `feat(security): scrub and verify generated evidence` | Полный NDJSON scrubber с fail-closed проверками и атомарной записью; adversarial fixtures с секретами и файловые сбои U01 |
| 24 | `ci(api): run isolated scopes and protect artifacts` | quality + dev/prod/isolation, manual scope, immutable Action pins, credentials scope, logs/digest/upload/cleanup; статические workflow guards и реальные проверки веток I02 |
| 25 | `docs(usage): document workflows and migrate manual requests` | README, BUGS, SECURITY, TEST_STRATEGY, debug setup, Postman/cURL assets, sample reports с происхождением |
| 26 | `test(parity): verify the completed TypeScript migration` | Заполненная scenario/check matrix, evidence выполнения U01–U06 и I01–I02, сравнение на одном image digest и итоговая проверка чистой установки |

Порядок зависимостей внутри этапов сохраняется. Generated-компоненты 19–21 сначала проверяются изолированно; полноценный generated CLI появляется после их интеграции в 22. API CI появляется после защиты evidence. Базовый quality workflow работает с начала проекта.

**Как сделать историю полезной для пошагового изучения**

- Репозиторий создаётся отдельно с новой историей; рабочее имя — `sdet-user-management-api-typescript`. GitHub owner, окончательное название, публичность и локальная папка определяются перед созданием.
- Коммиты создаются по мере реализации, с настоящими датами и конкретными diff. Не собирать весь проект одним коммитом и не делить готовый результат задним числом искусственно.
- Формат заголовка — `type(scope): конкретная возможность`, как в таблице. Body кратко объясняет назначение, перенесённые сценарии и выполненную проверку.
- Каждый коммит компилируется и проходит доступные ему quality/unit checks. После появления соответствующих API-сценариев проверяется baseline mode; известные дефекты в strict mode остаются ожидаемо видимыми FAIL, а не маскируются ради зелёного запуска.
- Добавить `docs/IMPLEMENTATION_STEPS.md`: шаг, функция, команда запуска, итоговый commit SHA. Так можно переходить к каждому состоянию проекта через Git history. Индекс предыдущих шагов можно обновлять последующими коммитами, избегая самоссылки на ещё не созданный SHA.
- Сохранить подробную историю при публикации и интеграции ветки; не выполнять squash. Для release использовать финальное проверенное состояние.
- Здесь «подписать коммит функциональностью» означает понятный commit message. Криптографическая GPG/SSH-подпись — отдельная настройка, если она требуется пользователю.

**Приёмка: что должно быть доказано**

1. На чистой среде Node + Docker новый репозиторий устанавливается через `npm ci` и запускает все команды без Python.
2. Typecheck, lint, formatting, unit/component tests и collection проходят. Сохраняется назначение всех 37 исходных unit cases; обязательное усиление U01–U06 реализовано и связано с test IDs, коммитами и evidence. Число тестов не используется вместо проверки полноты этой матрицы.
3. Все 55 исходных параметризованных E2E cases имеют TS-эквивалент и проверены для dev и prod; isolation проверен отдельно. Не теряются assertions состояния ради одинаковых счётчиков.
4. Для сравнения Python и TS используются раздельные чистые контейнеры одного зафиксированного image digest. Python нужен только для запуска исходного эталона во время миграции, а не новому репозиторию. Изменение поведения `latest` фиксируется как изменение приложения, не подгоняется под исторические числа.
5. Все девять багов и их точные baseline-условия представлены в новой suite. Интеграционные проверки I01 через настоящий runner доказывают правильные результаты strict/baseline mode, обработки окружений, ошибок setup/transport/async/teardown и исправленного поведения; exit code согласован с HTML/JUnit.
6. Generated parity matrix заполнена для всех применимых checks исходной версии Schemathesis и всех используемых phases. Replay воспроизводит ошибку; PUT/DELETE достигают существующего ресурса; invalid paths сохраняются. Точные случайные inputs и общее число generated requests не являются требованием равенства.
7. HTML переносим, JUnit читаем, NDJSON валиден и очищен, в evidence есть logs/image digest. Контрольные секреты отсутствуют после scrub; повреждённый файл блокирует upload.
8. GitHub Actions проверен реальным запуском во всех трёх scope; I02 подтверждён evidence контролируемых CI-запусков с провалами deterministic suite, generated exploration и scrubber. Статические проверки YAML дополняют эти запуски.
9. Documentation и sample reports относятся к TypeScript-запускам, содержат происхождение evidence и корректные ссылки. Ручные Postman/cURL-возможности сохранены. Старые учебные заметки обновлены либо ясно обозначены как исторический материал Python-проекта.
10. В новом GitHub-репозитории доступна вся история функциональных коммитов и индекс этапов. Исходный проект сохранён.

**Что требует проверки в начале реализации**

Самая существенная неопределённость — полный каталог применимых `--checks all` из зафиксированной Schemathesis 4.25.2 и корректность замены генератора. Его нужно исследовать первым и закрыть в parity matrix; одной библиотеки fast-check для заявления о полном переносе недостаточно.

Вторая — интеграция exact XFAIL с runner, teardown, reporters и exit codes. Она получает ранний самостоятельный коммит и controlled failure cases до массового переноса API-тестов.

Третья — различия Python FormatChecker и Ajv, raw HTTP semantics и переносимый HTML. Это проверяемые особенности реализации; они включены в отдельные критерии приёмки.

Этот план не расширяет задачу до переписывания сервера, UI, нагрузочного тестирования или исчерпывающей проверки всех возможных входных данных. Согласованное усиление тестовой инфраструктуры U01–U06 и I01–I02 входит в сам перенос. Другие новые возможности можно добавлять после подтверждённого переноса.


**Дополнения при начале реализации**

- После отклонённых PUT/POST и конфликтов проверять состояние принадлежащих тесту записей вне known-bug gate; новые проверки отмечать как усиление.
- Различать completed-with-findings и infrastructure-error/incomplete у генератора; только первое допускается как информационный результат.
- Для каждого detector проверять корректный и намеренно нарушенный ответ; неизвестные OpenAPI-конструкции отклонять явно.
- Parity/baseline: один worker, без retries; сверять ожидаемые и фактически выполненные test IDs, блокировать неожиданный skip/only/пустой запуск.
- Редактировать секреты до вывода в stdout/stderr, ошибки, HTML/JUnit/NDJSON и container logs; проверять escaping HTML/XML.
- Владеть контейнером по ID; обработать неудачный старт и SIGINT/SIGTERM, удалять только свои ресурсы; описать восстановление после SIGKILL.
- Проверять каждый функциональный коммит из чистого checkout с собственными зависимостями. После каждого этапа запускать весь уже реализованный набор; финально — полный набор и чистый clone.
