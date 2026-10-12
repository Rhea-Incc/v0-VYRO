import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  useCreateAdminCategory, useCreateAdminProduct, useGetAdminProduct, useGetAdminSession,
  useGetAdminSummary, useGetProductBySlug, useListAdminCategories, useListAdminProducts,
  useListCategories, useListProducts, useUpdateAdminCategory, useUpdateAdminProduct,
  getGetAdminProductQueryKey, getGetAdminSessionQueryKey, getGetAdminSummaryQueryKey,
  getGetProductBySlugQueryKey, getListAdminCategoriesQueryKey, getListAdminProductsQueryKey,
  getListCategoriesQueryKey, getListProductsQueryKey,
} from '@workspace/api-client-react';
import type { Category, CategoryInput, Product, ProductInput, ProductStatus } from '@workspace/api-client-react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, Menu, Search, X } from 'lucide-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import './index.css';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const assetUrl = (path: string) => `${basePath}${path.startsWith('/') ? path : `/${path}`}`;

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const appearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#FF6A00', colorForeground: '#20262B', colorMutedForeground: '#60686D', colorDanger: '#B42318',
    colorBackground: '#F5F3EC', colorInput: '#FFFFFF', colorInputForeground: '#20262B', colorNeutral: '#DDDCD5',
    fontFamily: 'DM Sans, sans-serif', borderRadius: '2px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#f4f1e9] rounded-none w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#20262B] font-bold', headerSubtitle: 'text-[#60686D]',
    socialButtonsBlockButtonText: 'text-[#20262B]', formFieldLabel: 'text-[#20262B]',
    footerActionLink: 'text-[#FF6A00]', footerActionText: 'text-[#60686D]', dividerText: 'text-[#60686D]',
    identityPreviewEditButton: 'text-[#FF6A00]', formFieldSuccessText: 'text-[#237A50]', alertText: 'text-[#20262B]',
    logoBox: 'mb-4', logoImage: 'max-h-10', socialButtonsBlockButton: 'border-[#DDDCD5] bg-white',
    formButtonPrimary: 'bg-[#FF6A00] hover:bg-[#E85F00] text-white rounded-none',
    formFieldInput: 'border-[#DDDCD5] bg-white text-[#20262B] rounded-none',
    footerAction: 'text-[#60686D]', dividerLine: 'bg-[#DDDCD5]', alert: 'bg-[#F5F3EC]',
    otpCodeFieldInput: 'border-[#DDDCD5] bg-white', formFieldRow: 'text-[#20262B]', main: 'text-[#20262B]',
  },
};

const money = (minor?: number | null, currency = 'USD') => typeof minor === 'number'
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100)
  : 'Price on request';
const imgPath = (path?: string | null) => path
  ? assetUrl(path.startsWith('/assets/') ? path : `/assets/${path.replace(/^\/+/, '')}`)
  : null;
const productImage = (product?: Product) => product?.images?.slice().sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)[0];
const productPrice = (product?: Product) => product?.variants?.[0];

function PageMeta({ title, description, noindex = false }: { title: string; description: string; noindex?: boolean }) {
  useEffect(() => {
    document.title = title;
    let descriptionTag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!descriptionTag) {
      descriptionTag = document.createElement('meta');
      descriptionTag.name = 'description';
      document.head.appendChild(descriptionTag);
    }
    descriptionTag.content = description;
    let robotsTag = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robotsTag) {
      robotsTag = document.createElement('meta');
      robotsTag.name = 'robots';
      document.head.appendChild(robotsTag);
    }
    robotsTag.content = noindex ? 'noindex, nofollow' : 'index, follow';
  }, [title, description, noindex]);
  return null;
}

function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`brand ${light ? 'brand-light' : ''}`} aria-label="VYRO home"><img src={assetUrl('/assets/vyro-logo.png')} alt="VYRO" className={light ? 'footer-logo' : ''} /></Link>;
}

function Header() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [, setLocation] = useLocation();
  const search = (e: FormEvent) => { e.preventDefault(); setLocation(`/search?q=${encodeURIComponent(term)}`); setSearchOpen(false); };
  return <>
    <div className="announcement">BETTER BEYOND&nbsp; / &nbsp;ENGINEERED FOR WHAT&apos;S NEXT</div>
    <header className="topbar">
      <button className="mobile-menu" aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="primary-nav" onClick={() => setMobileOpen(!mobileOpen)}><Menu size={20} /></button>
      <Brand />
      <nav id="primary-nav" className={`navlinks ${mobileOpen ? 'open' : ''}`} aria-label="Main navigation">
        <Link href="/shop" onClick={() => setMobileOpen(false)}>Shop</Link>
        <Link href="/our-story" onClick={() => setMobileOpen(false)}>Our story</Link>
        <Link href="/field-notes" onClick={() => setMobileOpen(false)}>Field notes</Link>
      </nav>
      <div className="navactions">
        <button className="iconlink" aria-label="Search catalogue" aria-expanded={searchOpen} aria-controls="header-search-panel" onClick={() => setSearchOpen(!searchOpen)}><Search size={16} /><span className="search-label">Search</span></button>
        <Link className="iconlink" href="/sign-in">Sign in</Link>
      </div>
    </header>
    {searchOpen && <form id="header-search-panel" className="search-row" onSubmit={search} style={{ maxWidth: 'none', margin: 0, padding: '12px 5vw', background: '#ebe8e0' }}>
      <label className="sr-only" htmlFor="header-search">Search catalogue</label><input id="header-search" autoFocus value={term} onChange={e => setTerm(e.target.value)} placeholder="Search the catalogue" />
      <button aria-label="Submit search"><ArrowRight size={18} /></button><button type="button" onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={18} /></button>
    </form>}
  </>;
}

function Footer() {
  return <footer className="footer">
    <div className="footer-main">
      <div><Brand light /><p>Go further by design.<br />Built for the miles that make you.</p></div>
      <div><h4>EXPLORE</h4><Link href="/shop">Shop all</Link><Link href="/our-story">Our story</Link><Link href="/field-notes">Field notes</Link></div>
      <div><h4>SUPPORT</h4><Link href="/contact">Contact</Link><Link href="/shipping">Shipping</Link><Link href="/returns">Returns</Link></div>
      <div><h4>THE DETAILS</h4><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/admin">Catalogue admin</Link></div>
    </div>
    <div className="footer-bottom"><span>© VYRO PERFORMANCE</span><span>ENGINEERED FOR WHAT&apos;S NEXT</span></div>
  </footer>;
}

