/**
 * MGCE MALL - Logic Layer
 * Merges static listings with local IndexedDB data and handles rendering.
 */
console.log("MGCE MALL: Global Logic Engine Ignited 💎");

// Global helper for theme toggle
window.toggleTheme = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
};

// Navbar Search Logic
window.handleNavbarSearch = (e) => {
    e.preventDefault();
    const query = e.target.querySelector('input').value;
    if (query) {
        window.location.href = `shop.html?search=${encodeURIComponent(query)}`;
    }
};

// Admin Portal Quick-Access (Hardened for Luxe Update)
window.goToAdmin = () => {
    try {
        const modal = document.getElementById('security-modal');
        if (modal && modal.__x) {
            modal.__x.$data.open = true;
            return;
        }
        // Fallback for pages without modal
        const key = prompt("Enter Master Key to access Admin Control:");
        if (key === '3639') {
            window.location.href = 'master-admin.html';
        } else if (key) {
            if (window.showToast) window.showToast("ACCESS DENIED: INVALID KEY", "danger");
            else alert("Access Denied: Invalid Key.");
        }
    } catch (e) {
        console.error("MALL: Admin Access Error", e);
        const key = prompt("MALL SECURITY FALLBACK: Enter Master Key:");
        if (key === '3639') window.location.href = 'master-admin.html';
    }
};

// Global Favorite Toggle
// Global Favorite Toggle with Safety Retry
window.toggleFavorite = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 1. Instant UI Feedback (Zero-Lag)
    const icon = e.currentTarget.querySelector('i') || e.currentTarget.querySelector('svg');
    const countSpan = document.getElementById(`count-${id}`);
    
    if (icon) {
        const isCurrentlyRed = icon.classList.contains('fill-red-500');
        if (!isCurrentlyRed) {
            icon.classList.add('fill-red-500', 'text-red-500');
            icon.classList.remove('text-slate-400');
            icon.setAttribute('fill', 'currentColor'); 
            if (countSpan) countSpan.innerText = `❤️ ${parseInt(countSpan.innerText.replace('❤️ ', '') || '0') + 1}`;
        } else {
            icon.classList.remove('fill-red-500', 'text-red-500');
            icon.classList.add('text-slate-400');
            icon.setAttribute('fill', 'none');
            if (countSpan) countSpan.innerText = `❤️ ${Math.max(0, parseInt(countSpan.innerText.replace('❤️ ', '') || '0') - 1)}`;
        }
    }

    // 2. Silent Background Sync
    try {
        const isAdded = await window.MarketplaceDB.toggleFavorite(id);
        
        // 3. Precise count update (if UI wasn't updated already or needs corrective sync)
        const countSpan = document.getElementById(`count-${id}`);
        if (countSpan) {
            const currentCount = parseInt(countSpan.innerText.replace('❤️ ', '') || '0');
            // This is just a fallback; the primary UI update happened at step 1
        }
    } catch (err) {
        console.warn("MGCE: Favorite background sync handled locally.", err.message);
    }
};

// Global Session Timer (2 Minute Pulse & Security Lockdown)
let sessionTimeout;
const resetSessionTimer = async () => {
    if (window.MarketplaceDB) {
        // Only trigger session logic if a phone exists in LocalStorage (user is intended to be logged in)
        const sessionPhone = localStorage.getItem('mgce_session_phone');
        if (!sessionPhone) {
            clearTimeout(sessionTimeout);
            return; 
        }

        // Hardening: Verify user still exists/not-banned on every activity
        const session = await window.MarketplaceDB.getCurrentSession();
        if (!session) {
            alert("Your session has been terminated by an administrator.");
            window.location.href = '/auth?mode=login';
            return;
        }

        window.MarketplaceDB.refreshSession();
        clearTimeout(sessionTimeout);
        sessionTimeout = setTimeout(() => {
            // Re-verify session right before alert to prevent "ghost" alerts
            if (localStorage.getItem('mgce_session_phone')) {
                alert("Session expired due to 2 minutes of inactivity. Please sign in again.");
                window.MarketplaceDB.clearSession();
                window.location.href = '/auth?mode=login';
            }
        }, 120000); // 2 minutes
    }
};

// Security Pulse: Background check every 10 seconds to catch bans instantly
let securityStrikes = 0;
setInterval(async () => {
    if (window.MarketplaceDB && localStorage.getItem('mgce_session_phone')) {
        const session = await window.MarketplaceDB.getCurrentSession();
        if (!session) {
            securityStrikes++;
            console.warn(`MGCE: Security Pulse Strike ${securityStrikes}/3`);
            if (securityStrikes >= 3) {
                console.error("MGCE: Session security check failed 3 times. Redirecting.");
                window.location.href = 'auth.html?mode=login';
                securityStrikes = 0;
            }
        } else {
            securityStrikes = 0; // Reset on success
        }
    }
}, 10000);

