# Blog setup (Contentful → gcctvms.pk/blog)

Posts are written in Contentful. Every day at **09:00 Pakistan time** a GitHub Action
(`.github/workflows/blog-and-deploy.yml`) runs `scripts/build-blog.mjs`, which turns every
post whose **Publish Date** has arrived into a static page under `gcctvms.pk/blog/`,
commits the result, and uploads the site to Hostinger over FTP.

To post daily, write posts ahead and give each one a future Publish Date. Each morning's
build publishes the ones that are due.

## Content model: `blogPost` ("Blog Post")

| Field name | Field ID | Type | Required | Notes |
|---|---|---|---|---|
| Title | `title` | Short text | Yes | The H1 on the page. Max 120. |
| Slug | `slug` | Short text | Yes | URL: `/blog/<slug>/`. Unique, lowercase-with-hyphens. |
| SEO Title | `seoTitle` | Short text | No | Browser tab / Google title. Max 60. Defaults to "Title \| GCCTVMS Pakistan". |
| Meta Description | `metaDescription` | Short text | Yes | Google snippet. Max 160. |
| Excerpt | `excerpt` | Long text | No | Summary on the blog listing card. Falls back to Meta Description. |
| Direct Answer | `directAnswer` | Long text | No | "Direct answer" box at the top of the post (for AI answers / featured snippets). |
| Featured Image | `featuredImage` | Media (image) | Yes | Shown at the top of the post and on the card. 1200×675 works best. |
| Featured Image Alt Text | `featuredImageAlt` | Short text | No | Describes the image. Falls back to the image's description, then the title. |
| Body | `body` | Rich text | Yes | The article. Use Heading 2/3 for sections (Heading 1 is turned into Heading 2). |
| Category | `category` | Short text (dropdown) | Yes | Security Insights, Guides, Home Security, Business Security, Company News. |
| Tags | `tags` | Short text, list | No | Shown under the post and used as keywords. |
| Author | `author` | Short text | No | Defaults to "GCCTVMS Editorial Team". |
| Publish Date | `publishDate` | Date & time | Yes | The post goes live at the first daily build after this time. |
| FAQs | `faqs` | JSON object | No | `[{"question": "...", "answer": "..."}]`. Shown as an FAQ block with FAQ rich-result markup. |

The field IDs must match exactly. To create the model automatically:

```
CONTENTFUL_SPACE_ID=<space id> CONTENTFUL_MANAGEMENT_TOKEN=<CFPAT-...> node scripts/create-contentful-model.mjs
```

## GitHub settings (repo → Settings → Secrets and variables → Actions)

**Secrets**

| Name | Value |
|---|---|
| `CONTENTFUL_SPACE_ID` | Contentful → Settings → API keys |
| `CONTENTFUL_DELIVERY_TOKEN` | "Content Delivery API - access token" from the same API key |
| `FTP_SERVER` | Hostinger hPanel → Files → FTP Accounts (e.g. `ftp.gcctvmspk.com` or the IP shown) |
| `FTP_USERNAME` | FTP username from hPanel |
| `FTP_PASSWORD` | FTP password from hPanel |

**Variables** (optional)

| Name | Default | Use |
|---|---|---|
| `SITE_URL` | `https://gcctvms.pk` | Domain used in canonical links, sitemap and structured data. |
| `FTP_SERVER_DIR` | `public_html/` | Folder on Hostinger the site is uploaded into. |
| `FTP_PROTOCOL` | `ftp` | `ftps` if Hostinger requires it. |
| `CONTENTFUL_ENVIRONMENT` | `master` | Contentful environment. |

## Running it

- Daily: automatic at 04:00 UTC (09:00 PKT).
- Now: GitHub → Actions → "Build blog and deploy" → Run workflow.
- Any push to `main` also rebuilds and uploads the site.
- Optional instant publishing: add a Contentful webhook (Settings → Webhooks) on Entry publish/unpublish that POSTs to
  `https://api.github.com/repos/gcctvms1/gcctvms.pk/dispatches` with body `{"event_type":"contentful-publish"}`,
  header `Accept: application/vnd.github+json` and `Authorization: Bearer <GitHub token with repo access>`.

## Testing locally without Contentful

```
SITE_DIR=gcctvms.pk node scripts/build-blog.mjs --mock path/to/sample-response.json
```

Do not edit the `<!-- BLOG:LIST:START -->` / `<!-- BLOG:LIST:END -->` markers in `gcctvms.pk/blog/index.html`;
the build rewrites the post listing between them.
