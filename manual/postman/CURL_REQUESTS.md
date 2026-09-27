# cURL: отдельные запросы для Postman

Команды ниже готовы для терминала или импорта в Postman: все переменные уже заменены значениями local dev. Для prod замените сегмент `/dev/` на `/prod/`; папка 08 использует оба prefix намеренно. В каждом сценарии соблюдайте предусловия из описания папки. Команды независимы синтаксически, но GET/PUT/DELETE существующей записи требуют предварительного POST. Для повторных POST меняйте email в body и соответствующих URL или очищайте только свой fixture.

Базовый адрес: `http://127.0.0.1:3000`. Challenge API должен быть запущен с опубликованным портом 3000. При нестандартной конфигурации измените адрес и токен. Значение `mysecrettoken` взято из Settings.

## 01 — Пять операций и CRUD

Начните здесь. Выполняйте сверху вниз. Для повторения цикла освободите email или задайте новый. После PUT проверяйте GET; после DELETE проверяйте отсутствие email в списке.

### 01 Список пользователей [expected 200]

Ожидаемый статус: 200. Ожидается JSON-массив User.

Источник: tests/test_crud.py::test_list_users_matches_contract

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json'
```

### 02 Создать пользователя [expected 201]

Ожидаемый статус: 201. Предусловие: значение email ещё не занято в выбранном prefix. Повторный POST того же email — отдельный duplicate-сценарий.

Источник: tests/test_crud.py::test_create_get_and_list_user

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.postman.dev@example.com",
  "age": 42
}'
```

### 03 Получить пользователя по email [expected 200]

Ожидаемый статус: 200. Сравните все поля с отправленными при POST.

Источник: tests/test_crud.py::test_create_get_and_list_user

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users/boka.postman.dev%40example.com \
  --header 'Accept: application/json'
```

### 04 Обновить name и age [expected 200]

Ожидаемый статус: 200.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-002: PUT возвращает 200 и echo, но последующий GET возвращает старые значения.

Источник: tests/test_crud.py::test_update_persists_changes

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.postman.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "Updated Candidate",
  "email": "boka.postman.dev@example.com",
  "age": 43
}'
```

### 05 GET после PUT — проверить сохранение [expected 200]

Ожидаемый статус: 200. Ожидаем name=Updated Candidate, age=43 и прежний email. Валидная схема сама не доказывает совпадение значений.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-002: PUT возвращает 200 и echo, но последующий GET возвращает старые значения.

Источник: tests/test_crud.py::test_update_persists_changes

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users/boka.postman.dev%40example.com \
  --header 'Accept: application/json'
```

### 06 Удалить пользователя [expected 204]

Ожидаемый статус: 204. Для существующего fixture: 204 и полностью пустое тело. Если fixture уже отсутствует: 404. Удаляйте только созданные вами данные.

Источник: tests/test_crud.py::test_delete_user_returns_no_content_and_removes_record

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.postman.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

### 07 Список после DELETE — проверить отсутствие email [expected 200]

Ожидаемый статус: 200. В массиве не должно быть записи с email. GET отсутствующего пользователя имеет BUG-004, поэтому для проверки удаления используем список.

Источник: tests/test_crud.py::test_delete_user_returns_no_content_and_removes_record

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json'
```

## 02 — Конфликты, missing user, смена email

Для duplicate и rename сначала создайте email запросом POST из папки 01. Для PUT conflict также создайте second_email. Rename выполняйте как отдельный сценарий; renamed_email должен быть свободен. missing_email не создавайте.

### Повторный POST того же email [expected 409]

Ожидаемый статус: 409.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-003: 500 с {"error":"Internal server error"} вместо 409.

Источник: tests/test_crud.py::test_duplicate_email_returns_conflict

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.postman.dev@example.com",
  "age": 42
}'
```

### GET отсутствующего пользователя [expected 404]

Ожидаемый статус: 404.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-004: вместо 404 возвращается 500 с {"error":"Internal server error"}.

Источник: tests/test_crud.py::test_get_unknown_user_returns_not_found

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users/boka.missing.dev%40example.com \
  --header 'Accept: application/json'
```

### PUT отсутствующего пользователя [expected 404]

