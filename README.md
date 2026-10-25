# Výtah Lab

Lokální česká aplikace porovnávající dvě nezávislé kopie stejného výtahu nad stejným JSONem. Základní výtah přebírá funkce `rozhodni` a `nastup` z dodaného `vytah.html`. Chytrý výtah nabízí ECO, LOOK+ a LOOK. Oba používají fyziku dodaného simulátoru s krokem 0,05 s. Nejde o společný dispečink dvou kabin.

## Spuštění

Otevřete `index.html` nebo `Spustit_Aplikaci.bat`. Aplikace funguje offline, bez instalace. Výchozí data ze souboru `zadani-bezny-den-ve-skole-B746-8C6D.json` jsou v `scenario.json` a vložena v `scenario-data.js`. Další soubor načte tlačítko **Nahrát vlastní JSON**; data zůstávají v prohlížeči.

Volitelný náhled: `node preview.cjs 4187`, potom http://127.0.0.1:4187. Ukončení Ctrl+C.

## Základní výtah z HTML

- Prázdná kabina jede pro nejdéle čekajícího.
- Cíle rozváží podle pořadí nástupu.
- Nástup je povolen jen do prázdné kabiny nebo tehdy, když všichni uvnitř nastoupili v aktuálním patře: `stav.vKabine.every(o => o.odkud === stav.patro)`.
- Při rozvozu tedy nepřibírá další čekající, dokud se nevyprázdní.

Předchozí implementace FIFO dovolovala přibírání při výstupních zastávkách. Nová odpovídá přiloženému HTML. Původní HTML je zachováno v `reference/vytah.html` jako nezávislý testovací vzor. `reference/build-engine.cjs` z něj vytváří `tick-engine.js`, přidává rozhraní pro algoritmus a záznam běhu. Nemění pořadí událostí, integraci pohybu ani časování nástupu/výstupu. Aktualizovaný soubor je již součástí aplikace; generátor při běžném spuštění nepotřebujete.

## Výsledek na dodaných 400 osobách

| Metrika | Základní z HTML | Chytrý ECO |
| --- | ---: | ---: |
| Rozvezeno | 400 z 400 | 400 z 400 |
| Hotovo v čase | 3 879,1 s | 3 788,3 s |
| Průměrné čekání | 313,7 s | 187,3 s |
| Průměrná jízda | 22,4 s | 20,3 s |
| Průměrně celkem | 336,1 s | 207,6 s |
| Nejdelší čekání | 1 438,7 s | 775,9 s |
| Nejdelší celkem | 1 457,1 s | 794,3 s |
| Zastavení (otevření dveří) | 309 | 350 |
| Ujetá dráha | 2 922 m | 2 193 m |
| Rozvezeno do 600 s | 42 | 50 |
| Modelová spotřeba za společný interval | 1,451 kWh | 1,312 kWh |

ECO zkracuje průměrný čas od příchodu do vystoupení o 38,2 %, čekání o 40,3 % a modelovou spotřebu o 9,5 %. Hodnoty základního výtahu odpovídají přiloženému obrázku; test porovnává i přesné časy všech 400 jednotlivých cestujících s původním HTML. Čísla nejsou napevno v rozhraní: všechna se počítají ze zvoleného zadání.

## Ukazatele a ovládání

Všechny metriky z obrázku jsou v porovnávací tabulce pro oba výtahy a v exportu JSON verze 2. Navíc zůstávají počet čekajících a lidí v kabině, 95. percentil čekání, prázdné kilometry, rozjezdy a energie.

- Čekání = dokončení nástupu − příchod; průměr i maximum zahrnují všechny již nastoupivší, stejně jako dodané HTML.
- Jízda = dokončení výstupu − dokončení nástupu; celkem = dokončení výstupu − příchod. Obě metriky zahrnují pouze rozvezené osoby.
- Hotovo v čase je výstup posledního člověka. Do úplného odbavení je hodnota prázdná; nezapočítává následné zavírání dveří. Pro prázdné zadání je 0.
- Rozvezeno do horizontu počítá výstupy nejpozději v `evaluation.horizon`, včetně hranice. Při přehrávání ukazuje pouze výstupy, které již nastaly.
- Hlavní procenta času a čekání porovnávají stejná ID již odbavená oběma výtahy. Záporné rozdíly se neskrývají.
- Zastavení se započte při zahájení otevření dveří, i bez předchozí jízdy.
- Přepínač rozsahu „Horizont zadání“ vybírá příchody do horizontu a pak je doobslouží. To je odlišné od metriky počtu výstupů do horizontu.
- Přehrávání, pauza, reset, rychlosti 1×/8×/32×/128×, posuvník času a přechod na výsledek aktualizují i nové ukazatele.
- Při dosažení `maxTime` se zobrazí neúplný výsledek. Stejně jako zdrojový simulátor pracuje konec běhu na mřížce kroků 0,05 s.

