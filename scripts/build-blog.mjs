#!/usr/bin/env node
// Build the GCCTVMS Pakistan blog from Contentful.
//
// Reads every published "blogPost" entry whose publishDate has arrived, then writes:
//   <SITE_DIR>/blog/index.html            listing (first page)
//   <SITE_DIR>/blog/page/<n>/index.html   further listing pages
//   <SITE_DIR>/blog/<slug>/index.html     one page per post
//   <SITE_DIR>/sitemap.xml                site pages + posts
//   <SITE_DIR>/blog/posts.json            manifest (used to remove deleted posts)
//
// The page header, footer and styles come from <SITE_DIR>/blog/index.html itself, so the
// blog always matches the rest of the site. Only the region between
// <!-- BLOG:LIST:START --> and <!-- BLOG:LIST:END --> is rewritten there.
//
// Environment:
//   CONTENTFUL_SPACE_ID        required (unless --mock)
//   CONTENTFUL_DELIVERY_TOKEN  required (unless --mock) - Content Delivery API token
//   CONTENTFUL_ENVIRONMENT     default "master"
//   CONTENT_TYPE_ID            default "blogPost"
//   SITE_DIR                   default "." (folder that holds index.html and blog/)
//   SITE_URL                   default "https://gcctvms.pk"
//   POSTS_PER_PAGE             default 12
//   NOINDEX_BELOW              keep the blog index out of search until this many posts are live (default 3)
//
// Test without Contentful:  node scripts/build-blog.mjs --mock path/to/sample.json

import fs from 'node:fs';
import path from 'node:path';

const env = process.env;
const SITE_DIR = path.resolve(env.SITE_DIR || '.');
const SITE_URL = (env.SITE_URL || 'https://gcctvms.pk').replace(/\/$/, '');
const CONTENT_TYPE = env.CONTENT_TYPE_ID || 'blogPost';
const PER_PAGE = Number(env.POSTS_PER_PAGE || 12);
const NOINDEX_BELOW = Number(env.NOINDEX_BELOW || 3);
const TZ = 'Asia/Karachi';
const DEFAULT_AUTHOR = 'GCCTVMS Editorial Team';
const mockIdx = process.argv.indexOf('--mock');
const MOCK = mockIdx > -1 ? process.argv[mockIdx + 1] : null;

const BLOG_DIR = path.join(SITE_DIR, 'blog');
const TEMPLATE_FILE = path.join(BLOG_DIR, 'index.html');
const MANIFEST = path.join(BLOG_DIR, 'posts.json');

// ---------- helpers ----------
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
const fail = msg => { console.error('build-blog: ' + msg); process.exit(1); };
const imgUrl = (url, w) => url ? `${url.startsWith('//') ? 'https:' + url : url}?w=${w}&fm=webp&q=80` : '';
const fmtDate = iso => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(iso));
const isoPk = iso => {
  // ISO 8601 in Pakistan time (+05:00), e.g. 2026-11-28T09:00:00+05:00
  const d = new Date(new Date(iso).getTime() + 5 * 3600e3);
  return d.toISOString().replace(/\.\d{3}Z$/, '+05:00');
};