function SiteShell({ children }: { children: ReactNode }) {
  return <div className="site-shell"><Header />{children}<Footer /></div>;
}

function Loading({ label = 'Loading catalogue' }: { label?: string }) {
  return <div className="state-panel" role="status" aria-live="polite"><div className="skeleton-line" /><h2>{label}</h2><p>One moment while we get things ready.</p></div>;
}

function QueryError({ retry, title = 'We hit a rough patch' }: { retry: () => void; title?: string }) {
  return <div className="state-panel" role="alert"><span className="eyebrow">CONNECTION INTERRUPTED</span><h2>{title}</h2><p>The catalogue could not be reached just now. Please try again.</p><button className="btn" onClick={retry}>Try again <ArrowRight size={15} /></button></div>;
}

function ProductCard({ product }: { product: Product }) {
  const photo = productImage(product);
  return <article className="product-card" data-testid={`card-product-${product.id}`}>
    <Link href={`/products/${product.slug}`} className="product-image" aria-label={`View ${product.name}`}>
      {imgPath(photo?.storagePath)
        ? <img src={imgPath(photo?.storagePath) ?? undefined} alt={photo?.altText || `${product.name} product photography`} loading="lazy" />
        : <span className="product-placeholder" role="img" aria-label={`${product.name} image not supplied`}><span aria-hidden="true">VYRO / IMAGE PENDING</span></span>}
      {product.featured && <span className="tag">VYRO / FEATURED</span>}
    </Link>
    <div className="product-info">
      <div><h3>{product.name}</h3><p>{product.category?.name || product.brand || 'VYRO PERFORMANCE'}</p></div>
      <span className="product-price">{money(productPrice(product)?.priceMinor, productPrice(product)?.currency)}</span>
    </div>
  </article>;
}

function ProductGrid({ products }: { products: Product[] }) {
  if (!products.length) return <div className="empty-state"><span className="eyebrow">NOTHING HERE YET</span><h2>No products to show</h2><p>Try a different category or check back soon.</p><Link className="btn" href="/shop">View all products <ArrowRight size={15} /></Link></div>;
  return <div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product} />)}</div>;
}

function HomePage() {
  const categories = useListCategories();
  const products = useListProducts({ page: 1, pageSize: 6, featured: true, sort: 'featured' });
  return <SiteShell>
    <PageMeta title="VYRO Performance — Better Beyond" description="Performance equipment for riders and explorers. Discover the VYRO catalogue, our story, and field notes from the road." />
    <main>
      <section className="hero" style={{ '--hero-photo': `url("${assetUrl('/assets/road-bike.webp')}")` } as CSSProperties}>
        <div className="hero-mark">VYRO / EDITORIAL IMAGE / 01</div>
        <div className="hero-inner"><span className="eyebrow">BUILT FOR THE WAY OUT</span><h1 className="display">BETTER<br />BEYOND.</h1><p>Precision performance for the miles that matter — on the road, off the map, and everywhere in between.</p><Link className="btn btn-orange" href="/shop">Explore the collection <ArrowRight size={15} /></Link></div>
      </section>
      <section className="section home-products">
        <div className="section-head"><div><span className="eyebrow">THE VYRO LINEUP</span><h2 className="display">Made to move.</h2></div><p>Purpose-built equipment. Considered details. Nothing between you and what&apos;s next.</p></div>
        {products.isLoading ? <Loading label="Finding the lineup" /> : products.isError ? <QueryError retry={() => products.refetch()} /> : <ProductGrid products={products.data?.items || []} />}
        {categories.data?.length ? <div style={{ marginTop: 28, display: 'flex', gap: 10, flexWrap: 'wrap' }}>{categories.data.map(c => <Link key={c.id} className="filter" href={`/shop/${c.slug}`}>{c.name} <ArrowUpRight size={12} /></Link>)}</div> : null}
      </section>
      <section className="story-band"><div className="story-photo" role="img" aria-label="Gravel bike detail ready for a wet-weather ride" style={{ '--story-photo': `url("${assetUrl('/assets/gravel-detail.webp')}")` } as CSSProperties} /><div className="story-copy"><span className="eyebrow">MORE THAN MOVEMENT</span><h2 className="display">The road is only the beginning.</h2><p>VYRO exists for people who find their edge by going a little further. We make performance essentials for movement with a point of view.</p><Link className="btn btn-outline" href="/our-story">Meet VYRO <ArrowRight size={15} /></Link></div></section>
      <section className="manifesto"><span className="eyebrow" style={{ color: '#182026' }}>A SIMPLE IDEA / A LONG WAY AHEAD</span><h2 className="display">Engineered for what&apos;s next.</h2><div className="manifesto-foot"><span>PERFORMANCE IS A WAY OF SEEING.</span><span>BETTER BEYOND <ArrowDownRight size={16} /></span></div></section>
      <section className="section"><div className="section-head"><div><span className="eyebrow">OUT THERE, IN HERE</span><h2 className="display">Field notes.</h2></div><Link className="btn btn-outline" href="/field-notes">Read the journal <ArrowRight size={15} /></Link></div>
        <div className="journal-grid"><Link className="journal-card" href="/field-notes/long-way-home" style={{ '--journal-photo': `url("${assetUrl('/assets/bike-overhead.webp')}")` } as CSSProperties}><div><span className="eyebrow">RIDE / ROUTE</span><h3>Find the longer way home.</h3><span className="mono">A FIELD NOTE FROM VYRO <ArrowUpRight size={13} /></span></div></Link><Link className="journal-card" href="/field-notes/details-that-matter" style={{ '--journal-photo': `url("${assetUrl('/assets/carbon-wheel.webp')}")` } as CSSProperties}><div><span className="eyebrow">EQUIPMENT / DETAIL</span><h3>Built for the in-between.</h3><span className="mono">A FIELD NOTE FROM VYRO <ArrowUpRight size={13} /></span></div></Link></div>
      </section>
      <section className="newsletter"><div><span className="eyebrow">THE VYRO DISPATCH</span><h2 className="display">A little further,<br />in your inbox.</h2></div><div><p style={{ fontSize: 12, color: '#5e6565', maxWidth: 360, lineHeight: 1.7 }}>Dispatch sign-up is part of what comes next. For now, explore the stories and routes already in our field notes.</p><Link className="btn btn-outline" href="/field-notes">Read field notes <ArrowRight size={14} /></Link></div></section>
    </main>
  </SiteShell>;
}