// Activity Listeners
['click', 'touchstart', 'mousemove', 'scroll', 'keydown'].forEach(evt => 
    document.addEventListener(evt, resetSessionTimer, { passive: true })
);

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Core initialization
    if (window.MarketplaceDB) {
        await window.MarketplaceDB.init();
        
        const session = await window.MarketplaceDB.getCurrentSession();
        if (session) {
            await window.MarketplaceDB.refreshSession();
            resetSessionTimer();
        }

    // --- Universal Cloud Status Injection ---
    window.injectCloudStatusIndicator = () => {
        const header = document.querySelector('header');
        if (!header || document.getElementById('global-cloud-pill')) return;

        // Find the right target (Logo area or similar)
        const logoBrand = header.querySelector('.flex.flex-col.leading-tight') || header.querySelector('.sm\\:flex.flex-col');
        if (logoBrand) {
            const pill = document.createElement('div');
            pill.id = 'global-cloud-pill';
            pill.className = 'flex items-center gap-1.5 ml-3 px-2 py-1 rounded-full border border-white/5 bg-white/5 backdrop-blur-md transition-all duration-500 opacity-0 scale-90';
            pill.innerHTML = `
                <div class="pill-dot w-1.5 h-1.5 rounded-full ${window.mgceCloudStatus === 'online' ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-orange-500 animate-pulse'}"></div>
                <span class="pill-text text-[7px] font-black uppercase tracking-widest text-slate-400">
                    ${window.mgceCloudStatus === 'online' ? 'Cloud Sync' : 'Local Data'}
                </span>
            `;
            logoBrand.after(pill);
            
            // Fade in elegantly
            setTimeout(() => {
                pill.classList.remove('opacity-0', 'scale-90');
                pill.classList.add('opacity-100', 'scale-100');
            }, 500);
        }
    };

    // Listen for Cloud State Changes
    window.addEventListener('mgce-cloud-state-change', (e) => {
        const pill = document.getElementById('global-cloud-pill');
        if (pill) {
            const dot = pill.querySelector('.pill-dot');
            const text = pill.querySelector('.pill-text');
            if (e.detail.status === 'online') {
                dot.className = 'pill-dot w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]';
                text.innerText = 'Cloud Sync';
            } else {
                dot.className = 'pill-dot w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse';
                text.innerText = 'Local Data';
            }
        }
    });

    // Run injection
    injectCloudStatusIndicator();

    // --- Real-Time Sync Engine: Re-render on Cloud Update ---
    window.addEventListener('mgce-db-updated', async (e) => {
        console.log(`MGCE: UI Sync Pulse [${e.detail.type}] landed. Re-rendering...`);
        
        // 1. Refetch data
        const freshListings = await window.getCombinedListings();
        
        // 2. Refresh UI Sections
        if (document.getElementById('trending-slider')) {
            renderTrendingSlider(freshListings);
        }
        if (document.getElementById('featured-listings')) {
            const featured = freshListings.filter(l => l.isFeatured).slice(0, 4);
            document.getElementById('featured-listings').innerHTML = (await Promise.all(featured.map(l => renderListingCard(l)))).join('');
            lucide.createIcons();
        }
        if (document.getElementById('shop-grid')) {
            // Re-run the main shop rendering logic with fresh data
            window.refreshShopUI(freshListings);
        }
        if (document.getElementById('stats-section')) {
            animateStats();
        }
    });

    // Check for Administrator Broadcasts
    const broadcast = await window.MarketplaceDB.getBroadcast();
        if (broadcast && broadcast.message) {
            const style = document.createElement('style');
            style.innerHTML = `
                @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
                @keyframes flicker { 
                    0%, 18%, 22%, 25%, 53%, 57%, 100% { opacity: 1; text-shadow: 0 0 10px var(--primary); }
                    20%, 24%, 55% { opacity: 0.2; text-shadow: none; }
                }
                .animate-marquee { animation: marquee 30s linear infinite; }
                .animate-flicker { animation: flicker 3s infinite; }
            `;
            document.head.appendChild(style);

            const banner = document.createElement('div');
            banner.className = 'fixed top-16 left-0 w-full bg-navy/90 backdrop-blur-xl border-y border-primary/30 h-10 z-[45] flex items-center overflow-hidden';
            banner.innerHTML = `
                <div class="flex items-center h-full px-6 bg-navy z-10 border-r border-primary/20 shadow-[10px_0_20px_rgba(0,0,0,0.5)]">
                    <span class="animate-flicker flex items-center gap-2 text-[10px] font-black text-primary uppercase tracking-tighter">
                        <span class="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                        LIVE NOTICE
                    </span>
                </div>
                <div class="flex-1 overflow-hidden relative">
                    <div class="animate-marquee whitespace-nowrap inline-block py-2">
                        <span class="text-[12px] font-black text-white uppercase tracking-widest px-10">
                            ${broadcast.message} • ${broadcast.message} • ${broadcast.message}
                        </span>
                    </div>
                </div>
                <button onclick="this.closest('div').remove()" class="h-full px-4 bg-navy z-10 border-l border-primary/20 text-slate-500 hover:text-red-500 transition-colors">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            `;
            document.body.appendChild(banner);
            lucide.createIcons();
        }
    }

    // Apply theme
    if (localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }

    // 1. Render Categories on Home Page
    const categoryGrid = document.getElementById('category-grid');
    if (categoryGrid) {
        const categories = [
            { name: "Electronics & Tech", icon: "💻" },
            { name: "Food & Drinks", icon: "🥤" },
            { name: "Fashion & Thrift", icon: "👗" },
            { name: "Saloon & Hair", icon: "✂️" },
            { name: "Manicure & Spa", icon: "💅" },
            { name: "Academic Tools", icon: "📚" },
            { name: "Tailoring & Laundry", icon: "🧺" },
            { name: "Graphic Design", icon: "🎨" },
        ];

        categoryGrid.innerHTML = categories.map((cat, idx) => `
            <div class="animate-fade-in-up" style="animation-delay: ${idx * 0.1}s">
                <a href="shop.html?category=${cat.name}" class="flex flex-col items-center p-6 rounded-2xl bg-cream/50 dark:bg-slate-900/50 border border-border dark:border-slate-800 hover:border-primary/30 transition-all text-center group">
                    <span class="text-4xl mb-4 group-hover:scale-110 transition-transform">${cat.icon}</span>
                    <span class="font-bold text-navy dark:text-white text-sm">${cat.name}</span>
                </a>
            </div>
        `).join('');
    }

    // Load combined listings
    const combinedListings = await getCombinedListings();

    // 2. Render Featured Listings on Home Page
    const featuredListingsGrid = document.getElementById('featured-listings');
    if (featuredListingsGrid) {
        const featured = combinedListings.filter(l => l.isFeatured).slice(0, 4);
        featuredListingsGrid.innerHTML = (await Promise.all(featured.map(l => renderListingCard(l)))).join('');
        lucide.createIcons();
    }

    // 3. Shop Entry Point
    window.refreshShopUI = async (allListings) => {
        const shopGrid = document.getElementById('shop-grid');
        if (!shopGrid) return;

        const urlParams = new URLSearchParams(window.location.search);
        const categoryFilter = urlParams.get('category');
        const typeFilter = urlParams.get('type');
        const activeFilter = urlParams.get('filter');
        const searchQuery = urlParams.get('search');
        
        let filteredListings = allListings;

        // Auto-hide sold items after 1 hour on the public shop
        const now = Date.now();
        filteredListings = filteredListings.filter(l => {
            if (!l.isSoldOut) return true;
            return (now - (l.soldAt || 0)) < 3600000;
        });

        if (categoryFilter) {
            filteredListings = filteredListings.filter(l => l.category.includes(categoryFilter));
        }
        if (typeFilter) {
            filteredListings = filteredListings.filter(l => l.type === typeFilter);
        }
        if (activeFilter === 'favorites') {
            const favResults = await Promise.all(allListings.map(async l => ({
                id: l.id,
                isFav: await window.MarketplaceDB.isFavorite(l.id)
            })));
            const favIds = favResults.filter(r => r.isFav).map(r => r.id);
            filteredListings = filteredListings.filter(l => favIds.includes(l.id));
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filteredListings = filteredListings.filter(l => 
                l.title.toLowerCase().includes(q) || 
                l.description.toLowerCase().includes(q) ||
                l.category.toLowerCase().includes(q)
            );
        }

        shopGrid.innerHTML = filteredListings.length > 0 
            ? (await Promise.all(filteredListings.map(l => renderListingCard(l)))).join('')
            : `<div class="col-span-full py-20 text-center">
                 <p class="text-slate-400 italic">No matches found for your search items in Maseno.</p>
               </div>`;
        lucide.createIcons();
    };

    // Initial Shop Render
    await window.refreshShopUI(combinedListings);

    // 4. Render Product Details Page
    const detailsContainer = document.getElementById('details-container');
    if (detailsContainer) {
        const urlParams = new URLSearchParams(window.location.search);
        const slug = urlParams.get('slug');
        const id = urlParams.get('id');
        
        const listing = combinedListings.find(l => (slug && l.slug === slug) || (id && l.id === id));

        if (listing) {
            detailsContainer.innerHTML = await renderListingDetails(listing);
            document.title = `${listing.title} | MGCE MALL`;
            
            // Render Suggested Items
            const suggestedGrid = document.getElementById('suggested-items');
            if (suggestedGrid) {
                const suggested = combinedListings
                    .filter(l => l.category === listing.category && l.id !== listing.id)
                    .slice(0, 4);
                
                if (suggested.length > 0) {
                    suggestedGrid.innerHTML = `
                        <div class="mt-20 space-y-8">
                            <h3 class="text-2xl font-black text-navy dark:text-white uppercase tracking-tight">You might also like...</h3>
                            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                ${await Promise.all(suggested.map(l => renderListingCard(l))).then(cards => cards.join(''))}
                            </div>
                        </div>
                    `;
                    lucide.createIcons();
                }
            }
        } else {
            detailsContainer.innerHTML = `
                <div class="text-center py-20">
                    <h1 class="text-4xl font-black text-navy dark:text-white mb-4 uppercase">Item Not Found</h1>
                    <p class="text-slate-500 dark:text-slate-400 mb-8">The item you are looking for does not exist or has been removed.</p>
                    <a href="shop.html" class="px-8 py-3 bg-navy dark:bg-primary text-primary dark:text-navy rounded-xl font-bold uppercase tracking-widest">Back to Shop</a>
                </div>
            `;
        }
        lucide.createIcons();
        if (session.role === 'seller') {
            // Fetch Sassy Stats
            const stats = await window.MarketplaceDB.getSellerStats(session.phone);
            const heartsEl = document.getElementById('seller-total-hearts');
            const itemsEl = document.getElementById('seller-active-items');
            if (heartsEl) heartsEl.innerText = stats.totalHearts.toLocaleString();
            if (itemsEl) itemsEl.innerText = stats.items.length.toLocaleString();

            const myItems = stats.items;
            if (myItems.length > 0) {
                myListingsGrid.innerHTML = await Promise.all(myItems.map(async l => {
                    return `
                        <div class="p-5 bg-white dark:bg-slate-900 border border-border dark:border-slate-800 rounded-[32px] flex items-center justify-between gap-4 group transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <div class="flex items-center gap-5">
                                <div class="w-14 h-14 bg-navy text-primary rounded-2xl flex items-center justify-center font-black text-2xl shadow-xl relative">
                                    ${l.title.charAt(0)}
                                    <div class="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-lg flex items-center gap-1 shadow-lg">
                                        ❤️ ${l.heartCount || 0}
                                    </div>
                                </div>
                                <div>
                                    <h4 class="font-bold text-navy dark:text-white uppercase tracking-tight">${l.title}</h4>
                                    <div class="flex items-center gap-2 mt-1">
                                        <span class="text-[8px] font-black uppercase tracking-[0.2em] ${l.isSold ? 'text-red-500' : 'text-primary'}" x-text="'${l.isSold ? 'Sold' : 'Active'}'"></span>
                                        <span class="text-[8px] text-slate-400 font-bold uppercase tracking-[0.2em] border-l border-slate-200 dark:border-slate-700 pl-2">KSh ${l.price.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <button onclick="markAsSold('${l.id}')" 
                                        class="px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${l.isSold ? 'bg-slate-100 dark:bg-slate-800 text-slate-400' : 'bg-primary/10 text-primary hover:bg-primary hover:text-navy'}">
                                    ${l.isSold ? 'Restock' : 'Mark Sold'}
                                </button>
                                <button onclick="deleteListing('${l.id}')" class="p-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                                </button>
                            </div>
                        </div>
                    `;
                })).then(res => res.join(''));
            } else {
                myListingsGrid.innerHTML = `<div class="col-span-full py-20 text-center"><p class="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em]">No listings posted yet.</p></div>`;
            }
        } else {
            // Buyer Role: Show Favorites
            const favIds = session.favorites || [];
            const myFavs = localListings.filter(l => favIds.includes(l.id));
            if (myFavs.length > 0) {
                myListingsGrid.classList.remove('grid-cols-1');
                myListingsGrid.classList.add('grid-cols-1', 'sm:grid-cols-2');
                myListingsGrid.innerHTML = await Promise.all(myFavs.map(l => renderListingCard(l))).then(cards => cards.join(''));
            } else {
                myListingsGrid.innerHTML = `
                    <div class="col-span-full py-12 text-center space-y-4">
                        <i data-lucide="heart" class="w-12 h-12 text-slate-200 mx-auto"></i>
                        <p class="text-slate-400 text-xs italic">You haven't loved any items yet.</p>
                        <a href="shop.html" class="inline-block text-xs font-bold text-primary hover:underline uppercase tracking-widest">Start Exploring</a>
                    </div>`;
            }
        }
        lucide.createIcons();
    }
});

