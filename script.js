"use strict";

const API = "https://api.jikan.moe/v4";
const SITE_URL = "https://animesteam14-create.github.io/AnimeVerse/";
const LEGAL_LINKS = [
  ["Crunchyroll", "https://www.crunchyroll.com/search?q="],
  ["Netflix", "https://www.netflix.com/search?q="],
  ["Hulu", "https://www.hulu.com/search?q="]
];
const GENRES = [
  { name: "Action", id: 1 },
  { name: "Adventure", id: 2 },
  { name: "Comedy", id: 4 },
  { name: "Drama", id: 8 },
  { name: "Fantasy", id: 10 },
  { name: "Romance", id: 22 },
  { name: "Sci-Fi", id: 24 },
  { name: "Slice of Life", id: 36 },
  { name: "Sports", id: 30 },
  { name: "Supernatural", id: 37 }
];

const state = {
  favorites: JSON.parse(localStorage.getItem("animeverse:favorites") || "[]"),
  searchPage: 1,
  currentQuery: "",
  currentGenre: "",
  currentMinScore: "",
  currentOrder: "popularity"
};

const routeView = document.querySelector("#routeView");
const heroSlider = document.querySelector("#heroSlider");
const heroBackdrop = document.querySelector("#heroBackdrop");
const categoryList = document.querySelector("#categoryList");
const globalSearchInput = document.querySelector("#globalSearchInput");
const quickResults = document.querySelector("#quickResults");
const navLinks = document.querySelector("#navLinks");
const navToggle = document.querySelector("#navToggle");
const themeToggle = document.querySelector("#themeToggle");
const scrollTopButton = document.querySelector("#scrollTop");
const introSkip = document.querySelector("#introSkip");

const cache = new Map();
let introTimer;

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("hashchange", renderRoute);
window.addEventListener("scroll", handleScroll, { passive: true });

function init() {
  document.querySelector("#year").textContent = new Date().getFullYear();
  applyTheme(localStorage.getItem("animeverse:theme") || "dark");
  bindGlobalEvents();
  renderCategories();
  hydrateHero();
  renderRoute();
  introTimer = setTimeout(hideIntro, 3600);
}

function bindGlobalEvents() {
  document.querySelector("#globalSearchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const query = globalSearchInput.value.trim();
    if (query) location.hash = `#/search?q=${encodeURIComponent(query)}`;
  });

  globalSearchInput.addEventListener("input", debounce(async (event) => {
    const query = event.target.value.trim();
    if (query.length < 2) {
      quickResults.classList.remove("show");
      quickResults.innerHTML = "";
      return;
    }
    try {
      const results = await fetchJson(`/anime?q=${encodeURIComponent(query)}&limit=5&sfw=true`);
      quickResults.innerHTML = results.data.map((anime) => `
        <a class="quick-result" href="#/anime/${anime.mal_id}/${slugify(anime.title)}">
          <img src="${imageOf(anime)}" alt="${escapeHtml(anime.title)} anime poster" loading="lazy" decoding="async">
          <strong>${escapeHtml(anime.title)}</strong>
          <span>&#9733; ${anime.score || "N/A"}</span>
        </a>
      `).join("");
      quickResults.classList.add("show");
    } catch (error) {
      quickResults.innerHTML = `<div class="quick-result">Search is taking a break. Try again shortly.</div>`;
      quickResults.classList.add("show");
    }
  }, 320));

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".hero-search")) quickResults.classList.remove("show");
    const favoriteButton = event.target.closest("[data-favorite]");
    if (favoriteButton) {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(JSON.parse(decodeURIComponent(favoriteButton.dataset.favorite)));
    }
  });

  navToggle.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
  });

  themeToggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyTheme(nextTheme);
  });

  scrollTopButton.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  introSkip.addEventListener("click", hideIntro);
}

function hideIntro() {
  clearTimeout(introTimer);
  document.querySelector("#pageLoader").classList.add("hide");
}

