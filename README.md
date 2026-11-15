# SciFi Vocab

PWA pour apprendre le vocabulaire anglais des classiques de la science-fiction : *1984*, *Neuromancer*, *Dune*, *Brave New World*, *Fahrenheit 451*, *Do Androids Dream of Electric Sheep?*, *Foundation*, *Snow Crash*…

## Fonctionnement

- **Apprendre** (écran d'accueil) : une pile de cartes avec le mot, sa traduction, son sens et des synonymes.
  - Swipe **→ / ✓ Vu** : le mot part dans le test.
  - Swipe **← / ↺ Encore** : le mot revient 5 cartes plus loin.
  - 🔊 : prononciation (synthèse vocale du navigateur).
- **Test** (onglet à côté) : QCM sur les mots vus (anglais → français ou français → anglais).
  - Bonne réponse : le mot est **acquis**.
  - Mauvaise réponse : le mot retourne **en tête de la pile de swipe** avec le tag « À revoir ».
- Tous les **10 swipes**, une fenêtre te propose de lancer un test.

La progression est enregistrée dans le navigateur (localStorage) et l'app marche hors ligne grâce au service worker.

## Lancer en local

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Pour l'installer sur ton téléphone, il faut la servir en HTTPS (GitHub Pages, Netlify…), puis faire « Ajouter à l'écran d'accueil ».

## Ajouter des mots

Édite `words.js` : `[mot, traduction, sens, "synonyme1, synonyme2", source]`. Les nouveaux mots apparaissent automatiquement dans la pile sans effacer la progression.