Ожидаемый статус: 404.

Источник: tests/test_validation.py::test_update_unknown_user_returns_not_found

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.missing.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.missing.dev@example.com",
  "age": 42
}'
```

### DELETE отсутствующего пользователя [expected 404]

Ожидаемый статус: 404. missing_email должен отсутствовать; токен валидный.

Источник: tests/test_authentication.py::test_delete_unknown_user_with_valid_token_returns_not_found

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.missing.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

### Создать второго пользователя для конфликта [expected 201]

Ожидаемый статус: 201. Предусловие: значение second_email ещё не занято в выбранном prefix. Повторный POST того же email — отдельный duplicate-сценарий.

Источник: tests/test_validation.py::test_update_to_duplicate_email_returns_conflict

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "Second User",
  "email": "boka.second.dev@example.com",
  "age": 42
}'
```

### PUT — заменить email на занятый second_email [expected 409]

Ожидаемый статус: 409.

Источник: tests/test_validation.py::test_update_to_duplicate_email_returns_conflict

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.postman.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "Changed User",
  "email": "boka.second.dev@example.com",
  "age": 42
}'
```

### PUT — заменить email на свободный renamed_email [expected 200]

Ожидаемый статус: 200.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-002: PUT возвращает 200 и echo, но последующий GET возвращает старые значения.

Источник: tests/test_crud.py::test_update_persists_email_change

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.postman.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "Renamed Candidate",
  "email": "boka.renamed.dev@example.com",
  "age": 43
}'
```

### GET по новому email после rename [expected 200]

Ожидаемый статус: 200. Ожидаем переименованного пользователя.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-002 + BUG-004: новая запись отсутствует, GET обычно возвращает 500.

Источник: tests/test_crud.py::test_update_persists_email_change

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users/boka.renamed.dev%40example.com \
  --header 'Accept: application/json'
```

### GET по старому email после rename [expected 404]

Ожидаемый статус: 404. После корректного rename старый ключ отсутствует.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-002: возвращается 200 с исходным пользователем.

Источник: tests/test_crud.py::test_update_persists_email_change

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users/boka.postman.dev%40example.com \
  --header 'Accept: application/json'
```

### Список после rename — сверить старый и новый email [expected 200]

Ожидаемый статус: 200. Ожидаем отсутствие старого ключа и наличие нового с обновлёнными значениями.

Источник: tests/test_crud.py::test_update_persists_email_change

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json'
```

### Cleanup second_email [expected 204]

Ожидаемый статус: 204. Для существующего fixture: 204 и полностью пустое тело. Если fixture уже отсутствует: 404. Удаляйте только созданные вами данные.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.second.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

### Cleanup renamed_email [expected 204]

Ожидаемый статус: 204. Для существующего fixture: 204 и полностью пустое тело. Если fixture уже отсутствует: 404. Удаляйте только созданные вами данные.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.renamed.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

### Cleanup исходного email [expected 204]

Ожидаемый статус: 204. Для существующего fixture: 204 и полностью пустое тело. Если fixture уже отсутствует: 404. Удаляйте только созданные вами данные.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.postman.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

## 03 — DELETE authentication

Перед КАЖДЫМ негативным DELETE создайте auth_email, если его нет. В dev BUG-001 действительно удаляет fixture, поэтому последовательное отправление трёх DELETE без повторного POST исказит сценарий. После запроса проверьте GET и список.

### 00 Создать fixture перед auth-case [expected 201]

Ожидаемый статус: 201. Предусловие: значение auth_email ещё не занято в выбранном prefix. Повторный POST того же email — отдельный duplicate-сценарий.

Источник: tests/test_authentication.py::test_delete_rejects_missing_or_invalid_authentication

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.auth.dev@example.com",
  "age": 42
}'
```

### Без заголовка Authentication [expected 401]

Ожидаемый статус: 401. Ожидаем ErrorResponse и сохранение исходного пользователя. В запросе явно выбран No Auth, чтобы не наследовать авторизацию коллекции.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-001 только в dev: 204 и удаление пользователя. В prod: 401 и пользователь сохраняется.

