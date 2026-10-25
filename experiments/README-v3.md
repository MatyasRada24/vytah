# Výtah Lab

Lokální česká webová aplikace porovnávající dvě nezávislé kopie stejného výtahu: jednoduché FIFO a chytré řízení. U chytrého výtahu lze přepínat energeticky vážené ECO, LOOK+ a původní adaptivní LOOK. Aplikace při otevření vybírá nové ECO; jde o volitelný kompromis průměrného času a energie vůči nejdelšímu čekání. Každá obsluhuje stejné cestující z přiloženého JSONu. Nejde o společný dispečink dvou kabin v jedné budově.

## Spuštění

Dvojklik na `Spustit_Aplikaci.bat` nebo otevřít `index.html` v prohlížeči. Aplikace funguje offline, bez instalace a bez serveru. Výchozí zadání je vloženo v `scenario-data.js`; originál je v `scenario.json`. Další zadání lze nahrát tlačítkem **Nahrát vlastní JSON**. Soubor se zpracovává pouze v prohlížeči.

Pro vývojový HTTP náhled: `node preview.cjs`, potom http://127.0.0.1:4173. Server se ukončuje Ctrl+C.

## Ovládání

- Spustit, pozastavit, resetovat; rychlosti 1×, 8×, 32× a 128×.
- Posun po časové ose zpět i vpřed; přímé zobrazení konečného výsledku.
- Celý soubor (400 osob) nebo jen příchody do horizontu zadání včetně (600 s, 113 osob), následně doobsloužení. `maxTime` je tvrdý konec pozorování.
- Živé šachty, fronty, obsazenost, počet odbavených, čekání a energie.
- Výsledky, graf energie, podrobná tabulka a export JSON s parametry, metrikami a časy cestujících v aktuálním okamžiku.

## Algoritmy a férovost

Parametry z JSON se nemění: 8 podlaží, 3 m/podlaží, 2 m/s, zrychlení 1 m/s², 6 osob, otevření i zavření 1,5 s, nástup/výstup 1 s na osobu. `slow` násobí nástup i výstup. Pohyb má trojúhelníkový nebo lichoběžníkový rychlostní profil podle délky jízdy. Počáteční patro je převzato z dat.

FIFO při prázdné kabině volí nejstarší požadavek, na místě nabírá v pořadí příchodu a rozváží podle pořadí nástupu. Během rozvozu nenabírá na dalších patrech.

Adaptivní LOOK řadí cíle v kabině podle směru, přibírá po cestě stejně orientovaná volání a respektuje kapacitu. Prázdná kabina minimalizuje skóre `(čas přejezdu + otevření + zavření) / (1 + stáří volání / 60 + 0,25 × min(velikost fronty, kapacita))`. Pokud nejstarší volání čeká alespoň 120 s, má při dalším vyprázdnění přednost. Tato hranice není zárukou maximální čekací doby. Během jízdy je zvolená zastávka pevná; nová volání se zohlední při dalším rozhodnutí.

Plánovač před nástupem používá jen patro, směr, stáří a počet již příchozích čekajících. Nezná budoucí příjezdy ani konkrétní cílová patra čekajících. I při `destVisible: true` tento algoritmus používá jen směr. Deterministický předvýpočet je určen pro plynulé přehrávání; plánovač vždy dostane pouze aktuálně dostupná volání.

Všechny parametry jsou v rozhraní pevné, tedy respektují i `locked` z dodaného souboru. `people` je autoritativní; z `generator` se další lidé negenerují. Identifikátor `hash` se zobrazuje jako metadata, neověřuje se jako kryptografický podpis. Import kontroluje formát a verzi, typy, rozsahy, unikátní ID a patra.

Jde o praktickou online heuristiku, nikoli prokazatelně optimální algoritmus pro všechny scénáře. Úspory nejsou zaručeny: záporné výsledky se zobrazí beze změny.

## Energeticky vážené řízení ECO (v3)

