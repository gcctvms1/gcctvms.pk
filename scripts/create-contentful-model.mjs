#!/usr/bin/env node
// One-time setup: create (or update) the "Blog Post" content type in Contentful.
//
//   CONTENTFUL_SPACE_ID=xxxx CONTENTFUL_MANAGEMENT_TOKEN=CFPAT-xxxx node scripts/create-contentful-model.mjs
//
// The management token is a personal access token (Contentful > Settings > CMA tokens).
// Use it only for this setup; the daily build needs only the read-only Delivery token.

const space = process.env.CONTENTFUL_SPACE_ID;
const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
const envId = process.env.CONTENTFUL_ENVIRONMENT || 'master';
const typeId = process.env.CONTENT_TYPE_ID || 'blogPost';
if (!space || !token) { console.error('Set CONTENTFUL_SPACE_ID and CONTENTFUL_MANAGEMENT_TOKEN.'); process.exit(1); }

const fields = [
  { id: 'title', name: 'Title', type: 'Symbol', required: true, validations: [{ size: { max: 120 } }] },
  { id: 'slug', name: 'Slug', type: 'Symbol', required: true, validations: [{ unique: true }, { regexp: { pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }, message: 'Lowercase letters, numbers and hyphens only' }] },
  { id: 'seoTitle', name: 'SEO Title', type: 'Symbol', required: false, validations: [{ size: { max: 60 } }] },
  { id: 'metaDescription', name: 'Meta Description', type: 'Symbol', required: true, validations: [{ size: { max: 160 } }] },
  { id: 'excerpt', name: 'Excerpt', type: 'Text', required: false, validations: [{ size: { max: 300 } }] },
  { id: 'directAnswer', name: 'Direct Answer', type: 'Text', required: false, validations: [{ size: { max: 600 } }] },
  { id: 'featuredImage', name: 'Featured Image', type: 'Link', linkType: 'Asset', required: true, validations: [{ linkMimetypeGroup: ['image'] }] },
  { id: 'featuredImageAlt', name: 'Featured Image Alt Text', type: 'Symbol', required: false },
  { id: 'body', name: 'Body', type: 'RichText', required: true, validations: [] },
  { id: 'category', name: 'Category', type: 'Symbol', required: true, validations: [{ in: ['Security Insights', 'Guides', 'Home Security', 'Business Security', 'Company News'] }] },
  { id: 'tags', name: 'Tags', type: 'Array', items: { type: 'Symbol' }, required: false },
  { id: 'author', name: 'Author', type: 'Symbol', required: false },
  { id: 'publishDate', name: 'Publish Date', type: 'Date', required: true },
  { id: 'faqs', name: 'FAQs', type: 'Object', required: false },
];

const base = `https://api.contentful.com/spaces/${space}/environments/${envId}/content_types/${typeId}`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.contentful.management.v1+json' };

const existing = await fetch(base, { headers });
const version = existing.ok ? (await existing.json()).sys.version : undefined;
const put = await fetch(base, {
  method: 'PUT',
  headers: version ? { ...headers, 'X-Contentful-Version': String(version) } : headers,
  body: JSON.stringify({ name: 'Blog Post', displayField: 'title', description: 'GCCTVMS Pakistan blog article (gcctvms.pk/blog)', fields }),
});
if (!put.ok) { console.error(`Create failed: ${put.status} ${await put.text()}`); process.exit(1); }
const saved = await put.json();
const act = await fetch(`${base}/published`, { method: 'PUT', headers: { ...headers, 'X-Contentful-Version': String(saved.sys.version) } });
if (!act.ok) { console.error(`Activate failed: ${act.status} ${await act.text()}`); process.exit(1); }

// Friendlier editors: slug generated from the title, FAQs as JSON, date with time.
const ei = await fetch(`${base}/editor_interface`, { headers });
if (ei.ok) {
  const cur = await ei.json();
  const controls = [
    { fieldId: 'slug', widgetId: 'slugEditor', widgetNamespace: 'builtin' },
    { fieldId: 'publishDate', widgetId: 'datePicker', widgetNamespace: 'builtin', settings: { format: 'timeZ', ampm: '24' } },
    { fieldId: 'category', widgetId: 'dropdown', widgetNamespace: 'builtin' },
    { fieldId: 'tags', widgetId: 'tagEditor', widgetNamespace: 'builtin' },
    { fieldId: 'faqs', widgetId: 'objectEditor', widgetNamespace: 'builtin', settings: { helpText: 'Format: [{"question":"...","answer":"..."}]' } },
  ];
  await fetch(`${base}/editor_interface`, { method: 'PUT', headers: { ...headers, 'X-Contentful-Version': String(cur.sys.version) }, body: JSON.stringify({ controls }) });
}
console.log(`Content type "${typeId}" is ready in space ${space} (${envId}).`);