// Fetch combined data
window.getCombinedListings = async () => {
    if (!window.MarketplaceDB.db) await window.MarketplaceDB.init();
    
    // Dynamic + Static
    const dynamic = await window.MarketplaceDB.getAllListings();
    const staticListings = window.getStaticListings ? window.getStaticListings() : [];
    
    const combined = [...dynamic, ...staticListings];

    // Inject user data (verification + badges) for every listing
    for (let l of combined) {
        const user = await window.MarketplaceDB.getUser(l.sellerPhone);
        if (user) {
            l.isVerified = user.isVerified;
            l.badge = user.badge || '';
        }
    }

    return combined.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
};

// Global stats calculator for Alpha/Admin use
window.getSellerStats = async (phone) => {
    if (!window.MarketplaceDB) return { totalSales: 0, activeCount: 0 };
    const all = await window.MarketplaceDB.getAllListings();
    const myItems = all.filter(l => l.sellerPhone === phone);
    
    const totalSales = myItems
        .filter(l => l.isSoldOut)
        .reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
        
    const activeCount = myItems.filter(l => !l.isSoldOut).length;
    
    return { totalSales, activeCount };
};

window.getAdminPlatformStats = async () => {
    const all = await window.MarketplaceDB.getAllListings();
    
    // Total platform metrics
    const totalRevenue = all.filter(l => l.isSoldOut).reduce((sum, l) => sum + parseFloat(l.price), 0);
    const totalActive = all.filter(l => !l.isSoldOut).length;
    const totalSold = all.filter(l => l.isSoldOut).length;

    // Seller aggregation
    const sellersMap = {};
    for (let listing of all) {
        const phone = listing.sellerPhone;
        if (!sellersMap[phone]) {
            const isVerified = await window.MarketplaceDB.isSellerVerified(phone);
            sellersMap[phone] = {
                name: listing.sellerName,
                phone: phone,
                itemsCount: 0,
                salesAmount: 0,
                soldCount: 0,
                isVerified: isVerified,
                location: listing.location || 'Maseno'
            };
        }
        sellersMap[phone].itemsCount++;
        if (listing.isSoldOut) {
            sellersMap[phone].salesAmount += parseFloat(listing.price);
            sellersMap[phone].soldCount++;
        }
    }

    const sellers = Object.values(sellersMap).sort((a, b) => b.salesAmount - a.salesAmount);
    const verifiedCount = sellers.filter(s => s.isVerified).length;
    
    const logs = await window.MarketplaceDB.getAuditLogs();
    const blacklist = await window.MarketplaceDB.getBlacklist();
    const broadcast = await window.MarketplaceDB.getBroadcast();
    const users = await window.MarketplaceDB.getAllUsers();

    const buyersCount = users.filter(u => u.role === 'buyer').length;
    const sellersCount = users.filter(u => u.role === 'seller').length;

    return {
        listings: all,
        sellers: sellers,
        logs: logs,
        blacklist: blacklist,
        broadcast: broadcast,
        users: users,
        totalRevenue,
        totalActive,
        totalSold,
        totalItems: all.length,
        verifiedCount,
        buyersCount,
        sellersCount
    };
};