Источник: tests/test_authentication.py::test_delete_rejects_missing_or_invalid_authentication[missing-header]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.auth.dev%40example.com \
  --header 'Accept: application/json'
```

### Пустой Authentication [expected 401]

Ожидаемый статус: 401. Ожидаем ErrorResponse и сохранение исходного пользователя. В запросе явно выбран No Auth, чтобы не наследовать авторизацию коллекции.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-001 только в dev: 204 и удаление пользователя. В prod: 401 и пользователь сохраняется.

Источник: tests/test_authentication.py::test_delete_rejects_missing_or_invalid_authentication[empty-token]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.auth.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication;'
```

### Неверный Authentication [expected 401]

Ожидаемый статус: 401. Ожидаем ErrorResponse и сохранение исходного пользователя. В запросе явно выбран No Auth, чтобы не наследовать авторизацию коллекции.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-001 только в dev: 204 и удаление пользователя. В prod: 401 и пользователь сохраняется.

Источник: tests/test_authentication.py::test_delete_rejects_missing_or_invalid_authentication[invalid-token]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.auth.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: wrong-token'
```

### GET после отказа — пользователь должен сохраниться [expected 200]

Ожидаемый статус: 200. Сравните поля с исходным POST.

Известное поведение по BUGS.md (не повторно проверено сейчас): При BUG-001 в dev пользователь удалён; из-за BUG-004 GET может вернуть 500.

Источник: tests/test_authentication.py::test_delete_rejects_missing_or_invalid_authentication

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users/boka.auth.dev%40example.com \
  --header 'Accept: application/json'
```

### Список после auth-case — проверить наличие email [expected 200]

Ожидаемый статус: 200. После корректного 401 auth_email должен остаться в списке.

Источник: tests/test_authentication.py::test_delete_rejects_missing_or_invalid_authentication

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json'
```

### Cleanup auth fixture с валидным токеном [expected 204]

Ожидаемый статус: 204. Для существующего fixture: 204 и полностью пустое тело. Если fixture уже отсутствует: 404. Удаляйте только созданные вами данные.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.auth.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

## 04 — POST: schema validation

Каждый case выполняйте отдельно. candidate_email должен быть свободен перед POST. Ошибочно принятый POST может создать запись: прочитайте и удалите только свой fixture перед следующим case. Для email=42 и not-an-email предусмотрены отдельные GET/DELETE внизу.

### missing-name [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_create_rejects_payloads_outside_openapi_schema[missing-name]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "email": "boka.candidate.dev@example.com",
  "age": 42
}'
```

### missing-email [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_create_rejects_payloads_outside_openapi_schema[missing-email]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "age": 42
}'
```

### missing-age [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_create_rejects_payloads_outside_openapi_schema[missing-age]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.candidate.dev@example.com"
}'
```

### null-name [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_create_rejects_payloads_outside_openapi_schema[null-name]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": null,
  "email": "boka.candidate.dev@example.com",
  "age": 42
}'
```

### null-email [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_create_rejects_payloads_outside_openapi_schema[null-email]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": null,
  "age": 42
}'
```

### null-age [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_create_rejects_payloads_outside_openapi_schema[null-age]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.candidate.dev@example.com",
  "age": null
}'
```

### name-integer [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-006: 201 и echo. Последующий GET возвращает числовое поле name/email как строку "42".

Источник: tests/test_validation.py::test_create_rejects_payloads_outside_openapi_schema[name-integer]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": 42,
  "email": "boka.candidate.dev@example.com",
  "age": 42
}'
```

### email-integer [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-006: 201 и echo. Последующий GET возвращает числовое поле name/email как строку "42".

Источник: tests/test_validation.py::test_create_rejects_payloads_outside_openapi_schema[email-integer]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": 42,
  "age": 42
}'
```

### invalid-email [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-005: 201, запись с ключом not-an-email сохраняется.

Источник: tests/test_validation.py::test_create_rejects_payloads_outside_openapi_schema[invalid-email]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "not-an-email",
  "age": 42
}'
```

### age-below-minimum [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_create_rejects_payloads_outside_openapi_schema[age-below-minimum]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.candidate.dev@example.com",
  "age": 0
}'
```

### age-above-maximum [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_create_rejects_payloads_outside_openapi_schema[age-above-maximum]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.candidate.dev@example.com",
  "age": 151
}'
```