function ShopPage() {
  const params = useParams<{ category?: string }>();
  const categories = useListCategories();
  const foundCategory = categories.data?.find(c => c.slug === params.category);
  const list = useListProducts({ page: 1, pageSize: 48, ...(params.category ? { category: params.category } : {}), sort: 'featured' });
  const title = foundCategory?.name || (params.category ? 'Category' : 'The collection');
  if (params.category && !categories.isLoading && !categories.isError && !foundCategory) return <SiteShell><div className="state-panel"><span className="eyebrow">404 / CATEGORY NOT FOUND</span><h2>That route is not on our map.</h2><p>Try the full collection instead.</p><Link className="btn" href="/shop">Browse all products <ArrowRight size={15} /></Link></div></SiteShell>;
  return <SiteShell><PageMeta title={`${title} — VYRO Performance`} description={foundCategory?.description || 'Explore the live VYRO catalogue: equipment for movement, designed for the miles ahead.'} /><main><section className="page-heading"><span className="eyebrow">VYRO / CATALOGUE</span><h1 className="display">{title}</h1><p>{foundCategory?.description || 'Designed for movement, built for the miles that make you.'}</p></section>
    <section className="catalogue"><div className="catalogue-bar"><span>{list.data?.total ?? '—'} ITEMS / LIVE CATALOGUE</span><div className="filters"><Link className={`filter ${!params.category ? 'active' : ''}`} href="/shop">All</Link>{categories.data?.map(c => <Link key={c.id} className={`filter ${params.category === c.slug ? 'active' : ''}`} href={`/shop/${c.slug}`}>{c.name}</Link>)}</div></div>
      {list.isLoading ? <Loading label="Loading the collection" /> : list.isError ? <QueryError retry={() => list.refetch()} /> : <ProductGrid products={list.data?.items || []} />}
    </section></main></SiteShell>;
}

function ProductPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const query = useGetProductBySlug(slug, { query: { queryKey: getGetProductBySlugQueryKey(slug) } });
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  useEffect(() => {
    setSelectedImage(0);
    setSelectedVariantId(query.data?.variants?.[0]?.id || '');
  }, [query.data?.id]);
  if (query.isLoading) return <SiteShell><Loading label="Loading product details" /></SiteShell>;
  if (query.isError) {
    const status = (query.error as { status?: number; response?: { status?: number } })?.status ?? (query.error as { response?: { status?: number } })?.response?.status;
    if (status === 404) return <SiteShell><div className="state-panel"><span className="eyebrow">404 / NOT FOUND</span><h2>That product is off the map.</h2><p>This listing may have moved or is no longer published.</p><Link className="btn" href="/shop">Back to the collection</Link></div></SiteShell>;
    return <SiteShell><QueryError title="Product unavailable" retry={() => query.refetch()} /></SiteShell>;
  }
  const product = query.data;
  if (!product) return <SiteShell><div className="state-panel"><span className="eyebrow">404 / NOT FOUND</span><h2>That product is off the map.</h2><Link className="btn" href="/shop">Back to the collection</Link></div></SiteShell>;
  const images = product.images?.slice().sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder) || [];
  const variant = product.variants?.find(item => item.id === selectedVariantId) || product.variants?.[0];
  const imageUrl = imgPath(images[selectedImage]?.storagePath);
  return <SiteShell><PageMeta title={`${product.name} — VYRO Performance`} description={product.shortDescription || product.description || `${product.name} from the VYRO Performance catalogue.`} /><main className="product-detail"><div>{imageUrl
      ? <img className="gallery-main" src={imageUrl} alt={images[selectedImage]?.altText || product.name} />
      : <div className="gallery-main gallery-placeholder" role="img" aria-label={`${product.name} image not supplied`}><span>VYRO / IMAGE PENDING</span></div>}
      {images.length > 1 && <div className="gallery-thumbs">{images.map((image, i) => <button key={image.id} className={i === selectedImage ? 'active' : ''} onClick={() => setSelectedImage(i)} aria-label={`View image ${i + 1}`}><img src={imgPath(image.storagePath) ?? undefined} alt="" /></button>)}</div>}</div>
    <div className="detail-copy"><span className="eyebrow">{product.category?.name || 'VYRO PERFORMANCE'} / PRODUCT</span><h1 className="display">{product.name}</h1><div className="detail-price">{money(variant?.priceMinor, variant?.currency)}</div><p>{product.shortDescription || product.description || 'Purposeful performance for the way ahead.'}</p>
      {product.variants && product.variants.length > 1 && <div className="field variant-picker"><label htmlFor="product-variant">Choose a variant</label><select id="product-variant" value={variant?.id || ''} onChange={event => setSelectedVariantId(event.target.value)}>{product.variants.map(item => <option key={item.id} value={item.id}>{item.name}{Object.values(item.options || {}).length ? ` — ${Object.values(item.options).join(' / ')}` : ''}</option>)}</select></div>}
      <div className="phase-note"><strong>PHASE 2 / PURCHASES NOT YET AVAILABLE</strong><br />We&apos;re building the next chapter. Checkout is not available in this phase, so no purchase or order can be placed here.</div>
      <div style={{ marginTop: 34 }}><div className="spec-line"><span>Available units</span><span>{variant?.availableStock ?? 0}</span></div><div className="spec-line"><span>Reference</span><span>{variant?.sku || product.slug}</span></div><div className="spec-line"><span>VYRO</span><span>ENGINEERED FOR WHAT&apos;S NEXT</span></div></div>
    </div></main></SiteShell>;
}

