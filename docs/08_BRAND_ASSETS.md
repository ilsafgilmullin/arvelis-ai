# ARVELIS AI — Brand Assets

## Утверждённая геометрия

Форма знака не меняется:

- геометрическая буква `A`;
- круговая орбита;
- правая часть орбиты переходит в точечную дугу;
- ARVELIS AI wordmark structure;
- слоган `INTELLIGENCE. PRECISION. RESULTS.`.

`Travel UI Redesign V2` не создаёт новый знак. Меняется только пользовательский colorway для светлого Travel UI.

## Colorways

### Classic / historical

Graphite/gold остаётся историческим brand-направлением и может использоваться в legacy/brand materials, где это отдельно уместно.

### Travel light

Для light Travel UI используется teal/blue gradient:

- teal start;
- cyan/blue middle;
- blue finish.

Это presentation variant той же геометрии.

## Текущие чистые технические ассеты

Classic technical preview:

- `public/brand/logo-mark.svg`;
- `public/brand/logo-mark-small.svg`;
- `public/brand/favicon.svg`.

Travel light technical preview:

- `public/brand/logo-mark-light.svg`;
- `public/brand/logo-mark-light-small.svg`.

React interface variant:

- `src/components/Brand.tsx` поддерживает `variant="classic"` и `variant="travel"`;
- SVG gradient id формируется per-instance через `useId`, чтобы несколько знаков на одной странице не конфликтовали;
- orbit, dots и A используют один и тот же colorway;
- геометрические path/circle coordinates сохранены.

## Small-size readability

`logo-mark-light-small.svg` сохраняет ту же форму, но использует слегка усиленную толщину орбиты/точек для технического 64×64 preview. Это не изменение композиции знака и не новый master-logo.

Проверять на малых размерах:

- читаемость A;
- различимость орбиты;
- точечная дуга не должна превращаться в шум;
- отсутствие glow;
- достаточный контраст на white / soft blue-white background.

## Master lockup

Полный lockup внутри React preview по-прежнему собирается из SVG-знака и текстовой типографики интерфейса. Это **не финальный master-brand asset**.

Не выдавать системный шрифт внутри случайно собранного SVG за утверждённый master wordmark.

Финальный набор остаётся отдельной brand-production задачей:

- [ ] `logo-full.svg`;
- [ ] `logo-full-tagline.svg`;
- [x] `logo-mark.svg` — classic technical preview;
- [x] `logo-mark-small.svg`;
- [x] `logo-mark-light.svg` — Travel light technical preview;
- [x] `logo-mark-light-small.svg`;
- [ ] `logo-full-light.svg`;
- [ ] `app-icon-512.png`;
- [x] `favicon.svg` — classic technical favicon;
- [ ] dedicated Travel favicon decision;
- [ ] `favicon-32.png`;
- [ ] `social-preview-1200x630.png`;
- [ ] `brand-preview.png`.

## Правила

- не использовать вырезанный постер, screenshot или raster crop как технический логотип;
- не менять геометрию без отдельного product/brand решения;
- не заменять знак travel-клише;
- light colorway не означает переход к neon/cyberpunk;
- интерфейсный вариант должен оставаться чистым и readable;
- новые PNG/app/social assets не создавать как «финальные» без утверждённого master lockup.
