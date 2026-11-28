#!/usr/bin/env node
// One-time setup: create (or update) the "FAQ" and "Blog Post" content types in Contentful.
//
//   CONTENTFUL_SPACE_ID=xxxx CONTENTFUL_MANAGEMENT_TOKEN=CFPAT-xxxx node scripts/create-contentful-model.mjs
//
// The management token is a personal access token (Contentful > Settings > CMA tokens).
// Use it only for this setup; the daily build needs only the read-only Delivery token.

const space = process.env.CONTENTFUL_SPACE_ID;
const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
const envId = process.env.CONTENTFUL_ENVIRONMENT || 'master';
const postTypeId = process.env.CONTENT_TYPE_ID || 'blogPost';
const faqTypeId = process.env.FAQ_TYPE_ID || 'faq';
if (!space || !token) { console.error('Set CONTENTFUL_SPACE_ID and CONTENTFUL_MANAGEMENT_TOKEN.'); process.exit(1); }

const api = `https://api.contentful.com/spaces/${space}/environments/${envId}/content_types`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.contentful.management.v1+json' };

async function upsertType(id, body, controls) {
  const url = `${api}/${id}`;
  const existing = await fetch(url, { headers });
  const version = existing.ok ? (await existing.json()).sys.version : undefined;
  const put = await fetch(url, { method: 'PUT', headers: version ? { ...headers, 'X-Contentful-Version': String(version) } : headers, body: JSON.stringify(body) });
  if (!put.ok) throw new Error(`${id}: save failed ${put.status} ${await put.text()}`);
  const saved = await put.json();
  const act = await fetch(`${url}/published`, { method: 'PUT', headers: { ...headers, 'X-Contentful-Version': String(saved.sys.version) } });
  if (!act.ok) throw new Error(`${id}: activate failed ${act.status} ${await act.text()}`);
  if (controls) {
    const ei = await fetch(`${url}/editor_interface`, { headers });
    if (ei.ok) {
      const cur = await ei.json();
      await fetch(`${url}/editor_interface`, { method: 'PUT', headers: { ...headers, 'X-Contentful-Version': String(cur.sys.version) }, body: JSON.stringify({ controls }) });
    }
  }
  console.log(`Content type "${id}" is ready.`);
}

// FAQ entries are linked from a post's "FAQs" field.
await upsertType(faqTypeId, {
  name: 'FAQ', displayField: 'question', description: 'One question and answer, linked from a Blog Post',
  fields: [
    { id: 'question', name: 'Question', type: 'Symbol', required: true },
    { id: 'answer', name: 'Answer', type: 'Text', required: true },
  ],
});

await upsertType(postTypeId, {
  name: 'Blog Post', displayField: 'title', description: 'GCCTVMS Pakistan blog article',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true },
    { id: 'slug', name: 'Slug', type: 'Symbol', required: true, validations: [{ unique: true }, { regexp: { pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }, message: 'Lowercase letters, numbers and hyphens only' }] },
    { id: 'cardTitle', name: 'Card Title', type: 'Symbol', required: false },
    { id: 'excerpt', name: 'Excerpt', type: 'Symbol', required: false },
    { id: 'coverImage', name: 'Cover Image', type: 'Link', linkType: 'Asset', required: true, validations: [{ linkMimetypeGroup: ['image'] }] },
    { id: 'coverImageAltText', name: 'Cover Image Alt Text', type: 'Symbol', required: false },
    { id: 'publishDate', name: 'Publish Date', type: 'Date', required: true },
    { id: 'author', name: 'Author', type: 'Symbol', required: false },
    { id: 'category', name: 'Category', type: 'Symbol', required: false },
    { id: 'readTime', name: 'Read Time', type: 'Integer', required: false, validations: [{ range: { min: 1, max: 60 } }] },
    { id: 'directAnswer', name: 'Direct Answer', type: 'Text', required: false },
    { id: 'body', name: 'Body', type: 'RichText', required: true },
    { id: 'ctaHeading', name: 'CTA Heading', type: 'Symbol', required: false },
    { id: 'ctaText', name: 'CTA Text', type: 'Symbol', required: false },
    { id: 'seoTitle', name: 'SEO Title', type: 'Symbol', required: false, validations: [{ size: { max: 60 } }] },
    { id: 'metaDescription', name: 'Meta Description', type: 'Symbol', required: false, validations: [{ size: { max: 160 } }] },
    { id: 'breadcrumbLabel', name: 'Breadcrumb Label', type: 'Symbol', required: false },
    { id: 'faqTitle', name: 'FAQ Title', type: 'Symbol', required: false },
    { id: 'faqs', name: 'FAQs', type: 'Array', required: false, items: { type: 'Link', linkType: 'Entry', validations: [{ linkContentType: [faqTypeId] }] } },
  ],
}, [
  { fieldId: 'slug', widgetId: 'slugEditor', widgetNamespace: 'builtin' },
  { fieldId: 'publishDate', widgetId: 'datePicker', widgetNamespace: 'builtin', settings: { format: 'timeZ', ampm: '24' } },
]);