### age-string [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_create_rejects_payloads_outside_openapi_schema[age-string]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.candidate.dev@example.com",
  "age": "42"
}'
```

### age-boolean [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_create_rejects_payloads_outside_openapi_schema[age-boolean]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.candidate.dev@example.com",
  "age": true
}'
```

### age-float [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_create_rejects_payloads_outside_openapi_schema[age-float]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.candidate.dev@example.com",
  "age": 42.5
}'
```

### age-object [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_create_rejects_payloads_outside_openapi_schema[age-object]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.candidate.dev@example.com",
  "age": {
    "value": 42
  }
}'
```

### age=1 — допустимая граница [expected 201]

Ожидаемый статус: 201. Перед каждой границей используйте свободный candidate_email.

Источник: tests/test_validation.py::test_create_accepts_documented_age_boundaries[minimum]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.candidate.dev@example.com",
  "age": 1
}'
```

### age=150 — допустимая граница [expected 201]

Ожидаемый статус: 201. Перед каждой границей используйте свободный candidate_email.

Источник: tests/test_validation.py::test_create_accepts_documented_age_boundaries[maximum]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.candidate.dev@example.com",
  "age": 150
}'
```

### name="" — допустимо по текущему контракту [expected 201]

Ожидаемый статус: 201.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-009: 400 с {"error":"name is required"}. В схеме отсутствует minLength.

Источник: tests/test_validation.py::test_create_accepts_empty_name_allowed_by_contract

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "",
  "email": "boka.candidate.dev@example.com",
  "age": 42
}'
```

### Прочитать fixture, если он существует [expected 200]

Ожидаемый статус: 200. Если POST отклонён и запись не создана: по контракту 404; BUG-004 может дать 500. Если запись существует: сравните все поля.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users/boka.candidate.dev%40example.com \
  --header 'Accept: application/json'
```

### Cleanup fixture [expected 204]

Ожидаемый статус: 204. Для существующего fixture: 204 и полностью пустое тело. Если fixture уже отсутствует: 404. Удаляйте только созданные вами данные.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.candidate.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

### GET записи с ключом 42 [expected 200]

Ожидаемый статус: 200. Только после собственного ошибочно принятого POST с этим ключом. Такой ответ может нарушать схему User.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users/42 \
  --header 'Accept: application/json'
```

### Cleanup собственного ключа 42 [expected 204]

Ожидаемый статус: 204. Выполняйте только если именно вы создали эту запись. Если записи нет: 404.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/42 \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

### GET записи с ключом not-an-email [expected 200]

Ожидаемый статус: 200. Только после собственного ошибочно принятого POST с этим ключом. Такой ответ может нарушать схему User.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users/not-an-email \
  --header 'Accept: application/json'
```

### Cleanup собственного ключа not-an-email [expected 204]

Ожидаемый статус: 204. Выполняйте только если именно вы создали эту запись. Если записи нет: 404.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/not-an-email \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

## 05 — PUT: schema validation

Перед case создайте validation_email. При повторении сначала прочитайте/удалите свой fixture, затем создайте заново. PUT использует существующий email в URL; mutation изменяет только тело запроса.

### 00 Создать fixture перед PUT validation [expected 201]

Ожидаемый статус: 201. Предусловие: значение validation_email ещё не занято в выбранном prefix. Повторный POST того же email — отдельный duplicate-сценарий.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.validation.dev@example.com",
  "age": 42
}'
```

### missing-name [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_update_rejects_payloads_outside_openapi_schema[missing-name]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "email": "boka.validation.dev@example.com",
  "age": 42
}'
```

### missing-email [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_update_rejects_payloads_outside_openapi_schema[missing-email]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "age": 42
}'
```

### missing-age [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_update_rejects_payloads_outside_openapi_schema[missing-age]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.validation.dev@example.com"
}'
```

### null-name [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_update_rejects_payloads_outside_openapi_schema[null-name]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": null,
  "email": "boka.validation.dev@example.com",
  "age": 42
}'
```

### null-email [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_update_rejects_payloads_outside_openapi_schema[null-email]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": null,
  "age": 42
}'
```