// ---------- Contentful ----------
async function fetchAll() {
  if (MOCK) return JSON.parse(fs.readFileSync(MOCK, 'utf8'));
  const space = env.CONTENTFUL_SPACE_ID, token = env.CONTENTFUL_DELIVERY_TOKEN;
  if (!space || !token) fail('CONTENTFUL_SPACE_ID and CONTENTFUL_DELIVERY_TOKEN must be set.');
  const envId = env.CONTENTFUL_ENVIRONMENT || 'master';
  const out = { items: [], includes: { Asset: [], Entry: [] } };
  for (let skip = 0; ; skip += 100) {
    const q = new URLSearchParams({
      content_type: CONTENT_TYPE, include: '2', limit: '100', skip: String(skip),
      order: '-fields.publishDate', 'fields.publishDate[lte]': new Date().toISOString(),
    });
    const res = await fetch(`https://cdn.contentful.com/spaces/${space}/environments/${envId}/entries?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) fail(`Contentful returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const page = await res.json();
    out.items.push(...page.items);
    out.includes.Asset.push(...(page.includes?.Asset || []));
    out.includes.Entry.push(...(page.includes?.Entry || []));
    if (skip + 100 >= page.total) break;
  }
  return out;
}

// ---------- rich text -> HTML ----------
function makeRenderer(assets, entries) {
  const assetUrl = id => assets.get(id)?.fields?.file?.url;
  const markWrap = (text, marks = []) => marks.reduce((t, m) => ({
    bold: `<strong>${t}</strong>`, italic: `<em>${t}</em>`, underline: `<u>${t}</u>`, code: `<code>${t}</code>`,
    superscript: `<sup>${t}</sup>`, subscript: `<sub>${t}</sub>`, strikethrough: `<s>${t}</s>`,
  })[m.type] ?? t, text);
  const isExternal = uri => /^https?:\/\//i.test(uri) && !uri.startsWith(SITE_URL);
  const kids = n => (n.content || []).map(render).join('');
  function render(n) {
    switch (n.nodeType) {
      case 'document': return kids(n);
      case 'text': return markWrap(esc(n.value).replace(/\n/g, '<br>'), n.marks);
      case 'paragraph': { const h = kids(n); return h.trim() ? `<p>${h}</p>` : ''; }
      case 'heading-1': case 'heading-2': return `<h2>${kids(n)}</h2>`; // the post title is the only H1
      case 'heading-3': return `<h3>${kids(n)}</h3>`;
      case 'heading-4': return `<h4>${kids(n)}</h4>`;
      case 'heading-5': case 'heading-6': return `<h5>${kids(n)}</h5>`;
      case 'unordered-list': return `<ul>${kids(n)}</ul>`;
      case 'ordered-list': return `<ol>${kids(n)}</ol>`;
      case 'list-item': return `<li>${kids(n).replace(/^<p>([\s\S]*)<\/p>$/, '$1')}</li>`;
      case 'blockquote': return `<blockquote>${kids(n)}</blockquote>`;
      case 'hr': return '<hr>';
      case 'table': return `<div class="table-wrap"><table>${kids(n)}</table></div>`;
      case 'table-row': return `<tr>${kids(n)}</tr>`;
      case 'table-header-cell': return `<th>${kids(n).replace(/^<p>([\s\S]*)<\/p>$/, '$1')}</th>`;
      case 'table-cell': return `<td>${kids(n).replace(/^<p>([\s\S]*)<\/p>$/, '$1')}</td>`;
      case 'hyperlink': {
        const uri = n.data?.uri || '#';
        return `<a href="${esc(uri)}"${isExternal(uri) ? ' target="_blank" rel="noopener"' : ''}>${kids(n)}</a>`;
      }
      case 'entry-hyperlink': {
        const slug = entries.get(n.data?.target?.sys?.id)?.fields?.slug;
        return slug ? `<a href="/blog/${esc(slug)}/">${kids(n)}</a>` : kids(n);
      }
      case 'asset-hyperlink': {
        const url = assetUrl(n.data?.target?.sys?.id);
        return url ? `<a href="${esc(url.startsWith('//') ? 'https:' + url : url)}" target="_blank" rel="noopener">${kids(n)}</a>` : kids(n);
      }
      case 'embedded-asset-block': {
        const a = assets.get(n.data?.target?.sys?.id);
        const f = a?.fields?.file;
        if (!f?.url || !String(f.contentType || '').startsWith('image/')) return '';
        const { width, height } = f.details?.image || {};
        const alt = a.fields.description || a.fields.title || '';
        return `<figure><img src="${esc(imgUrl(f.url, 1100))}" alt="${esc(alt)}"${width ? ` width="${Math.min(width, 1100)}" height="${Math.round(height * Math.min(width, 1100) / width)}"` : ''} loading="lazy" decoding="async">${a.fields.title && a.fields.description ? `<figcaption>${esc(a.fields.description)}</figcaption>` : ''}</figure>`;
      }
      default: return kids(n); // embedded entries and unknown nodes: keep any text inside
    }
  }
  const text = n => n.nodeType === 'text' ? n.value : (n.content || []).map(text).join(' ');
  return { html: doc => doc ? render(doc) : '', text: doc => doc ? text(doc) : '' };
}

// ---------- normalise entries ----------
function normalise(data) {
  const assets = new Map((data.includes?.Asset || []).map(a => [a.sys.id, a]));
  const entries = new Map([...(data.includes?.Entry || []), ...data.items].map(e => [e.sys.id, e]));
  const rt = makeRenderer(assets, entries);
  const now = Date.now();
  const seen = new Set();
  const posts = [];
  const str = v => (typeof v === 'string' ? v.trim() : '');
  // FAQs: "References, many" to FAQ entries (question + answer). The answer may be Long text or Rich text.
  const readFaqs = list => (Array.isArray(list) ? list : []).map(item => {
    const q = item?.sys?.type === 'Link' ? entries.get(item.sys.id)?.fields : (item?.fields || item);
    if (!q) return null;
    const question = str(q.question || q.title);
    const a = q.answer ?? q.body;
    if (!question || !a) return null;
    if (typeof a === 'object' && a.nodeType) {
      const html = rt.html(a);
      return html.trim() ? { question, answerHtml: html, answerText: rt.text(a).replace(/\s+/g, ' ').trim() } : null;
    }
    const text = String(a).trim();
    return text ? { question, answerHtml: text.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join(''), answerText: text } : null;
  }).filter(Boolean);

  for (const e of data.items) {
    const f = e.fields || {};
    const title = str(f.title);
    const slug = slugify(f.slug || title);
    if (!title || !slug || !f.publishDate || !f.body) { console.warn(`skip ${e.sys.id}: missing title, slug, publishDate or body`); continue; }
    if (new Date(f.publishDate).getTime() > now) continue;
    if (seen.has(slug)) { console.warn(`skip ${e.sys.id}: duplicate slug "${slug}"`); continue; }
    seen.add(slug);
    const img = assets.get((f.coverImage || f.featuredImage)?.sys?.id);
    const words = rt.text(f.body).split(/\s+/).filter(Boolean).length;
    const readTime = Number.isInteger(f.readTime) && f.readTime > 0 ? f.readTime : Math.max(1, Math.round(words / 200));
    posts.push({
      id: e.sys.id, slug, title,
      cardTitle: str(f.cardTitle) || title,
      breadcrumbLabel: str(f.breadcrumbLabel) || str(f.cardTitle) || title,
      seoTitle: str(f.seoTitle) || `${title} | GCCTVMS Pakistan`,
      metaDescription: str(f.metaDescription) || str(f.excerpt),
      excerpt: str(f.excerpt) || str(f.metaDescription),
      directAnswer: str(f.directAnswer),
      bodyHtml: rt.html(f.body),
      image: img?.fields?.file?.url || '',
      imageW: img?.fields?.file?.details?.image?.width, imageH: img?.fields?.file?.details?.image?.height,
      imageAlt: str(f.coverImageAltText) || str(f.coverImageAlt) || str(f.featuredImageAlt) || img?.fields?.description || title,
      category: str(f.category) || 'Security Insights',
      tags: Array.isArray(f.tags) ? f.tags.filter(Boolean) : [],
      author: str(f.author) || DEFAULT_AUTHOR,
      publishDate: f.publishDate,
      updatedAt: e.sys.updatedAt || f.publishDate,
      readMins: readTime,
      ctaHeading: str(f.ctaHeading) || 'Want your cameras watched live?',
      ctaText: str(f.ctaText) || 'Schedule a call and tell us about your property and cameras.',
      faqTitle: str(f.faqTitle) || 'Frequently Asked Questions',
      faqs: readFaqs(f.faqs),
    });
  }
  posts.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
  return posts;
}

// ---------- page templating ----------
const LIST_RE = /<!-- BLOG:LIST:START -->[\s\S]*?<!-- BLOG:LIST:END -->/;

function setHead(html, { title, desc, url, image, type = 'website', noindex = false, ld }) {
  let h = html;
  h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  h = h.replace(/<meta name="description"\s+content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
  h = h.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${esc(url)}">`);
  h = h.replace(/\s*<meta name="robots" content="[^"]*">/, '');
  if (noindex) h = h.replace(/(<link rel="canonical" href="[^"]*">)/, '$1\n    <meta name="robots" content="noindex, follow">');
  h = h.replace(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${type}">`);
  h = h.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`);
  h = h.replace(/<meta property="og:description"\s+content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
  h = h.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${esc(url)}">`);
  if (image) h = h.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(image)}">`);
  if (ld) h = h.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2).replace(/</g, '\\u003c')}\n    </script>`);
  return h;
}
// The template lives at /blog/; pages deeper down need longer relative paths to /assets/.
const rebase = (html, depth) => html.replace(/(href|src)="\.\.\/assets\//g, `$1="${'../'.repeat(depth)}assets/`);
const setMain = (html, main) => html.replace(/<main id="main">[\s\S]*?<\/main>/, `<main id="main">\n${main}\n    </main>`);

const org = { '@type': 'Organization', '@id': SITE_URL + '/#organization', name: 'Global CCTV Monitoring Services (GCCTVMS)', url: SITE_URL, logo: SITE_URL + '/assets/img/logo.png', sameAs: ['https://gcctvms.com'] };
const crumbs = items => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) });