function isVideo(src) {
    if (!src || typeof src !== 'string') return false;
    return src.startsWith('data:video') || src.endsWith('.mp4') || src.endsWith('.webm') || src.endsWith('.mov');
}

/**
 * Helper to render a listing card HTML (Luxe Redesign)
 */
async function renderListingCard(listing) {
    const isFav = await window.MarketplaceDB.isFavorite(listing.id);
    const media = listing.images && listing.images.length > 0 ? listing.images[0] : 'placeholder';
    const isVideo = media.startsWith('data:video');

    return `
        <div class="group luxe-card overflow-hidden relative">
            
            <!-- Luxe Favorite Trigger -->
            <button onclick="toggleFavorite(event, '${listing.id}')" 
                    class="absolute top-6 right-6 z-20 p-3 bg-white/40 dark:bg-navy/40 backdrop-blur-xl rounded-[20px] shadow-2xl hover:scale-110 active:scale-90 transition-all border border-white/20">
                <i data-lucide="heart" class="w-5 h-5 ${isFav ? 'fill-red-500 text-red-500' : 'text-white'}"></i>
            </button>

            <a href="details.html?id=${listing.id}" class="block aspect-[4/5] overflow-hidden relative">
                ${media === 'placeholder' ? `
                    <div class="w-full h-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
                        <span class="text-navy/5 dark:text-white/5 font-black text-6xl italic tracking-tighter">LUXE</span>
                    </div>
                ` : isVideo ? `
                    <video src="${media}" class="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" muted loop autoplay></video>
                ` : `
                    <img src="${media}" alt="${listing.title}" class="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110">
                `}
                
                <!-- Luxe Status Pills -->
                <div class="absolute top-6 left-6 z-10 flex flex-col gap-2">
                    ${listing.isSoldOut ? `
                        <span class="status-pill status-pill-sold">Sold Out</span>
                    ` : `
                        <span class="status-pill ${listing.type === 'service' ? 'status-pill-pending' : 'status-pill-active'}">
                            ${listing.type === 'service' ? 'Service' : 'Active'}
                        </span>
                    `}
                    ${listing.isVerified ? `
                        <span class="status-pill status-pill-elite">MALL Verified</span>
                    ` : ''}
                </div>
            </a>

            <div class="p-8 space-y-4">
                <div class="space-y-1">
                    <p class="text-[9px] font-black text-primary uppercase tracking-[0.3em]">${listing.category}</p>
                    <h3 class="text-xl font-black text-navy dark:text-white group-hover:text-primary transition-colors truncate uppercase tracking-tighter leading-tight">
                        ${listing.title}
                    </h3>
                </div>
                
                <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/5">
                    <div class="flex flex-col">
                        <span class="text-2xl font-black text-navy dark:text-white tracking-tighter">KSh ${listing.price.toLocaleString()}</span>
                        <div class="flex items-center gap-2 mt-1">
                            <i data-lucide="user" class="w-3 h-3 text-slate-400"></i>
                            <span class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">${listing.sellerName}</span>
                        </div>
                    </div>
                    
                    <a href="https://wa.me/${listing.sellerPhone}" target="_blank" 
                       class="p-4 bg-navy dark:bg-primary text-primary dark:text-navy rounded-[24px] shadow-xl hover:scale-110 transition-all">
                        <i data-lucide="message-circle" class="w-6 h-6"></i>
                    </a>
                </div>
            </div>
        </div>
    `;
}