### null-age [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_update_rejects_payloads_outside_openapi_schema[null-age]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.validation.dev@example.com",
  "age": null
}'
```

### name-integer [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-006: 200 и echo с name=42.

Источник: tests/test_validation.py::test_update_rejects_payloads_outside_openapi_schema[name-integer]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": 42,
  "email": "boka.validation.dev@example.com",
  "age": 42
}'
```

### email-integer [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-006: 500 с {"error":"Internal server error"}.

Источник: tests/test_validation.py::test_update_rejects_payloads_outside_openapi_schema[email-integer]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": 42,
  "age": 42
}'
```

### invalid-email [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_update_rejects_payloads_outside_openapi_schema[invalid-email]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "not-an-email",
  "age": 42
}'
```

### age-below-minimum [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_update_rejects_payloads_outside_openapi_schema[age-below-minimum]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.validation.dev@example.com",
  "age": 0
}'
```

### age-above-maximum [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_update_rejects_payloads_outside_openapi_schema[age-above-maximum]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.validation.dev@example.com",
  "age": 151
}'
```

### age-string [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_update_rejects_payloads_outside_openapi_schema[age-string]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.validation.dev@example.com",
  "age": "42"
}'
```

### age-boolean [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_update_rejects_payloads_outside_openapi_schema[age-boolean]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.validation.dev@example.com",
  "age": true
}'
```

### age-float [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_update_rejects_payloads_outside_openapi_schema[age-float]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.validation.dev@example.com",
  "age": 42.5
}'
```

### age-object [expected 400]

Ожидаемый статус: 400. Ожидается JSON ErrorResponse. Для диагностики побочных эффектов используйте GET/список после запроса.

Источник: tests/test_validation.py::test_update_rejects_payloads_outside_openapi_schema[age-object]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.validation.dev@example.com",
  "age": {
    "value": 42
  }
}'
```

### name="" — допустимо по текущему контракту [expected 200]

Ожидаемый статус: 200.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-009: 400 с {"error":"name is required"}. В схеме отсутствует minLength.

Источник: tests/test_validation.py::test_update_accepts_empty_name_allowed_by_contract

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "",
  "email": "boka.validation.dev@example.com",
  "age": 43
}'
```

### Прочитать fixture, если он существует [expected 200]

Ожидаемый статус: 200. Если POST отклонён и запись не создана: по контракту 404; BUG-004 может дать 500. Если запись существует: сравните все поля.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json'
```

### Cleanup fixture [expected 204]

Ожидаемый статус: 204. Для существующего fixture: 204 и полностью пустое тело. Если fixture уже отсутствует: 404. Удаляйте только созданные вами данные.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.validation.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

## 06 — Non-object JSON и Content-Type

POST array/string не требует fixture. Для PUT сначала создайте body_email. Перед POST text/plain media_email должен быть свободен. PUT выполняйте на свежем fixture; затем сравните GET с исходными полями.

### 00 Создать fixture для PUT body cases [expected 201]

Ожидаемый статус: 201. Предусловие: значение body_email ещё не занято в выбранном prefix. Повторный POST того же email — отдельный duplicate-сценарий.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.body.dev@example.com",
  "age": 42
}'
```

### POST: JSON array [expected 400]

Ожидаемый статус: 400.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-007: 500 с {"error":"Internal server error"}. При PUT исходная запись остаётся без изменений.

Источник: tests/test_request_body.py::test_create_rejects_non_object_json_body[array]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '[]'
```

### POST: JSON string [expected 400]

Ожидаемый статус: 400.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-007: 500 с {"error":"Internal server error"}. При PUT исходная запись остаётся без изменений.

Источник: tests/test_request_body.py::test_create_rejects_non_object_json_body[string]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '"text"'
```

### POST: JSON-текст с Content-Type text/plain [expected 400]

Ожидаемый статус: 400. В текущих tests ожидается 400. Ответ 415 пока не объявлен в OpenAPI.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-008: POST возвращает 201 и сохраняет запись.

Источник: tests/test_request_body.py::test_create_rejects_unsupported_request_media_type

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: text/plain' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.media.dev@example.com",
  "age": 42
}'
```