ECO ponechává řazení zastávek LOOK, ale mění výběr dalšího svozu. Počítá náklad prázdného přejezdu ze stejného energetického modelu jako simulátor: hmotnost kabiny a protizávaží, směr gravitace, tření, rozjezd a účinnost. Pomocnou elektroniku do tohoto skóre nezahrnuje; skutečná výsledná spotřeba ji stále zahrnuje beze změny.

Skóre fronty = (čas příjezdu + otevření + zavření + 6 s/Wh × mechanická energie přejezdu ve Wh) / součet priorit. Priorita osoby je 1 + čekání / 240 s; započítá se nejvýše kapacita osob. Po 900 s má nejstarší volání při další prázdné kabině přednost. Okamžité otočení při otevřených dveřích se vynechá, pokud jiné patro čeká alespoň 120 s. Žádná hranice není zárukou maximálního čekání.

Parametry byly vybrány na školním souboru z 240 kombinací. Toto je kalibrace na konkrétní data, nikoli důkaz obecné optimality. Zamítnuté experimenty zahrnovaly odhad cílů z historie, řízení podle dominantní fronty, čekání na skupinu, smíšené směry a reakci na nová volání během jízdy. Do aktivního enginu nebyly tyto experimentální změny zařazeny.

| Metrika, 400 osob | LOOK+ | ECO |
| --- | ---: | ---: |
| Průměrná cesta | 218,45 s | 210,16 s |
| Průměrné čekání | 196,59 s | 189,11 s |
| Modelová energie | 1,29491 kWh | 1,28120 kWh |
| Nejdelší čekání | 669,34 s | 790,09 s |
| 95. percentil čekání | 585,26 s | 662,35 s |

Proti LOOK+: průměrná cesta kratší o 3,80 %, energie nižší o 1,06 %, nejdelší čekání delší o 120,75 s. Všech 400 osob je odbaveno. Právě zhoršení nejdelšího čekání je v aplikaci zvýrazněné, takže ECO není prezentováno jako všeobecné zlepšení. Staré algoritmy i fyzikální model zůstávají nezměněné.

Po výběru parametrů proběhlo ověření na 24 dalších scénářích (seedy 173, 211, 251, 307, 353, 401; rovnoměrný provoz, nahoru, dolů, nárazové příchody). Všude byly odbaveny všechny osoby; ECO zlepšilo průměrnou cestu v 11 případech, energii ve 13 a obě metriky současně v 8. Proto zůstává přepínač všech tří variant. Zopakování: `node experiments/eco-benchmark.cjs`; podrobná data v `experiments/eco-benchmark-results.json`. Srovnává se vždy stejný časový interval včetně standby.

