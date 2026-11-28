# Blog setup (Contentful → gcctvms.pk/blog)

Posts are written in Contentful. Every day at **09:00 Pakistan time** a GitHub Action
(`.github/workflows/blog-and-deploy.yml`) runs `scripts/build-blog.mjs`, which turns every
post whose **Publish Date** has arrived into a static page under `gcctvms.pk/blog/`,
commits the result, and uploads the site to Hostinger over FTP.

To post daily, write posts ahead and give each one a future Publish Date. Each morning's
build publishes the ones that are due.

## Content model

### `blogPost` ("Blog Post")

| Name | Field ID | Type | Required | Used for |
|---|---|---|---|---|
| Title (entry title) | `title` | Short text | Yes | H1 on the post page |
| Slug | `slug` | Short text | Yes | URL: `/blog/<slug>/` (lowercase-with-hyphens, unique) |
| Card Title | `cardTitle` | Short text | No | Title on the blog listing card (falls back to Title) |
| Excerpt | `excerpt` | Short text | No | Summary on the listing card |
| Cover Image | `coverImage` | Media | Yes | Top of the post and the listing card (1200x675 works best) |
| Cover Image Alt Text | `coverImageAltText` | Short text | No | Image description for accessibility and SEO |
| Publish Date | `publishDate` | Date & time | Yes | Post goes live at the first daily build after this time |
| Author | `author` | Short text | No | Defaults to "GCCTVMS Editorial Team" |
| Category | `category` | Short text | No | Label above the title and on the card (defaults to "Security Insights") |
| Read Time | `readTime` | Integer | No | Minutes; calculated from the body when empty |
| Direct Answer | `directAnswer` | Long text | No | "Direct answer" box at the top of the post |
| Body | `body` | Rich text | Yes | The article (Heading 1 is shown as Heading 2) |
| CTA Heading | `ctaHeading` | Short text | No | Call-to-action box at the end (default: "Want your cameras watched live?") |
| CTA Text | `ctaText` | Short text | No | Text in that box |
| SEO Title | `seoTitle` | Short text | No | Browser tab and Google title, max 60 (default: Title + " \| GCCTVMS Pakistan") |
| Meta Description | `metaDescription` | Short text | No | Google snippet, max 160 (falls back to Excerpt) |
| Breadcrumb Label | `breadcrumbLabel` | Short text | No | Last breadcrumb item (falls back to Card Title, then Title) |
| FAQ Title | `faqTitle` | Short text | No | Heading of the FAQ block (default: "Frequently Asked Questions") |
| FAQs | `faqs` | References, many (FAQ) | No | FAQ block plus FAQ rich-result markup |

### `faq` ("FAQ")

| Name | Field ID | Type | Required |
|---|---|---|---|
| Question (entry title) | `question` | Short text | Yes |
| Answer | `answer` | Long text (Rich text also works) | Yes |

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