### PUT: JSON array [expected 400]

Ожидаемый статус: 400.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-007: 500 с {"error":"Internal server error"}. При PUT исходная запись остаётся без изменений.

Источник: tests/test_request_body.py::test_update_rejects_non_object_json_body[array]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.body.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '[]'
```

### PUT: JSON string [expected 400]

Ожидаемый статус: 400.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-007: 500 с {"error":"Internal server error"}. При PUT исходная запись остаётся без изменений.

Источник: tests/test_request_body.py::test_update_rejects_non_object_json_body[string]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.body.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '"text"'
```

### PUT: JSON-текст с Content-Type text/plain [expected 400]

Ожидаемый статус: 400. В текущих tests ожидается 400. Ответ 415 пока не объявлен в OpenAPI.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-008: PUT возвращает 200 и echo; из-за BUG-002 обновление не сохраняется.

Источник: tests/test_request_body.py::test_update_rejects_unsupported_request_media_type

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.body.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: text/plain' \
  --data-raw '{
  "name": "Wrong Media Type",
  "email": "boka.body.dev@example.com",
  "age": 43
}'
```

### GET после PUT — проверить исходное состояние [expected 200]

Ожидаемый статус: 200. После отклонённого PUT исходная запись должна остаться без изменений.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users/boka.body.dev%40example.com \
  --header 'Accept: application/json'
```

### GET после POST text/plain — диагностировать создание [expected 200]

Ожидаемый статус: 200. Корректный отказ POST не должен создавать запись (GET: 404). Этот диагностический запрос ожидает 200 только при воспроизведении BUG-008.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-008: созданная запись читается с 200.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users/boka.media.dev%40example.com \
  --header 'Accept: application/json'
```

### Cleanup PUT fixture [expected 204]

Ожидаемый статус: 204. Для существующего fixture: 204 и полностью пустое тело. Если fixture уже отсутствует: 404. Удаляйте только созданные вами данные.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.body.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

### Cleanup ошибочно созданного POST fixture [expected 204]

Ожидаемый статус: 204. Для существующего fixture: 204 и полностью пустое тело. Если fixture уже отсутствует: 404. Удаляйте только созданные вами данные.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.media.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

## 07 — URL encoding: плюс и процент

В JSON email передаётся обычным текстом, в URL — percent-encoded ровно один раз. Скрипт коллекции вычисляет *_path из исходных email. Выполняйте отдельный цикл POST → GET → DELETE → list для каждого email.

### plus: POST [expected 201]

Ожидаемый статус: 201. Предусловие: значение plus_email ещё не занято в выбранном prefix. Повторный POST того же email — отдельный duplicate-сценарий.

Источник: tests/test_validation.py::test_email_reserved_character_round_trips_through_encoded_path[plus]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.dev+tag@example.com",
  "age": 42
}'
```

### plus: GET [expected 200]

Ожидаемый статус: 200. В URL символ + должен быть %2B, символ % — %25. Сравните полученные поля с POST.

Источник: tests/test_validation.py::test_email_reserved_character_round_trips_through_encoded_path[plus]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users/boka.dev%2Btag%40example.com \
  --header 'Accept: application/json'
```

### plus: DELETE [expected 204]

Ожидаемый статус: 204. Для существующего fixture: 204 и полностью пустое тело. Если fixture уже отсутствует: 404. Удаляйте только созданные вами данные.

Источник: tests/test_validation.py::test_email_reserved_character_round_trips_through_encoded_path[plus]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.dev%2Btag%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

### plus: list после DELETE [expected 200]

Ожидаемый статус: 200. Записи с plus_email не должно быть в массиве.

Источник: tests/test_validation.py::test_email_reserved_character_round_trips_through_encoded_path[plus]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json'
```

### percent: POST [expected 201]

Ожидаемый статус: 201. Предусловие: значение percent_email ещё не занято в выбранном prefix. Повторный POST того же email — отдельный duplicate-сценарий.