function card(p, level = 2) {
  const href = `/blog/${p.slug}/`;
  return `                    <article class="post reveal">
                        <a href="${href}" class="post__img" tabindex="-1" aria-hidden="true">${p.image ? `<img src="${esc(imgUrl(p.image, 640))}" alt="" loading="lazy" decoding="async" width="640" height="360">` : ''}</a>
                        <div class="post__body">
                            <span class="post__cat">${esc(p.category)}</span>
                            <h${level} class="post__title"><a href="${href}">${esc(p.cardTitle)}</a></h${level}>
                            ${p.excerpt ? `<p class="post__excerpt">${esc(p.excerpt)}</p>` : ''}
                            <div class="post__meta"><time datetime="${isoPk(p.publishDate)}">${fmtDate(p.publishDate)}</time> &middot; ${p.readMins} min read</div>
                            <a class="post__more" href="${href}">Read More &raquo;</a>
                        </div>
                    </article>`;
}

function listRegion(pagePosts, page, pages) {
  if (!pagePosts.length) {
    return `<!-- BLOG:LIST:START -->
                <div class="empty-state reveal">
                    <span class="empty-state__icon"><svg class="ic"><use href="#i-grid" /></svg></span>
                    <p class="empty-state__title">No articles are published yet.</p>
                    <p>In the meantime, read about our <a href="/services/">services</a> or see the <a href="/faqs/">FAQs</a>.</p>
                    <div class="cta__actions">
                        <a class="btn btn--primary" href="/services/">Services</a>
                        <a class="btn btn--ghost" href="/faqs/">FAQs</a>
                    </div>
                </div>
                <!-- BLOG:LIST:END -->`;
  }
  const pageHref = n => n === 1 ? '/blog/' : `/blog/page/${n}/`;
  const nav = pages > 1 ? `
                <nav class="pager" aria-label="Blog pages">
                    ${page > 1 ? `<a class="pager__btn" href="${pageHref(page - 1)}" rel="prev">&laquo; Newer</a>` : ''}
                    ${Array.from({ length: pages }, (_, i) => i + 1).map(n => n === page ? `<span class="pager__num is-current" aria-current="page">${n}</span>` : `<a class="pager__num" href="${pageHref(n)}">${n}</a>`).join('')}
                    ${page < pages ? `<a class="pager__btn" href="${pageHref(page + 1)}" rel="next">Older &raquo;</a>` : ''}
                </nav>` : '';
  return `<!-- BLOG:LIST:START -->
                <div class="posts posts--blog">
${pagePosts.map(p => card(p, 2)).join('\n')}
                </div>${nav}
                <!-- BLOG:LIST:END -->`;
}