function SearchPage() {
  const params = new URLSearchParams(window.location.search);
  const [term, setTerm] = useState(params.get('q') || '');
  const [submitted, setSubmitted] = useState(params.get('q') || '');
  const results = useListProducts({ page: 1, pageSize: 48, ...(submitted ? { q: submitted } : {}) });
  return <SiteShell><PageMeta title={submitted ? `Search: ${submitted} — VYRO Performance` : 'Search the VYRO catalogue'} description="Search VYRO published catalogue listings." /><main><section className="page-heading"><span className="eyebrow">VYRO / FIND YOUR NEXT</span><h1 className="display">Search.</h1><p>Look through the live catalogue.</p></section><section className="catalogue">
    <form className="search-row" onSubmit={e => { e.preventDefault(); setSubmitted(term.trim()); }}><label className="sr-only" htmlFor="catalogue-search">Search catalogue</label><input id="catalogue-search" value={term} onChange={e => setTerm(e.target.value)} placeholder="Try a name or category" /><button aria-label="Search"><Search size={18} /></button></form>
    {submitted && <div className="catalogue-bar"><span>RESULTS FOR “{submitted}”</span><span>{results.data?.total ?? '—'} MATCHES</span></div>}
    {results.isLoading ? <Loading label="Searching the catalogue" /> : results.isError ? <QueryError retry={() => results.refetch()} /> : submitted ? <ProductGrid products={results.data?.items || []} /> : <div className="empty-state"><span className="eyebrow">START WITH A SEARCH</span><h2>What are you looking for?</h2><p>Search by product name or category.</p></div>}
  </section></main></SiteShell>;
}

function StoryPage() {
  return <SiteShell><PageMeta title="Our story — VYRO Performance" description="Why VYRO exists: considered performance equipment for riders and explorers, and the journeys that take them further." /><main className="story-page"><img src={assetUrl('/assets/bike-overhead.webp')} alt="A rider's perspective looking down at a road bike on open tarmac" /><div className="story-page-copy"><span className="eyebrow">OUR STORY / VYRO</span><h1 className="display">Better is<br />out there.</h1><p>We believe performance isn&apos;t a finish line. It&apos;s a way of moving through the world: with curiosity, care, and the confidence to go a little further.</p><p>VYRO makes considered equipment for riders and explorers. Our starting point is always the same: what does the journey ask of you?</p><Link className="btn" href="/shop">Explore VYRO <ArrowRight size={15} /></Link></div></main><section className="manifesto"><span className="eyebrow">OUR NORTH STAR</span><h2 className="display">Engineered for what&apos;s next.</h2><div className="manifesto-foot"><span>PEOPLE FIRST. PURPOSE ALWAYS.</span><span>BETTER BEYOND</span></div></section></SiteShell>;
}

const notes = [
  { slug: 'long-way-home', category: 'RIDE / ROUTE', title: 'Find the longer way home.', image: '/assets/bike-overhead.webp', alt: 'Road bike photographed from above on dark open tarmac', copy: 'A reminder that the best route is rarely the shortest one.' },
  { slug: 'details-that-matter', category: 'EQUIPMENT / DETAIL', title: 'Built for the in-between.', image: '/assets/carbon-wheel.webp', alt: 'Close view of a dark carbon road wheel and valve', copy: 'Good design earns its place in the moments you almost miss.' },
  { slug: 'weather-is-part-of-it', category: 'FIELD / CONDITIONS', title: 'Weather is part of it.', image: '/assets/gravel-detail.webp', alt: 'Water droplets on a dark gravel-bike frame and tire', copy: 'The forecast changes. The reason to go does not.' },
];

function NotesPage() {
  const slug = useParams<{ slug?: string }>().slug;
  if (slug) {
    const note = notes.find(item => item.slug === slug);
    if (!note) return <SiteShell><div className="state-panel"><h2>Field note not found.</h2><Link className="btn" href="/field-notes">Return to field notes</Link></div></SiteShell>;
    return <SiteShell><PageMeta title={`${note.title} — VYRO Field Notes`} description={note.copy} /><main className="story-page"><img src={assetUrl(note.image)} alt={note.alt} /><div className="story-page-copy"><span className="eyebrow">{note.category} / VYRO FIELD NOTES</span><h1 className="display">{note.title}</h1><p>{note.copy}</p><p>There is always another line to follow, another turn worth taking. VYRO field notes are dispatches from the places, people, and details that keep us moving.</p><Link className="btn btn-outline" href="/field-notes">All field notes <ArrowRight size={15} /></Link></div></main></SiteShell>;
  }
  return <SiteShell><PageMeta title="Field notes — VYRO Performance" description="Routes, reflections, and the small details that change how far we go." /><main><section className="page-heading"><span className="eyebrow">VYRO / JOURNAL</span><h1 className="display">Field notes.</h1><p>Routes, reflections, and the small details that change how far we go.</p></section><section className="catalogue"><div className="notes-list">{notes.map(note => <Link className="note-card" href={`/field-notes/${note.slug}`} key={note.slug}><img src={assetUrl(note.image)} alt={note.alt} /><div><span className="eyebrow">{note.category}</span><h2>{note.title}</h2><p>{note.copy}</p><span className="mono">READ NOTE <ArrowUpRight size={13} /></span></div></Link>)}</div></section></main></SiteShell>;
}

const legalPages: Record<string, { title: string; intro: string; sub: string }> = {
  contact: { title: 'Talk to us.', intro: 'Good equipment begins with listening. We are preparing VYRO customer support for the next phase.', sub: 'For now, this Phase 1 foundation is a public catalogue preview. Contact channels will be published before commerce launches.' },
  shipping: { title: 'Shipping.', intro: 'Shipping options and delivery estimates will be published when purchasing becomes available.', sub: 'VYRO is currently presenting its live catalogue only. No orders can be placed in this phase.' },
  returns: { title: 'Returns.', intro: 'Our returns process will be published before checkout becomes available.', sub: 'No purchases or returns are being processed during this catalogue preview phase.' },
  privacy: { title: 'Privacy.', intro: 'This Phase 1 catalogue does not process payments, orders, or newsletter subscriptions. If you create a sign-in account, Clerk processes the identity and session information needed to provide authentication.', sub: 'VYRO customer profiles and purchase features are not available. Before those features launch, this page must be expanded with final data purposes, retention, service-provider details, user rights, and a working privacy contact.' },
  terms: { title: 'Terms.', intro: 'These pages introduce the VYRO catalogue experience.', sub: 'The catalogue is informational in this phase. Purchases, checkout, and order formation are not available.' },
};