async function fetchJson(path) {
  const url = path.startsWith("http") ? path : `${API}${path}`;
  if (cache.has(url)) return cache.get(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  const data = await response.json();
  cache.set(url, data);
  return data;
}

async function hydrateHero() {
  heroSlider.innerHTML = skeletonCards(1);
  try {
    const { data } = await fetchJson("/top/anime?filter=airing&limit=5");
    heroSlider.innerHTML = data.map((anime, index) => `
      <a class="slide-card ${index === 0 ? "active" : ""}" href="#/anime/${anime.mal_id}/${slugify(anime.title)}">
        <img src="${imageOf(anime, "large")}" alt="${escapeHtml(anime.title)} trending anime poster" loading="${index === 0 ? "eager" : "lazy"}" decoding="async">
        <div class="slide-info">
          <p class="eyebrow">Trending now</p>
          <h2>${escapeHtml(anime.title)}</h2>
          <p>&#9733; ${anime.score || "N/A"} &bull; ${anime.episodes || "?"} episodes</p>
        </div>
      </a>
    `).join("");
    heroBackdrop.style.setProperty("--hero-image", `url("${imageOf(data[0], "large")}")`);
    startSlider(data);
  } catch (error) {
    heroSlider.innerHTML = `<div class="error-state">Trending anime could not load right now.</div>`;
  }
}

function startSlider(data) {
  let index = 0;
  setInterval(() => {
    const slides = [...heroSlider.querySelectorAll(".slide-card")];
    if (!slides.length) return;
    slides[index].classList.remove("active");
    index = (index + 1) % slides.length;
    slides[index].classList.add("active");
    heroBackdrop.style.setProperty("--hero-image", `url("${imageOf(data[index], "large")}")`);
  }, 4800);
}

function renderCategories() {
  categoryList.innerHTML = GENRES.map((genre) => `
    <a class="category-button" href="#/search?genre=${genre.id}">${genre.name}</a>
  `).join("");
}

function renderRoute() {
  if (location.hash && !location.hash.startsWith("#/")) return;
  navLinks.classList.remove("open");
  navToggle.setAttribute("aria-expanded", "false");
  const { page, id, params } = getRoute();
  document.body.classList.toggle("is-subpage", page !== "home");
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === page);
  });

  if (page === "anime" && id) {
    renderDetail(id);
  } else if (page === "search") {
    renderSearch(params);
  } else if (page === "favorites") {
    renderFavorites();
  } else if (page === "about" || page === "privacy" || page === "terms" || page === "contact") {
    renderTrustPage(page);
  } else {
    renderHome();
  }
  routeView.focus({ preventScroll: true });
}

function getRoute() {
  const raw = location.hash || "#/home";
  const [path, query = ""] = raw.replace("#/", "").split("?");
  const segments = path.split("/");
  const params = new URLSearchParams(query);
  return { page: segments[0] || "home", id: segments[1], params };
}

