# SciFi Vocab

PWA pour apprendre le vocabulaire anglais et valider ses niveaux CECRL de A1 à C2 : **~6 500 mots et expressions**
(A1 400 · A2 485 · B1 867 · B2 1 757 · C1 1 815 · C2 1 190), dont des phrasal verbs, des idioms et le vocabulaire des
classiques de la SF (*1984*, *Neuromancer*, *Dune*, *Brave New World*, *Fahrenheit 451*, *Foundation*, *Snow Crash*…).

## Fonctionnement

- **Apprendre** (écran d'accueil) : une pile de cartes avec le mot, sa traduction, son sens et des synonymes.
  - Swipe **→ / ✓ Vu** : le mot part dans le test.
  - Swipe **← / ↺ Encore** : le mot revient 5 cartes plus loin.
  - 🔊 : prononciation (synthèse vocale du navigateur).
- **Test** (onglet à côté) : QCM sur les mots vus (anglais → français ou français → anglais).
  - Bonne réponse : le mot est **acquis**.
  - Mauvaise réponse : le mot retourne **en tête de la pile de swipe** avec le tag « À revoir ».
- **Filtre de niveau** au-dessus des cartes (A1 → C2, B2 par défaut) + bouton 🚀 SF pour ne voir que le vocabulaire des romans.
- **Niveaux** (3e onglet) : progression par niveau et **tests de niveau** à réponses écrites (pas de QCM),
  en mélangeant français → anglais (avec la 1re lettre et le nombre de lettres en indice) et anglais → français.
  - Un test = 20 mots jamais encore tirés dans ce niveau ; il faut **17/20** pour le réussir.
  - Pour valider un niveau, il faut réussir **10 tests (A1, A2), 12 (B1), 15 (B2), 18 (C1), 20 (C2)**.
  - Accents, majuscules, articles (le, la, to, the…) et petites fautes de frappe sont tolérés.
  - Les mots trouvés passent en « acquis », les ratés retournent en tête de la pile de swipe.
- Tous les **10 swipes**, une fenêtre te propose de lancer un test.

La progression est enregistrée dans le navigateur (localStorage) et l'app marche hors ligne grâce au service worker.

## Lancer en local

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Pour l'installer sur ton téléphone, il faut la servir en HTTPS (GitHub Pages, Netlify…), puis faire « Ajouter à l'écran d'accueil ».

## Ajouter / corriger des mots

Les sources sont dans `data/*.json` (un objet par mot : `w, fr, def, syn, lvl, pos, ex`, et `src` pour la SF).
Après modification, régénère `words.js` :

```sh
python3 tools/build_words.py
```

Les doublons sont fusionnés (on garde le niveau le plus bas). Les nouveaux mots apparaissent dans la pile sans effacer la progression.
La base a été générée par IA à partir des référentiels CECRL connus (English Vocabulary Profile, Oxford 3000/5000) :
les niveaux sont indicatifs et quelques traductions peuvent être imparfaites.
