/**
 * MGCE Marketplace - Storage Layer (IndexedDB)
 * Handles listings, multiple images, and user profiles persistently.
 */

const DB_NAME = 'MGCEMarketplaceDB';
const DB_VERSION = 4;

class MarketplaceStorage {
    constructor() {
        this.db = null;
        this.firestore = null;
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

            request.onsuccess = async (event) => {
                this.db = event.target.result;
                
                // Initialize Firebase Cloud Power
                if (window.firebase && window._mgceFirebaseConfig) {
                    try {
                        const app = firebase.initializeApp(window._mgceFirebaseConfig);
                        this.firestore = firebase.firestore();
                        
                        // --- Phase 2: Elite Handshake with Safety Timeout ---
                        if (firebase.auth) {
                            console.log("MGCE: Reaching for Global Cloud Handshake...");
                            
                            // 5s Safety Race
                            const handshakePromise = firebase.auth().signInAnonymously();
                            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Handshake Timeout")), 5000));
                            
                            try {
                                await Promise.race([handshakePromise, timeoutPromise]);
                                if (firebase.auth().currentUser) {
                                    console.log("MGCE: Global Cloud Handshake Verified! ✅");
                                    window.mgceCloudStatus = 'online';
                                    window.dispatchEvent(new CustomEvent('mgce-cloud-state-change', { detail: { status: 'online' } }));
                                    
                                    // Global Migration: Rescue local data to the cloud
                                    this.migrateLocalData();
                                }
                            } catch (e) {
                                console.warn("MGCE Cloud: Handshake delayed or offline. Proceeding in Local-First mode.", e.message);
                                window.mgceCloudStatus = 'offline';
                                window.dispatchEvent(new CustomEvent('mgce-cloud-state-change', { detail: { status: 'offline' } }));
                            }
                        }

                        console.log("MGCE: Elite Cloud Sync Engine Active.");
                        
                        // Start Background Sync
                        this.syncCloudData();
                    } catch (e) {
                        console.warn("MGCE: Cloud Sync bypass (Local Only Mode)", e.message);
                    }
                }
                
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

            request.onsuccess = async () => {
                // Cloud Sync Profile
                if (this.firestore) {
                    try {
                        console.log(`MGCE Cloud: Broadcasting profile update for [${user.phone}]... 📡`);
                        await this.firestore.collection('profiles').doc(user.phone).set({
                            ...user,
                            lastSync: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                        console.log("MGCE Cloud: Profile Handshake Complete! Profile is now global. ✅");
                    } catch (e) {
                         console.error("MGCE Cloud Error: Profile sync failed.", e.message);
                    }
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getUser(phone) {
        if (!phone) return null;
        const cleanPhone = phone.trim();
        await this._ensure();
        
        // 1. Local Lookup
        let user = await new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['users'], 'readonly');
            const store = transaction.objectStore('users');
            const request = store.get(cleanPhone);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        // 2. Cloud Fallback (Critical for different devices)
        if (!user && this.firestore) {
            console.log(`MGCE Cloud: User [${cleanPhone}] not found locally. Searching global vaults...`);
            try {
                const doc = await this.firestore.collection('profiles').doc(cleanPhone).get();
                if (doc.exists) {
                    user = doc.data();
                    console.log("MGCE Cloud: Remote user found and retrieved.");
                    // Save locally for future speed
                    await this.saveUser(user);
                }
            } catch (e) {
                console.warn("MGCE Cloud: Remote fetch failed.", e.message);
            }
        }

        return user;
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
                
                // Cloud Sync Heart Rate
                if (this.firestore) {
                    await this.firestore.collection('listings').doc(listingId).update({
                        heartCount: listing.heartCount
                    }).catch(e => console.warn("MGCE: Heart Cloud sync lag."));
                }
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

    // --- Elite Cloud Sync Engine ---
    async syncCloudData() {
        if (!this.firestore) return;

        // 1. Listings Listener
        this.firestore.collection('listings').onSnapshot(async (snapshot) => {
            console.log(`MGCE Cloud: Received Global Pulse [${snapshot.size} items].`);
            const transaction = this.db.transaction(['listings'], 'readwrite');
            const store = transaction.objectStore('listings');
            
            snapshot.docChanges().forEach((change) => {
                const data = change.doc.data();
                if (change.type === "added" || change.type === "modified") {
                    store.put(data);
                } else if (change.type === "removed") {
                    store.delete(change.doc.id);
                }
            });

            // Notify UI that a global pulse was received
            window.dispatchEvent(new CustomEvent('mgce-db-updated', { detail: { type: 'listings' } }));
        }, (err) => {
            console.error("MGCE Cloud Error: Listings Sync Failed (Check Firestore Rules)", err.message);
        });

        // 2. Profiles Sync (Verification & Badges)
        this.firestore.collection('profiles').onSnapshot(async (snapshot) => {
            console.log(`MGCE Cloud: Synchronizing Identity Vault...`);
            const transaction = this.db.transaction(['users'], 'readwrite');
            const store = transaction.objectStore('users');
            
            snapshot.docChanges().forEach((change) => {
                const data = change.doc.data();
                if (change.type === "added" || change.type === "modified") {
                    store.put(data);
                }
            });

            window.dispatchEvent(new CustomEvent('mgce-db-updated', { detail: { type: 'profiles' } }));
        }, (err) => {
            console.error("MGCE Cloud Error: Profiles Sync Failed (Check Firestore Rules)", err.message);
        });
    }

    async getTrendingListings(limit = 6) {
        let all = await this.getAllListings();
        // Sort by hearts descending
        return all.sort((a, b) => (b.heartCount || 0) - (a.heartCount || 0)).slice(0, limit);
    }

    async getGlobalStats() {
        const all = await this.getAllListings();
        const profiles = await new Promise((resolve) => {
            const transaction = this.db.transaction(['users'], 'readonly');
            const store = transaction.objectStore('users');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
        });

        const totalHearts = all.reduce((sum, item) => sum + (item.heartCount || 0), 0);
        
        return {
            totalItems: all.length,
            totalUsers: profiles.length,
            totalHearts: totalHearts
        };
    }

    async getSellerStats(phone) {
        const all = await this.getAllListings();
        const sellerItems = all.filter(l => l.sellerPhone === phone);
        const totalHearts = sellerItems.reduce((sum, l) => sum + (l.heartCount || 0), 0);

        return {
            items: sellerItems,
            totalHearts: totalHearts
        };
    }

    async toggleListingSold(id) {
        const item = await this.getListing(id);
        if (!item) return;
        item.isSold = !item.isSold;
        item.soldAt = item.isSold ? Date.now() : null;
        return await this.saveListing(item);
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

            request.onsuccess = async () => {
                // Cloud Push
                if (this.firestore) {
                    try {
                        await this.firestore.collection('listings').doc(listing.id).set({
                            ...listing,
                            lastSync: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                        console.log(`MGCE Cloud: Listing [${listing.title}] Broadcasted Successfully! 📡`);
                    } catch (e) {
                        console.error("MGCE Cloud Error: Listing Broadcast failed.", e.message);
                    }
                }
                resolve();
            };
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

    // --- Global Migration Engine ---
    async migrateLocalData() {
        if (!this.firestore) return;
        const sessionPhone = localStorage.getItem('mgce_session_phone');
        if (!sessionPhone) return;

        console.log("MGCE Cloud: Initiating Global Migration Audit...");
        try {
            const localListings = await this.getAllListings();
            const myItems = localListings.filter(l => l.sellerPhone === sessionPhone);
            
            if (myItems.length > 0) {
                console.log(`MGCE Cloud: Scanning ${myItems.length} personal items for cloud status...`);
                for (const item of myItems) {
                    // Direct Cloud Push (Ensures old items move to Firestore)
                    await this.firestore.collection('listings').doc(item.id).set({
                        ...item,
                        lastSync: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }
                console.log(`MGCE Cloud: Migration Pulse Complete. ${myItems.length} items verified in global vault! ✅`);
                
                // Final Pulse: Notify UI that migration might have brought new data
                window.dispatchEvent(new CustomEvent('mgce-db-updated', { detail: { type: 'listings' } }));
            }
        } catch (e) {
            console.warn("MGCE Cloud: Migration Audit paused.", e.message);
        }
    }
}

// Global instance
const db = new MarketplaceStorage();
window.MarketplaceDB = db;