async function renderHome() {
  setSeo({
    title: "AnimeVerse - Best Anime Discovery, Ratings & Legal Watch Links",
    description: "Discover the best anime to watch next with trending shows, ratings, trailers, characters, episode info, favorites, and legal streaming links.",
    canonical: SITE_URL,
    type: "website"
  });
  routeView.innerHTML = `
    <section class="section seo-intro fade-in">
      <div class="section-heading">
        <div><p class="eyebrow">Anime guide</p><h2>Find anime by rating, genre, trailer, and legal watch options</h2></div>
      </div>
      <p>AnimeVerse is built for fans who want a fast way to discover what to watch next. Browse popular anime, compare scores, explore current seasonal releases, save favorites, and jump to official platforms such as Crunchyroll, Netflix, and Hulu when you are ready to watch legally.</p>
      <div class="internal-links" aria-label="Popular anime discovery links">
        <a href="#/search?order=popularity">Most popular anime</a>
        <a href="#/search?order=score">Top rated anime</a>
        <a href="#/search?genre=1">Best action anime</a>
        <a href="#/search?genre=22">Best romance anime</a>
      </div>
    </section>
    <section class="section fade-in">
      <div class="section-heading">
        <div><p class="eyebrow">Most watched</p><h2>Popular Anime</h2></div>
        <a class="secondary-cta" href="#/search?order=popularity">View all</a>
      </div>
      <div id="popularGrid">${skeletonCards(5)}</div>
    </section>
    <section class="section fade-in">
      <div class="section-heading">
        <div><p class="eyebrow">Fan favorites</p><h2>Top Rated</h2></div>
        <a class="secondary-cta" href="#/search?order=score">View all</a>
      </div>
      <div id="topGrid">${skeletonCards(5)}</div>
    </section>
    <section class="section fade-in">
      <div class="section-heading">
        <div><p class="eyebrow">Currently airing</p><h2>Trending This Season</h2></div>
        <a class="secondary-cta" href="#/search?order=favorites">View all</a>
      </div>
      <div id="trendingGrid">${skeletonCards(5)}</div>
    </section>
    ${adSlot("home-mid")}
    <section class="section guide-hub fade-in" id="guideHub">
      <div class="section-heading">
        <div><p class="eyebrow">Stay longer</p><h2>Pick your next anime path</h2></div>
      </div>
      <div class="guide-grid">
        <a class="guide-card" href="#/search?genre=1&rating=8&order=score">
          <span>High impact</span>
          <strong>Action anime with strong ratings</strong>
          <p>Fast fights, rivalries, tournament arcs, and big comeback episodes.</p>
        </a>
        <a class="guide-card" href="#/search?genre=22&rating=7&order=score">
          <span>Heart pull</span>
          <strong>Romance anime worth trying</strong>
          <p>Warm character drama, emotional endings, and comfort-watch stories.</p>
        </a>
        <a class="guide-card" href="#/search?genre=10&order=popularity">
          <span>World jump</span>
          <strong>Fantasy and adventure picks</strong>
          <p>Magic worlds, quests, guilds, monsters, and long binge-friendly journeys.</p>
        </a>
        <a class="guide-card" href="#/search?order=score&rating=8">
          <span>Safe bet</span>
          <strong>Top-rated anime for beginners</strong>
          <p>Start with shows fans already love, then branch into related genres.</p>
        </a>
      </div>
    </section>
    <section class="section retention-panel fade-in">
      <div>
        <p class="eyebrow">Legal watching only</p>
        <h2>Explore, save, compare, then watch on official platforms</h2>
        <p class="section-copy">AnimeVerse is designed as a discovery guide, not a streaming host. That keeps the site safer for ads, creators, and users while still giving visitors useful reasons to browse.</p>
      </div>
      <div class="retention-stats" aria-label="AnimeVerse feature highlights">
        <span><strong>Genres</strong> mood-based browsing</span>
        <span><strong>Watchlist</strong> local favorites</span>
        <span><strong>Details</strong> trailers and episodes</span>
      </div>
    </section>
  `;

  loadHomeSection("#popularGrid", "/top/anime?filter=bypopularity&limit=10");
  loadHomeSection("#topGrid", "/top/anime?limit=10");
  loadHomeSection("#trendingGrid", "/seasons/now?limit=10&sfw=true");
}

async function loadHomeSection(selector, path) {
  const container = document.querySelector(selector);
  if (!container) return;

  try {
    const { data } = await fetchJson(path);
    container.innerHTML = data?.length ? cardGrid(data) : `<div class="empty-state">No anime found for this section.</div>`;
  } catch (error) {
    container.innerHTML = `<div class="error-state">This anime section could not load. Try refreshing in a moment.</div>`;
  }
}

