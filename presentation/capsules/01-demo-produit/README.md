# Capsule 01 - Demo produit

## Objectif

Montrer un produit complet deja exploitable: parcours utilisateur, parcours admin, lecture, discussions, progression et publication de contenu.

## Duree cible

- 3 a 6 minutes

## Fil de presentation

1. Login / Register
2. Library
3. Player: resume + chapitres + progression
4. Discussions et profil
5. Admin upload MP3
6. Jobs et disponibilite du livre

## Message principal

Le systeme fonctionne deja comme un produit complet, au-dela d'une simple demonstration technique.

## Fichiers a ouvrir

- [login.page.ts](/Users/a3emond/dev/audiobook-platform/frontend/src/app/features/auth/login-page/login.page.ts)
- [library-page.component.ts](/Users/a3emond/dev/audiobook-platform/frontend/src/app/features/library/library-page/library-page.component.ts)
- [player.page.ts](/Users/a3emond/dev/audiobook-platform/frontend/src/app/features/player/player-page/player.page.ts)
- [discussions.page.ts](/Users/a3emond/dev/audiobook-platform/frontend/src/app/features/discussions/discussions-page/discussions.page.ts)
- [profile.page.ts](/Users/a3emond/dev/audiobook-platform/frontend/src/app/features/profile/profile-page/profile.page.ts)
- [admin-upload.page.ts](/Users/a3emond/dev/audiobook-platform/frontend/src/app/features/admin/admin-upload-page/admin-upload.page.ts)
- [admin-jobs.page.ts](/Users/a3emond/dev/audiobook-platform/frontend/src/app/features/admin/admin-jobs-page/admin-jobs.page.ts)

## Slides / diagrammes a montrer

- Aucun support global requis pour cette capsule.
- Optionnel: ouvrir [../05-flux-techniques-e2e/assets/diagrammes.md](/Users/a3emond/dev/audiobook-platform/presentation/capsules/05-flux-techniques-e2e/assets/diagrammes.md) pour illustrer un flux technique.

## Points a souligner

- separation claire entre espace lecteur et espace admin;
- lecture avec reprise;
- discussions et profil comme fonctions produit completes;
- administration de contenu sans manipulation manuelle des fichiers serveur.

## Plan B si la demo live ralentit

- montrer uniquement login -> library -> player;
- puis basculer sur admin upload et jobs;
- appuyer la narration avec les fichiers de code ci-dessus.