Výzkumný kontext dalších přístupů: [receding-horizon elevator dispatch, IFAC](https://www.sciencedirect.com/science/article/pii/S1474667015328706). Implementované ECO je vlastní jednoduchá heuristika, nikoli implementace citovaného výzkumného algoritmu.

## Řízení LOOK+ (v2)

LOOK+ hodnotí celé fronty (patro + směr). Pro nejvýše kapacitu kabiny sčítá váhy `(1 + čekání / 120 s)²`. Skóre je součet času přejezdu, otevření/zavření a odhadované jízdy k okrajovému patru ve směru volání, dělený touto váhou. Odhad okraje není skutečným cílem cestujících. Po 600 s dostane nejstarší volání při vyprázdnění přednost.

Při výstupu posledního člověka dovolí opačný směr nástupu bez nového cyklu zavření a otevření. Pokud jiné patro čeká alespoň 360 s, tuto příležitost vynechá. Jde o kompromis propustnosti a dlouhého čekání, nikoli garanci mezní doby čekání.

Varianta byla zvolena po porovnání kandidátů na školním zadání a následně ověřena na 24 dalších deterministických scénářích (čtyři druhy provozu, šest seedů). Na nich zkrátila průměrnou cestu v 17 případech, šest bylo shodných a jeden horší. Energii zlepšila v 11 případech, šest bylo shodných a sedm horších; zejména při rovnoměrném provozu může energii zvýšit. Proto je původní algoritmus stále volitelný a neslibujeme všeobecnou převahu.

Na dodaných 400 osobách oproti předchozímu chytrému řízení:

| Metrika | LOOK původní | LOOK+ |
| --- | ---: | ---: |
| Průměrná cesta | 234,12 s | 218,45 s |
| Průměr čekání | 212,18 s | 196,59 s |
| Nejdelší čekání | 709,34 s | 669,34 s |
| Energie za společný interval | 1,31120 kWh | 1,29491 kWh |

Výpočty lze zopakovat příkazem `node experiments/benchmark.cjs`; podrobnosti jsou v `experiments/benchmark-results.json`. Původní engine je uložen jako `experiments/simulation-v1.cjs` a regresní test potvrzuje shodu s volbou LOOK v nové aplikaci.

## Metriky a energie

Čekání končí dokončením nástupu. Celková cesta končí dokončením výstupu. Hlavní procenta časové úspory porovnávají stejná ID odbavená oběma výtahy. Průměry v tabulce a pod šachtami jsou za dosud odbavené osoby příslušného výtahu. Neodbavení a osoby v kabině se uvádějí zvlášť. Při časovém limitu je výsledek označen jako neúplný.

JSON neobsahuje energetické parametry. Použitý společný zjednodušený model: kabina 800 kg, osoba 75 kg, protizávaží kabina + polovina maximálního nákladu, účinnost 80 %, tření 180 N, standby 80 W, pomocný pohon 120 W, dveře 200 W nad standby. Oba bez rekuperace. Model zahrnuje práci proti nevyvážení a tření, kinetickou energii rozjezdu, pomocný příkon a čas. Energie je odhad, nikoli certifikovaný výpočet ani měření. Záměrně se nesrovnávají rozdílné motory či standby režimy.

Při dřívějším dokončení se do konce společného intervalu počítá standby. Rozdíl v procentech = `(FIFO − LOOK) / FIFO × 100`. Celý výchozí soubor: oba výtahy obslouží 400 osob; přibližně 15,1 % kratší celková cesta, 15,6 % kratší čekání a 3,6 % nižší modelová spotřeba pro LOOK+ oproti FIFO. Původní LOOK zůstává na 9,0 %, 8,9 % a 2,4 %.

Kontext: [LOOK scheduling, CMU](https://www.cs.cmu.edu/~natassa/courses/15-823/S01/lectures/15_disks.pdf) a [energetické technologie výtahů, KONE](https://www.kone.com/global/en/newsroom/stories/igbt-supercharging-elevators.html). Konkrétní číselné energetické předpoklady jsou vlastní volbou modelu.

## Aktivní soubory

- `index.html`, `dashboard.css`, `dashboard.js`: rozhraní.
- `simulation.js`: nezávislý simulační engine pro browser i Node.
- `scenario.json`, `scenario-data.js`: dodané zadání a jeho offline vložení.
- `simulation.test.cjs`: dvanáct testů výpočtu.
- `preview.cjs`: volitelný lokální server.
- `previous-version/`: záloha předchozího rozhraní a výpočtu. Staré soubory `app.js`, `styles.css`, `elevator-engine.js`, `sound-effects.js` v kořeni se novou stránkou nenačítají.

- `experiments/`: původní engine, vývojoví kandidáti a opakovatelný benchmark.

## Ověření

Spustit `node --test --test-isolation=none simulation.test.cjs`.

Testy ověřují všech 400 osob, determinismus, kapacitu a zachování počtu osob, analytickou dobu jízdy, zpomalený nástup, nezávislost na budoucích voláních a skrytých cílech, validaci, prázdná data, časový limit, horizont, společný standby a zachování záporných výsledků.

V prohlížeči ověřeno: desktop a mobil 390 px, přehrávání/pauza/reset, oba rozsahy, načtení původního JSONu, odmítnutí neplatného JSONu, export výsledků a absence chyb v konzoli.

Aktualizace LOOK+: přidány testy přesné shody původního řízení, úspory dveřního cyklu při otočení a zlepšení všech čtyř školních metrik.

Aktualizace ECO: přidány regresní testy přesné shody LOOK+ a FIFO, úplného deterministického odbavení ECO a transparentně horšího maximálního čekání, kapacity, časové kauzality, prázdných dat a časového limitu. Export uvádí zvolenou verzi algoritmu.