async function renderSearch(params) {
  state.searchPage = 1;
  state.currentQuery = params.get("q") || "";
  state.currentGenre = params.get("genre") || "";
  state.currentMinScore = params.get("rating") || "";
  state.currentOrder = params.get("order") || "popularity";
  const genreName = GENRES.find((genre) => String(genre.id) === state.currentGenre)?.name;
  const titlePrefix = genreName ? `Best ${genreName} Anime` : state.currentQuery ? `Search Anime: ${state.currentQuery}` : "Search Anime by Genre, Rating & Popularity";
  setSeo({
    title: `${titlePrefix} - AnimeVerse`,
    description: "Search anime instantly by title, genre, rating, and popularity. Compare scores, save favorites, and open anime detail pages with trailers and legal watch links.",
    canonical: `${SITE_URL}#/search${location.hash.includes("?") ? location.hash.slice(location.hash.indexOf("?")) : ""}`,
    type: "website"
  });

  routeView.innerHTML = `
    <section class="section fade-in">
      <div class="section-heading">
        <div><p class="eyebrow">Instant catalog</p><h1 class="page-title">Search Anime</h1></div>
      </div>
      <p class="section-copy">Use filters to discover anime that match your mood, from high-rated classics to current popular series. Results update quickly using public anime metadata and link to detail pages with summaries, trailers, characters, and legal watch options.</p>
      <form class="filter-panel" id="searchFilters">
        <input id="searchInput" type="search" value="${escapeHtml(state.currentQuery)}" placeholder="Search anime title" aria-label="Anime title">
        <select id="genreSelect" aria-label="Genre">
          <option value="">All genres</option>
          ${GENRES.map((genre) => `<option value="${genre.id}" ${state.currentGenre === String(genre.id) ? "selected" : ""}>${genre.name}</option>`).join("")}
        </select>
        <select id="ratingSelect" aria-label="Minimum rating">
          <option value="">Any rating</option>
          <option value="8" ${state.currentMinScore === "8" ? "selected" : ""}>8+</option>
          <option value="7" ${state.currentMinScore === "7" ? "selected" : ""}>7+</option>
          <option value="6" ${state.currentMinScore === "6" ? "selected" : ""}>6+</option>
        </select>
        <select id="orderSelect" aria-label="Sort order">
          <option value="popularity" ${state.currentOrder === "popularity" ? "selected" : ""}>Popularity</option>
          <option value="score" ${state.currentOrder === "score" ? "selected" : ""}>Top rated</option>
          <option value="favorites" ${state.currentOrder === "favorites" ? "selected" : ""}>Most favorited</option>
          <option value="title" ${state.currentOrder === "title" ? "selected" : ""}>Title</option>
        </select>
        <button class="filter-button" type="submit">Apply filters</button>
      </form>
      <div id="searchResults">${skeletonCards(10)}</div>
      <div class="pagination-row"><button class="load-more" id="loadMore" type="button">Load more</button></div>
    </section>
  `;

  document.querySelector("#searchFilters").addEventListener("submit", (event) => {
    event.preventDefault();
    updateSearchFromInputs();
  });
  ["searchInput", "genreSelect", "ratingSelect", "orderSelect"].forEach((id) => {
    const element = document.querySelector(`#${id}`);
    element.addEventListener(id === "searchInput" ? "input" : "change", debounce(updateSearchFromInputs, 420));
  });
  document.querySelector("#loadMore").addEventListener("click", () => loadSearchResults(true));
  await loadSearchResults(false);
}

function updateSearchFromInputs() {
  const query = document.querySelector("#searchInput").value.trim();
  const genre = document.querySelector("#genreSelect").value;
  const rating = document.querySelector("#ratingSelect").value;
  const order = document.querySelector("#orderSelect").value;
  const next = new URLSearchParams();
  if (query) next.set("q", query);
  if (genre) next.set("genre", genre);
  if (rating) next.set("rating", rating);
  if (order) next.set("order", order);
  state.currentQuery = query;
  state.currentGenre = genre;
  state.currentMinScore = rating;
  state.currentOrder = order;
  history.replaceState(null, "", `#/search?${next.toString()}`);
  loadSearchResults(false);
}

async function loadSearchResults(append) {
  const container = document.querySelector("#searchResults");
  const loadMore = document.querySelector("#loadMore");
  if (!append) {
    container.innerHTML = skeletonCards(10);
    state.searchPage = 1;
  } else {
    state.searchPage += 1;
    loadMore.textContent = "Loading...";
  }

  const parts = [`page=${state.searchPage}`, "limit=15", "sfw=true", `order_by=${state.currentOrder}`, "sort=desc"];
  if (state.currentQuery) parts.push(`q=${encodeURIComponent(state.currentQuery)}`);
  if (state.currentGenre) parts.push(`genres=${state.currentGenre}`);
  if (state.currentMinScore) parts.push(`min_score=${state.currentMinScore}`);

  try {
    const { data, pagination } = await fetchJson(`/anime?${parts.join("&")}`);
    const html = data.length ? cardGrid(data) : `<div class="empty-state">No anime found. Try a wider search.</div>`;
    if (append) {
      container.querySelector(".anime-grid")?.insertAdjacentHTML("beforeend", data.map(cardTemplate).join(""));
    } else {
      container.innerHTML = html;
    }
    loadMore.hidden = !pagination.has_next_page;
  } catch (error) {
    container.innerHTML = `<div class="error-state">Search results could not load. Try again in a moment.</div>`;
  } finally {
    loadMore.textContent = "Load more";
  }
}