function LegalPage() {
  const path = window.location.pathname.split('/').filter(Boolean).pop() || 'contact';
  const page = legalPages[path] || legalPages.contact;
  return <SiteShell><PageMeta title={`${page.title.replace(/[.?!]$/, '')} — VYRO Performance`} description={page.intro} /><main className="text-page"><span className="eyebrow">VYRO / {path.toUpperCase()}</span><h1 className="display">{page.title}</h1><p>{page.intro}</p><h2 className="display">Phase 1 foundation</h2><p>{page.sub}</p></main></SiteShell>;
}

function AuthScreen({ signUp = false }: { signUp?: boolean }) {
  return <main className="auth-backdrop"><PageMeta title={signUp ? 'Create an account — VYRO' : 'Sign in — VYRO'} description="Sign in to the VYRO catalogue administration experience." noindex /><div className="auth-art" style={{ '--auth-photo': `url("${assetUrl('/assets/road-bike-front.webp')}")` } as CSSProperties}><h1 className="display">BETTER<br />BEYOND.</h1></div><div className="auth-form">{signUp
    ? <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    : <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />}</div></main>;
}

function ClerkCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const id = user?.id ?? null;
    if (previous.current !== undefined && previous.current !== id) qc.clear();
    previous.current = id;
  }), [addListener, qc]);
  return null;
}

function HomeRedirect() { return <HomePage />; }

function ClerkRoutedApp() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to continue with VYRO' } }, signUp: { start: { title: 'Join VYRO', subtitle: 'Make room for what is next' } } }}
    routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}>
    <ClerkCacheInvalidator />
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/shop" component={ShopPage} /><Route path="/shop/:category" component={ShopPage} />
      <Route path="/products/:slug" component={ProductPage} /><Route path="/search" component={SearchPage} />
      <Route path="/our-story" component={StoryPage} /><Route path="/field-notes" component={NotesPage} /><Route path="/field-notes/:slug" component={NotesPage} />
      <Route path="/contact" component={LegalPage} /><Route path="/shipping" component={LegalPage} /><Route path="/returns" component={LegalPage} /><Route path="/privacy" component={LegalPage} /><Route path="/terms" component={LegalPage} />
      <Route path="/admin" component={AdminGate} /><Route path="/admin/products" component={AdminGate} /><Route path="/admin/products/new" component={AdminGate} /><Route path="/admin/products/:id" component={AdminGate} /><Route path="/admin/categories" component={AdminGate} />
      <Route path="/sign-in/*?" component={() => <AuthScreen />} /><Route path="/sign-up/*?" component={() => <AuthScreen signUp />} />
      <Route component={NotFound} />
    </Switch>
  </ClerkProvider>;
}

function NotFound() {
  return <SiteShell><main className="not-found"><div><span className="eyebrow">404 / OFF ROUTE</span><h1 className="display" style={{ fontSize: 80 }}>This way, maybe.</h1><p>That page is not on our map.</p><Link className="btn" href="/">Back to VYRO <ArrowRight size={15} /></Link></div></main></SiteShell>;
}

function AdminGate() {
  const session = useGetAdminSession({ query: { queryKey: getGetAdminSessionQueryKey(), retry: false } });
  if (session.isLoading) return <div className="site-shell"><Loading label="Checking catalogue access" /></div>;
  if (session.isError) return <div className="site-shell"><Header /><div className="state-panel"><span className="eyebrow">VYRO / ADMIN</span><h2>Sign in to continue.</h2><p>Catalogue administration requires a server-verified VYRO admin session.</p><Link className="btn" href="/sign-in">Sign in <ArrowRight size={15} /></Link></div><Footer /></div>;
  if (!session.data?.isAdmin) return <div className="site-shell"><Header /><div className="state-panel"><span className="eyebrow">ACCESS RESTRICTED</span><h2>Admin access is not enabled.</h2><p>Your current server-verified role does not permit catalogue administration.</p><Link className="btn btn-outline" href="/">Return to VYRO</Link></div><Footer /></div>;
  return <AdminLayout />;
}

function AdminLayout() {
  const path = window.location.pathname.replace(basePath, '');
  const clerk = useClerk();
  return <div className="site-shell"><PageMeta title="Catalogue administration — VYRO" description="Private VYRO catalogue management." noindex /><Header /><div className="admin-layout"><nav className="admin-side" aria-label="Admin navigation"><span className="eyebrow">VYRO / CATALOGUE OPS</span><Link className={path === '/admin' ? 'active' : ''} href="/admin">Overview</Link><Link className={path.includes('/products') ? 'active' : ''} href="/admin/products">Products</Link><Link className={path === '/admin/categories' ? 'active' : ''} href="/admin/categories">Categories</Link><Link href="/">← Storefront</Link><button className="filter" onClick={() => void clerk.signOut({ redirectUrl: `${basePath}/` })}>Sign out</button></nav><div className="admin-main"><Switch><Route path="/admin" component={AdminOverview} /><Route path="/admin/products" component={AdminProducts} /><Route path="/admin/products/new" component={ProductEditor} /><Route path="/admin/products/:id" component={ProductEditor} /><Route path="/admin/categories" component={AdminCategories} /></Switch></div></div></div>;
}

function AdminOverview() {
  const summary = useGetAdminSummary({ query: { queryKey: getGetAdminSummaryQueryKey() } });
  const latest = useListAdminProducts({ page: 1, pageSize: 5 });
  if (summary.isLoading) return <Loading label="Loading operations overview" />;
  if (summary.isError) return <QueryError title="Overview unavailable" retry={() => summary.refetch()} />;
  const values = summary.data;
  return <><div className="admin-title"><div><span className="eyebrow">CATALOGUE / OPERATIONS</span><h1 className="display">Overview</h1><p>A clear view of what is live and what needs attention.</p></div><Link className="btn" href="/admin/products/new">New product <ArrowRight size={15} /></Link></div>
    <div className="metric-grid">{[['Total products', values?.totalProducts], ['Published', values?.publishedProducts], ['Drafts', values?.draftProducts], ['Low stock variants', values?.lowStockVariants]].map(([label, value]) => <div className="metric" key={label as string}><span>{label}</span><strong>{value ?? 0}</strong></div>)}</div>
    <div className="admin-title"><div><span className="eyebrow">RECENTLY UPDATED</span><h2 className="display" style={{ fontSize: 36 }}>Latest products</h2></div><Link className="filter" href="/admin/products">View catalogue <ArrowRight size={13} /></Link></div>
    {latest.isLoading ? <Loading label="Loading recent products" /> : latest.isError ? <QueryError title="Products unavailable" retry={() => latest.refetch()} /> : <AdminProductTable products={latest.data?.items || []} />}
  </>;
}

