/**
 * MGCE Marketplace - Storage Layer (IndexedDB)
 * Handles listings, multiple images, and user profiles persistently.
 */

const DB_NAME = 'MGCEMarketplaceDB';
const DB_VERSION = 4;

class MarketplaceStorage {
    constructor() {
        this.db = null;
        this._initPromise = null;
    }

    async _ensure() {
        if (this._initPromise) await this._initPromise;
        if (!this.db) {
            // Self-init if called prematurely
            await this.init();
        }
    }

    async init() {
        if (this._initPromise) return this._initPromise;
        this._initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;

                // Existing stores
                if (!db.objectStoreNames.contains('listings')) {
                    db.createObjectStore('listings', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('profiles')) {
                    db.createObjectStore('profiles', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('blacklist')) {
                    db.createObjectStore('blacklist', { keyPath: 'phone' });
                }

                // v3 Stores
                if (!db.objectStoreNames.contains('audit_logs')) {
                    db.createObjectStore('audit_logs', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('verifications')) {
                    db.createObjectStore('verifications', { keyPath: 'phone' });
                }
                if (!db.objectStoreNames.contains('broadcasts')) {
                    db.createObjectStore('broadcasts', { keyPath: 'id' });
                }

                // v4 Stores - Users & Favorites
                if (!db.objectStoreNames.contains('users')) {
                    db.createObjectStore('users', { keyPath: 'phone' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onerror = (event) => reject(event.target.error);
        });
    }

    // --- User & Session Management ---
    async saveUser(user) {
        await this._ensure();
        const isBanned = await this.isPhoneBanned(user.phone);
        if (isBanned) throw new Error("This phone number is banned from the platform.");
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['users'], 'readwrite');
            const store = transaction.objectStore('users');
            const request = store.put({
                ...user,
                favorites: user.favorites || [],
                isVerified: user.isVerified || false,
                createdAt: user.createdAt || Date.now()
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getUser(phone) {
        if (!phone) return null;
        const cleanPhone = phone.trim();
        await this._ensure();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['users'], 'readonly');
            const store = transaction.objectStore('users');
            const request = store.get(cleanPhone);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async setCurrentSession(phone) {
        localStorage.setItem('mgce_session_phone', phone);
        localStorage.setItem('mgce_session_expiry', Date.now() + 120000); // 2 minute pulse
    }

    async getCurrentSession() {
        let phone = localStorage.getItem('mgce_session_phone');
        if (phone) phone = phone.trim();
        let expiry = localStorage.getItem('mgce_session_expiry');
        
        // Auto-heal legacy sessions (phone exists but expiry missing)
        if (phone && !expiry) {
            console.info("MGCE: Legacy session detected. Auto-repairing security timestamp...");
            await this.refreshSession();
            expiry = localStorage.getItem('mgce_session_expiry');
        }

        // Add 30s grace period to prevent race conditions during refresh
        if (!phone || !expiry || Date.now() > (parseInt(expiry) + 30000)) {
            if (phone) {
                console.warn("MGCE: Session truly expired. Clearing for security.");
                this.clearSession();
            }
            return null;
        }
        
        await this._ensure();
        let user = await this.getUser(phone);
        
        // Safety Retry: If phone exists but user not found, wait and try once more
        if (!user && phone) {
            console.warn(`MGCE: User [${phone}] lookup failed (race condition). Retrying...`);
            await new Promise(r => setTimeout(r, 500));
            user = await this.getUser(phone);
        }

        // Silent Regeneration: If still not found but phone exists, auto-recreate the profile
        if (!user && phone) {
            console.warn(`MGCE: User profile missing from database. Auto-regenerating for [${phone}]...`);
            user = {
                phone: phone,
                name: "Elite User",
                role: 'buyer',
                favorites: [],
                isVerified: false,
                createdAt: Date.now()
            };
            await this.saveUser(user);
        }
        
        const isBanned = await this.isPhoneBanned(phone);
        
        if (isBanned) {
            console.warn("MGCE: User is banned. Clearing session.");
            this.clearSession();
            return null;
        }

        return user;
    }

    async clearSession() {
        localStorage.removeItem('mgce_session_phone');
        localStorage.removeItem('mgce_session_expiry');
    }

    async refreshSession() {
        const phone = localStorage.getItem('mgce_session_phone');
        if (phone) {
            localStorage.setItem('mgce_session_expiry', Date.now() + 120000);
        }
    }

    // --- Favorites Logic ---
    async toggleFavorite(listingId) {
        const user = await this.getCurrentSession();
        
        let isAdded = false;
        if (!user) {
            console.info("MGCE: No active session. Using Local Backup for favorite.");
            let localFavs = JSON.parse(localStorage.getItem('mgce_local_favs') || '[]');
            const index = localFavs.indexOf(listingId);
            if (index > -1) {
                localFavs.splice(index, 1);
                isAdded = false;
            } else {
                localFavs.push(listingId);
                isAdded = true;
            }
            localStorage.setItem('mgce_local_favs', JSON.stringify(localFavs));
        } else {
            const favorites = user.favorites || [];
            const index = favorites.indexOf(listingId);
            
            if (index > -1) {
                favorites.splice(index, 1);
                isAdded = false;
            } else {
                favorites.push(listingId);
                isAdded = true;
            }

            user.favorites = favorites;
            await this.saveUser(user);
        }

        // --- Increment/Decrement Listing Heart Count ---
        try {
            const listing = await this.getListing(listingId);
            if (listing) {
                listing.heartCount = Math.max(0, (listing.heartCount || 0) + (isAdded ? 1 : -1));
                await this.saveListing(listing);
            }
        } catch (e) {
            console.warn("MGCE: Could not update listing heart count:", e.message);
        }

        return isAdded;
    }

    async getListingHeartCount(id) {
        const listing = await this.getListing(id);
        return listing ? (listing.heartCount || 0) : 0;
    }

    async isFavorite(listingId) {
        // Check Local Backup first (Trust the Click)
        const localFavs = JSON.parse(localStorage.getItem('mgce_local_favs') || '[]');
        if (localFavs.includes(listingId)) return true;

        const user = await this.getCurrentSession();
        if (!user) return false;
        return (user.favorites || []).includes(listingId);
    }

    async updateUser(phone, data) {
        const user = await this.getUser(phone);
        if (!user) throw new Error("User not found.");
        
        const updated = { ...user, ...data };
        return await this.saveUser(updated);
    }

    // Generic Action Logger
    async addAuditLog(action, target) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['audit_logs'], 'readwrite');
            const store = transaction.objectStore('audit_logs');
            const entry = {
                action,
                target,
                timestamp: Date.now()
            };
            const request = store.add(entry);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getAuditLogs() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['audit_logs'], 'readonly');
            const store = transaction.objectStore('audit_logs');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result.sort((a,b) => b.timestamp - a.timestamp));
            request.onerror = () => reject(request.error);
        });
    }

