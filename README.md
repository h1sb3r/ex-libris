# Ex Libris

Maquette locale navigable : accueil, collection, fiche de lecture et carnet.

Ouvrir `index.html` dans un navigateur. Aucun serveur ni installation nécessaire. Les polices Google sont facultatives : des polices système prennent le relais hors connexion.

La recherche couvre titres, auteurs, genres, années et notes, sans distinction d'accents. La collection propose des filtres de statut et quatre tris. Les notes sont modifiables et conservées dans le navigateur via localStorage ; elles ne sont pas synchronisées ni sauvegardées ailleurs.

Les huit livres, les souvenirs, les dates de lecture et la progression constituent des données de démonstration. Les couvertures sont des compositions typographiques illustratives, pas les couvertures des éditeurs. Les métadonnées devront être vérifiées lors du raccordement à un catalogue.

La synchronisation, l'ajout de livres, les citations, les appréciations, l'export et la chronologie restent à réaliser après validation de la maquette.

## Google Books

La collection propose une recherche Google Books (titre, auteur ou ISBN). Elle affiche les métadonnées et un lien vers Google Books ; elle ne modifie pas votre collection.

Dans Google Cloud, activez Books API, créez une clé, choisissez les restrictions Sites Web avec `https://h1sb3r.github.io/*`, puis restreignez les API à Books API. Pour un serveur local sur le port 8001, ajoutez `http://127.0.0.1:8001/*`. Les requêtes vers Google peuvent transmettre seulement l'origine du site : évitez une restriction limitée au chemin `/ex-libris/`.

Dans Collection → Configurer Google Books, enregistrez la clé. Elle reste dans le localStorage de ce navigateur et doit être configurée séparément sur chaque appareil. Ne transmettez pas la clé dans le chat et ne l'insérez pas dans les fichiers Git. La balise `google-books-api-key` reste vide dans la version publiée. Une clé côté navigateur est visible par son utilisateur : les restrictions Google sont indispensables.

Pour tester localement : `python -m http.server 8001 --bind 127.0.0.1`, puis ouvrir `http://127.0.0.1:8001/#collection`.

## Open Library

Source par défaut sans clé : https://openlibrary.org/search.json (lang=fr, 12 résultats). Une édition pertinente est sélectionnée par œuvre ; la jaquette peut appartenir à une autre édition si aucune couverture spécifique n’est disponible. Couvertures : https://covers.openlibrary.org/b/id/{id}-M.jpg?default=false. Une requête par seconde et cache de 30 recherches par session. Les ajouts des deux catalogues sont conservés localement, avec des identifiants distincts. Google Books reste disponible dans le sélecteur. Un extrait est montré quand le catalogue fournit first_sentence ; ce champ n’est pas un résumé complet.

Pour un usage fréquent ou un déploiement à grande échelle, enregistrer l’application auprès d’Open Library et prévoir un serveur capable d’identifier les requêtes avec User-Agent/contact. Aucun contact personnel n’est transmis par cette version statique. Documentation : https://openlibrary.org/developers/api