async function renderDetail(id) {
  routeView.innerHTML = `<section class="section">${skeletonCards(3)}</section>`;
  try {
    const [animeResponse, charactersResponse, episodesResponse] = await Promise.all([
      fetchJson(`/anime/${id}/full`),
      fetchJson(`/anime/${id}/characters`),
      fetchJson(`/anime/${id}/episodes`),
    ]);
    const anime = animeResponse.data;
    const animeUrl = `${SITE_URL}#/anime/${anime.mal_id}/${slugify(anime.title)}`;
    setSeo({
      title: `${anime.title} Anime Guide: Rating, Episodes, Trailer & Legal Watch Links`,
      description: stripText(anime.synopsis || `Explore ${anime.title} anime details, rating, episodes, characters, trailer, and legal watch options.`),
      canonical: animeUrl,
      image: imageOf(anime, "large"),
      type: "video.tv_show",
      schema: animeSchema(anime, animeUrl)
    });
    const characters = charactersResponse.data.slice(0, 12);
    const episodes = episodesResponse.data.slice(0, 12);
    routeView.innerHTML = `
      <article class="fade-in">
        <section class="detail-hero">
          <img src="${imageOf(anime, "large")}" alt="${escapeHtml(anime.title)} anime banner image" loading="eager" decoding="async">
          <div class="detail-content">
            <img class="detail-poster" src="${imageOf(anime)}" alt="${escapeHtml(anime.title)} official anime poster">
            <div class="detail-panel">
              <div class="detail-title-row">
                <div>
                  <p class="eyebrow">${anime.status || "Anime details"}</p>
                  <h1>${escapeHtml(anime.title)}</h1>
                </div>
                ${favoriteMarkup(anime)}
              </div>
              <div class="meta-row">
                <div class="meta-tile"><span>Rating</span><strong>&#9733; ${anime.score || "N/A"}</strong></div>
                <div class="meta-tile"><span>Episodes</span><strong>${anime.episodes || "TBA"}</strong></div>
                <div class="meta-tile"><span>Type</span><strong>${anime.type || "Anime"}</strong></div>
                <div class="meta-tile"><span>Year</span><strong>${anime.year || "Unknown"}</strong></div>
              </div>
              <div class="chips">${(anime.genres || []).map((genre) => `<a class="chip" href="#/search?genre=${genre.mal_id}">${genre.name}</a>`).join("")}</div>
              <p class="synopsis">${escapeHtml(stripText(anime.synopsis || "Synopsis is not available yet."))}</p>
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-heading"><div><p class="eyebrow">Cast</p><h2>Characters</h2></div></div>
          <div class="character-grid">${characters.length ? characters.map(characterTemplate).join("") : `<div class="empty-state">Character details are not available.</div>`}</div>
        </section>

        <section class="section">
          <div class="section-heading"><div><p class="eyebrow">Guide</p><h2>Episode List</h2></div></div>
          <div class="episode-list">${episodes.length ? episodes.map((episode) => `<div class="episode-item"><strong>Episode ${episode.mal_id}</strong><p>${escapeHtml(episode.title || "Untitled")}</p></div>`).join("") : `<div class="empty-state">Episode information is not available.</div>`}</div>
        </section>

        <section class="section">
          <div class="section-heading"><div><p class="eyebrow">Official preview</p><h2>Trailer</h2></div></div>
          ${trailerMarkup(anime)}
        </section>

        ${adSlot("detail-mid")}

        <section class="section">
          <div class="section-heading"><div><p class="eyebrow">Legal platforms</p><h2>Watch On</h2></div></div>
          <div class="watch-grid">
            ${LEGAL_LINKS.map(([name, url]) => `<a class="watch-link" href="${url}${encodeURIComponent(anime.title)}" target="_blank" rel="noopener">${name}<span>&#8599;</span></a>`).join("")}
          </div>
        </section>

        <section class="section seo-intro">
          <div class="section-heading"><div><p class="eyebrow">Anime FAQ</p><h2>${escapeHtml(anime.title)} discovery guide</h2></div></div>
          <div class="faq-grid">
            <article class="faq-item">
              <h3>Where can I watch ${escapeHtml(anime.title)} legally?</h3>
              <p>Use the legal platform links above to search official services. Availability can vary by country and subscription plan.</p>
            </article>
            <article class="faq-item">
              <h3>What genres does ${escapeHtml(anime.title)} belong to?</h3>
              <p>${(anime.genres || []).map((genre) => genre.name).join(", ") || "Genre details are not available yet."}</p>
            </article>
            <article class="faq-item">
              <h3>Is ${escapeHtml(anime.title)} worth watching?</h3>
              <p>Check the rating, synopsis, trailer, characters, and episode count on this page to decide whether it matches your taste.</p>
            </article>
          </div>
          <div class="internal-links">
            ${(anime.genres || []).slice(0, 4).map((genre) => `<a href="#/search?genre=${genre.mal_id}">More ${genre.name} anime</a>`).join("")}
            <a href="#/search?order=score">Explore top rated anime</a>
          </div>
        </section>
      </article>
    `;
  } catch (error) {
    routeView.innerHTML = `<div class="error-state">Anime details could not load right now.</div>`;
  }
}

function adSlot(label) {
  return `
    <aside class="ad-slot" aria-label="Advertisement placement">
      <span>Advertisement</span>
      <strong>Ad space ready</strong>
      <p>Use this area for approved ad network code after your site has enough original content and policy pages.</p>
      <small>${label}</small>
    </aside>
  `;
}

function renderFavorites() {
  setSeo({
    title: "Saved Anime Favorites - AnimeVerse Watchlist",
    description: "View your locally saved anime favorites and quickly return to anime ratings, trailers, summaries, and legal watch links.",
    canonical: `${SITE_URL}#/favorites`,
    type: "website"
  });
  routeView.innerHTML = `
    <section class="section fade-in">
      <div class="section-heading">
        <div><p class="eyebrow">Bookmarks</p><h1 class="page-title">Favorites</h1></div>
      </div>
      <p class="section-copy">Your favorites are stored privately in this browser with localStorage. Use this watchlist to compare anime later and revisit official trailers or legal platform links.</p>
      ${state.favorites.length ? cardGrid(state.favorites) : `<div class="empty-state">No saved anime yet. Tap the heart on any card to bookmark it.</div>`}
    </section>
  `;
}