function AdminProductTable({ products }: { products: Product[] }) {
  if (!products.length) return <div className="empty-state"><h2>No products yet</h2><p>Create the first catalogue listing when you&apos;re ready.</p><Link className="btn" href="/admin/products/new">Create product <ArrowRight size={15} /></Link></div>;
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product</th><th>Category</th><th>Status</th><th>Variants</th><th>Updated</th><th></th></tr></thead><tbody>{products.map(p => <tr key={p.id} data-testid={`row-product-${p.id}`}><td><strong>{p.name}</strong><br /><span className="mono">{p.slug}</span></td><td>{p.category?.name || '—'}</td><td><span className={`status-pill ${p.status}`}>{p.status}</span></td><td>{p.variants?.length || 0}</td><td>{new Date(p.updatedAt).toLocaleDateString()}</td><td><Link href={`/admin/products/${p.id}`} aria-label={`Edit ${p.name}`}>Edit <ArrowUpRight size={13} /></Link></td></tr>)}</tbody></table></div>;
}

function AdminProducts() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [term, setTerm] = useState('');
  const list = useListAdminProducts({ page: 1, pageSize: 100, ...(term ? { q: term } : {}), ...(status ? { status: status as 'draft' | 'published' | 'archived' } : {}) });
  return <><div className="admin-title"><div><span className="eyebrow">CATALOGUE / ALL PRODUCTS</span><h1 className="display">Products</h1><p>Manage product details and visibility.</p></div><Link className="btn" href="/admin/products/new">New product <ArrowRight size={15} /></Link></div>
    <form className="catalogue-bar" onSubmit={e => { e.preventDefault(); setTerm(q.trim()); }}><div className="search-row" style={{ margin: 0, width: 'min(390px,100%)' }}><label className="sr-only" htmlFor="admin-search">Search admin products</label><input id="admin-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by product name" /><button aria-label="Search products"><Search size={16} /></button></div><label className="mono">STATUS &nbsp;<select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label></form>
    {list.isLoading ? <Loading label="Loading products" /> : list.isError ? <QueryError retry={() => list.refetch()} /> : <AdminProductTable products={list.data?.items || []} />}
  </>;
}

type VariantDraft = { sku: string; name: string; price: string; currency: string; stock: string; compare: string; options: string; status: 'active' | 'inactive' };
const blankVariant = (): VariantDraft => ({ sku: '', name: 'Standard', price: '', currency: 'USD', stock: '0', compare: '', options: '', status: 'active' });