    async saveListing(listing) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['listings'], 'readwrite');
            const store = transaction.objectStore('listings');
            const request = store.put(listing);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getListing(id) {
        await this._ensure();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['listings'], 'readonly');
            const store = transaction.objectStore('listings');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllListings() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['listings'], 'readonly');
            const store = transaction.objectStore('listings');
            const request = store.getAll();

            request.onsuccess = () => {
                const now = Date.now();
                const listings = request.result;
                const filtered = listings.filter(item => {
                    if (item.isSoldOut && item.soldAt) {
                        const oneHourInMs = 60 * 60 * 1000;
                        return (now - item.soldAt) < oneHourInMs;
                    }
                    return true;
                });
                resolve(filtered);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteListing(id) {
        // Find listing info first for log
        const all = await this.getAllListings();
        const item = all.find(l => l.id === id);
        if (item) await this.addAuditLog('PURGE_LISTING', `${item.title} (Seller: ${item.sellerPhone})`);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['listings'], 'readwrite');
            const store = transaction.objectStore('listings');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async purgeSellerListings(phone) {
        const listings = await this.getAllListings();
        const sellerItems = listings.filter(l => l.sellerPhone === phone);
        for (let item of sellerItems) {
            await this.deleteListing(item.id);
        }
    }

    async saveProfile(profile) {
        const isBanned = await this.isPhoneBanned(profile.phone);
        if (isBanned) throw new Error("This phone number is banned from the platform.");
        
        profile.id = 'current_user';
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['profiles'], 'readwrite');
            const store = transaction.objectStore('profiles');
            const request = store.put(profile);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getProfile() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['profiles'], 'readonly');
            const store = transaction.objectStore('profiles');
            const request = store.get('current_user');

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Blacklist Logic
    async banPhone(phone) {
        await this.addAuditLog('BAN_SELLER', phone);
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['blacklist'], 'readwrite');
            const store = transaction.objectStore('blacklist');
            const request = store.put({ phone, timestamp: Date.now() });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async unbanPhone(phone) {
        await this.addAuditLog('RESTORE_SELLER', phone);
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['blacklist'], 'readwrite');
            const store = transaction.objectStore('blacklist');
            const request = store.delete(phone);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async isPhoneBanned(phone) {
        if (!phone) return false;
        await this._ensure();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['blacklist'], 'readonly');
            const store = transaction.objectStore('blacklist');
            const request = store.get(phone);

            request.onsuccess = () => resolve(!!request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getBlacklist() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['blacklist'], 'readonly');
            const store = transaction.objectStore('blacklist');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Verification Logic
    async setVerification(phone, status) {
        await this.addAuditLog(status ? 'VERIFY_SELLER' : 'UNVERIFY_SELLER', phone);
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['verifications'], 'readwrite');
            const store = transaction.objectStore('verifications');
            if (status) {
                const request = store.put({ phone, timestamp: Date.now() });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } else {
                const request = store.delete(phone);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            }
        });
    }

    async isSellerVerified(phone) {
        if (!phone) return false;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['verifications'], 'readonly');
            const store = transaction.objectStore('verifications');
            const request = store.get(phone);
            request.onsuccess = () => resolve(!!request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllUsers() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['users'], 'readonly');
            const store = transaction.objectStore('users');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getListingHeartCount(listingId) {
        const users = await this.getAllUsers();
        return users.filter(u => (u.favorites || []).includes(listingId)).length;
    }

    async setBroadcast(message) {
        await this.addAuditLog('POST_BROADCAST', message.substring(0, 50) + '...');
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['broadcasts'], 'readwrite');
            const store = transaction.objectStore('broadcasts');
            const request = store.put({ id: 'current', message, timestamp: Date.now() });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getBroadcast() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['broadcasts'], 'readonly');
            const store = transaction.objectStore('broadcasts');
            const request = store.get('current');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

// Global instance
const db = new MarketplaceStorage();
window.MarketplaceDB = db;