function renderTrustPage(page) {
  const pages = {
    about: {
      title: "About AnimeVerse - Legal Anime Discovery Guide",
      heading: "About AnimeVerse",
      description: "Learn about AnimeVerse, a legal anime discovery guide for ratings, trailers, characters, favorites, and official watch links.",
      eyebrow: "About",
      body: `
        <p>AnimeVerse helps fans discover anime through public metadata, ratings, trailers, characters, genres, and official platform search links. The site is built for discovery and guidance only.</p>
        <p>AnimeVerse does not host, embed, upload, or promote pirated anime episodes or illegal streaming sources. Visitors should use licensed platforms available in their region.</p>
      `
    },
    privacy: {
      title: "Privacy Policy - AnimeVerse",
      heading: "Privacy Policy",
      description: "Read the AnimeVerse privacy policy covering local favorites, ads, analytics, external links, and public anime metadata.",
      eyebrow: "Privacy",
      body: `
        <p>AnimeVerse stores favorites locally in your browser using localStorage. This watchlist stays on your device unless you clear browser data.</p>
        <p>The site may use advertising or analytics tools after publishing. These services may use cookies or similar technologies according to their own policies.</p>
        <p>AnimeVerse links to external platforms such as Crunchyroll, Netflix, Hulu, YouTube, and anime database pages. External sites have their own privacy practices.</p>
      `
    },
    terms: {
      title: "Terms of Use - AnimeVerse",
      heading: "Terms of Use",
      description: "Read the AnimeVerse terms for legal anime discovery, external links, public data, and responsible site usage.",
      eyebrow: "Terms",
      body: `
        <p>AnimeVerse is an informational anime discovery website. Anime details, images, ratings, characters, and trailer data may come from public third-party sources.</p>
        <p>All anime titles, images, videos, and trademarks belong to their respective owners. AnimeVerse does not claim ownership of third-party intellectual property.</p>
        <p>Users should not treat platform search links as availability guarantees. Streaming availability can vary by country, license, and subscription plan.</p>
      `
    },
    contact: {
      title: "Contact AnimeVerse - Corrections, Ads & Takedown Requests",
      heading: "Contact AnimeVerse",
      description: "Contact AnimeVerse for corrections, feedback, advertising questions, takedown requests, or legal anime discovery suggestions.",
      eyebrow: "Contact",
      body: `
        <p>For corrections, feedback, takedown requests, partnership questions, or advertising inquiries, contact the site owner at <strong>hello@animeverse.example</strong>.</p>
        <p>When reporting an issue, include the page URL, anime title, and a clear explanation so the request can be reviewed quickly.</p>
      `
    }
  };
  const content = pages[page] || pages.about;
  setSeo({
    title: content.title,
    description: content.description,
    canonical: `${SITE_URL}#/${page}`,
    type: "website"
  });
  routeView.innerHTML = `
    <section class="section seo-intro fade-in">
      <div class="section-heading">
        <div><p class="eyebrow">${content.eyebrow}</p><h1 class="page-title">${content.heading}</h1></div>
      </div>
      <div class="policy-copy">${content.body}</div>
      <div class="internal-links">
        <a href="#/about">About</a>
        <a href="#/privacy">Privacy Policy</a>
        <a href="#/terms">Terms</a>
        <a href="#/contact">Contact</a>
      </div>
    </section>
  `;
}

