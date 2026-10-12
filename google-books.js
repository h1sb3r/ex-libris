(() => {
  const storageKey = 'exlibris-google-books-key';
  let controller;
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
    section.innerHTML = `<h2>Rechercher dans Google Books</h2>
      <p class="subtitle">Retrouvez un livre par son titre, son auteur ou son ISBN.</p>
      <details><summary>Configurer Google Books</summary>
      <p class="subtitle">La clé est conservée dans ce navigateur. Dans Google Cloud, autorisez https://h1sb3r.github.io/* et limitez la clé à Books API.</p>
      <form id="books-config" class="toolbar"><input id="books-key" type="password" autocomplete="off" aria-label="Clé API Google Books" placeholder="Votre clé API"><button class="chip" type="submit">Enregistrer la clé</button><button class="chip" id="books-forget" type="button">Effacer la clé</button></form>
      <p id="books-config-status" role="status"></p></details>
      <form id="books-search" class="toolbar"><input id="books-query" type="search" required maxlength="300" aria-label="Rechercher dans Google Books" placeholder="Titre, auteur ou ISBN"><button class="chip" type="submit">Rechercher</button></form>
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
      const key = readKey();
      const message = section.querySelector('#books-status');
      const results = section.querySelector('#books-results');
      results.replaceChildren();
      if (!key) { message.textContent = 'Ouvrez « Configurer Google Books » pour enregistrer votre clé.'; return; }
      const query = section.querySelector('#books-query').value.trim();
      if (!query) return;
      const request = new AbortController();
      controller = request;
      const timeout = setTimeout(() => request.abort(), 15000);
      message.textContent = 'Recherche en cours…';
      try {
        const url = new URL('https://www.googleapis.com/books/v1/volumes');
        url.search = new URLSearchParams({ q: query, key, maxResults: '12', printType: 'books' });
        const response = await fetch(url, { signal: request.signal });
        if (!response.ok) {
          const failure = await response.json().catch(() => null);
          const reason = failure?.error?.details?.find(detail => typeof detail.reason === 'string')?.reason;
          const explanation = typeof failure?.error?.message === 'string' ? failure.error.message.replace(/AIza[\w-]+/g, '[clé masquée]').slice(0, 700) : 'Service indisponible. Réessayez plus tard.';
          throw new Error(`Google Books (HTTP ${response.status}${reason ? ', ' + reason : ''}) : ${explanation}`);
        }
        const data = await response.json();
        if (request.signal.aborted) return;
        const items = Array.isArray(data.items) ? data.items : [];
        message.textContent = items.length ? `${items.length} résultat(s) · métadonnées Google Books` : 'Aucun livre trouvé.';
        for (const item of items) {
          const info = item.volumeInfo || {};
          const article = document.createElement('article');
          article.className = 'note-card';
          const title = document.createElement('h3');
          title.textContent = info.title || 'Sans titre';
          const author = document.createElement('p');
          author.textContent = Array.isArray(info.authors) ? info.authors.join(', ') : 'Auteur non indiqué';
          const meta = document.createElement('p');
          meta.textContent = [info.publisher, info.publishedDate].filter(Boolean).join(' · ');
          article.append(title, author, meta);
          if (typeof item.id === 'string') {
            const link = document.createElement('a');
            link.href = `https://books.google.com/books?id=${encodeURIComponent(item.id)}`;
            link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'text-link';
            link.textContent = 'Voir dans Google Books →'; article.append(link);
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