/**
 * Helper to render product details HTML
 */
async function renderListingDetails(listing) {
    const media = listing.images || ['placeholder'];
    
    return `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12" 
             x-data="{ 
                current: 0, 
                paused: false, 
                items: ${JSON.stringify(media).replace(/"/g, '&quot;')},
                next() { this.current = (this.current + 1) % this.items.length },
                prev() { this.current = (this.current - 1 + this.items.length) % this.items.length }
             }"
             x-init="setInterval(() => { if(!paused && items.length > 1) next() }, 6000)">
            
            <!-- Image Gallery -->
            <div class="space-y-4">
                <div class="aspect-square bg-cream dark:bg-slate-900 rounded-3xl border border-border dark:border-slate-800 flex items-center justify-center overflow-hidden relative"
                     @mouseenter="paused = true" @mouseleave="paused = false">
                    
                    <template x-for="(item, index) in items" :key="index">
                        <div x-show="current === index" class="w-full h-full animate-fade-in-up">
                            <template x-if="item !== 'placeholder' && !item.startsWith('data:video')">
                                <img :src="item" class="w-full h-full object-cover">
                            </template>
                            <template x-if="item !== 'placeholder' && item.startsWith('data:video')">
                                <video :src="item" controls autoplay muted loop class="w-full h-full object-cover"></video>
                            </template>
                            <template x-if="item === 'placeholder'">
                                <div class="w-full h-full flex items-center justify-center bg-slate-50 dark:bg-slate-900 border-border">
                                    <span class="text-primary/10 font-bold text-6xl">MGCE</span>
                                </div>
                            </template>
                        </div>
                    </template>

                    ${listing.isSoldOut ? `
                        <div class="absolute inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center z-10">
                            <span class="bg-red-600 text-white px-8 py-3 rounded-full font-black uppercase tracking-widest text-2xl rotate-[-5deg] shadow-2xl">Sold Out</span>
                        </div>
                    ` : ''}

                    <!-- Carousel Controls -->
                    <template x-if="items.length > 1">
                        <div class="absolute inset-x-4 bottom-4 flex justify-between">
                            <button @click="prev()" class="p-2 bg-navy/50 text-white rounded-full backdrop-blur-md hover:bg-primary hover:text-navy transition-all"><i data-lucide="chevron-left" class="w-5 h-5"></i></button>
                            <button @click="next()" class="p-2 bg-navy/50 text-white rounded-full backdrop-blur-md hover:bg-primary hover:text-navy transition-all"><i data-lucide="chevron-right" class="w-5 h-5"></i></button>
                        </div>
                    </template>
                </div>
                
                <div class="grid grid-cols-5 gap-3">
                    <template x-for="(item, index) in items">
                        <button @click="current = index; paused = true" 
                                class="aspect-square rounded-2xl border-4 overflow-hidden transition-all shadow-md"
                                :class="current === index ? 'border-primary' : 'border-transparent opacity-50'">
                            <template x-if="item !== 'placeholder' && !item.startsWith('data:video')">
                                <img :src="item" class="w-full h-full object-cover">
                            </template>
                             <template x-if="item !== 'placeholder' && item.startsWith('data:video')">
                                <div class="w-full h-full bg-navy relative flex items-center justify-center">
                                    <i data-lucide="play-circle" class="w-6 h-6 text-white absolute"></i>
                                    <video :src="item" class="w-full h-full object-cover opacity-50"></video>
                                </div>
                            </template>
                            <template x-if="item === 'placeholder'">
                                <div class="w-full h-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-[8px] text-slate-300">MGCE</div>
                            </template>
                        </button>
                    </template>
                </div>
            </div>

            <!-- Content -->
            <div class="space-y-8">
                <div class="flex items-center gap-2">
                    <span class="px-4 py-1.5 bg-navy dark:bg-slate-800 border border-primary/20 text-primary text-[10px] font-black uppercase rounded-full tracking-widest">
                        ${listing.type === 'service' ? '✨ Campus Service' : '📦 Marketplace Item'}
                    </span>
                    ${listing.isSoldOut ? '<span class="px-4 py-1.5 bg-red-600/10 text-red-600 text-[10px] font-black uppercase rounded-full tracking-widest border border-red-600/20">Sold Out</span>' : ''}
                </div>

                <div>
                    <h1 class="text-4xl md:text-5xl font-black text-navy dark:text-white uppercase leading-none mb-3">${listing.title}</h1>
                    <div class="flex flex-wrap items-center gap-4 text-xs font-black text-primary uppercase tracking-widest">
                        <span class="flex items-center gap-1.5"><i data-lucide="tag" class="w-4 h-4"></i> ${listing.category}</span>
                        <span class="flex items-center gap-1.5 text-slate-400 dark:text-slate-500"><i data-lucide="map-pin" class="w-4 h-4"></i> Maseno University Area</span>
                    </div>
                </div>

                <div class="flex items-center gap-4">
                    <div class="text-5xl font-black text-navy dark:text-white flex items-center gap-2">
                        <span class="text-xl text-primary font-bold">KSh</span>
                        ${listing.price.toLocaleString()}
                    </div>
                    <div class="flex items-center gap-2 px-4 py-2 bg-red-500/10 rounded-2xl border border-red-500/20">
                        <i data-lucide="heart" class="w-5 h-5 text-red-500 fill-red-500"></i>
                        <span id="count-detail-${listing.id}" class="text-lg font-black text-red-500">${listing.heartCount || 0}</span>
                    </div>
                    <button @click="window.shareListing('${listing.title.replace(/'/g, "\\'")}', '${listing.id}')" 
                            class="ml-auto p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-500 hover:text-primary transition-all group" title="Share Product">
                        <i data-lucide="share-2" class="w-6 h-6 group-hover:scale-110 transition-transform"></i>
                    </button>
                </div>

                <div class="p-8 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-border dark:border-slate-800 space-y-4">
                    <h4 class="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">About this listing</h4>
                    <p class="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">${listing.description}</p>
                </div>

                <div class="flex flex-col gap-4">
                    <button @click="window.open('https://wa.me/${listing.sellerPhone}?text=' + encodeURIComponent('Hi ${listing.sellerName.replace(/'/g, '\\\'')}, I\'m interested in your \'${listing.title.replace(/'/g, '\\\'')}\' on the MGCE MALL!'), '_blank')" 
                            class="px-8 py-6 bg-navy dark:bg-primary text-primary dark:text-navy rounded-[32px] font-black text-xl flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all shadow-2xl shadow-navy/20 dark:shadow-primary/10 uppercase tracking-widest">
                        <i data-lucide="message-circle" class="w-6 h-6"></i>
                        Direct WhatsApp
                    </button>
                </div>

                <!-- Seller Profile Mini-Card -->
                <div class="pt-10 border-t border-border dark:border-slate-800">
                    <div class="flex items-center gap-5">
                        <div class="w-16 h-16 bg-navy text-primary rounded-3xl flex items-center justify-center font-black text-2xl shadow-xl">
                            ${listing.sellerName.charAt(0)}
                        </div>
                        <div>
                            <p class="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-[0.2em] mb-1">Empowered Seller</p>
                            <div class="flex items-center gap-2">
                                <p class="font-black text-navy dark:text-white text-2xl uppercase tracking-tighter">${listing.sellerName}</p>
                                ${listing.isVerified ? '<i data-lucide="verified" class="w-6 h-6 text-primary" title="MALL Verified Seller"></i>' : ''}
                                ${listing.badge ? `<span class="bg-primary/20 text-primary px-2.5 py-1 rounded-lg font-black text-[9px] uppercase tracking-widest border border-primary/20 ml-2 shadow-lg shadow-primary/5">${listing.badge}</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Global functions for management
window.markAsSold = async (id) => {
    const listings = await window.MarketplaceDB.getAllListings();
    const listing = listings.find(l => l.id === id);
    if (listing) {
        listing.isSoldOut = true;
        listing.soldAt = Date.now();
        await window.MarketplaceDB.saveListing(listing);
        location.reload();
    }
};

window.deleteListing = async (id) => {
    if (confirm("Permanently purge this listing from the MALL database?")) {
        await window.MarketplaceDB.deleteListing(id);
        window.showToast("LISTING PURGED GLOBALLY", "danger");
        setTimeout(() => location.reload(), 1000);
    }
}

window.editListingItem = async (id) => {
    const listings = await window.MarketplaceDB.getAllListings();
    const item = listings.find(l => l.id === id);
    if (item) {
        // Find the Alpine component for account.html
        const el = document.querySelector('[x-data]');
        if (el && el.__x && el.__x.$data) {
            el.__x.$data.editingItem = { ...item };
            el.__x.$data.editListingOpen = true;
        } else {
            // Fallback for non-Alpine contexts if needed
            window.showToast("Accessing Secure Edit Module...");
        }
    }
}

window.handleLogout = async () => {
    window.showToast("SYNCING: SECURING GLOBAL SESSION...");
    await window.MarketplaceDB.clearSession();
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
}

// --- Elite Pack 3: Hub & Search Logic ---

async function renderTrendingSlider(providedListings) {
    const container = document.getElementById('trending-slider');
    if (!container) return;

    // Use provided listings or fetch from DB
    const trending = providedListings 
        ? providedListings.sort((a, b) => (b.heartCount || 0) - (a.heartCount || 0)).slice(0, 6)
        : await window.MarketplaceDB.getTrendingListings(6);

    if (!trending.length) {
        container.innerHTML = `<p class="text-slate-400 text-xs py-10 uppercase tracking-widest pl-4">No trending items yet. Add some hearts!</p>`;
        return;
    }

    container.innerHTML = trending.map(item => `
        <div class="flex-shrink-0 w-72 snap-center group">
            <div class="relative h-96 rounded-[32px] overflow-hidden border border-border/20 shadow-2xl transition-all duration-500 hover:scale-[1.02]">
                <img src="${item.images?.[0] || 'placeholder'}" class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
                <div class="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-navy via-navy/60 to-transparent">
                    <span class="text-[9px] font-black text-primary uppercase tracking-[0.3em] mb-2 block">${item.category}</span>
                    <h3 class="text-white font-bold uppercase tracking-tight truncate mb-4">${item.title}</h3>
                    <div class="flex items-center justify-between">
                        <span class="text-primary font-black">KSh ${item.price.toLocaleString()}</span>
                        <a href="details.html?id=${item.id}" class="px-4 py-2 bg-white/10 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-widest rounded-full border border-white/20 hover:bg-primary hover:text-navy transition-all">Details</a>
                    </div>
                </div>
                <div class="absolute top-6 right-6 px-3 py-1.5 bg-red-500/80 backdrop-blur-md text-white rounded-full text-[9px] font-black flex items-center gap-1.5 shadow-lg">
                    ❤️ ${item.heartCount || 0}
                </div>
            </div>
        </div>
    `).join('');
    
    lucide.createIcons();
}

async function animateStats() {
    const stats = await window.MarketplaceDB.getGlobalStats();
    
    const elements = {
        'stat-hearts': stats.totalHearts,
        'stat-users': stats.totalUsers,
        'stat-items': stats.totalItems
    };

    Object.entries(elements).forEach(([id, target]) => {
        const el = document.getElementById(id);
        if (!el) return;

        let current = 0;
        const duration = 2000;
        const increment = target / (duration / 16);
        
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                el.innerText = target.toLocaleString();
                clearInterval(timer);
            } else {
                el.innerText = Math.floor(current).toLocaleString();
            }
        }, 16);
    });
}