Источник: tests/test_validation.py::test_email_reserved_character_round_trips_through_encoded_path[percent]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.dev%tag@example.com",
  "age": 42
}'
```

### percent: GET [expected 200]

Ожидаемый статус: 200. В URL символ + должен быть %2B, символ % — %25. Сравните полученные поля с POST.

Источник: tests/test_validation.py::test_email_reserved_character_round_trips_through_encoded_path[percent]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users/boka.dev%25tag%40example.com \
  --header 'Accept: application/json'
```

### percent: DELETE [expected 204]

Ожидаемый статус: 204. Для существующего fixture: 204 и полностью пустое тело. Если fixture уже отсутствует: 404. Удаляйте только созданные вами данные.

Источник: tests/test_validation.py::test_email_reserved_character_round_trips_through_encoded_path[percent]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.dev%25tag%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

### percent: list после DELETE [expected 200]

Ожидаемый статус: 200. Записи с percent_email не должно быть в массиве.

Источник: tests/test_validation.py::test_email_reserved_character_round_trips_through_encoded_path[percent]

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json'
```

## 08 — Изоляция dev и prod

Оба prefix находятся на одном base_url. Эта папка намеренно использует явные /dev и /prod и игнорирует переменную env. isolation_email одинаковый в обеих средах; сначала убедитесь, что он свободен в каждой. Выполняйте сверху вниз.

### 01 Создать в dev [expected 201]

Ожидаемый статус: 201. Предусловие: значение isolation_email ещё не занято в выбранном prefix. Повторный POST того же email — отдельный duplicate-сценарий.

Источник: tests/test_environment_isolation.py::test_dev_and_prod_data_is_independent

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "Development User",
  "email": "boka.isolation@example.com",
  "age": 31
}'
```

### 02 Создать тот же email в prod [expected 201]

Ожидаемый статус: 201. Предусловие: значение isolation_email ещё не занято в выбранном prefix. Повторный POST того же email — отдельный duplicate-сценарий.

Источник: tests/test_environment_isolation.py::test_dev_and_prod_data_is_independent

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/prod/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "Production User",
  "email": "boka.isolation@example.com",
  "age": 47
}'
```

### 03 PUT только в dev [expected 200]

Ожидаемый статус: 200.

Известное поведение по BUGS.md (не повторно проверено сейчас): BUG-002: PUT возвращает 200 и echo, но последующий GET возвращает старые значения.

Источник: tests/test_environment_isolation.py::test_dev_and_prod_data_is_independent

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.isolation%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "Updated Dev User",
  "email": "boka.isolation@example.com",
  "age": 32
}'
```

### 04 Проверить prod после dev PUT [expected 200]

Ожидаемый статус: 200. name=Production User, age=47; prod не изменился.

Источник: tests/test_environment_isolation.py::test_dev_and_prod_data_is_independent

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/prod/users/boka.isolation%40example.com \
  --header 'Accept: application/json'
```

### 05 DELETE только в dev [expected 204]

Ожидаемый статус: 204. Для существующего fixture: 204 и полностью пустое тело. Если fixture уже отсутствует: 404. Удаляйте только созданные вами данные.

Источник: tests/test_environment_isolation.py::test_dev_and_prod_data_is_independent

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.isolation%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

### 06 Список dev после DELETE [expected 200]

Ожидаемый статус: 200. isolation_email отсутствует в dev.

Источник: tests/test_environment_isolation.py::test_dev_and_prod_data_is_independent

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json'
```

### 07 Проверить prod после dev DELETE [expected 200]

Ожидаемый статус: 200. Пользователь всё ещё существует: name=Production User, age=47.

Источник: tests/test_environment_isolation.py::test_dev_and_prod_data_is_independent

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/prod/users/boka.isolation%40example.com \
  --header 'Accept: application/json'
```

### 08 Cleanup prod [expected 204]

Ожидаемый статус: 204. Для существующего fixture: 204 и полностью пустое тело. Если fixture уже отсутствует: 404. Удаляйте только созданные вами данные.

Источник: tests/test_environment_isolation.py::test_dev_and_prod_data_is_independent

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/prod/users/boka.isolation%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

### 09 Cleanup dev — если не удалён ранее [expected 204]

Ожидаемый статус: 204. Для существующего fixture: 204 и полностью пустое тело. Если fixture уже отсутствует: 404. Удаляйте только созданные вами данные.

Источник: tests/test_environment_isolation.py::test_dev_and_prod_data_is_independent

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.isolation%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```

