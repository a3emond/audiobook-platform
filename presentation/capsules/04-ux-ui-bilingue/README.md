# Capsule 04 - UX/UI, i18n et produit bilingue

## Objectif

Montrer que l'experience utilisateur repose sur la navigation, la lecture, la continute et un vrai traitement bilingue de l'interface, du contenu et des discussions.

## Duree cible

- 6 a 12 minutes

## Fil de presentation

1. Navigation et guards
2. Player et reduction de friction
3. i18n frontend
4. Contenu language-aware
5. Discussions separees par langue

## Message principal

L'approche UX/UI est fonctionnelle et structuree: l'interface, le catalogue et les interactions sociales sont coherents avec un produit bilingue reel.

## Fichiers a ouvrir

- [app.routes.ts](/Users/a3emond/dev/audiobook-platform/frontend/src/app/app.routes.ts)
- [app.config.ts](/Users/a3emond/dev/audiobook-platform/frontend/src/app/app.config.ts)
- [player.service.ts](/Users/a3emond/dev/audiobook-platform/frontend/src/app/core/services/player.service.ts)
- [i18n.service.ts](/Users/a3emond/dev/audiobook-platform/frontend/src/app/core/services/i18n.service.ts)
- [library.service.ts](/Users/a3emond/dev/audiobook-platform/frontend/src/app/core/services/library.service.ts)
- [discussion.service.ts](/Users/a3emond/dev/audiobook-platform/api/src/modules/discussions/discussion.service.ts)
- [discussion.routes.ts](/Users/a3emond/dev/audiobook-platform/api/src/modules/discussions/discussion.routes.ts)

## Slides / diagrammes a montrer

- [assets/diagrammes.md](/Users/a3emond/dev/audiobook-platform/presentation/capsules/04-ux-ui-bilingue/assets/diagrammes.md)
- [assets/frontend-architecture.puml](/Users/a3emond/dev/audiobook-platform/presentation/capsules/04-ux-ui-bilingue/assets/frontend-architecture.puml)

## Preuves rapides

- dictionnaires `fr`/`en`;
- `document.documentElement.lang`;
- `withDefaultLanguage()`;
- `CHANNELS_BY_LANG`;
- routes `/:lang/:channelKey/messages`.

## Points a souligner

- i18n et contenu bilingue sont deux couches distinctes;
- le catalogue suit la langue choisie;
- les discussions evitenent le melange des communautes linguistiques.