function ProductEditor() {
  const { id } = useParams<{ id?: string }>();
  const edit = Boolean(id && id !== 'new');
  const qc = useQueryClient();
  const productQuery = useGetAdminProduct(id || '', { query: { enabled: edit, queryKey: getGetAdminProductQueryKey(id || '') } });
  const categories = useListAdminCategories({ query: { queryKey: getListAdminCategoriesQueryKey() } });
  const create = useCreateAdminProduct();
  const update = useUpdateAdminProduct();
  const [, setLocation] = useLocation();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [metadata, setMetadata] = useState('{}');
  const [status, setStatus] = useState<ProductStatus>('draft');
  const [featured, setFeatured] = useState(false);
  const [brand, setBrand] = useState('VYRO');
  const [imagePath, setImagePath] = useState('');
  const [altText, setAltText] = useState('');
  const [variants, setVariants] = useState<VariantDraft[]>([blankVariant()]);
  const [loadedId, setLoadedId] = useState('');
  const [success, setSuccess] = useState(() => new URLSearchParams(window.location.search).get('saved') === '1' ? 'Catalogue product saved.' : '');
  const [errorText, setErrorText] = useState('');
  useEffect(() => {
    const product = productQuery.data;
    if (!edit || !product || loadedId === product.id) return;
    setLoadedId(product.id); setName(product.name); setSlug(product.slug); setCategoryId(product.categoryId || '');
    setShortDescription(product.shortDescription || ''); setDescription(product.description || ''); setStatus(product.status);
    setMetadata(JSON.stringify(product.metadata || {}, null, 2));
    setFeatured(product.featured); setBrand(product.brand || 'VYRO');
    setImagePath(product.images?.map(image => image.storagePath).join('\n') || ''); setAltText(product.images?.[0]?.altText || '');
    if (product.variants?.length) setVariants(product.variants.map(v => ({ sku: v.sku, name: v.name, price: String(v.priceMinor / 100), currency: v.currency, stock: String(v.availableStock), compare: v.compareAtPriceMinor == null ? '' : String(v.compareAtPriceMinor / 100), options: Object.entries(v.options || {}).map(([key, value]) => `${key}=${value}`).join(', '), status: v.status })));
  }, [edit, productQuery.data, loadedId]);
  const autoSlug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const save = (e: FormEvent) => {
    e.preventDefault(); setSuccess(''); setErrorText('');
    let metadataObject: Record<string, unknown>;
    try {
      metadataObject = JSON.parse(metadata) as Record<string, unknown>;
      if (!metadataObject || Array.isArray(metadataObject) || typeof metadataObject !== 'object') throw new Error();
    } catch {
      setErrorText('Metadata must be valid JSON object data.');
      return;
    }
    const payload: ProductInput = {
      categoryId: categoryId || null, name: name.trim(), slug: slug.trim(), shortDescription: shortDescription || null,
      description: description || null, status, brand: brand || null, featured, metadata: metadataObject,
      variants: variants.map(variant => ({ sku: variant.sku.trim(), name: variant.name.trim() || 'Standard', options: Object.fromEntries(variant.options.split(',').map(pair => pair.trim()).filter(Boolean).map(pair => { const [key, ...value] = pair.split('='); return [key.trim(), value.join('=').trim()] as [string, string]; }).filter(pair => Boolean(pair[0] && pair[1]))), priceMinor: Math.round(Number(variant.price) * 100), currency: variant.currency.toUpperCase(), compareAtPriceMinor: variant.compare ? Math.round(Number(variant.compare) * 100) : null, status: variant.status, stockOnHand: Math.max(0, Number(variant.stock) || 0) })),
       images: imagePath.split(/[\n,]+/).map(path => path.trim()).filter(Boolean).map((path, index) => ({ storagePath: path.startsWith('/assets/') ? path : `/assets/${path.replace(/^\/+/, '')}`, altText: altText.trim() || `${name} product image`, sortOrder: index, isPrimary: index === 0 })),
    };
    const onSuccess = (result: Product) => {
      qc.invalidateQueries({ queryKey: getListAdminProductsQueryKey() }); qc.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
      qc.invalidateQueries({ queryKey: getListProductsQueryKey() }); qc.invalidateQueries({ queryKey: getGetAdminProductQueryKey(result.id) });
      setSuccess('Catalogue product saved.');
      if (!edit) setLocation(`/admin/products/${result.id}?saved=1`);
    };
    const onError = (err: Error) => setErrorText(err.message || 'Unable to save this product. Check required fields and try again.');
    if (edit && id) update.mutate({ id, data: payload }, { onSuccess, onError });
    else create.mutate({ data: payload }, { onSuccess, onError });
  };
  if (edit && productQuery.isLoading) return <Loading label="Loading product editor" />;
  if (edit && productQuery.isError) return <QueryError title="Product could not be opened" retry={() => productQuery.refetch()} />;
  if (edit && !productQuery.data && !productQuery.isLoading) return <div className="state-panel"><h2>Product not found.</h2><Link className="btn" href="/admin/products">Back to products</Link></div>;
  const pending = create.isPending || update.isPending;
  return <><div className="admin-title"><div><span className="eyebrow">CATALOGUE / PRODUCT RECORD</span><h1 className="display">{edit ? 'Edit product' : 'New product'}</h1><p>Keep the catalogue accurate and ready for what comes next.</p></div><Link className="filter" href="/admin/products">← Product list</Link></div>
    {success && <div className="notice" role="status"><Check size={15} /> {success}</div>}{errorText && <div className="notice" role="alert" style={{ background: '#f4dfd9', color: '#842f23' }}>{errorText}</div>}
    <form className="admin-form" onSubmit={save}><div className="form-grid">
      <div className="field"><label htmlFor="prod-name">Product name</label><input id="prod-name" required maxLength={160} value={name} onChange={e => { setName(e.target.value); if (!edit) setSlug(autoSlug(e.target.value)); }} /></div>
      <div className="field"><label htmlFor="prod-slug">Slug</label><input id="prod-slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={e => setSlug(autoSlug(e.target.value))} /></div>
      <div className="field"><label htmlFor="prod-category">Category</label><select id="prod-category" value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Uncategorised</option>{categories.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div className="field"><label htmlFor="prod-status">Status</label><select id="prod-status" value={status} onChange={e => setStatus(e.target.value as ProductStatus)}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></div>
      <div className="field"><label htmlFor="prod-brand">Brand</label><input id="prod-brand" value={brand} onChange={e => setBrand(e.target.value)} /></div>
      <div className="field"><label htmlFor="prod-short">Short description</label><input id="prod-short" maxLength={300} value={shortDescription} onChange={e => setShortDescription(e.target.value)} /></div>
      <div className="field full"><label htmlFor="prod-description">Description</label><textarea id="prod-description" value={description} onChange={e => setDescription(e.target.value)} /></div>
      <div className="field full"><label htmlFor="prod-metadata">Metadata (JSON object)</label><textarea id="prod-metadata" value={metadata} onChange={e => setMetadata(e.target.value)} /></div>
       <div className="field"><label htmlFor="img-path">Verified product image paths under /assets/ (one per line)</label><textarea id="img-path" placeholder="product-name.webp" value={imagePath} onChange={e => setImagePath(e.target.value)} /><small>Only add images verified as this VYRO product. Supplied riding photography is used for editorial storytelling.</small></div>
      <div className="field"><label htmlFor="img-alt">Image alt text</label><input id="img-alt" value={altText} onChange={e => setAltText(e.target.value)} /></div>
      <div className="field full"><div className="admin-title"><div><span className="eyebrow">VARIANT SETUP</span><h2 className="display" style={{ fontSize: 30 }}>Variants</h2></div><button className="filter" type="button" onClick={() => setVariants(current => [...current, blankVariant()])}>Add variant <ArrowRight size={13} /></button></div></div>
      {variants.map((variant, index) => <div className="field full" key={`variant-${index}`} style={{ border: '1px solid #d8d3c8', padding: 18, background: '#f2efe8' }}>
        <div className="admin-title"><div><span className="eyebrow">VARIANT {String(index + 1).padStart(2, '0')}</span></div>{variants.length > 1 && <button className="filter" type="button" onClick={() => setVariants(current => current.filter((_, i) => i !== index))}>Remove</button>}</div>
        <div className="form-grid">
          <div className="field"><label htmlFor={`var-name-${index}`}>Variant name</label><input id={`var-name-${index}`} required value={variant.name} onChange={e => setVariants(current => current.map((v, i) => i === index ? { ...v, name: e.target.value } : v))} /></div>
          <div className="field"><label htmlFor={`var-sku-${index}`}>SKU</label><input id={`var-sku-${index}`} required value={variant.sku} onChange={e => setVariants(current => current.map((v, i) => i === index ? { ...v, sku: e.target.value } : v))} /></div>
          <div className="field"><label htmlFor={`var-price-${index}`}>Catalogue price</label><input id={`var-price-${index}`} type="number" min="0" step=".01" required value={variant.price} onChange={e => setVariants(current => current.map((v, i) => i === index ? { ...v, price: e.target.value } : v))} /></div>
          <div className="field"><label htmlFor={`var-compare-${index}`}>Compare-at price (optional)</label><input id={`var-compare-${index}`} type="number" min="0" step=".01" value={variant.compare} onChange={e => setVariants(current => current.map((v, i) => i === index ? { ...v, compare: e.target.value } : v))} /></div>
          <div className="field"><label htmlFor={`var-stock-${index}`}>{edit ? 'Available stock (read only)' : 'Initial stock'}</label><input id={`var-stock-${index}`} type="number" min="0" step="1" value={variant.stock} disabled={edit} onChange={e => setVariants(current => current.map((v, i) => i === index ? { ...v, stock: e.target.value } : v))} />{edit && <small>Stock is preserved when editing product details.</small>}</div>
          <div className="field"><label htmlFor={`var-currency-${index}`}>Currency code</label><input id={`var-currency-${index}`} maxLength={3} value={variant.currency} onChange={e => setVariants(current => current.map((v, i) => i === index ? { ...v, currency: e.target.value.toUpperCase() } : v))} /></div>
          <div className="field"><label htmlFor={`var-status-${index}`}>Variant state</label><select id={`var-status-${index}`} value={variant.status} onChange={e => setVariants(current => current.map((v, i) => i === index ? { ...v, status: e.target.value as 'active' | 'inactive' } : v))}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
          <div className="field full"><label htmlFor={`var-options-${index}`}>Options as key=value pairs (comma separated)</label><input id={`var-options-${index}`} placeholder="Size=Large, Finish=Black" value={variant.options} onChange={e => setVariants(current => current.map((v, i) => i === index ? { ...v, options: e.target.value } : v))} /></div>
        </div>
      </div>)}
    </div>
      <label className="check-field"><input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} /> Feature this product in the storefront</label>
      <div className="admin-actions"><button className="btn" disabled={pending} type="submit">{pending ? 'Saving…' : edit ? 'Save product' : 'Create product'} <ArrowRight size={15} /></button><Link className="filter" href="/admin/products">Cancel</Link></div>
    </form>
  </>;
}