function cardGrid(items) {
  return `<div class="anime-grid">${items.map(cardTemplate).join("")}</div>`;
}

function cardTemplate(anime) {
  return `
    <a class="card" href="#/anime/${anime.mal_id}/${slugify(anime.title)}" aria-label="View ${escapeHtml(anime.title)} anime details">
      <div class="poster-wrap">
        <img src="${imageOf(anime)}" alt="${escapeHtml(anime.title)} anime poster with rating and episode information" loading="lazy" decoding="async">
        <span class="rating-pill">&#9733; ${anime.score || "N/A"}</span>
        ${favoriteMarkup(anime)}
        <span class="type-pill">${anime.type || "Anime"}</span>
      </div>
      <div class="card-body">
        <p class="card-title">${escapeHtml(anime.title)}</p>
        <div class="card-meta"><span>${anime.episodes || "?"} eps</span><span>${anime.year || anime.aired?.prop?.from?.year || "TBA"}</span></div>
      </div>
    </a>
  `;
}

function characterTemplate(item) {
  const character = item.character;
  return `
    <a class="card character-card" href="${character.url}" target="_blank" rel="noopener">
      <img src="${character.images?.jpg?.image_url || ""}" alt="${escapeHtml(character.name)} anime character image" loading="lazy" decoding="async">
      <div class="card-body">
        <p class="card-title">${escapeHtml(character.name)}</p>
        <div class="card-meta"><span>${item.role}</span></div>
      </div>
    </a>
  `;
}

function trailerMarkup(anime) {
  const trailerUrl = anime.trailer?.url || anime.trailer?.embed_url;
  const embedUrl = anime.trailer?.embed_url;
  if (!trailerUrl) {
    return `<div class="empty-state">No official YouTube trailer is available for this anime.</div>`;
  }

  if (location.protocol === "file:") {
    return `
      <div class="trailer-fallback">
        <h3>Trailer opens on YouTube</h3>
        <p>YouTube embeds may not load from a local file path. Open the site through the local server or watch the official trailer on YouTube.</p>
        <a class="primary-cta" href="${trailerUrl}" target="_blank" rel="noopener">Watch official trailer</a>
      </div>
    `;
  }

  return `
    <iframe class="trailer-frame" src="${embedUrl}" title="${escapeHtml(anime.title)} official anime trailer" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
    <div class="trailer-note">
      <span>If the embed is blocked,</span>
      <a href="${trailerUrl}" target="_blank" rel="noopener">watch the official trailer on YouTube</a>.
    </div>
  `;
}

