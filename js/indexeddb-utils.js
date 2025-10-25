// IndexedDB utilities for Virtual Chartered Accountants app
// This provides local storage capabilities for characters, messages, and auth tokens

const DB_NAME = 'VirtualCADB';
// IMPORTANT: Increase DB version to trigger schema update
const DB_VERSION = 3; // <-- BADLAV 1: Version 2 se 3 kiya

class ChatbotStorage {
    constructor() {
        this.dbName = DB_NAME;
        this.version = DB_VERSION;
        this.db = null; // Store db connection
    }

    async openDB() {
        // Agar connection pehle se hai to wahi use karo
        if (this.db) {
            return this.db;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = (event) => reject("Database error: " + event.target.errorCode);
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Naya, behtar tareeka object stores banane ka
                // <-- BADLAV 2: 'updateCards' store add kiya
                const stores = ['userProfile', 'characters', 'groups', 'authTokens', 'secretCode', 'updateCards'];
                stores.forEach(storeName => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        db.createObjectStore(storeName, { keyPath: 'id' });
                    }
                });
            };
        });
    }

    // Generic function to perform a transaction (GET, PUT, DELETE, etc.)
    async performTransaction(storeName, mode, action) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);

            action(store, resolve, reject);
        });
    }

    // === REFACTORED FUNCTIONS ===
    
    // Generic function to get a single item
    async getItem(storeName, id) {
        const db = await this.openDB();
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);
        
        return new Promise((resolve, reject) => {
           request.onsuccess = () => resolve(request.result || null);
           request.onerror = () => reject(request.error);
        });
    }

    // Generic function to set (add/update) a single item
    async setItem(storeName, item) {
       await this.performTransaction(storeName, 'readwrite', (store, resolve) => {
           const request = store.put(item);
           request.onsuccess = () => resolve(request.result);
       });
    }
    
    // Generic function to set (add/update) a list of items
    async setItems(storeName, items) {
       await this.performTransaction(storeName, 'readwrite', async (store, resolve) => {
           await new Promise((res, rej) => {
               const req = store.clear();
               req.onsuccess = res;
               req.onerror = rej;
           });

           if (Array.isArray(items)) {
                for (const item of items) {
                    store.put(item);
                }
           }
           resolve();
       });
    }
    
    // Generic function to get all items from a store
    async getAllItems(storeName) {
        const db = await this.openDB();
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        
        return new Promise((resolve, reject) => {
           request.onsuccess = () => resolve(request.result || []);
           request.onerror = () => reject(request.error);
        });
    }

    // --- User Profile ---
    async getUserProfile() {
        const profile = await this.getItem('userProfile', 'mainUser');
        return profile;
    }

    async setUserProfile(profile) {
        await this.setItem('userProfile', { ...profile, id: 'mainUser' });
    }

    // --- Characters ---
    async getCharacters() {
        return this.getAllItems('characters');
    }

    async setCharacters(characters) {
        await this.setItems('characters', characters);
    }
    
    // --- Groups ---
    async getGroups() {
        return this.getAllItems('groups');
    }

    async setGroups(groups) {
        await this.setItems('groups', groups);
    }

    // --- BADLAV 3: Naye functions 'updateCards' ke liye ---
    async getUpdateCards() {
        return this.getAllItems('updateCards');
    }

    async setUpdateCards(cards) {
        await this.setItems('updateCards', cards);
    }
    // --- Naya function khatam ---

    // --- Auth Token ---
    async getAuthToken() {
        const result = await this.getItem('authTokens', 'googleAuth');
        return result ? result.token : null;
    }

    async setAuthToken(token) {
        await this.setItem('authTokens', { id: 'googleAuth', token });
    }
    
    async removeAuthToken() {
       await this.performTransaction('authTokens', 'readwrite', (store, resolve) => {
           const request = store.delete('googleAuth');
           request.onsuccess = resolve;
       });
    }

    // --- Secret Code ---
    async getSecretCode() {
        const result = await this.getItem('secretCode', 'appSecret');
        return result ? result.code : null;
    }

    async setSecretCode(code) {
        await this.setItem('secretCode', { id: 'appSecret', code });
    }
    
    async removeSecretCode() {
       await this.performTransaction('secretCode', 'readwrite', (store, resolve) => {
           const request = store.delete('appSecret');
           request.onsuccess = resolve;
       });
    }
    
    // --- Get All Data for Export ---
    async getAllData() {
        const userProfile = await this.getUserProfile();
        const characters = await this.getCharacters();
        const groups = await this.getGroups();
        const updateCards = await this.getUpdateCards(); // <-- BADLAV 4: Naya data add kiya
        return { userProfile, characters, groups, updateCards }; // <-- BADLAV 4: Naya data return kiya
    }
    
    // --- Set All Data from Import ---
    async setAllData(data) {
        if (data.userProfile) await this.setUserProfile(data.userProfile);
        if (data.characters) await this.setCharacters(data.characters);
        if (data.groups) await this.setGroups(data.groups);
        if (data.updateCards) await this.setUpdateCards(data.updateCards); // <-- BADLAV 5: Naya data import kiya
    }
}

// Create global instance
window.chatbotStorage = new ChatbotStorage();
console.log('📦 IndexedDB storage initialized (v3) for Virtual Chartered Accountants app'); // Version 3