function postMain(p, related) {
  const faqHtml = p.faqs.length ? `
                    <section class="post-faq" aria-labelledby="faq-title">
                        <h2 id="faq-title">${esc(p.faqTitle)}</h2>
                        <div class="accordion">
${p.faqs.map((q, i) => `                            <details${i === 0 ? ' open' : ''}><summary>${esc(q.question)}</summary><div class="faq-answer">${q.answerHtml}</div></details>`).join('\n')}
                        </div>
                    </section>` : '';
  const tags = p.tags.length ? `
                    <ul class="post-tags" aria-label="Tags">${p.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
  const rel = related.length ? `
        <section class="section related">
            <div class="container">
                <div class="section-head reveal"><span class="eyebrow eyebrow--center">Keep Reading</span><h2>More from the blog</h2></div>
                <div class="posts">
${related.map(r => card(r, 3)).join('\n')}
                </div>
            </div>
        </section>` : '';
  return `
        <section class="page-hero page-hero--post">
            <div class="container">
                <nav class="crumbs" aria-label="Breadcrumb">
                    <a href="/">Home</a><span aria-hidden="true">/</span><a href="/blog/">Blog</a><span aria-hidden="true">/</span><span aria-current="page">${esc(p.breadcrumbLabel)}</span>
                </nav>
                <span class="hero__kicker"><span class="live-dot"></span>${esc(p.category)}</span>
                <h1>${esc(p.title)}</h1>
                <p class="post-meta"><time datetime="${isoPk(p.publishDate)}">${fmtDate(p.publishDate)}</time> &middot; By ${esc(p.author)} &middot; ${p.readMins} min read</p>
            </div>
        </section>

        <section class="section article-section">
            <div class="container">
                <article class="article">
                    ${p.image ? `<img class="feature-img" src="${esc(imgUrl(p.image, 1200))}" alt="${esc(p.imageAlt)}" width="1200" height="${p.imageW ? Math.round(1200 * p.imageH / p.imageW) : 675}" fetchpriority="high" decoding="async">` : ''}
                    ${p.directAnswer ? `<div class="answer-box"><p><strong>Direct answer:</strong> ${esc(p.directAnswer)}</p></div>` : ''}
                    <div class="article__body">
${p.bodyHtml}
                    </div>${faqHtml}${tags}
                    <div class="article-cta">
                        <p class="article-cta__title">${esc(p.ctaHeading)}</p>
                        <p>${esc(p.ctaText)}</p>
                        <a class="btn btn--primary" href="https://cal.com/mudassirali/30min" target="_blank" rel="noopener"><svg class="ic"><use href="#i-cal" /></svg>Schedule a Call</a>
                    </div>
                </article>
            </div>
        </section>${rel}
`;
}

// ---------- sitemap ----------
function sitemap(posts) {
  const staticPaths = [];
  const walk = (dir, rel) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        if (['assets', 'node_modules', '.git', 'blog'].includes(name)) continue;
        walk(full, rel + name + '/');
      } else if (name === 'index.html') staticPaths.push(rel);
    }
  };
  walk(SITE_DIR, '/');
  const urls = [
    ...staticPaths.sort().map(p => ({ loc: SITE_URL + p })),
    { loc: SITE_URL + '/blog/', lastmod: posts[0] ? posts[0].updatedAt.slice(0, 10) : undefined },
    ...posts.map(p => ({ loc: `${SITE_URL}/blog/${p.slug}/`, lastmod: p.updatedAt.slice(0, 10) })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
}

// ---------- main ----------
const writeFile = (file, content) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };

(async () => {
  if (!fs.existsSync(TEMPLATE_FILE)) fail(`template not found: ${TEMPLATE_FILE}`);
  let template = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  if (!LIST_RE.test(template)) fail('blog/index.html is missing the <!-- BLOG:LIST:START --> / <!-- BLOG:LIST:END --> markers.');

  const posts = normalise(await fetchAll());
  console.log(`build-blog: ${posts.length} published post(s)`);

  // Remove pages for posts that were deleted or unpublished in Contentful.
  const previous = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { slugs: [], pages: 1 };
  const current = new Set(posts.map(p => p.slug));
  for (const slug of previous.slugs || []) {
    if (!current.has(slug) && slugify(slug) === slug && slug) {
      fs.rmSync(path.join(BLOG_DIR, slug), { recursive: true, force: true });
      console.log(`build-blog: removed /blog/${slug}/`);
    }
  }
  fs.rmSync(path.join(BLOG_DIR, 'page'), { recursive: true, force: true });

  // Listing pages
  const pages = Math.max(1, Math.ceil(posts.length / PER_PAGE));
  const noindex = posts.length < NOINDEX_BELOW;
  for (let page = 1; page <= pages; page++) {
    const slice = posts.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    const url = page === 1 ? `${SITE_URL}/blog/` : `${SITE_URL}/blog/page/${page}/`;
    let html = template.replace(LIST_RE, listRegion(slice, page, pages));
    html = setHead(html, {
      title: page === 1 ? 'Blog | GCCTVMS Pakistan' : `Blog, page ${page} | GCCTVMS Pakistan`,
      desc: 'Guides from GCCTVMS on CCTV monitoring, virtual guarding and keeping homes and businesses in Pakistan safer with the cameras you already have.',
      url, noindex,
      ld: { '@context': 'https://schema.org', '@graph': [
        { '@type': 'Blog', '@id': SITE_URL + '/blog/#blog', name: 'GCCTVMS Pakistan Blog', url: SITE_URL + '/blog/', publisher: { '@id': org['@id'] },
          blogPost: slice.map(p => ({ '@type': 'BlogPosting', headline: p.title, url: `${SITE_URL}/blog/${p.slug}/`, datePublished: isoPk(p.publishDate) })) },
        org, crumbs([['Home', SITE_URL + '/'], ['Blog', SITE_URL + '/blog/']])] },
    });
    if (page === 1) writeFile(TEMPLATE_FILE, html);
    else writeFile(path.join(BLOG_DIR, 'page', String(page), 'index.html'), rebase(html, 3));
  }
  template = fs.readFileSync(TEMPLATE_FILE, 'utf8');

  // Post pages
  for (const p of posts) {
    const url = `${SITE_URL}/blog/${p.slug}/`;
    const related = posts.filter(r => r.slug !== p.slug && r.category === p.category).concat(posts.filter(r => r.slug !== p.slug && r.category !== p.category)).slice(0, 3);
    const image = p.image ? imgUrl(p.image, 1200) : '';
    const graph = [
      { '@type': 'BlogPosting', '@id': url + '#article', headline: p.title, description: p.metaDescription, image: image || undefined,
        datePublished: isoPk(p.publishDate), dateModified: p.updatedAt, author: { '@type': 'Person', name: p.author },
        publisher: { '@id': org['@id'] }, mainEntityOfPage: url, inLanguage: 'en-PK', keywords: p.tags.length ? p.tags.join(', ') : undefined },
      org,
      crumbs([['Home', SITE_URL + '/'], ['Blog', SITE_URL + '/blog/'], [p.breadcrumbLabel, url]]),
    ];
    if (p.faqs.length) graph.push({ '@type': 'FAQPage', '@id': url + '#faq', mainEntity: p.faqs.map(q => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answerText } })) });
    let html = setMain(template, postMain(p, related));
    html = setHead(html, { title: p.seoTitle, desc: p.metaDescription, url, image, type: 'article', noindex: false, ld: { '@context': 'https://schema.org', '@graph': graph } });
    writeFile(path.join(BLOG_DIR, p.slug, 'index.html'), rebase(html, 2));
  }

  writeFile(MANIFEST, JSON.stringify({ slugs: posts.map(p => p.slug), pages }, null, 2) + '\n');
  writeFile(path.join(SITE_DIR, 'sitemap.xml'), sitemap(posts));
  console.log(`build-blog: wrote ${pages} listing page(s), ${posts.length} post page(s) and sitemap.xml`);
})().catch(e => fail(e.stack || String(e)));
