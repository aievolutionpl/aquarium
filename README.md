# Akwarium 3D

Statyczna strona (Three.js r160 z lokalnego `vendor/`, bez build-stepu). Live: https://aievolutionpl.github.io/aquarium/

Zbiornik 11 × 4.6 × 4.2 j. (woda 4.32). Gatunki: neon, rummy (bystrzyk czerwononosy), angel (skalar), guppy, cory (kirysek), ram (pielęgniczka Ramireza), betta.
Inne zwierzęta: snail ×3 (szyba tylna, szyba boczna, dno), shrimp ×4, frog ×1 (powierzchnia ↔ korzeń), daphnia ×24 (rozwielitki w toni).
`?debug` pokazuje licznik FPS.

## API `window.__aquarium` (kontrakt dla warstwy minigry, v2)

Obiekt zamrożony (`Object.freeze`), dostępny po załadowaniu `main.js`. Wszystkie metody są synchroniczne.

| metoda | zwraca |
|---|---|
| `version` | `2` |
| `tank` | `{width, height, depth, water}` (jednostki świata) |
| `fishCounts()` | `{neon: 36, rummy: 14, angel: 3, guppy: 8, cory: 6, ram: 2, betta: 1}` (mobile: neon 26, rummy 10) |
| `fishTotal()` | liczba ryb |
| `speciesNames()` | `{kind: 'polska nazwa'}` |
| `animalCounts()` | `{snail: 3, shrimp: 4, frog: 1, daphnia: 24}` |
| `animalTotal()` | liczba obiektów-zwierząt (daphnia liczone jako 1 rój) |
| `fps()` | średni FPS z ostatnich ~0.5 s |
| `fishScreen()` | `[{id, species, name, x, y, visible}]` — px względem canvasu `#c` (CSS px), `visible` = w kadrze |
| `animalScreen()` | `[{id, type, name, x, y, visible}]` (bez rozwielitek) |
| `frogScreen()` | `{x, y, visible}` |
| `feed(xWorld?)` | sypie pokarm (opcjonalnie nad danym X świata, zakres ±5.5); zwraca liczbę granulek |
| `foodCount()` / `eatenCount()` | granulki w wodzie / zjedzone od startu |
| `night()` | czy tryb nocny |
| `state()` | zbiorczy snapshot powyższych liczb |

`window.__aq` = wewnętrzny dostęp debugowy (niestabilny).