## Chytré algoritmy

Rozhodování ECO, LOOK+ a LOOK používá dosud příchozí volání: patro, směr a stáří. Cílové patro osoby se používá až po nástupu. Neznají budoucí příjezdy a konkrétní cíle čekajících nepoužívají ani při `destVisible: true`. Nová fyzika může měnit výsledné časy i následná rozhodnutí oproti starší verzi.

S cestujícími v kabině řadí cíle ve směru jízdy a při volné kapacitě zařadí známé stejně orientované požadavky po cestě. Každý zvolený úsek jízdy je pevný; nové volání za jízdy jej nepřesměruje.

Prázdná kabina ECO hodnotí fronty podle `(čas příjezdu + otevření + zavření + 6 s/Wh × odhad mechanické energie prázdného přejezdu) / součet priorit`. Priorita je `1 + čekání / 240 s`, nejvýše pro kapacitu osob. Po 900 s dostane nejstarší volání při vyprázdnění přednost. Při výstupu poslední osoby může otočit směr a využít otevřené dveře, pokud jiné patro nečeká alespoň 120 s. Hranice nejsou zárukou maximálního čekání.

LOOK+ používá váhu `(1 + čekání / 120 s)²` a časový náklad zahrnující odhad jízdy k okraji budovy. Přednost nejstaršího volání nastává po 600 s, omezení otočení při otevřených dveřích po 360 s čekání jinde. LOOK používá jednodušší skóre blízkosti, stáří a velikosti fronty s předností po 120 s a bez tohoto otočení.

ECO bylo původně laděno na školním souboru a není obecně optimální. Aktuální porovnání s LOOK+ se ukazuje nad hlavními výsledky, včetně případného zhoršení nejdelšího čekání. `node experiments/eco-benchmark.cjs` porovnává ECO a LOOK+ na aktuální společné fyzice také na 24 syntetických scénářích. Starší výsledky a metodika jsou historické: `experiments/README-v3.md` a uložené enginy `simulation-v1.cjs` až `simulation-v3.cjs`.

## Energie

JSON ani přiložené HTML neobsahují model elektřiny. Aplikace k oběma běhům přidává shodný odhad: kabina 800 kg, osoba 75 kg, protizávaží kabina + polovina maximálního nákladu, účinnost 80 %, tření 180 N, standby 80 W, pomocný pohon 120 W a dveře 200 W nad standby. Bez rekuperace.

V každém kroku se počítá kladná práce proti nevyvážení a tření z reálně ujeté dráhy a kladný přírůstek kinetické energie. Přičítá se příkon za čas kroku. Brzdění nevrací elektřinu. Když výtah skončí dříve, do konce společného intervalu se přičítá standby. Jde o zjednodušený odhad, nikoli měření. Mechanický odhad v rozhodování ECO nadále používá analytický profil plánované jízdy; výsledná spotřeba pochází z vykonaných kroků.

## Ověření a soubory

`node --test --test-isolation=none simulation.test.cjs dashboard.test.cjs`

14 testů ověřuje přesnou shodu s HTML, zákaz přibírání během rozvozu, různou kapacitu a fyziku, zpomalené přestupy, determinismus, kapacitu, zachování počtu osob, absenci znalosti budoucnosti, využití otevřených dveří, průběžné metriky, hranici horizontu, časový limit, prázdná data, validaci, společný interval energie, offline načtení skriptů a nové položky v exportu. V prohlížeči byly ověřeny konečné hodnoty, oba rozsahy, přepnutí řízení, přehrávání, pauza a reset; konzole bez chyb.

Aktivní soubory: `index.html`, `dashboard.css`, `dashboard.js`, `simulation.js`, `tick-engine.js`, `scenario.json`, `scenario-data.js`. `reference/` obsahuje původní HTML, generátor fyziky a nezávislý testovací vzor. `preview.cjs` slouží pro volitelný server. Staré soubory `app.js`, `styles.css`, `elevator-engine.js`, `sound-effects.js`, `previous-version/` a vývojoví kandidáti v `experiments/` nejsou načítány aplikací.

## Matyáš Rada + Filip Krejčí
Filip Krejčí poskytnul data a nápady.
Matyáš Rada využil Chat GPT na měsíc zadarmo.
