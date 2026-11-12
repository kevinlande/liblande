/* LibLande: a publication's details, as BibTeX fields, for a DOI (from
 * Crossref, or DataCite for one Crossref doesn't have), an arXiv ID or
 * link (arXiv's DOI for it), or an ISBN (from Open Library). Used by
 * server.js (Add's lookup) and by LibLande for Word (adding a work found
 * online). liblandeLookup.lookupDoi(input) answers {type, fields, source},
 * or throws with why.
 */
(function (root) {
  'use strict';
  // Details for a DOI from Crossref, as BibTeX fields (as Code.gs's); a DOI
  // Crossref doesn't have (arXiv's, Zenodo's, a dataset's) from DataCite.
  // An arXiv ID or link counts as arXiv's DOI for it.
  const ARXIV_ID = /^(?:arxiv:\s*|https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\/)?(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?(?:\.pdf)?$/i;
  function doiOf(input) {
    const v = String(input || '').trim();
    const ax = ARXIV_ID.exec(v);
    if (ax) return '10.48550/arXiv.' + ax[1];
    return v.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  }
  // An ISBN (10 or 13 digits, its check digit right), from what was
  // typed or found in a PDF; '' if it isn't one.
  function isbnOf(input) {
    const s = String(input || '').trim();
    if (!/^(isbn(-1[03])?[:\s]*)?[\d][\d\s-]{8,16}[\dXx]$/i.test(s)) return '';
    const d = s.replace(/^isbn(-1[03])?/i, '').replace(/[^\dXx]/g, '').toUpperCase();
    if (d.length === 10) { let t = 0; for (let i = 0; i < 10; i++) t += (10 - i) * (d[i] === 'X' ? 10 : +d[i]); return t % 11 === 0 ? d : ''; }
    if (d.length === 13 && /^\d+$/.test(d)) { let t = 0; for (let i = 0; i < 13; i++) t += +d[i] * (i % 2 ? 3 : 1); return t % 10 === 0 ? d : ''; }
    return '';
  }
  // A book's details from Open Library, by its ISBN.
  async function lookupIsbn(isbn) {
    let res;
    try { res = await fetch('https://openlibrary.org/api/books?' + new URLSearchParams({ bibkeys: 'ISBN:' + isbn, format: 'json', jscmd: 'data' })); }
    catch (e) { throw new Error(navigator.onLine ? 'Open Library can\u2019t be reached just now. Try again, or fill in the details yourself.' : 'You\u2019re offline.'); }
    if (!res.ok) throw new Error('The ISBN lookup didn\u2019t work (Open Library error ' + res.status + '). Try again, or fill in the details yourself.');
    const b = (await res.json())['ISBN:' + isbn];
    if (!b) throw new Error('Open Library doesn\u2019t have a book with the ISBN ' + isbn + '. Fill in the details yourself.');
    // ("David Quammen" as BibTeX has it: Quammen, David.)
    const person = n => { const w = String(n || '').trim().split(/\s+/); return w.length > 1 ? w.pop() + ', ' + w.join(' ') : w[0] || ''; };
    const f = {
      title: (b.title || '') + (b.subtitle ? ': ' + b.subtitle : ''),
      author: (b.authors || []).map(a => person(a.name)).filter(Boolean).join(' and '),
      year: ((/\d{4}/.exec(b.publish_date || '') || [''])[0]),
      publisher: ((b.publishers || [])[0] || {}).name || '',
      address: ((b.publish_places || [])[0] || {}).name || '',
      isbn,
    };
    return { type: 'book', fields: tidyFields(f), source: 'Open Library' };
  }
  async function lookupDoi(input) {
    const isbn = isbnOf(input);
    if (isbn) return lookupIsbn(isbn);
    const doi = doiOf(input);
    if (!/^10\.\d{4,9}\/\S+$/.test(doi)) {
      throw new Error('That doesn\u2019t look like a DOI. A DOI starts with 10., like 10.1111/phpr.70141 (or give an arXiv ID, like 2301.01234).');
    }
    const path = doi.split('/').map(encodeURIComponent).join('/');
    const unreachable = who => new Error(navigator.onLine ? who + ' can\u2019t be reached just now. Try again, or fill in the details yourself.' : 'You\u2019re offline.');
    let res;
    // (arXiv's go straight to DataCite.)
    if (!/^10\.48550\//.test(doi)) {
      try { res = await fetch('https://api.crossref.org/works/' + path); } catch (e) { throw unreachable('Crossref'); }
      if (res.ok) return crossrefFields((await res.json()).message, doi);
      if (res.status !== 404) throw new Error('The DOI lookup didn\u2019t work (error ' + res.status + '). Try again, or fill in the details yourself.');
    }
    try { res = await fetch('https://api.datacite.org/dois/' + path); } catch (e) { throw unreachable('DataCite (where arXiv\u2019s DOIs are)'); }
    if (res.status === 404) throw new Error('Neither Crossref nor DataCite has a publication with that DOI.');
    if (!res.ok) throw new Error('The DOI lookup didn\u2019t work (DataCite error ' + res.status + '). Try again, or fill in the details yourself.');
    return dataciteFields((await res.json()).data.attributes, doi);
  }
  // (Crossref and others send some text with HTML's codes, as
  // "Philosophy &amp; Public Affairs": put back as the characters.)
  const unEntity = s => {
    if (!/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/i.test(s)) return s;
    const t = document.createElement('textarea');
    t.innerHTML = s;
    return t.value;
  };
  const tidyFields = f => { Object.keys(f).forEach(k => { f[k] = unEntity(String(f[k] || '')).replace(/[{}]/g, '').trim(); if (!f[k]) delete f[k]; }); return f; };
  // DataCite's record: a preprint (arXiv's) as @misc published by arXiv,
  // with its arXiv ID as the eprint.
  function dataciteFields(a, doi) {
    const titles = a.titles || [], main = titles.find(t => !t.titleType) || titles[0] || {}, sub = titles.find(t => t.titleType === 'Subtitle');
    const people = list => (list || []).map(p => p.familyName ? (p.givenName ? p.familyName + ', ' + p.givenName : p.familyName) : (p.name || ''))
      .filter(Boolean).join(' and ');
    const general = ((a.types || {}).resourceTypeGeneral || '').toLowerCase();
    const type = { journalarticle: 'article', book: 'book', bookchapter: 'incollection', conferencepaper: 'inproceedings', dissertation: 'phdthesis', report: 'techreport' }[general] || 'misc';
    const date = ((a.dates || []).find(d => /^(issued|available|submitted)$/i.test(d.dateType)) || {}).date || '';
    const m = /^\d{4}-(\d{2})/.exec(date);
    const publisher = typeof a.publisher === 'object' && a.publisher ? a.publisher.name : a.publisher;
    const abs = ((a.descriptions || []).find(d => d.descriptionType === 'Abstract') || {}).description || '';
    const arxiv = /^10\.48550\/arxiv\.(.+)$/i.exec(doi);
    const f = {
      title: (main.title || '') + (sub && sub.title ? ': ' + sub.title : ''),
      author: people(a.creators),
      year: a.publicationYear ? String(a.publicationYear) : date.slice(0, 4),
      month: m ? 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[+m[1] - 1] || '' : '',
      doi: a.doi || doi,
      url: arxiv ? 'https://arxiv.org/abs/' + arxiv[1] : a.url || '',
      publisher: publisher || '',
      abstract: abs.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    };
    if (arxiv) { f.eprint = arxiv[1]; f.archiveprefix = 'arXiv'; }
    if (type === 'article') f.journal = ((a.container || {}).title) || '';
    return { type, fields: tidyFields(f), source: 'DataCite' };
  }
  function crossrefFields(w, doi) {
    const types = { 'journal-article': 'article', 'book-chapter': 'incollection', 'book-section': 'incollection',
      'book-part': 'incollection', 'book': 'book', 'monograph': 'book', 'edited-book': 'book', 'reference-book': 'book',
      'proceedings-article': 'inproceedings', 'dissertation': 'phdthesis', 'report': 'techreport', 'posted-content': 'unpublished' };
    const type = types[w.type] || 'misc';
    const people = list => (list || []).map(p => p.family ? (p.given ? p.family + ', ' + p.given : p.family) : (p.name || ''))
      .filter(Boolean).join(' and ');
    const first = a => (a && a[0]) || '';
    const parts = (w['published-print'] || w['published-online'] || w.issued || w.created || {})['date-parts'];
    const f = {
      title: first(w.title) + (first(w.subtitle) ? ': ' + first(w.subtitle) : ''),
      author: people(w.author),
      year: parts && parts[0] && parts[0][0] ? String(parts[0][0]) : '',
      month: parts && parts[0] && parts[0][1] ? 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[parts[0][1] - 1] || '' : '',
      doi: w.DOI || doi,
      url: w.URL || '',
      publisher: w.publisher || '',
    };
    if (type === 'article') {
      f.journal = first(w['container-title']);
      f.volume = w.volume || '';
      f.number = w.issue || '';
      f.issn = first(w.ISSN);
    } else if (type === 'incollection' || type === 'inproceedings') {
      f.booktitle = first(w['container-title']);
      f.editor = people(w.editor);
    } else if (type === 'book') {
      if (!f.author) f.editor = people(w.editor);
      f.isbn = first(w.ISBN);
    }
    if (w.page) f.pages = String(w.page).replace(/-/g, '--');
    if (w.abstract) f.abstract = w.abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/^\s*Abstract\s*/i, '').trim();
    return { type, fields: tidyFields(f), source: 'Crossref' };
  }
  root.liblandeLookup = { lookupDoi };
})(self);