## 09 — Дополнительно: no body, null, malformed JSON

Ручное исследование для подготовки. Это не утверждение о существующем E2E-покрытии: JSON null проверяется unit-тестом клиента с MockTransport; no body и malformed JSON не представлены отдельными deterministic API tests. Фактический ответ сервера здесь не перепроверен. Для PUT создайте raw_email.

### 00 Создать fixture для PUT [expected 201]

Ожидаемый статус: 201. Предусловие: значение raw_email ещё не занято в выбранном prefix. Повторный POST того же email — отдельный duplicate-сценарий.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "name": "SDET Candidate",
  "email": "boka.raw.dev@example.com",
  "age": 42
}'
```

### POST: No body — ноль байтов [expected 400]

Ожидаемый статус: 400. Это дополнительная ручная проверка, не отдельный deterministic API test. Ожидание: отказ с документированным validation response, поскольку requestBody обязателен и должен быть объектом по схеме. Проверяйте фактические status/body/state.

Источник: Дополнительное ручное упражнение

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json'
```

### POST: JSON null — четыре байта [expected 400]

Ожидаемый статус: 400. Это дополнительная ручная проверка, не отдельный deterministic API test. Ожидание: отказ с документированным validation response, поскольку requestBody обязателен и должен быть объектом по схеме. Проверяйте фактические status/body/state.

Источник: tests/test_client.py::test_raw_request_sends_any_json_shape[null] (unit, только POST; не проверяет поведение сервера)

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw null
```

### POST: Malformed JSON — незакрытый объект [expected 400]

Ожидаемый статус: 400. Это дополнительная ручная проверка, не отдельный deterministic API test. Ожидание: отказ с документированным validation response, поскольку requestBody обязателен и должен быть объектом по схеме. Проверяйте фактические status/body/state.

Источник: Дополнительное ручное упражнение

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/dev/users \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{"name":'
```

### PUT: No body — ноль байтов [expected 400]

Ожидаемый статус: 400. Это дополнительная ручная проверка, не отдельный deterministic API test. Ожидание: отказ с документированным validation response, поскольку requestBody обязателен и должен быть объектом по схеме. Проверяйте фактические status/body/state.

Источник: Дополнительное ручное упражнение

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.raw.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json'
```

### PUT: JSON null — четыре байта [expected 400]

Ожидаемый статус: 400. Это дополнительная ручная проверка, не отдельный deterministic API test. Ожидание: отказ с документированным validation response, поскольку requestBody обязателен и должен быть объектом по схеме. Проверяйте фактические status/body/state.

Источник: tests/test_client.py::test_raw_request_sends_any_json_shape[null] (unit, только POST; не проверяет поведение сервера)

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.raw.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw null
```

### PUT: Malformed JSON — незакрытый объект [expected 400]

Ожидаемый статус: 400. Это дополнительная ручная проверка, не отдельный deterministic API test. Ожидание: отказ с документированным validation response, поскольку requestBody обязателен и должен быть объектом по схеме. Проверяйте фактические status/body/state.

Источник: Дополнительное ручное упражнение

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request PUT http://127.0.0.1:3000/dev/users/boka.raw.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{"name":'
```

### GET после невалидного PUT [expected 200]

Ожидаемый статус: 200. Ожидается исходный пользователь без изменений.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request GET http://127.0.0.1:3000/dev/users/boka.raw.dev%40example.com \
  --header 'Accept: application/json'
```

### Cleanup raw fixture [expected 204]

Ожидаемый статус: 204. Для существующего fixture: 204 и полностью пустое тело. Если fixture уже отсутствует: 404. Удаляйте только созданные вами данные.

Один Send отправляет один запрос. Предусловия и проверка состояния выполняются вручную.

```bash
curl --include --silent --show-error --max-time 5 --request DELETE http://127.0.0.1:3000/dev/users/boka.raw.dev%40example.com \
  --header 'Accept: application/json' \
  --header 'Authentication: mysecrettoken'
```
