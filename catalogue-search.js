(() => {
  const storageKey = 'exlibris-google-books-key';
  let controller;
  const cache = new Map();
  let lastRequest = 0;
  function normalizeOpenLibrary(doc) {
    const edition = doc.editions?.docs?.[0];
    const key = edition?.key || doc.key;
    const id = typeof key === 'string' ? key.split('/').pop() : '';
    const cover = edition?.cover_i || doc.cover_i;
    return { id, source: 'openlibrary', workKey: doc.key,
      volumeInfo: { title: edition?.title || doc.title, authors: doc.author_name,
      publishedDate: String(edition?.publish_date || doc.first_publish_year || ''),
      publisher: Array.isArray(edition?.publisher) ? edition.publisher[0] : '',
      categories: [], description: Array.isArray(doc.first_sentence) ? doc.first_sentence.join(' ') : doc.first_sentence || '',
      imageLinks: cover ? {thumbnail: 'https://covers.openlibrary.org/b/id/' + cover + '-M.jpg?default=false'} : {} } };
  }
  function readKey() {
    try { return localStorage.getItem(storageKey) || document.querySelector('meta[name="google-books-api-key"]').content.trim(); }
    catch { return ''; }
  }
  function mount() {
    controller?.abort();
    if (location.hash !== '#collection' || document.getElementById('catalogue')) return;
    const section = document.createElement('section');
    section.id = 'catalogue';
    section.className = 'section';
    section.innerHTML = `<h2>Trouver un livre</h2>
      <p class="subtitle">Retrouvez un livre par son titre, son auteur ou son ISBN.</p>
      <p class="subtitle">Open Library : recherche sans clé API, éditions françaises privilégiées.</p><details><summary>Configurer Google Books (facultatif)</summary>
      <p class="subtitle">La clé est conservée dans ce navigateur. Dans Google Cloud, autorisez https://h1sb3r.github.io/* et limitez la clé à Books API.</p>
      <form id="books-config" class="toolbar"><input id="books-key" type="password" autocomplete="off" aria-label="Clé API Google Books" placeholder="Votre clé API"><button class="chip" type="submit">Enregistrer la clé</button><button class="chip" id="books-forget" type="button">Effacer la clé</button></form>
      <p id="books-config-status" role="status"></p></details>
      <form id="books-search" class="toolbar"><select id="catalogue-source" aria-label="Catalogue"><option value="openlibrary">Open Library</option><option value="google">Google Books</option></select><input id="books-query" type="search" required maxlength="300" aria-label="Rechercher un livre dans le catalogue" placeholder="Titre, auteur ou ISBN"><button class="chip" type="submit">Rechercher</button></form>
      <p id="books-status" role="status" aria-live="polite"></p><div id="books-results" class="books"></div>`;
    document.getElementById('app').append(section);
    const status = section.querySelector('#books-config-status');
    status.textContent = readKey() ? 'Une clé est configurée dans ce navigateur.' : 'Configurez votre clé pour utiliser la recherche.';
    section.querySelector('#books-config').onsubmit = event => {
      event.preventDefault();
      const input = section.querySelector('#books-key');
      if (!input.value.trim()) { status.textContent = 'Saisissez une clé API.'; return; }
      try { localStorage.setItem(storageKey, input.value.trim()); input.value = ''; status.textContent = 'Clé enregistrée dans ce navigateur.'; }
      catch { status.textContent = 'Le navigateur ne permet pas de conserver la clé.'; }
    };
    section.querySelector('#books-forget').onclick = () => {
      controller?.abort();
      try { localStorage.removeItem(storageKey); status.textContent = 'Clé locale effacée.'; }
      catch { status.textContent = 'Impossible d’accéder au stockage du navigateur.'; }
    };
    section.querySelector('#books-search').onsubmit = async event => {
      event.preventDefault();
      controller?.abort();
      const provider = section.querySelector('#catalogue-source').value;
      const providerName = provider === 'openlibrary' ? 'Open Library' : 'Google Books';
      const key = readKey();
      const message = section.querySelector('#books-status');
      const results = section.querySelector('#books-results');
      results.replaceChildren();
      if (provider === 'google' && !key) { message.textContent = 'Ouvrez « Configurer Google Books » pour enregistrer votre clé.'; return; }
      const query = section.querySelector('#books-query').value.trim();
      if (!query) return;
      const request = new AbortController();
      controller = request;
      const timeout = setTimeout(() => request.abort(), 15000);
      message.textContent = 'Recherche en cours…';
      try {
        const cacheKey = provider + ':' + query;
        let data = cache.get(cacheKey);
        if (!data) {
          if (provider === 'openlibrary' && Date.now() - lastRequest < 1000) throw new Error('Attendez une seconde avant de relancer la recherche.');
          const url = new URL(provider === 'openlibrary' ? 'https://openlibrary.org/search.json' : 'https://www.googleapis.com/books/v1/volumes');
          url.search = provider === 'openlibrary'
            ? new URLSearchParams({q: /^\d[\d -]{8,}$/.test(query) ? 'isbn:' + query.replace(/[ -]/g, '') : query, limit:'12', lang:'fr', fields:'key,title,author_name,first_publish_year,cover_i,first_sentence,editions,editions.key,editions.title,editions.cover_i,editions.publisher,editions.publish_date'})
            : new URLSearchParams({q:query,key,maxResults:'12',printType:'books'});
          if (provider === 'openlibrary') lastRequest = Date.now();
          const response = await fetch(url, {signal:request.signal});
          if (!response.ok) throw new Error(providerName + ' est indisponible (HTTP ' + response.status + '). Réessayez plus tard.');
          data = await response.json();
          if (!request.signal.aborted) { if(cache.size >= 30) cache.delete(cache.keys().next().value); cache.set(cacheKey,data); }
        }
        if (request.signal.aborted) return;
        const items = provider === 'openlibrary' ? (Array.isArray(data.docs) ? data.docs.map(normalizeOpenLibrary).filter(item => /^OL\d+[WM]$/.test(item.id)) : []) : (Array.isArray(data.items) ? data.items : []);
        message.textContent = items.length ? `${items.length} résultat(s) · métadonnées ${providerName}` : 'Aucun livre trouvé.';
        for (const item of items) {
          const info = item.volumeInfo || {};
          const article = document.createElement('article');
          article.className = 'catalogue-card';
          const jacket = document.createElement('div');
          jacket.className = 'catalogue-jacket';
          const fallback = document.createElement('span');
          fallback.className = 'catalogue-placeholder';
          fallback.textContent = 'Couverture indisponible';
          jacket.append(fallback);
          const source = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
          if (typeof source === 'string') {
            try {
              const imageUrl = new URL(source);
              if (['http:', 'https:'].includes(imageUrl.protocol) && (/(^|\.)google(?:usercontent)?\.com$/.test(imageUrl.hostname) || imageUrl.hostname === 'covers.openlibrary.org')) {
                imageUrl.protocol = 'https:';
                const image = document.createElement('img');
                image.alt = `Couverture de ${info.title || 'ce livre'}`;
                image.loading = 'lazy'; image.decoding = 'async';
                image.onload = () => { fallback.hidden = true; };
                image.onerror = () => { image.remove(); fallback.hidden = false; };
                image.src = imageUrl.href;
                jacket.append(image);
              }
            } catch {}
          }
          article.append(jacket);
          const title = document.createElement('h3');
          title.textContent = info.title || 'Sans titre';
          const author = document.createElement('p');
          author.textContent = Array.isArray(info.authors) ? info.authors.join(', ') : 'Auteur non indiqué';
          const meta = document.createElement('p');
          meta.className = 'catalogue-meta';
          meta.textContent = [info.publisher, typeof info.publishedDate === 'string' ? (provider === 'openlibrary' ? info.publishedDate : info.publishedDate.slice(0, 10)) : '', info.pageCount ? `${info.pageCount} pages` : ''].filter(Boolean).join(' · ');
          article.append(title, author, meta);
          const description = document.createElement('p');
          description.className = 'catalogue-description';
          // Parse catalogue HTML as an inert document; only plain text enters the page.
          const text = typeof info.description === 'string' ? new DOMParser().parseFromString(info.description, 'text/html').body.textContent.replace(/\s+/g, ' ').trim() : '';
          description.textContent = text ? text.slice(0, 220) + (text.length > 220 ? '…' : '') : 'Aucun résumé disponible pour cette édition.';
          article.append(description);
          if (typeof item.id === 'string') {
            const link = document.createElement('a');
            link.href = provider === 'openlibrary' ? 'https://openlibrary.org/' + (/M$/.test(item.id) ? 'books/' : 'works/') + item.id : `https://books.google.com/books?id=${encodeURIComponent(item.id)}`;
            link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'text-link';
            link.textContent = 'Voir la fiche et l’aperçu →'; article.append(link);
            const add = document.createElement('button');
            add.className = 'button catalogue-add';
            add.type = 'button';
            const feedback = document.createElement('p');
            feedback.setAttribute('role', 'status');
            function showAdded(book) {
              add.textContent = 'Dans ma bibliothèque'; add.disabled = true;
              const open = document.createElement('a');
              open.className = 'text-link'; open.href = `#livre/${book.id}`;
              open.textContent = 'Ouvrir ma fiche →'; feedback.replaceChildren(open);
            }
            const existing = window.exlibrisLibrary.find(item.id, item.source);
            if (existing) showAdded(existing);
            else add.textContent = 'Ajouter à ma bibliothèque';
            add.onclick = () => {
              try {
                const book = window.exlibrisLibrary.add(item);
                showAdded(book);
                message.textContent = `« ${book.title} » ajouté à votre bibliothèque · À lire. Conservé dans ce navigateur.`;
              } catch (error) { feedback.textContent = error.message; }
            };
            article.append(add, feedback);
          }
          results.append(article);
        }
      } catch (error) {
        if (controller !== request || !section.isConnected) return;
        message.textContent = error.name === 'AbortError' ? 'Recherche interrompue. Vous pouvez réessayer.' : error instanceof TypeError ? 'Connexion impossible. Vérifiez votre connexion et réessayez.' : error.message;
      } finally { clearTimeout(timeout); }
    };
  }
  new MutationObserver(mount).observe(document.getElementById('app'), { childList: true });
  window.addEventListener('hashchange', mount);
  mount();
})();