function AdminCategories() {
  const list = useListAdminCategories({ query: { queryKey: getListAdminCategoriesQueryKey() } });
  const create = useCreateAdminCategory();
  const update = useUpdateAdminCategory();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState(''); const [slug, setSlug] = useState(''); const [description, setDescription] = useState('');
  const [order, setOrder] = useState('0'); const [image, setImage] = useState(''); const [active, setActive] = useState(true); const [parentId, setParentId] = useState('');
  const [message, setMessage] = useState('');
  const prepare = (category?: Category) => { setEditing(category || null); setName(category?.name || ''); setSlug(category?.slug || ''); setDescription(category?.description || ''); setOrder(String(category?.sortOrder || 0)); setImage(category?.imagePath || ''); setActive(category?.isActive ?? true); setParentId(category?.parentId || ''); setMessage(''); };
  const save = (e: FormEvent) => {
     e.preventDefault(); const payload: CategoryInput = { name: name.trim(), slug: slug.trim(), description: description || null, parentId: parentId || null, imagePath: image ? (image.startsWith('/assets/') ? image : `/assets/${image.replace(/^\/+/, '')}`) : null, sortOrder: Math.max(0, Number(order) || 0), isActive: active };
    const onSuccess = () => { const savedText = editing ? 'Category updated.' : 'Category created.'; qc.invalidateQueries({ queryKey: getListAdminCategoriesQueryKey() }); qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() }); prepare(); setMessage(savedText); };
    const onError = (error: Error) => setMessage(error.message || 'Category could not be saved.');
    if (editing) update.mutate({ id: editing.id, data: payload }, { onSuccess, onError });
    else create.mutate({ data: payload }, { onSuccess, onError });
  };
  if (list.isLoading) return <Loading label="Loading categories" />;
  if (list.isError) return <QueryError retry={() => list.refetch()} />;
  return <><div className="admin-title"><div><span className="eyebrow">CATALOGUE / TAXONOMY</span><h1 className="display">Categories</h1><p>Organise how people discover VYRO products.</p></div></div>
    {message && <div className="notice" role="status">{message}</div>}
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Slug</th><th>State</th><th>Sort order</th><th></th></tr></thead><tbody>{list.data?.map(c => <tr key={c.id}><td><strong>{c.name}</strong></td><td className="mono">{c.slug}</td><td><span className={`status-pill ${c.isActive ? 'published' : 'draft'}`}>{c.isActive ? 'Active' : 'Inactive'}</span></td><td>{c.sortOrder}</td><td><button className="filter" onClick={() => prepare(c)}>Edit</button></td></tr>)}</tbody></table></div>
    {!list.data?.length && <div className="empty-state"><h2>No categories yet</h2><p>Create a category to organise the catalogue.</p></div>}
    <section style={{ marginTop: 38, background: '#eeebe3', border: '1px solid #d8d3c8', padding: 24 }}>
      <div className="admin-title"><div><span className="eyebrow">{editing ? 'EDIT CATEGORY' : 'NEW CATEGORY'}</span><h2 className="display" style={{ fontSize: 34 }}>{editing ? editing.name : 'Add a category'}</h2></div>{editing && <button className="filter" onClick={() => prepare()}>Cancel edit</button>}</div>
      <form className="form-grid" onSubmit={save}>
        <div className="field"><label htmlFor="cat-name">Name</label><input id="cat-name" required maxLength={100} value={name} onChange={e => { setName(e.target.value); if (!editing) setSlug(e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')); }} /></div>
        <div className="field"><label htmlFor="cat-slug">Slug</label><input id="cat-slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={e => setSlug(e.target.value)} /></div>
        <div className="field"><label htmlFor="cat-order">Sort order</label><input id="cat-order" type="number" min="0" value={order} onChange={e => setOrder(e.target.value)} /></div>
        <div className="field"><label htmlFor="cat-image">Image path under /assets/</label><input id="cat-image" value={image} onChange={e => setImage(e.target.value)} /></div>
        <div className="field"><label htmlFor="cat-parent">Parent category</label><select id="cat-parent" value={parentId} onChange={e => setParentId(e.target.value)}><option value="">No parent</option>{list.data?.filter(category => category.id !== editing?.id).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
        <div className="field full"><label htmlFor="cat-description">Description</label><textarea id="cat-description" value={description} onChange={e => setDescription(e.target.value)} /></div>
        <div className="field full"><label className="check-field"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active in the public storefront</label></div>
        <div className="field full"><button className="btn" disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? 'Saving…' : editing ? 'Save category' : 'Create category'} <ArrowRight size={15} /></button></div>
      </form>
    </section>
  </>;
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <QueryClientProvider client={queryClient}><WouterRouter base={basePath}><ClerkRoutedApp /></WouterRouter></QueryClientProvider>;
}

export default App;