// Live Search logic for shop page
window.handleLiveSearch = async (e) => {
    const query = e.target.value.toLowerCase();
    const container = document.getElementById('shop-grid');
    if (!container) return;

    const listings = await window.MarketplaceDB.getAllListings();
    const filtered = listings.filter(l => 
        l.title.toLowerCase().includes(query) || 
        l.category.toLowerCase().includes(query) ||
        l.sellerName.toLowerCase().includes(query)
    );

    if (!filtered.length) {
        container.innerHTML = `<div class="col-span-full py-20 text-center space-y-4">
            <i data-lucide="search-x" class="w-12 h-12 text-slate-300 mx-auto"></i>
            <p class="text-slate-500 font-bold uppercase tracking-widest text-xs">No results matching your MALL taste.</p>
        </div>`;
        lucide.createIcons();
        return;
    }

    container.innerHTML = '';
    for (const listing of filtered) {
        container.innerHTML += await renderListingCard(listing);
    }
    lucide.createIcons();
};

window.shareListing = async (title, id) => {
    const url = `${window.location.origin}/details?id=${id}`;
    if (navigator.share) {
        try {
            await navigator.share({ title: `MALL: ${title}`, url });
        } catch (e) {
            console.warn("Share failed", e);
        }
    } else {
        await navigator.clipboard.writeText(url);
        window.showToast("LINK COPIED: BROADCAST THE LOVE! 💎", "success");
    }
};