function favoriteMarkup(anime) {
  const minimal = {
    mal_id: anime.mal_id,
    title: anime.title,
    score: anime.score,
    episodes: anime.episodes,
    year: anime.year || anime.aired?.prop?.from?.year,
    type: anime.type,
    images: anime.images
  };
  const saved = state.favorites.some((item) => item.mal_id === anime.mal_id);
  return `<button class="favorite-btn ${saved ? "saved" : ""}" type="button" aria-label="${saved ? "Remove from" : "Add to"} favorites" data-favorite="${encodeURIComponent(JSON.stringify(minimal))}">&hearts;</button>`;
}

function toggleFavorite(anime) {
  const exists = state.favorites.some((item) => item.mal_id === anime.mal_id);
  state.favorites = exists ? state.favorites.filter((item) => item.mal_id !== anime.mal_id) : [anime, ...state.favorites];
  localStorage.setItem("animeverse:favorites", JSON.stringify(state.favorites));
  renderRoute();
}

function imageOf(anime, size = "normal") {
  return size === "large"
    ? anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || ""
    : anime.images?.webp?.image_url || anime.images?.jpg?.image_url || "";
}

function skeletonCards(count) {
  return `<div class="skeleton-grid">${Array.from({ length: count }, () => `<div class="skeleton"></div>`).join("")}</div>`;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("animeverse:theme", theme);
  themeToggle.querySelector(".theme-icon").textContent = theme === "light" ? "L" : "D";
  themeToggle.querySelector(".theme-label").textContent = theme === "light" ? "Light" : "Dark";
}

function handleScroll() {
  scrollTopButton.classList.toggle("show", window.scrollY > 520);
}

function setTitle(title, description) {
  document.title = title;
  document.querySelector("meta[name='description']").setAttribute("content", description.slice(0, 155));
}

function setSeo({ title, description, canonical, image, type, schema }) {
  const safeDescription = stripText(description || "").slice(0, 155);
  document.title = title;
  setMeta("meta[name='description']", "content", safeDescription);
  setMeta("link[rel='canonical']", "href", canonical || SITE_URL);
  setMeta("meta[property='og:title']", "content", title);
  setMeta("meta[property='og:description']", "content", safeDescription);
  setMeta("meta[property='og:url']", "content", canonical || SITE_URL);
  setMeta("meta[property='og:type']", "content", type || "website");
  setMeta("meta[property='og:image']", "content", image || "https://cdn.myanimelist.net/images/anime/1208/94745l.jpg");
  setMeta("meta[name='twitter:title']", "content", title);
  setMeta("meta[name='twitter:description']", "content", safeDescription);
  const schemaTag = document.querySelector("#baseSchema");
  if (schemaTag && schema) {
    schemaTag.textContent = JSON.stringify(schema);
  } else if (schemaTag) {
    schemaTag.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "AnimeVerse",
      "url": SITE_URL,
      "description": "AnimeVerse helps fans discover trending, popular, and top-rated anime with trailers, ratings, characters, and legal streaming links.",
      "potentialAction": {
        "@type": "SearchAction",
        "target": `${SITE_URL}#/search?q={search_term_string}`,
        "query-input": "required name=search_term_string"
      }
    });
  }
}

function setMeta(selector, attribute, value) {
  const element = document.querySelector(selector);
  if (element && value) element.setAttribute(attribute, value);
}

function animeSchema(anime, url) {
  return {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    "name": anime.title,
    "url": url,
    "image": imageOf(anime, "large"),
    "description": stripText(anime.synopsis || ""),
    "genre": (anime.genres || []).map((genre) => genre.name),
    "numberOfEpisodes": anime.episodes || undefined,
    "aggregateRating": anime.score ? {
      "@type": "AggregateRating",
      "ratingValue": anime.score,
      "bestRating": 10,
      "ratingCount": anime.scored_by || 1
    } : undefined
  };
}

function stripText(text) {
  return text.replace(/\[Written by MAL Rewrite\]/gi, "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "anime";
}

function debounce(callback, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}
