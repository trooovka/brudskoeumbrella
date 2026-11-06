# EARTHSHAKER OR BROODMOTHER — проект для Cloudflare

Сайт на Cloudflare Pages, аккаунты в базе D1. Всё на бесплатном тарифе (лимиты проверь на странице тарифов Cloudflare).

Структура:
- `public/` — сайт (index.html и video.mp4)
- `functions/api/[[route]].js` — регистрация, вход, выход, «кто я»
- `schema.sql` — таблицы базы
- `wrangler.toml` — настройки

## Деплой

Нужны Node.js 18+ и аккаунт Cloudflare. Команды выполняй в папке проекта.

1. Войти в Cloudflare:
   `npx wrangler login`
2. Создать проект Pages:
   `npx wrangler pages project create brudskoe --production-branch main`
3. Создать базу:
   `npx wrangler d1 create brudskoe-db`
   В выводе будет `database_id`. Вставь его в `wrangler.toml` вместо `ВСТАВЬ_СЮДА_ID_ИЗ_ШАГА_3`.
4. Создать таблицы в облачной базе:
   `npx wrangler d1 execute brudskoe-db --remote --file=schema.sql`
5. Залить сайт:
   `npx wrangler pages deploy public`
   Сайт откроется по адресу вида `brudskoe.pages.dev`.
6. Если регистрация отвечает ошибкой про `DB`: в панели Cloudflare открой Workers & Pages → brudskoe → Settings → Bindings → Add → D1 database, имя переменной `DB`, база `brudskoe-db`, потом снова выполни шаг 5.

## Свой домен

Workers & Pages → brudskoe → Custom domains → Set up a custom domain, введи домен.
Если домен уже добавлен в Cloudflare, записи создадутся сами. Если нет, Cloudflare покажет, какую запись CNAME или какие серверы имён указать у регистратора.

## Защита от подбора паролей (рекомендую)

Cloudflare → твой домен → Security → WAF → Rate limiting rules. Правило: путь `/api/login` и `/api/register`, например 10 запросов за минуту с одного IP, действие Block.

## Проверка локально

```
npx wrangler d1 execute brudskoe-db --local --file=schema.sql
npx wrangler pages dev public
```

## Как это устроено

- Пароли хэшируются на сервере (PBKDF2, SHA-256, 100 000 итераций, соль у каждого своя). Пароль в открытом виде нигде не хранится.
- После входа выдаётся сессия на 30 дней в куке `HttpOnly; Secure; SameSite=Lax`. В базе лежит только хэш токена.
- Выход удаляет сессию из базы.
- Посмотреть пользователей: `npx wrangler d1 execute brudskoe-db --remote --command "SELECT nick, rank, created FROM users"`
