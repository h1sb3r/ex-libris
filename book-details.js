(() => {
  const attached = new WeakSet();
  let nextRequest = 0;
  const plain = value => typeof value === 'string' ? new DOMParser().parseFromString(value, 'text/html').body.textContent.trim() : '';
  async function get(url) {
    const delay = Math.max(0, nextRequest - Date.now());
    nextRequest = Math.max(Date.now(), nextRequest) + 1000;
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    const response = await fetch(url, {signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(`Catalogue indisponible (HTTP ${response.status}).`);
    return response.json();
  }
  async function metadata(book) {
    if (book.source === 'openlibrary') {
      if (!/^OL\d+[WM]$/.test(book.googleId)) throw new Error('Identifiant Open Library invalide.');
      const edition = await get(`https://openlibrary.org/${book.googleId.endsWith('M')?'books':'works'}/${book.googleId}.json`);
      const workKey = edition.works?.[0]?.key;
      const work = /^\/works\/OL\d+W$/.test(workKey || '') ? await get(`https://openlibrary.org${workKey}.json`) : edition;
      const refs = edition.authors?.length ? edition.authors : work.authors;
      const names = [];
      for (const ref of (refs || []).slice(0, 4)) {
        const key = ref.key || ref.author?.key;
        if (/^\/authors\/OL\d+A$/.test(key || '')) names.push((await get(`https://openlibrary.org${key}.json`)).name);
      }
      const coverId = edition.covers?.find(id => id > 0) || work.covers?.find(id => id > 0);
      return {title:edition.title || work.title,author:names.filter(Boolean).join(', '),publishedDate:edition.publish_date || work.first_publish_date,
        publisher:edition.publishers?.join(', '),pageCount:edition.number_of_pages,isbn:edition.isbn_13?.[0] || edition.isbn_10?.[0],
        description:plain(edition.description?.value || edition.description || work.description?.value || work.description),
        jacket:coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false` : undefined};
    }
    if (!book.googleId) throw new Error('Cette fiche de démonstration n’est pas liée à un catalogue. Vous pouvez la modifier manuellement.');
    const key = localStorage.getItem('exlibris-google-books-key') || '';
    const url = new URL(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(book.googleId)}`);
    if (key) url.searchParams.set('key',key);
    const data = (await get(url)).volumeInfo || {};
    return {title:data.title,author:data.authors?.join(', '),publishedDate:data.publishedDate,publisher:data.publisher,pageCount:data.pageCount,
      description:plain(data.description),jacket:safeJacket(data.imageLinks?.thumbnail),isbn:data.industryIdentifiers?.find(id=>id.type==='ISBN_13')?.identifier};
  }
  function mount() {
    const root = document.querySelector('.detail');
    if (!root || attached.has(root)) return;
    attached.add(root);
    const book = books.find(b => location.hash === `#livre/${b.id}`);
    if (!book) return;
    const controls = document.createElement('section');
    controls.className = 'note-area book-controls';
    controls.innerHTML = `<div class="filters"><button class="chip" data-refresh>Actualiser les informations</button><button class="chip" data-edit>Modifier</button><button class="chip" data-delete>Supprimer</button></div><p role="status" data-feedback></p><form hidden data-editor>
      ${[['title','Titre'],['author','Auteur'],['publishedDate','Date de parution'],['publisher','Éditeur'],['genre','Genre'],['isbn','ISBN'],['pageCount','Nombre de pages']].map(([field,label])=>`<label>${label}<input name="${field}" value="${esc(book[field] || (field==='publishedDate'?book.year:''))}" ${field==='title'?'required':''}></label>`).join('')}
      <label>Statut<select name="status">${['À lire','En cours','Lu','Abandonné'].map(value=>`<option ${book.status===value?'selected':''}>${value}</option>`).join('')}</select></label>
      <label>Résumé<textarea name="description">${esc(book.description||'')}</textarea></label>
      <button class="button" type="submit">Enregistrer les modifications</button><button class="chip" type="button" data-cancel>Annuler</button></form>
      <div hidden data-confirm><p>Retirer ce livre et ses notes de votre bibliothèque ?</p><button class="chip" data-confirm-delete>Supprimer ce livre</button><button class="chip" data-keep>Conserver</button></div>`;
    root.children[1].prepend(controls);
    const feedback = controls.querySelector('[data-feedback]');
    const editor = controls.querySelector('[data-editor]');
    controls.querySelector('[data-edit]').onclick=()=>{editor.hidden=false;};
    controls.querySelector('[data-cancel]').onclick=()=>{editor.hidden=true;};
    function commit(patch) {
      const updated = {...book,...patch};
      window.exlibrisPersist(books.map(b=>b.id===book.id?updated:b));
      Object.assign(book,patch);
    }
    editor.onsubmit=event=>{
      event.preventDefault();
      try {
        const patch=Object.fromEntries(new FormData(editor));
        if(!patch.title.trim()) throw new Error('Saisissez un titre.');
        patch.year=patch.publishedDate.match(/\b\d{4}\b/)?.[0] || 'Non indiquée';
        patch.manualFields=[...new Set([...(book.manualFields||[]),...Object.keys(patch).filter(field=>String(patch[field])!==String(book[field]||''))])];
        patch.note=document.getElementById('note')?.value ?? book.note;
        commit(patch);render();
      } catch(error){feedback.textContent='Enregistrement impossible : '+error.message;}
    };
    controls.querySelector('[data-delete]').onclick=()=>{controls.querySelector('[data-confirm]').hidden=false;};
    controls.querySelector('[data-keep]').onclick=()=>{controls.querySelector('[data-confirm]').hidden=true;};
    controls.querySelector('[data-confirm-delete]').onclick=()=>{
      try {
        const state=JSON.parse(localStorage.getItem('exlibris-library-v2')||'{}');
        localStorage.setItem('exlibris-library-v2',JSON.stringify({...state,books:books.filter(b=>b.id!==book.id),trash:book}));
        books.splice(books.indexOf(book),1);location.hash='#collection';
      }catch{feedback.textContent='Stockage indisponible : le livre n’a pas été supprimé.';}
    };
    const refresh = controls.querySelector('[data-refresh]');
    async function update() {
      refresh.disabled=true;feedback.textContent='Actualisation du catalogue…';
      try {
        const incoming=await metadata(book);
        if(!root.isConnected || !books.includes(book))return;
        const patch={};
        for(const [field,value] of Object.entries(incoming))if(value!==undefined&&value!==''&&!(book.manualFields||[]).includes(field))patch[field]=value;
        patch.metadataUpdatedAt=Date.now();
        if(patch.publishedDate && !(book.manualFields||[]).includes('year'))patch.year=String(patch.publishedDate).match(/\b\d{4}\b/)?.[0] || book.year;
        patch.note=document.getElementById('note')?.value ?? book.note;
        commit(patch);
        if(editor.hidden)render();
        else feedback.textContent='Informations actualisées. Vous pouvez terminer vos modifications.';
      }catch(error){if(root.isConnected)feedback.textContent=error.message.replace(/AIza[\w-]+/g,'[clé masquée]')+' Vos informations sont conservées.';}
      finally{refresh.disabled=false;}
    }
    refresh.onclick=update;
    if(book.googleId && !book.metadataUpdatedAt)update();
    else feedback.textContent=book.metadataUpdatedAt?'Informations du catalogue actualisées. Vos corrections manuelles et vos notes sont conservées.':'Vous pouvez modifier cette fiche manuellement.';
  }
  function undo() {
    const state=JSON.parse(localStorage.getItem('exlibris-library-v2')||'{}');
    if(!state.trash || document.querySelector('[data-restore]') || location.hash!=='#collection')return;
    const button=document.createElement('button');button.className='chip';button.dataset.restore='';button.textContent='Annuler la dernière suppression';
    button.onclick=()=>{try{const restored=state.trash;const list=books.some(b=>b.id===restored.id)?books:[...books,restored];localStorage.setItem('exlibris-library-v2',JSON.stringify({...state,books:list,trash:null}));books.splice(0,books.length,...list);render();}catch{button.textContent='Restauration impossible : stockage indisponible.';}};
    document.getElementById('app').prepend(button);
  }
  new MutationObserver(()=>{mount();try{undo();}catch{}}).observe(document.getElementById('app'),{childList:true});
  mount();try{undo();}catch{}
})();

