# Capsule 02 - Architecture et deploiement

## Objectif

Mettre en avant une architecture auto-contenue, isolee, maintenable et securisee, avec exposition minimale via Nginx.

## Duree cible

- 5 a 10 minutes

## Fil de presentation

1. Vue systeme globale
2. Docker Compose comme unite de deploiement
3. Services internes non exposes
4. Nginx comme point d'entree unique
5. Reverse proxy de production par domaine
6. Impact sur securite et maintenance

## Message principal

L'architecture de deploiement est deja structuree selon une logique professionnelle: encapsulation, separation des responsabilites et reduction de la surface d'exposition.

## Fichiers a ouvrir

- [docker-compose.yml](/Users/a3emond/dev/audiobook-platform/docker-compose.yml)
- [default.conf](/Users/a3emond/dev/audiobook-platform/infra/nginx/default.conf)
- [server.ts](/Users/a3emond/dev/audiobook-platform/api/src/server.ts)
- [worker.ts](/Users/a3emond/dev/audiobook-platform/worker/src/worker.ts)

## Slides / diagrammes a montrer

- [assets/diagrammes.md](/Users/a3emond/dev/audiobook-platform/presentation/capsules/02-architecture-deploiement/assets/diagrammes.md)
- [assets/api-class-diagram.puml](/Users/a3emond/dev/audiobook-platform/presentation/capsules/02-architecture-deploiement/assets/api-class-diagram.puml)

## Preuves rapides

- seul `nginx` publie un port;
- `db`, `api` et `worker` restent internes;
- routage centralise `/`, `/api/`, `/streaming/`, `/ws`.

## Points a souligner

- isolation reseau;
- maintenance simplifiee;
- deployment plus propre;
- adaptation naturelle a un reverse proxy par domaine en production.
